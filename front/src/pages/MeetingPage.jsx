import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Sidebar from '../components/meeting/Sidebar'
import MeetingMain from '../components/meeting/MeetingMain'
import {
  fetchMeetings,
  replaceFinalSegments,
  setAnalysis,
  setMeetingAudioLinks,
  setMeetingStatus,
} from '../features/meeting/meetingSlice';
import { getMeetingAnalysis, getMeetingTranscript } from '../services/meetingApi';

function mapTranscriptSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map((seg, index) => {
    const startSec = Number(seg.start || 0);
    const endSec = Number(seg.end || startSec + 1);
    return {
      segmentKey: `db-${seg.verbId ?? index}`,
      speakerLabel: seg.speaker || 'SPEAKER_UNKNOWN',
      text: seg.text || '',
      startMs: Math.floor(startSec * 1000),
      endMs: Math.floor(endSec * 1000),
    };
  });
}

function notifyBrowserCompleted(meetingId) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  const title = '회의 분석 완료';
  const options = {
    body: `회의 #${meetingId} 요약과 할일이 준비되었습니다.`,
    tag: `meeting-${meetingId}-analysis-ready`,
  };

  if (Notification.permission === 'granted') {
    new Notification(title, options);
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, options);
      }
    });
  }
}

function isProcessingStatus(status) {
  return status === 'POST_PROCESSING' || status === 'PROCESSING' || status === 3 || status === '3';
}

function isCompletedStatus(status) {
  return status === 'COMPLETED' || status === 'DONE' || status === 4 || status === '4';
}

function isFailedStatus(status) {
  return status === 'FAILED' || status === 5 || status === '5';
}

