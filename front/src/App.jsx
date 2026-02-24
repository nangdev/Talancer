import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import AuthPage from './pages/AuthPage';
import MeetingPage from './pages/MeetingPage';
import { bootstrapAuth } from './features/auth/authSlice';

export default function App() {
  const dispatch = useDispatch();
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);

  useEffect(() => {
    dispatch(bootstrapAuth());
  }, [dispatch]);

  return isLoggedIn ? <MeetingPage /> : <AuthPage />;
}
