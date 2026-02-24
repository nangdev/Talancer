import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ChatMessage from './ChatMessage';
import ComposerBar from './ComposerBar';
import {
  replaceFinalSegments,
  setMeetingAudioLinks,
  setMeetingStatus,
} from '../../features/meeting/meetingSlice';
import { getMeetingTranscript, updateMeetingSpeakers } from '../../services/meetingApi';

function mapTranscriptSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map((seg, index) => {
    const startSec = Number(seg?.start || 0);
    const endSec = Number(seg?.end || startSec + 1);

    return {
      segmentKey: `db-${seg?.verbId ?? index}`,
      speakerLabel: seg?.speaker || 'SPEAKER_UNKNOWN',
      text: seg?.text || '',
      startMs: Math.floor(startSec * 1000),
      endMs: Math.floor(endSec * 1000),
    };
  });
}

export default function MeetingMain() {
  const dispatch = useDispatch();
  const currentMeetingId = useSelector((state) => state.meeting.currentMeetingId);
  const finalSegments = useSelector((state) => state.meeting.finalSegments);
  const partialSegments = useSelector((state) => state.meeting.partialSegments);
  const status = useSelector((state) => state.meeting.status);
  const wsState = useSelector((state) => state.meeting.wsState);
  const summary = useSelector((state) => state.meeting.summary);
  const tasks = useSelector((state) => state.meeting.tasks);
  const meetingAudioUrl = useSelector((state) => state.meeting.meetingAudioUrl);
  const meetingAudioDownloadUrl = useSelector((state) => state.meeting.meetingAudioDownloadUrl);
  const audioRef = useRef(null);
  const chatAreaRef = useRef(null);
  const stopTimerRef = useRef(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [speakerEditorOpen, setSpeakerEditorOpen] = useState(false);
  const [speakerDrafts, setSpeakerDrafts] = useState({});
  const [speakerSaving, setSpeakerSaving] = useState(false);
  const [speakerEditError, setSpeakerEditError] = useState('');

  const partialList = useMemo(() => {
    return Object.values(partialSegments).sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  }, [partialSegments]);

  const uniqueSpeakers = useMemo(() => {
    const labels = finalSegments
      .map((seg) => String(seg?.speakerLabel || '').trim())
      .filter((label) => label.length > 0);
    return Array.from(new Set(labels));
  }, [finalSegments]);

  const hasAnyMessage = finalSegments.length > 0 || partialList.length > 0;

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setAnalysisOpen(false);
    setSpeakerEditorOpen(false);
    setSpeakerDrafts({});
    setSpeakerEditError('');
  }, [currentMeetingId]);

  useEffect(() => {
    if (!chatAreaRef.current) return;
    chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
  }, [finalSegments, partialList]);

  const playSegment = (segment) => {
    if (!audioRef.current || !meetingAudioUrl) return;

    const start = Math.max(0, (segment?.startMs ?? 0) / 1000);
    const end = Math.max(start + 0.1, (segment?.endMs ?? segment?.startMs ?? 1000) / 1000);

    audioRef.current.currentTime = start;
    audioRef.current.play().catch(() => {});

    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      if (!audioRef.current) return;
      audioRef.current.pause();
    }, (end - start) * 1000);
  };

  const refreshTranscriptFromServer = async () => {
    if (!currentMeetingId) return;

    const transcript = await getMeetingTranscript(currentMeetingId);
    const mapped = mapTranscriptSegments(transcript?.segments);

    dispatch(replaceFinalSegments(mapped));
    dispatch(
      setMeetingAudioLinks({
        audioUrl: transcript?.audioUrl || null,
        audioDownloadUrl: transcript?.audioDownloadUrl || null,
      })
    );
    dispatch(setMeetingStatus(transcript?.status || 'READY'));
  };

  const applySpeakerRenames = async (renames) => {
    if (!currentMeetingId) return;

    const normalizedRenames = (Array.isArray(renames) ? renames : [])
      .map((item) => ({
        from: String(item?.from || '').trim(),
        to: String(item?.to || '').trim(),
      }))
      .filter((item) => item.from && item.to && item.from !== item.to);

    if (normalizedRenames.length === 0) return;

    setSpeakerSaving(true);
    setSpeakerEditError('');
    try {
      await updateMeetingSpeakers(currentMeetingId, normalizedRenames);
      await refreshTranscriptFromServer();
    } catch (e) {
      const message = e?.message || '발화자 이름 변경에 실패했습니다.';
      setSpeakerEditError(message);
      window.alert(message);
      throw e;
    } finally {
      setSpeakerSaving(false);
    }
  };

  const handleSpeakerClick = async (segment) => {
    const from = String(segment?.speakerLabel || '').trim();
    if (!from || speakerSaving) return;

    const next = window.prompt('발화자 이름을 입력하세요.', from);
    if (next == null) return;

    const to = String(next).trim();
    if (!to || to === from) return;

    try {
      await applySpeakerRenames([{ from, to }]);
    } catch {
      // applySpeakerRenames 에서 사용자 오류 노출 처리
    }
  };

  const openSpeakerEditor = () => {
    const drafts = {};
    uniqueSpeakers.forEach((speaker) => {
      drafts[speaker] = speaker;
    });
    setSpeakerDrafts(drafts);
    setSpeakerEditError('');
    setSpeakerEditorOpen(true);
  };

  const closeSpeakerEditor = () => {
    if (speakerSaving) return;
    setSpeakerEditorOpen(false);
  };

  const handleSpeakerDraftChange = (from, to) => {
    setSpeakerDrafts((prev) => ({
      ...prev,
      [from]: to,
    }));
  };

  const submitSpeakerEditor = async () => {
    if (speakerSaving) return;

    const renames = uniqueSpeakers
      .map((from) => ({
        from,
        to: String(speakerDrafts[from] || '').trim(),
      }))
      .filter((item) => item.to && item.to !== item.from);

    if (renames.length === 0) {
      setSpeakerEditorOpen(false);
      return;
    }

    try {
      await applySpeakerRenames(renames);
      setSpeakerEditorOpen(false);
    } catch {
      // applySpeakerRenames 에서 사용자 오류 노출 처리
    }
  };

  const hasTaskList = Array.isArray(tasks) && tasks.length > 0;
  const isRecording = status === 'RECORDING' || status === 'LIVE';
  const isProcessing = status === 'PROCESSING' || status === 'POST_PROCESSING' || status === 'STOPPING';
  const isCompleted = status === 'DONE' || status === 'COMPLETED';
  const summaryText =
    summary ||
    (isProcessing
      ? '회의 내용을 정리하고 있습니다. 잠시만 기다려 주세요.'
      : '아직 생성된 요약이 없습니다.');

  return (
    <main className="meeting-main">
      <div className="meeting-header">
        <h2>회의를 시작해 볼까요?</h2>
        <div className="header-badges">
          <span className={`record-badge ${isRecording ? 'on' : ''}`}>
            {isRecording
              ? '● 녹음 중'
              : isProcessing
              ? '처리 중'
              : isCompleted
              ? '완료'
              : '대기 중'}
          </span>

          <span className={`ws-badge ws-${String(wsState).toLowerCase()}`}>
            WS: {wsState}
          </span>
          {meetingAudioDownloadUrl && (
            <a
              className="audio-download-btn"
              href={meetingAudioDownloadUrl}
              download
              title="전체 음성 다운로드"
            >
              음성 다운로드
            </a>
          )}
          {uniqueSpeakers.length > 0 && (
            <button
              type="button"
              className="audio-download-btn speaker-bulk-btn"
              onClick={openSpeakerEditor}
              disabled={speakerSaving}
              title="발화자 일괄 변경"
            >
              발화자 일괄 변경
            </button>
          )}
        </div>
      </div>

      {!hasAnyMessage ? (
        <div className="meeting-empty">
          <h1>회의를 시작해 볼까요?</h1>
          <p>마이크 버튼을 누르면 STT 결과가 채팅 형식으로 표시됩니다.</p>
        </div>
      ) : (
        <div ref={chatAreaRef} className="chat-area">
          {finalSegments.map((seg) => (
            <ChatMessage
              key={`f-${seg.segmentKey}`}
              message={seg}
              onPlaySegment={playSegment}
              onSpeakerClick={handleSpeakerClick}
            />
          ))}

          {partialList.map((seg) => (
            <ChatMessage key={`p-${seg.segmentKey}`} message={seg} isPartial />
          ))}
        </div>
      )}

      {meetingAudioUrl && <audio ref={audioRef} className="hidden-segment-audio" src={meetingAudioUrl} preload="metadata" />}

      {currentMeetingId && (
        <>
          {!analysisOpen && (
            <button
              type="button"
              className="analysis-edge-trigger"
              onMouseEnter={() => setAnalysisOpen(true)}
              onFocus={() => setAnalysisOpen(true)}
              onClick={() => setAnalysisOpen(true)}
              title="요약/할일 열기"
            >
              요약
            </button>
          )}

          <aside className={`analysis-drawer ${analysisOpen ? 'open' : ''}`} aria-hidden={!analysisOpen}>
            <div className="analysis-drawer-content">
              <div className="analysis-title-row">
                <h3>회의 요약 / 할일</h3>
                <div className="analysis-title-actions">
                  {isProcessing && <span className="analysis-chip">AI 분석 중</span>}
                  <button
                    type="button"
                    className="analysis-close-btn"
                    onClick={() => setAnalysisOpen(false)}
                    title="요약 닫기"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="analysis-body">
                <section className="analysis-block">
                  <h4>Summary</h4>
                  <div className="analysis-block-content">
                    <p>{summaryText}</p>
                  </div>
                </section>

                <section className="analysis-block">
                  <h4>Tasks</h4>
                  <div className="analysis-block-content">
                    {hasTaskList ? (
                      <ul className="task-list">
                        {tasks.map((task, idx) => (
                          <li key={`task-${idx}`}>
                            <strong>{task.worker || 'Unknown'}</strong>: {task.task || ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="analysis-empty">
                        {isProcessing
                          ? '할일 목록을 생성 중입니다.'
                          : '등록된 할일이 없습니다.'}
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </aside>
        </>
      )}

      {speakerEditorOpen && (
        <div className="speaker-modal-backdrop" role="dialog" aria-modal="true" aria-label="발화자 이름 일괄 변경">
          <div className="speaker-modal">
            <div className="speaker-modal-header">
              <h3>발화자 이름 일괄 변경</h3>
              <button type="button" className="speaker-modal-close" onClick={closeSpeakerEditor} disabled={speakerSaving}>
                닫기
              </button>
            </div>

            <div className="speaker-modal-body">
              {uniqueSpeakers.map((speaker) => (
                <label key={speaker} className="speaker-edit-row">
                  <span className="speaker-edit-from">{speaker}</span>
                  <input
                    className="speaker-edit-input"
                    value={speakerDrafts[speaker] ?? ''}
                    onChange={(event) => handleSpeakerDraftChange(speaker, event.target.value)}
                    placeholder="새 발화자 이름"
                    disabled={speakerSaving}
                  />
                </label>
              ))}

              {speakerEditError && <p className="speaker-edit-error">{speakerEditError}</p>}
            </div>

            <div className="speaker-modal-actions">
              <button type="button" className="speaker-modal-btn ghost" onClick={closeSpeakerEditor} disabled={speakerSaving}>
                취소
              </button>
              <button type="button" className="speaker-modal-btn primary" onClick={submitSpeakerEditor} disabled={speakerSaving}>
                {speakerSaving ? '저장 중...' : '적용'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ComposerBar />
    </main>
  );
}
