import { useRef, useState } from 'react';

const TARGET_SAMPLE_RATE = 16000;

function downsampleBuffer(input, inputSampleRate, targetSampleRate) {
  if (targetSampleRate >= inputSampleRate) {
    return input;
  }

  const sampleRateRatio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(input.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i += 1) {
      accum += input[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < float32Array.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

export function useMeetingRecorder({ meetingId, onSttMessage }) {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const wsClientRef = useRef(null);

  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);

  const chunksRef = useRef([]);
  const startedAtRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const [wsState, setWsState] = useState('CLOSED');
  const [error, setError] = useState('');

  const startRealtimePcmStreaming = (stream, wsClient) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(input, audioContext.sampleRate, TARGET_SAMPLE_RATE);
      const pcm16 = floatTo16BitPCM(downsampled);
      wsClient.sendBinary(pcm16);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    sourceNodeRef.current = source;
    processorNodeRef.current = processor;
  };

  const stopRealtimePcmStreaming = async () => {
    try {
      processorNodeRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      if (audioContextRef.current?.state !== 'closed') {
        await audioContextRef.current?.close();
      }
    } catch {
      // ignore close errors
    } finally {
      processorNodeRef.current = null;
      sourceNodeRef.current = null;
      audioContextRef.current = null;
    }
  };

  const start = async (AiWsClientClass) => {
    setError('');
    if (recording) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    setWsState('CONNECTING');
    const wsClient = new AiWsClientClass({
      meetingId,
      onOpen: () => setWsState('OPEN'),
      onClose: () => setWsState('CLOSED'),
      onError: () => {
        setWsState('ERROR');
        setError('AI websocket connection error');
      },
      onMessage: (msg) => onSttMessage?.(msg),
    });

    wsClientRef.current = wsClient;
    wsClient.connect();

    startRealtimePcmStreaming(stream, wsClient);

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    });
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    mediaRecorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;
      chunksRef.current.push(event.data);
    };

    mediaRecorder.onerror = () => {
      setError('Recording error occurred');
    };

    mediaRecorder.start(1000);
    setRecording(true);
  };

  const stop = async () => {
    if (!recording) return null;

    const mediaRecorder = mediaRecorderRef.current;
    const wsClient = wsClientRef.current;

    const stoppedBlob = await new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      mediaRecorder.stop();
    });

    await stopRealtimePcmStreaming();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    wsClient?.stopAndClose();

    setRecording(false);
    setWsState('CLOSED');

    return {
      blob: stoppedBlob,
      durationMs: Date.now() - startedAtRef.current,
    };
  };

  return {
    recording,
    wsState,
    error,
    start,
    stop,
  };
}
