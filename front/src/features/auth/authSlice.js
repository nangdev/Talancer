import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { getMe, login as loginApi, signup as signupApi } from '../../services/authApi';
import {
  clearAuthToken,
  decodeJwtPayload,
  getAuthToken,
  saveAuthToken,
} from '../../services/tokenStorage';

function buildUserFromToken(token, fallbackLoginId = null) {
  const payload = decodeJwtPayload(token);
  return {
    loginId: payload?.sub || fallbackLoginId || null,
    role: payload?.role || null,
    name: null,
  };
}

async function resolveUserProfile(token, fallbackLoginId = null) {
  const fromToken = buildUserFromToken(token, fallbackLoginId);
  try {
    const profile = await getMe();
    if (!profile) {
      return {
        ...fromToken,
        name: fromToken.loginId || null,
      };
    }
    return {
      ...fromToken,
      userId: profile.userId ?? null,
      loginId: profile.loginId || fromToken.loginId || null,
      role: profile.role || fromToken.role || null,
      name: profile.name || profile.loginId || fromToken.loginId || null,
    };
  } catch {
    return {
      ...fromToken,
      name: fromToken.loginId || null,
    };
  }
}

export const bootstrapAuth = createAsyncThunk('auth/bootstrapAuth', async () => {
  const token = getAuthToken();
  if (!token) return { token: null, user: null };
  const user = await resolveUserProfile(token);
  return { token, user };
});

export const login = createAsyncThunk(
  'auth/login',
  async ({ loginId, password }, { rejectWithValue }) => {
    try {
      const token = await loginApi({ loginId, password });
      saveAuthToken(token);
      const user = await resolveUserProfile(token, loginId);
      return { token, user };
    } catch (error) {
      return rejectWithValue(error.message || 'Login failed');
    }
  }
);

export const signup = createAsyncThunk(
  'auth/signup',
  async ({ loginId, password, name }, { rejectWithValue }) => {
    try {
      const message = await signupApi({ loginId, password, name });
      return message;
    } catch (error) {
      return rejectWithValue(error.message || 'Signup failed');
    }
  }
);

const initialState = {
  mode: 'login',
  isLoggedIn: false,
  user: null,
  token: null,
  loading: false,
  error: null,
  signupLoading: false,
  signupMessage: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setMode: (state, action) => {
      state.mode = action.payload;
      state.error = null;
      state.signupMessage = null;
    },
    logout: (state) => {
      clearAuthToken();
      state.isLoggedIn = false;
      state.user = null;
      state.token = null;
      state.error = null;
      state.signupMessage = null;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        const { token, user } = action.payload;
        state.token = token;
        state.user = user;
        state.isLoggedIn = Boolean(token);
      })
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.isLoggedIn = true;
        state.token = action.payload.token;
        state.user = action.payload.user;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      .addCase(signup.pending, (state) => {
        state.signupLoading = true;
        state.error = null;
        state.signupMessage = null;
      })
      .addCase(signup.fulfilled, (state, action) => {
        state.signupLoading = false;
        state.signupMessage = action.payload || 'Signup completed';
        state.mode = 'login';
      })
      .addCase(signup.rejected, (state, action) => {
        state.signupLoading = false;
        state.error = action.payload || action.error.message;
      });
  },
});

export const { setMode, logout, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