export default function MeetingPage() {
  const dispatch = useDispatch();
  const currentMeetingId = useSelector((state) => state.meeting.currentMeetingId);
  const meetingStatus = useSelector((state) => state.meeting.status);
  const wsState = useSelector((state) => state.meeting.wsState);
  const meetings = useSelector((state) => state.meeting.meetings || []);
  const finalSegmentCount = useSelector((state) => state.meeting.finalSegments.length);
  const partialSegmentCount = useSelector(
    (state) => Object.keys(state.meeting.partialSegments || {}).length
  );
  const currentAudioUrl = useSelector((state) => state.meeting.meetingAudioUrl);
  const currentAudioDownloadUrl = useSelector((state) => state.meeting.meetingAudioDownloadUrl);
  const processingMeetingsRef = useRef(new Set());
  const notifiedMeetingsRef = useRef(new Set());
  const meetingStatusSnapshotRef = useRef(new Map());
  const toastTimerRef = useRef(null);
  const audioUrlRef = useRef(currentAudioUrl);
  const audioDownloadUrlRef = useRef(currentAudioDownloadUrl);
  const finalSegmentCountRef = useRef(finalSegmentCount);
  const partialSegmentCountRef = useRef(partialSegmentCount);
  const [toastMessage, setToastMessage] = useState('');

  const showCompletedToast = (meetingId) => {
    setToastMessage(`회의 #${meetingId} 분석이 완료되었습니다.`);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 3500);
  };

  useEffect(() => {
    dispatch(fetchMeetings());
  }, [dispatch]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    audioUrlRef.current = currentAudioUrl;
  }, [currentAudioUrl]);

  useEffect(() => {
    audioDownloadUrlRef.current = currentAudioDownloadUrl;
  }, [currentAudioDownloadUrl]);

  useEffect(() => {
    finalSegmentCountRef.current = finalSegmentCount;
  }, [finalSegmentCount]);

  useEffect(() => {
    partialSegmentCountRef.current = partialSegmentCount;
  }, [partialSegmentCount]);

  useEffect(() => {
    for (const meeting of meetings) {
      if (!meeting?.id) continue;
      const status = meeting?.status;
      if (isProcessingStatus(status)) {
        processingMeetingsRef.current.add(meeting.id);
        notifiedMeetingsRef.current.delete(meeting.id);
      }
      if (!meetingStatusSnapshotRef.current.has(meeting.id)) {
        meetingStatusSnapshotRef.current.set(meeting.id, status);
      }
    }
  }, [meetings]);

  useEffect(() => {
    const hasProcessingMeeting =
      meetingStatus === 'STOPPING' ||
      isProcessingStatus(meetingStatus) ||
      meetings.some((meeting) => isProcessingStatus(meeting?.status));
    if (!hasProcessingMeeting) return;

    let active = true;
    let pollTimer = null;

    const pollMeetingStatuses = async () => {
      try {
        const nextMeetings = await dispatch(fetchMeetings()).unwrap();
        if (!active) return;

        const nextIds = new Set();
        for (const meeting of nextMeetings) {
          const meetingId = meeting?.id;
          if (!meetingId) continue;
          nextIds.add(meetingId);

          const prevStatus = meetingStatusSnapshotRef.current.get(meetingId);
          const nextStatus = meeting?.status;

          if (isProcessingStatus(nextStatus)) {
            processingMeetingsRef.current.add(meetingId);
            notifiedMeetingsRef.current.delete(meetingId);
          }

          const shouldNotify =
            !notifiedMeetingsRef.current.has(meetingId) &&
            (isProcessingStatus(prevStatus) || processingMeetingsRef.current.has(meetingId)) &&
            isCompletedStatus(nextStatus);

          if (shouldNotify) {
            notifiedMeetingsRef.current.add(meetingId);
            processingMeetingsRef.current.delete(meetingId);
            showCompletedToast(meetingId);
            notifyBrowserCompleted(meetingId);
          }

          if (isFailedStatus(nextStatus)) {
            processingMeetingsRef.current.delete(meetingId);
          }

          meetingStatusSnapshotRef.current.set(meetingId, nextStatus);
        }

        for (const meetingId of Array.from(meetingStatusSnapshotRef.current.keys())) {
          if (!nextIds.has(meetingId)) {
            meetingStatusSnapshotRef.current.delete(meetingId);
            processingMeetingsRef.current.delete(meetingId);
            notifiedMeetingsRef.current.delete(meetingId);
          }
        }
      } catch (e) {
        console.error('Failed to poll meeting statuses', e);
      } finally {
        if (active) {
          pollTimer = window.setTimeout(pollMeetingStatuses, 4000);
        }
      }
    };

    pollTimer = window.setTimeout(pollMeetingStatuses, 3000);

    return () => {
      active = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [dispatch, meetings]);

  useEffect(() => {
    if (!currentMeetingId) return;
    const isRealtimeStreaming =
      meetingStatus === 'STOPPING' ||
      meetingStatus === 'RECORDING' ||
      meetingStatus === 'LIVE' ||
      wsState === 'OPEN' ||
      wsState === 'CONNECTING';

    if (isRealtimeStreaming) return;

    let active = true;

    if (isProcessingStatus(meetingStatus)) {
      processingMeetingsRef.current.add(currentMeetingId);
      notifiedMeetingsRef.current.delete(currentMeetingId);
    }

    let pollTimer = null;
    const syncMeeting = async () => {
      try {
        const transcript = await getMeetingTranscript(currentMeetingId);
        if (!active) return;

        const mapped = mapTranscriptSegments(transcript?.segments);
        const serverStatus = transcript?.status || 'READY';
        const hasLocalSegments =
          finalSegmentCountRef.current > 0 || partialSegmentCountRef.current > 0;
        const isLocalProcessing =
          meetingStatus === 'STOPPING' || isProcessingStatus(meetingStatus);
        const isStaleCompletedWithoutSegments =
          isCompletedStatus(serverStatus) && mapped.length === 0 && hasLocalSegments && isLocalProcessing;

        if (isStaleCompletedWithoutSegments) {
          pollTimer = window.setTimeout(syncMeeting, 1200);
          return;
        }

        const isProcessingLike = isProcessingStatus(serverStatus);
        const shouldKeepLocalSegments =
          mapped.length === 0 && hasLocalSegments && (isProcessingLike || isLocalProcessing);
        const nextAudioUrl =
          transcript?.audioUrl ||
          (isProcessingLike ? audioUrlRef.current : null);
        const nextAudioDownloadUrl =
          transcript?.audioDownloadUrl ||
          (isProcessingLike ? audioDownloadUrlRef.current : null);

        if (!shouldKeepLocalSegments) {
          dispatch(replaceFinalSegments(mapped));
        }
        dispatch(
          setMeetingAudioLinks({
            audioUrl: nextAudioUrl,
            audioDownloadUrl: nextAudioDownloadUrl,
          })
        );
        dispatch(setMeetingStatus(serverStatus));

        if (isProcessingStatus(serverStatus)) {
          processingMeetingsRef.current.add(currentMeetingId);
          notifiedMeetingsRef.current.delete(currentMeetingId);
        }

        let analysis = null;
        if (isCompletedStatus(serverStatus)) {
          analysis = await getMeetingAnalysis(currentMeetingId).catch(() => null);
          if (!active) return;
        }

        dispatch(
          setAnalysis({
            summary: analysis?.summary ?? transcript?.summary ?? null,
            tasks: Array.isArray(analysis?.tasks) ? analysis.tasks : transcript?.tasks || [],
          })
        );

        if (isCompletedStatus(serverStatus)) {
          const shouldNotify =
            processingMeetingsRef.current.has(currentMeetingId) &&
            !notifiedMeetingsRef.current.has(currentMeetingId);

          if (shouldNotify) {
            notifiedMeetingsRef.current.add(currentMeetingId);
            showCompletedToast(currentMeetingId);
            notifyBrowserCompleted(currentMeetingId);
            dispatch(fetchMeetings());
          }
          return;
        }

        if (isFailedStatus(serverStatus)) return;

        const shouldPoll =
          isProcessingStatus(serverStatus) ||
          isProcessingStatus(meetingStatus);

        if (shouldPoll) {
          pollTimer = window.setTimeout(syncMeeting, 3000);
        }
      } catch (e) {
        console.error('Failed to load transcript', e);
        const shouldRetry = meetingStatus === 'STOPPING' || isProcessingStatus(meetingStatus);
        if (active && shouldRetry) {
          pollTimer = window.setTimeout(syncMeeting, 4000);
        }
      }
    };

    syncMeeting();

    return () => {
      active = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [
    currentMeetingId,
    meetingStatus,
    wsState,
    dispatch,
  ]);

  return (
    <div className="meeting-layout">
      <Sidebar />
      <MeetingMain />
      {toastMessage && (
        <div className="analysis-complete-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  )
}
