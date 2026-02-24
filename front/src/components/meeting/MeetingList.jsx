import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { deleteMeetingAsync, selectMeeting } from '../../features/meeting/meetingSlice';

export default function MeetingList() {
  const dispatch = useDispatch();
  const meetingState = useSelector((state) => state.meeting) || {};
  const [menuMeetingId, setMenuMeetingId] = useState(null);
  const openedMenuRef = useRef(null);

  const meetings = meetingState.meetings ?? [];
  const currentMeetingId = meetingState.currentMeetingId ?? null;
  const loading = meetingState.loading ?? false;
  const deletingMeetingId = meetingState.deletingMeetingId ?? null;
  const error = meetingState.error ?? null;

  useEffect(() => {
    const onOutsideClick = (event) => {
      if (!openedMenuRef.current) return;
      if (openedMenuRef.current.contains(event.target)) return;
      setMenuMeetingId(null);
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') setMenuMeetingId(null);
    };

    document.addEventListener('mousedown', onOutsideClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const handleDelete = async (meeting) => {
    if (!meeting?.id) return;
    const confirmed = window.confirm(`"${meeting.title}" 회의를 삭제할까요?`);
    if (!confirmed) return;
    setMenuMeetingId(null);
    dispatch(deleteMeetingAsync(meeting.id));
  };

  const toggleMenu = (event, meetingId) => {
    event.stopPropagation();
    setMenuMeetingId((prev) => (prev === meetingId ? null : meetingId));
  };

  const handleSelectMeeting = (meetingId) => {
    setMenuMeetingId(null);
    dispatch(selectMeeting(meetingId));
  };

  return (
    <div className="meeting-list">
      <p className="sidebar-section-title">Meetings</p>

      {loading && <p className="empty-meeting-text">Loading...</p>}
      {!loading && error && <p className="empty-meeting-text">{error}</p>}

      {!loading && !error && meetings.length === 0 ? (
        <p className="empty-meeting-text">No meetings yet.</p>
      ) : (
        meetings.map((meeting) => (
          <div
            key={meeting.id}
            className={`meeting-item-row ${currentMeetingId === meeting.id ? 'active' : ''} ${
              menuMeetingId === meeting.id ? 'menu-open' : ''
            }`}
          >
            <button
              type="button"
              className={`meeting-item ${currentMeetingId === meeting.id ? 'active' : ''}`}
              onClick={() => handleSelectMeeting(meeting.id)}
            >
              <span className="meeting-item-title">{meeting.title}</span>
              <span className="meeting-item-time">{meeting.updatedAt}</span>
            </button>

            <div
              className="meeting-item-menu"
              ref={menuMeetingId === meeting.id ? openedMenuRef : null}
            >
              <button
                type="button"
                className="meeting-menu-trigger"
                onClick={(event) => toggleMenu(event, meeting.id)}
                title="회의 메뉴"
              >
                ...
              </button>

              {menuMeetingId === meeting.id && (
                <div className="meeting-menu-popover">
                  {meeting.audioDownloadUrl && (
                    <a
                      className="meeting-menu-item"
                      href={meeting.audioDownloadUrl}
                      download
                      onClick={() => setMenuMeetingId(null)}
                    >
                      전체 음성 다운로드
                    </a>
                  )}
                  <button
                    type="button"
                    className="meeting-menu-item danger"
                    onClick={() => handleDelete(meeting)}
                    disabled={deletingMeetingId === meeting.id}
                  >
                    {deletingMeetingId === meeting.id ? '삭제 중...' : '회의 삭제'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
