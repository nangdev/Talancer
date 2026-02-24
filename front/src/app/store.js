import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import meetingReducer from '../features/meeting/meetingSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    meeting: meetingReducer,
  },
});