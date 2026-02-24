import asyncio
import io
import json
import os
import re
import subprocess
import tempfile
import time
import wave
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx
import numpy as np
import webrtcvad
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from langdetect import LangDetectException, detect
from pydub import AudioSegment
from pyannote.audio import Pipeline


# =========================
# Service Config
# =========================

HF_TOKEN = ""

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://talancer-backend:8088")
# Use SttController callback endpoints (new schema)
BACKEND_PATH_STT_BATCH = "/stt/batch"
BACKEND_PATH_STT_DIARIZE = "/stt/batch-diarize"

WHISPER_BASE_URL = os.getenv("WHISPER_BASE_URL", "http://whisper:9000").rstrip("/")
WHISPER_ASR_PATH = os.getenv("WHISPER_ASR_PATH", "/asr")

TRANSLATE_URL = os.getenv("TRANSLATE_URL", "").rstrip("/")
TRANSLATE_API_KEY = os.getenv("TRANSLATE_API_KEY", "")
TRANSLATE_TARGET = os.getenv("TRANSLATE_TARGET", "ko")
NATIVE_LANG = os.getenv("NATIVE_LANG", "ko")

# Real-time input format (frontend PCM16 mono)
SAMPLE_RATE = int(os.getenv("STT_SAMPLE_RATE", "16000"))
CHANNELS = int(os.getenv("STT_CHANNELS", "1"))
SAMPLE_WIDTH = int(os.getenv("STT_SAMPLE_WIDTH", "2"))
CHUNK_SECONDS = float(os.getenv("STT_CHUNK_SECONDS", "1.5"))
MIN_CHUNK_SECONDS = float(os.getenv("STT_MIN_CHUNK_SECONDS", "0.8"))

# Realtime VAD/segmentation tuning
FRAME_MS = 30
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000
VAD_MODE = int(os.getenv("STT_VAD_MODE", "3"))
MIN_UTTERANCE_MS = 300
MAX_UTTERANCE_MS = 2000
END_SILENCE_MS = 240
OVERLAP_MS = 600

# Realtime hallucination/silence filtering
HALLUCINATION_PHRASES = ["구독", "좋아요", "알림설정", "감사합니다", "미안합니다"]
NO_SPEECH_PROB_THRESHOLD = float(os.getenv("STT_NO_SPEECH_PROB_THRESHOLD", "0.60"))
SILENCE_DBFS_THRESHOLD = float(os.getenv("STT_SILENCE_DBFS_THRESHOLD", "-42.0"))
PHRASE_DBFS_THRESHOLD = float(os.getenv("STT_PHRASE_DBFS_THRESHOLD", "-30.0"))
DUPLICATE_WINDOW_SEC = float(os.getenv("STT_DUPLICATE_WINDOW_SEC", "3.0"))

# Language/script guards
HANGUL_RE = re.compile(r"[가-힣]")
LATIN_RE = re.compile(r"[A-Za-z]")
CYRIL_RE = re.compile(r"[А-Яа-я]")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")

# Cached heavy model handle
_DIAR_PIPELINE: Optional[Pipeline] = None


# =========================
# Session State
# =========================


@dataclass
class RealtimeSession:
    meeting_id: str
    ws: WebSocket

    pcm_buffer: bytearray = field(default_factory=bytearray)
    worker_task: Optional[asyncio.Task] = None
    closed: bool = False

    partial_segments: List[Dict[str, Any]] = field(default_factory=list)
    segment_index: int = 0

    segmenter: Optional["VadSegmenter"] = None

    def bytes_per_second(self) -> int:
        return SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH

    def min_chunk_bytes(self) -> int:
        return int(self.bytes_per_second() * MIN_CHUNK_SECONDS)


SESSIONS: Dict[str, RealtimeSession] = {}


# =========================
# Realtime Segmenter (VAD)
# =========================


