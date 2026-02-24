import { useDispatch, useSelector } from 'react-redux';
import { createMeetingAsync } from '../../features/meeting/meetingSlice';
import { logout } from '../../features/auth/authSlice';
import MeetingList from './MeetingList';

export default function Sidebar() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const displayName = user?.name || user?.loginId || 'User';

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button
          className="new-meeting-btn"
          onClick={() => dispatch(createMeetingAsync({ title: 'New Meeting' }))}
        >
          + New Meeting
        </button>

        <MeetingList />
      </div>

      <div className="sidebar-bottom">
        <div className="user-box">
          <div className="user-avatar">{displayName.toString().charAt(0)}</div>
          <div className="user-info">
            <p className="user-name">{displayName}</p>
            <p className="user-id">{user?.loginId ? `@${user.loginId}` : 'guest'}</p>
          </div>
        </div>
        <button className="logout-btn" onClick={() => dispatch(logout())}>
          Logout
        </button>
      </div>
    </aside>
  );
}
