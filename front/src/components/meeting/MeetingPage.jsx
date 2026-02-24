import Sidebar from '../components/meeting/Sidebar';
import MeetingMain from '../components/meeting/MeetingMain';

export default function MeetingPage() {
  return (
    <div className="meeting-layout">
      <Sidebar />
      <MeetingMain />
    </div>
  );
}