class VadSegmenter:
    def __init__(self):
        self.vad = webrtcvad.Vad(VAD_MODE)
        self.buf = np.zeros(0, dtype=np.int16)

        self.in_speech = False
        self.speech_buf = np.zeros(0, dtype=np.int16)

        self.speech_ms = 0
        self.silence_ms = 0

    def push_pcm(self, pcm_bytes: bytes) -> List[np.ndarray]:
        out: List[np.ndarray] = []
        samples = pcm16_bytes_to_int16(pcm_bytes)
        self.buf = np.concatenate([self.buf, samples])

        while len(self.buf) >= FRAME_SAMPLES:
            frame = self.buf[:FRAME_SAMPLES]
            self.buf = self.buf[FRAME_SAMPLES:]

            is_speech = self.vad.is_speech(frame.tobytes(), SAMPLE_RATE)
            if is_speech:
                self.silence_ms = 0
                self.speech_ms += FRAME_MS

                if not self.in_speech:
                    self.in_speech = True
                    self.speech_buf = np.zeros(0, dtype=np.int16)

                self.speech_buf = np.concatenate([self.speech_buf, frame])

                if self.speech_ms >= MAX_UTTERANCE_MS:
                    utt = self._finalize(force=True)
                    if utt is not None and len(utt) > 0:
                        out.append(utt)
                continue

            if not self.in_speech:
                continue

            self.silence_ms += FRAME_MS
            self.speech_buf = np.concatenate([self.speech_buf, frame])

            if self.silence_ms >= END_SILENCE_MS and self.speech_ms >= MIN_UTTERANCE_MS:
                utt = self._finalize(force=False)
                if utt is not None and len(utt) > 0:
                    out.append(utt)

        return out

    def _finalize(self, force: bool = False) -> Optional[np.ndarray]:
        utt = self.speech_buf

        if not force and self.silence_ms > 0:
            trim_samples = int(SAMPLE_RATE * (self.silence_ms / 1000.0))
            if trim_samples > 0 and len(utt) > trim_samples:
                utt = utt[:-trim_samples]

        min_keep_samples = int(SAMPLE_RATE * 0.20)
        if utt is None or len(utt) < min_keep_samples:
            self._reset_overlap(np.zeros(0, dtype=np.int16), force=force)
            return None

        overlap_samples = SAMPLE_RATE * OVERLAP_MS // 1000
        tail = utt[-overlap_samples:] if len(utt) > overlap_samples else utt.copy()

        self._reset_overlap(tail, force=force)
        return utt

    def _reset_overlap(self, tail: np.ndarray, force: bool):
        self.in_speech = False
        self.speech_buf = tail
        self.speech_ms = 0 if force else OVERLAP_MS
        self.silence_ms = 0


# =========================
# Audio / Text Utilities
# =========================


def pcm16_bytes_to_int16(pcm_bytes: bytes) -> np.ndarray:
    return np.frombuffer(pcm_bytes, dtype=np.int16)


def pcm16_to_wav_bytes(pcm: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Wrap raw PCM16 mono bytes into WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def rms_dbfs_int16(samples: np.ndarray) -> float:
    if samples is None or len(samples) == 0:
        return -120.0
    x = samples.astype(np.float32)
    rms = np.sqrt(np.mean(x * x) + 1e-12)
    dbfs = 20.0 * np.log10(rms / 32768.0 + 1e-12)
    return float(dbfs)


def to_wav_16k_mono(input_bytes: bytes) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".in", delete=True) as fin, tempfile.NamedTemporaryFile(
        suffix=".wav", delete=True
    ) as fout:
        fin.write(input_bytes)
        fin.flush()

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            fin.name,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "wav",
            fout.name,
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0:
            err = proc.stderr.decode()[:400]
            raise HTTPException(status_code=400, detail=f"ffmpeg convert failed: {err}")
        return fout.read()


def load_wav_16k_mono(wav_bytes: bytes) -> AudioSegment:
    audio = AudioSegment.from_file(io.BytesIO(wav_bytes), format="wav")
    return audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)


def slice_wav_segment(audio: AudioSegment, start_s: float, end_s: float) -> bytes:
    s_ms = max(0, int(start_s * 1000))
    e_ms = max(s_ms + 1, int(end_s * 1000))
    seg = audio[s_ms:e_ms]
    buf = io.BytesIO()
    seg.export(buf, format="wav")
    return buf.getvalue()


def normalize_text_for_filter(text: str) -> str:
    return re.sub(r"[\s\.,!?~\-_/·…]+", "", (text or "").strip())


HALLUCINATION_PHRASES_NORMALIZED = {
    normalize_text_for_filter(p) for p in HALLUCINATION_PHRASES
}


