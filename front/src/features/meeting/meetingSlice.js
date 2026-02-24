import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { createMeeting, deleteMeeting, getMeetings } from '../../services/meetingApi';

function getMeetingSortTime(meeting) {
  const source = meeting?.updateTime || meeting?.endedAt || meeting?.startAt;
  if (!source) return 0;

  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return 0;

  return date.getTime();
}

function formatMeetingTime(meeting) {
  const ts = getMeetingSortTime(meeting);
  if (!ts) return '-';

  return new Date(ts).toLocaleString();
}

function sortMeetingsByLatest(list) {
  return [...list].sort((a, b) => (b.sortTs ?? 0) - (a.sortTs ?? 0));
}

function mapMeetingDto(meeting) {
  const sortTs = getMeetingSortTime(meeting);
  return {
    id: meeting.meetingId,
    title: meeting.title || 'Untitled Meeting',
    updatedAt: formatMeetingTime(meeting),
    sortTs,
    status: meeting.status || 'CREATED',
    audioDownloadUrl: meeting.audioDownloadUrl || null,
    raw: meeting,
  };
}

export const fetchMeetings = createAsyncThunk(
  'meeting/fetchMeetings',
  async (_, { rejectWithValue }) => {
    try {
      const list = await getMeetings();
      return list.map(mapMeetingDto);
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to fetch meetings');
    }
  }
);

export const createMeetingAsync = createAsyncThunk(
  'meeting/createMeeting',
  async ({ title }, { rejectWithValue }) => {
    try {
      const created = await createMeeting({ title });
      return mapMeetingDto(created);
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to create meeting');
    }
  }
);

export const deleteMeetingAsync = createAsyncThunk(
  'meeting/deleteMeeting',
  async (meetingId, { rejectWithValue }) => {
    try {
      await deleteMeeting(meetingId);
      return meetingId;
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to delete meeting');
    }
  }
);

const initialState = {
  meetings: [],
  currentMeetingId: null,
  loading: false,
  deletingMeetingId: null,
  error: null,

  status: 'READY',
  wsState: 'CLOSED',
  partialSegments: {},
  finalSegments: [],
  summary: null,
  tasks: [],
  meetingAudioUrl: null,
  meetingAudioDownloadUrl: null,
};

const meetingSlice = createSlice({
  name: 'meeting',
  initialState,
  reducers: {
    selectMeeting(state, action) {
      state.currentMeetingId = action.payload;
      state.partialSegments = {};
      state.finalSegments = [];
      state.summary = null;
      state.tasks = [];
      state.meetingAudioUrl = null;
      state.meetingAudioDownloadUrl = null;
      state.status = 'READY';
      state.wsState = 'CLOSED';
    },
    setMeetingStatus(state, action) {
      state.status = action.payload;
    },
    setWsState(state, action) {
      state.wsState = action.payload;
    },
    upsertPartialSegment(state, action) {
      const seg = action.payload;
      if (!seg?.segmentKey) return;
      state.partialSegments[seg.segmentKey] = seg;
    },
    addFinalSegment(state, action) {
      const seg = action.payload;
      if (!seg?.segmentKey) return;

      if (state.partialSegments[seg.segmentKey]) {
        delete state.partialSegments[seg.segmentKey];
      }

      const idx = state.finalSegments.findIndex((s) => s.segmentKey === seg.segmentKey);
      if (idx >= 0) {
        state.finalSegments[idx] = seg;
      } else {
        state.finalSegments.push(seg);
      }

      state.finalSegments.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
    },
    updateSpeakerLabel(state, action) {
      const { segmentKey, speakerLabel } = action.payload || {};
      if (!segmentKey) return;

      const partial = state.partialSegments[segmentKey];
      if (partial) partial.speakerLabel = speakerLabel;

      const final = state.finalSegments.find((s) => s.segmentKey === segmentKey);
      if (final) final.speakerLabel = speakerLabel;
    },
    promotePartialToFinal(state) {
      const partialList = Object.values(state.partialSegments || {})
        .filter((seg) => seg?.segmentKey)
        .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));

      if (partialList.length === 0) return;

      const merged = [...state.finalSegments];
      const indexByKey = new Map(merged.map((seg, index) => [seg.segmentKey, index]));

      for (const seg of partialList) {
        const idx = indexByKey.get(seg.segmentKey);
        if (idx == null) {
          indexByKey.set(seg.segmentKey, merged.length);
          merged.push(seg);
        } else {
          merged[idx] = seg;
        }
      }

      merged.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
      state.finalSegments = merged;
      state.partialSegments = {};
    },
    resetSegments(state) {
      state.partialSegments = {};
      state.finalSegments = [];
      state.meetingAudioUrl = null;
      state.meetingAudioDownloadUrl = null;
    },
    replaceFinalSegments(state, action) {
      state.finalSegments = Array.isArray(action.payload) ? action.payload : [];
      state.finalSegments.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
      state.partialSegments = {};
    },
    setAnalysis(state, action) {
      const payload = action.payload || {};
      state.summary = payload.summary || null;
      state.tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    },
    setMeetingAudioLinks(state, action) {
      const payload = action.payload || {};
      state.meetingAudioUrl = payload.audioUrl || null;
      state.meetingAudioDownloadUrl = payload.audioDownloadUrl || null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMeetings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMeetings.fulfilled, (state, action) => {
        state.loading = false;
        state.meetings = sortMeetingsByLatest(action.payload);
        if (!state.currentMeetingId && action.payload.length > 0) {
          state.currentMeetingId = state.meetings[0].id;
        }
      })
      .addCase(fetchMeetings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      .addCase(createMeetingAsync.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createMeetingAsync.fulfilled, (state, action) => {
        state.loading = false;
        state.meetings = sortMeetingsByLatest([action.payload, ...state.meetings]);
        state.currentMeetingId = action.payload.id;
        state.status = 'READY';
        state.wsState = 'CLOSED';
        state.partialSegments = {};
        state.finalSegments = [];
        state.summary = null;
        state.tasks = [];
        state.meetingAudioUrl = null;
        state.meetingAudioDownloadUrl = null;
      })
      .addCase(createMeetingAsync.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      .addCase(deleteMeetingAsync.pending, (state, action) => {
        state.deletingMeetingId = action.meta.arg ?? null;
        state.error = null;
      })
      .addCase(deleteMeetingAsync.fulfilled, (state, action) => {
        state.deletingMeetingId = null;
        state.meetings = state.meetings.filter((meeting) => meeting.id !== action.payload);

        if (state.currentMeetingId === action.payload) {
          state.currentMeetingId = state.meetings.length > 0 ? state.meetings[0].id : null;
          state.partialSegments = {};
          state.finalSegments = [];
          state.summary = null;
          state.tasks = [];
          state.meetingAudioUrl = null;
          state.meetingAudioDownloadUrl = null;
          state.status = 'READY';
          state.wsState = 'CLOSED';
        }
      })
      .addCase(deleteMeetingAsync.rejected, (state, action) => {
        state.deletingMeetingId = null;
        state.error = action.payload || action.error.message;
      });
  },
});

export const {
  selectMeeting,
  setMeetingStatus,
  setWsState,
  upsertPartialSegment,
  addFinalSegment,
  updateSpeakerLabel,
  promotePartialToFinal,
  resetSegments,
  replaceFinalSegments,
  setAnalysis,
  setMeetingAudioLinks,
} = meetingSlice.actions;

export default meetingSlice.reducer;
