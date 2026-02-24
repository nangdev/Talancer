import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchMeetings,
  promotePartialToFinal,
  replaceFinalSegments,
  setMeetingStatus,
  setWsState,
  upsertPartialSegment,
} from '../../features/meeting/meetingSlice';
import { useMeetingRecorder } from '../../hooks/useMeetingRecorder';
import { AiWsClient } from '../../services/aiWsClient';
import { processMeetingAudio } from '../../services/meetingApi';

function toSegmentFromPartial(msg) {
  const tsMs = Math.floor((msg?.ts || Date.now() / 1000) * 1000);
  const key = `seg-${msg?.idx ?? tsMs}`;
  return {
    segmentKey: key,
    speakerLabel: 'AI',
    text: msg?.text || '',
    startMs: tsMs,
    endMs: tsMs + 1000,
  };
}

export default function ComposerBar() {
  const dispatch = useDispatch();
  const { currentMeetingId } = useSelector((s) => s.meeting);

  const [busy, setBusy] = useState(false);

  const { recording, wsState, error, start, stop } = useMeetingRecorder({
    meetingId: currentMeetingId,
    onSttMessage: (msg) => {
      if (!msg?.type) return;

      if (msg.type === 'partial') {
        dispatch(upsertPartialSegment(toSegmentFromPartial(msg)));
      } else if (msg.type === 'final' && Array.isArray(msg.segments)) {
        const mapped = msg.segments.map((seg) => {
          const tsMs = Math.floor((seg?.ts || Date.now() / 1000) * 1000);
          return {
            segmentKey: `seg-${seg.idx ?? tsMs}`,
            speakerLabel: 'AI',
            text: seg.text || '',
            startMs: tsMs,
            endMs: tsMs + 1000,
          };
        });
        if (mapped.length > 0) {
          dispatch(replaceFinalSegments(mapped));
        }
      } else if (msg.type === 'partial_error' || msg.type === 'error') {
        console.error('AI message error:', msg);
      }
    },
  });

  const handleStart = async () => {
    if (!currentMeetingId) {
      alert('Create or select a meeting first.');
      return;
    }

    try {
      setBusy(true);
      dispatch(setWsState('CONNECTING'));
      dispatch(setMeetingStatus('RECORDING'));
      await start(AiWsClient);
      dispatch(setWsState('OPEN'));
    } catch (e) {
      console.error(e);
      dispatch(setMeetingStatus('FAILED'));
      dispatch(setWsState('ERROR'));
      alert(e.message || 'Failed to start recording');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    try {
      setBusy(true);
      const result = await stop();
      dispatch(setWsState('CLOSED'));
      if (!result) {
        dispatch(setMeetingStatus('READY'));
        return;
      }

      dispatch(promotePartialToFinal());
      dispatch(setMeetingStatus('STOPPING'));
      await processMeetingAudio({
        meetingId: currentMeetingId,
        audioBlob: result.blob,
      });
      dispatch(setMeetingStatus('POST_PROCESSING'));

      await dispatch(fetchMeetings());
    } catch (e) {
      console.error(e);
      dispatch(setMeetingStatus('FAILED'));
      alert(e.message || 'Failed to stop recording');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        <input
          className="composer-input"
          value={
            recording
              ? `Collecting realtime transcript... (WS: ${wsState})`
              : 'Press mic button to start recording.'
          }
          readOnly
        />

        <div className="composer-actions">
          {!recording ? (
            <button
              type="button"
              className="icon-btn mic-btn"
              onClick={handleStart}
              disabled={busy}
              title="Start recording"
            >
              Mic
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn mic-btn recording"
              onClick={handleStop}
              disabled={busy}
              title="Stop recording"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {(error || busy) && <p className="composer-help">{error || (busy ? 'Processing...' : '')}</p>}
    </div>
  );
}