def normalize_meeting_id(meeting_id: str) -> Any:
    text = str(meeting_id or "").strip()
    try:
        return int(text)
    except Exception:
        return text


def korean_only(text: str, min_hangul: int = 2) -> bool:
    if not text:
        return False

    stripped = text.strip()
    if not stripped:
        return False

    if LATIN_RE.search(stripped) or CYRIL_RE.search(stripped) or CJK_RE.search(stripped):
        return False

    return len(HANGUL_RE.findall(stripped)) >= min_hangul


def safe_detect_language(text: str) -> Optional[str]:
    text = (text or "").strip()
    if not korean_only(text, min_hangul=2):
        return None
    if len(text) < 5:
        return None

    try:
        return detect(text)
    except LangDetectException:
        return None


def extract_no_speech_prob(result: Dict[str, Any]) -> Optional[float]:
    segments = result.get("segments")
    if not isinstance(segments, list):
        return None

    probs: List[float] = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        try:
            p = float(seg.get("no_speech_prob"))
        except (TypeError, ValueError):
            continue
        probs.append(p)

    if not probs:
        return None
    return max(probs)


def is_recent_duplicate(session: RealtimeSession, text: str) -> bool:
    if not session.partial_segments:
        return False

    last = session.partial_segments[-1]
    last_text = (last.get("text") or "").strip()
    last_ts = last.get("ts")

    if not isinstance(last_ts, (int, float)):
        return False

    if normalize_text_for_filter(last_text) != normalize_text_for_filter(text):
        return False

    return (time.time() - float(last_ts)) <= DUPLICATE_WINDOW_SEC


def looks_like_hallucination(
    text: str,
    duration: float,
    dbfs: float,
    no_speech_prob: Optional[float] = None,
) -> bool:
    t = (text or "").strip()
    if not t:
        return True

    if no_speech_prob is not None and no_speech_prob >= NO_SPEECH_PROB_THRESHOLD:
        return True

    normalized = normalize_text_for_filter(t)
    if normalized in HALLUCINATION_PHRASES_NORMALIZED and dbfs < PHRASE_DBFS_THRESHOLD:
        return True

    if dbfs < SILENCE_DBFS_THRESHOLD:
        return True

    if duration <= 2.0 and len(t) >= 60:
        return True

    return False


# =========================
# External Service Clients
# =========================


async def whisper_asr_bytes(
    audio_bytes: bytes,
    filename: str = "audio.wav",
    mime_type: str = "application/octet-stream",
    task: str = "transcribe",
    output: str = "json",
    language: Optional[str] = None,
) -> Dict[str, Any]:
    params: Dict[str, str] = {"task": task, "output": output}
    if language:
        params["language"] = language

    url = f"{WHISPER_BASE_URL}{WHISPER_ASR_PATH}"
    files = {"audio_file": (filename, audio_bytes, mime_type)}

    timeout = httpx.Timeout(120.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, params=params, files=files)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Whisper error {resp.status_code}: {resp.text[:500]}")
        return resp.json()


async def libretranslate(text: str, source: str = "auto", target: str = TRANSLATE_TARGET) -> str:
    if not TRANSLATE_URL:
        return text

    payload = {"q": text, "source": source, "target": target, "format": "text"}
    if TRANSLATE_API_KEY:
        payload["api_key"] = TRANSLATE_API_KEY

    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{TRANSLATE_URL}/translate", data=payload)
        if resp.status_code != 200:
            return text
        data = resp.json()
        return data.get("translatedText", text)


async def post_to_backend(path: str, payload: dict) -> dict:
    url = f"{BACKEND_BASE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            try:
                return resp.json()
            except Exception:
                return {"status": "ok", "raw": resp.text}
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        body = exc.response.text[:300]
        raise HTTPException(status_code=502, detail=f"Backend error {status} from {url}: {body}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Backend connection failed to {url}: {str(exc)}")


def get_diarization_pipeline() -> Pipeline:
    global _DIAR_PIPELINE
    if _DIAR_PIPELINE is not None:
        return _DIAR_PIPELINE

    if not HF_TOKEN:
        raise RuntimeError("HF_TOKEN (or HUGGINGFACE_HUB_TOKEN) is required for gated pyannote models.")

    _DIAR_PIPELINE = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-community-1",
        token=HF_TOKEN,
    )

    try:
        import torch

        if torch.cuda.is_available():
            _DIAR_PIPELINE.to("cuda")
    except Exception:
        pass

    return _DIAR_PIPELINE


