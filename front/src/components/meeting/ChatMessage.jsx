export default function ChatMessage({ message, isPartial = false, onPlaySegment, onSpeakerClick }) {
  const canPlay = !isPartial && typeof onPlaySegment === 'function';
  const canRenameSpeaker = !isPartial && typeof onSpeakerClick === 'function';
  const timeText = `${formatMsRange(message.startMs, message.endMs)}${isPartial ? ' · 입력 중' : ''}`;
  const speakerLabel = message.speakerLabel || '화자';
  const tone = getSpeakerTone(speakerLabel);

  return (
    <div className={`chat-message speaker-tone-${tone} ${isPartial ? 'partial' : ''}`}>
      <div className="chat-message-header">
        {canRenameSpeaker ? (
          <button
            type="button"
            className={`speaker-badge speaker-badge-btn speaker-tone-${tone}`}
            onClick={() => onSpeakerClick(message)}
            title="발화자 이름 수정"
          >
            {speakerLabel}
          </button>
        ) : (
          <span className={`speaker-badge speaker-tone-${tone}`}>{speakerLabel}</span>
        )}
        {canPlay ? (
          <button type="button" className="chat-time chat-time-btn" onClick={() => onPlaySegment(message)}>
            {timeText}
          </button>
        ) : (
          <span className="chat-time">{timeText}</span>
        )}
      </div>
      <p className="chat-text">{message.text || ''}</p>
    </div>
  );
}

function formatMsRange(startMs, endMs) {
  if (typeof startMs !== 'number' || typeof endMs !== 'number') return '지금';

  const start = Math.floor(startMs / 1000);
  const end = Math.floor(endMs / 1000);

  const sMin = String(Math.floor(start / 60)).padStart(2, '0');
  const sSec = String(start % 60).padStart(2, '0');
  const eMin = String(Math.floor(end / 60)).padStart(2, '0');
  const eSec = String(end % 60).padStart(2, '0');

  return `${sMin}:${sSec} ~ ${eMin}:${eSec}`;
}

function getSpeakerTone(speakerLabel) {
  const label = String(speakerLabel || '');
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return hash % 6;
}