# =========================
# Realtime STT Pipeline
# =========================


def build_partial_segment(session: RealtimeSession, text: str) -> Dict[str, Any]:
    seg = {
        "idx": session.segment_index,
        "text": text,
        "lang": "ko",
        "ts": time.time(),
    }
    session.partial_segments.append(seg)
    session.segment_index += 1
    return seg


async def send_partial_segment(session: RealtimeSession, seg: Dict[str, Any]) -> None:
    await session.ws.send_json(
        {
            "type": "partial",
            "meetingId": session.meeting_id,
            "idx": seg["idx"],
            "text": seg["text"],
            "lang": seg["lang"],
            "ts": seg["ts"],
        }
    )


async def send_partial_error(session: RealtimeSession, message: str) -> None:
    try:
        await session.ws.send_json(
            {
                "type": "partial_error",
                "meetingId": session.meeting_id,
                "message": message[:300],
            }
        )
    except Exception:
        pass


async def transcribe_realtime_utterance(
    session: RealtimeSession,
    utt: np.ndarray,
    lang_hint: str,
) -> Optional[Dict[str, Any]]:
    duration = len(utt) / float(SAMPLE_RATE)
    dbfs = rms_dbfs_int16(utt)

    if duration < 0.20:
        return None
    if dbfs < -45.0:
        return None

    wav_bytes = pcm16_to_wav_bytes(utt.tobytes(), SAMPLE_RATE)
    result = await whisper_asr_bytes(
        wav_bytes,
        filename=f"{session.meeting_id}-{session.segment_index}.wav",
        task="transcribe",
        output="json",
        language=lang_hint,
    )

    text = (result.get("text") or "").strip()
    no_speech_prob = extract_no_speech_prob(result)

    if not korean_only(text, min_hangul=2):
        return None

    if looks_like_hallucination(
        text,
        duration=duration,
        dbfs=dbfs,
        no_speech_prob=no_speech_prob,
    ):
        return None

    if is_recent_duplicate(session, text):
        return None

    return build_partial_segment(session, text)


async def process_utterances(
    session: RealtimeSession,
    utterances: List[np.ndarray],
    lang_hint: str,
) -> None:
    for utt in utterances:
        try:
            seg = await transcribe_realtime_utterance(session, utt, lang_hint)
            if not seg:
                continue
            await send_partial_segment(session, seg)
        except Exception as exc:
            await send_partial_error(session, str(exc))
            await asyncio.sleep(0.05)


async def process_pcm_chunk(session: RealtimeSession, chunk: bytes, lang_hint: str) -> None:
    if session.segmenter is None:
        session.segmenter = VadSegmenter()

    try:
        utterances = session.segmenter.push_pcm(chunk)
    except Exception as exc:
        await send_partial_error(session, f"VAD error: {str(exc)[:200]}")
        await asyncio.sleep(0.05)
        return

    if not utterances:
        return

    await process_utterances(session, utterances, lang_hint)


async def realtime_worker(session: RealtimeSession, lang_hint: Optional[str]) -> None:
    min_bytes = session.min_chunk_bytes()
    lang_hint = lang_hint or "ko"

    if session.segmenter is None:
        session.segmenter = VadSegmenter()

    max_take = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH

    while True:
        if session.closed and len(session.pcm_buffer) < min_bytes:
            break

        if len(session.pcm_buffer) < 3200:
            await asyncio.sleep(0.05)
            continue

        take = min(len(session.pcm_buffer), max_take)
        chunk = bytes(session.pcm_buffer[:take])
        del session.pcm_buffer[:take]

        await process_pcm_chunk(session, chunk, lang_hint)

    # stop 이후 남은 버퍼 flush
    if len(session.pcm_buffer) >= min_bytes:
        chunk = bytes(session.pcm_buffer)
        session.pcm_buffer.clear()
        await process_pcm_chunk(session, chunk, lang_hint)


# =========================
# FastAPI App / Realtime APIs
# =========================


app = FastAPI(title="Realtime STT AI Server", version="1.0.0")


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {"ok": True, "whisper": WHISPER_BASE_URL}


@app.websocket("/ws/stt")
async def ws_stt(websocket: WebSocket):
    await websocket.accept()
    session: Optional[RealtimeSession] = None

    try:
        msg = await websocket.receive_json()
        if msg.get("type") != "start":
            await websocket.send_json({"type": "error", "message": "Expected start message"})
            await websocket.close(code=1002)
            return

        meeting_id = str(msg.get("meetingId") or "").strip()
        if not meeting_id:
            await websocket.send_json({"type": "error", "message": "meetingId required"})
            await websocket.close(code=1002)
            return

        lang_hint = "ko"

        session = RealtimeSession(meeting_id=meeting_id, ws=websocket)
        session.segmenter = VadSegmenter()
        SESSIONS[meeting_id] = session

        await websocket.send_json({"type": "started", "meetingId": meeting_id})

        session.worker_task = asyncio.create_task(realtime_worker(session, lang_hint))

        while True:
            incoming = await websocket.receive()

            if incoming.get("bytes") is not None:
                session.pcm_buffer.extend(incoming["bytes"])
                continue

            if incoming.get("text") is None:
                continue

            try:
                control = json.loads(incoming["text"])
            except Exception:
                await websocket.send_json({"type": "error", "message": "Invalid JSON control message"})
                continue

            control_type = control.get("type")
            if control_type == "stop":
                await websocket.send_json({"type": "stopping", "meetingId": meeting_id})
                break

            if control_type == "ping":
                await websocket.send_json({"type": "pong", "t": time.time()})
                continue

            await websocket.send_json({"type": "error", "message": f"Unknown control type: {control_type}"})

        session.closed = True
        if session.worker_task:
            await session.worker_task

        full_text = " ".join(seg.get("text", "") for seg in session.partial_segments).strip()
        await websocket.send_json(
            {
                "type": "final",
                "meetingId": session.meeting_id,
                "segments": session.partial_segments,
                "fullText": full_text,
            }
        )

        await websocket.close(code=1000)

    except WebSocketDisconnect:
        if session:
            session.closed = True
            if session.worker_task:
                try:
                    await session.worker_task
                except Exception:
                    pass
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)[:500]})
        except Exception:
            pass
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        if session:
            SESSIONS.pop(session.meeting_id, None)


# =========================
# Batch STT APIs
# =========================


@app.post("/stt/batch")
async def stt_batch(
    meeting_id: str = Form(...),
    language: Optional[str] = Form(None),
    audio: UploadFile = File(...),
):
    """
    Backend -> AI Server: final audio file 전달 후 batch STT 수행.
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    language = language or "ko"

    wav_bytes = to_wav_16k_mono(audio_bytes)
    result = await whisper_asr_bytes(
        wav_bytes,
        filename=f"{meeting_id}.wav",
        mime_type="audio/wav",
        task="transcribe",
        output="json",
        language=language,
    )

    text = (result.get("text") or "").strip()
    lang = result.get("language") or safe_detect_language(text) or "unknown"
    meeting_id_value = normalize_meeting_id(meeting_id)

    payload = {
        "meetingId": meeting_id_value,
        "lang": lang,
        "text": text,
    }
    return await post_to_backend(BACKEND_PATH_STT_BATCH, payload)


@app.post("/stt/batch-diarize")
async def stt_batch_diarize(
    meeting_id: str = Form(...),
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    min_speakers: int = Form(3),
    max_speakers: int = Form(4),
    min_segment_sec: float = Form(0.6),
    merge_gap_sec: float = Form(0.35),
):
    """
    배치: 오디오 업로드 -> wav 변환 -> diarization -> 구간별 STT -> backend 전달.
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    wav_bytes = to_wav_16k_mono(audio_bytes)
    wav_audio = load_wav_16k_mono(wav_bytes)
    meeting_id_value = normalize_meeting_id(meeting_id)
    lang = language or "ko"

    async def build_full_audio_fallback_segments() -> List[Dict[str, Any]]:
        result = await whisper_asr_bytes(
            wav_bytes,
            filename=f"{meeting_id}-full.wav",
            mime_type="audio/wav",
            task="transcribe",
            output="json",
            language=lang,
        )
        text = (result.get("text") or "").strip()
        if not text:
            return []

        end_sec = max(0.1, round(len(wav_audio) / 1000.0, 3))
        return [
            {
                "speaker": "SPEAKER_00",
                "start": 0.0,
                "end": end_sec,
                "text": text,
            }
        ]

    pipeline = get_diarization_pipeline()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp_wav:
        tmp_wav.write(wav_bytes)
        tmp_wav.flush()

        diar_out = pipeline(
            tmp_wav.name,
            min_speakers=int(min_speakers),
            max_speakers=int(max_speakers),
        )

    diar = diar_out.speaker_diarization if hasattr(diar_out, "speaker_diarization") else diar_out

    raw_segments: List[Dict[str, Any]] = []
    for turn, _, speaker in diar.itertracks(yield_label=True):
        start = float(turn.start)
        end = float(turn.end)
        if end - start < float(min_segment_sec):
            continue
        raw_segments.append({"speaker": str(speaker), "start": start, "end": end})

    raw_segments.sort(key=lambda x: (x["start"], x["end"]))
    if not raw_segments:
        fallback_segments = await build_full_audio_fallback_segments()
        payload = {
            "meetingId": meeting_id_value,
            "speakers": 1 if fallback_segments else 0,
            "segments": fallback_segments,
            "fullText": "\n".join(
                f'{s["speaker"]}: {s["text"]}' for s in fallback_segments
            ).strip(),
        }
        return await post_to_backend(BACKEND_PATH_STT_DIARIZE, payload)

    merged: List[Dict[str, Any]] = []
    for seg in raw_segments:
        if not merged:
            merged.append(seg)
            continue

        prev = merged[-1]
        if seg["speaker"] == prev["speaker"] and seg["start"] - prev["end"] <= float(merge_gap_sec):
            prev["end"] = max(prev["end"], seg["end"])
        else:
            merged.append(seg)

    out: List[Dict[str, Any]] = []
    for idx, seg in enumerate(merged):
        chunk_wav = slice_wav_segment(wav_audio, seg["start"], seg["end"])

        result = await whisper_asr_bytes(
            chunk_wav,
            filename=f"{meeting_id}-spk-{idx}.wav",
            mime_type="audio/wav",
            task="transcribe",
            output="json",
            language=lang,
        )

        text = (result.get("text") or "").strip()
        if not text:
            continue

        out.append(
            {
                "speaker": seg["speaker"],
                "start": round(seg["start"], 3),
                "end": round(seg["end"], 3),
                "text": text,
            }
        )

    if not out:
        out = await build_full_audio_fallback_segments()

    speakers = len({s["speaker"] for s in out}) if out else len({s["speaker"] for s in merged})
    full_lines = [f'{s["speaker"]}: {s["text"]}' for s in out]

    payload = {
        "meetingId": meeting_id_value,
        "speakers": speakers,
        "segments": out,
        "fullText": "\n".join(full_lines).strip(),
    }
    return await post_to_backend(BACKEND_PATH_STT_DIARIZE, payload)


# =========================
# Translation API
# =========================


@app.post("/translate/foreign-only")
async def translate_foreign_only(payload: Dict[str, Any]):
    """
    segments 중 외국어로 판정된 구간만 번역해 반환.
    """
    meeting_id = str(payload.get("meetingId") or "").strip()
    segments = payload.get("segments") or []
    target = payload.get("target") or TRANSLATE_TARGET

    if not isinstance(segments, list):
        raise HTTPException(status_code=400, detail="segments must be list")

    out_segments: List[Dict[str, Any]] = []
    rebuilt: List[str] = []

    for seg in segments:
        text = (seg.get("text") or "").strip()
        lang = seg.get("lang") or safe_detect_language(text) or "unknown"
        translated = None

        if text and lang not in ("unknown", None) and lang != NATIVE_LANG:
            translated = await libretranslate(text, source="auto", target=target)

        out_seg = dict(seg)
        out_seg["lang"] = lang
        out_seg["translated"] = translated
        out_segments.append(out_seg)

        rebuilt.append(translated if translated else text)

    return {
        "meetingId": meeting_id,
        "segments": out_segments,
        "fullText": " ".join((s.get("text") or "").strip() for s in out_segments).strip(),
        "fullTextTranslated": " ".join(t.strip() for t in rebuilt if t.strip()).strip(),
        "translateEnabled": bool(TRANSLATE_URL),
        "translateTarget": target,
    }
