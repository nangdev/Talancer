import axios from 'axios';

const aiHttpClient = axios.create({
  baseURL: import.meta.env.VITE_AI_SERVER_BASE_URL || '/ai',
  timeout: 30000,
});

function parseAiApiError(error) {
  const detail = error?.response?.data?.detail;
  const message =
    (typeof detail === 'string' && detail) ||
    error?.response?.data?.message ||
    error?.message ||
    'AI server request failed';
  return new Error(message);
}

export async function sttBatch({ meetingId, audioBlob, language = 'ko' }) {
  try {
    const formData = new FormData();
    formData.append('meeting_id', String(meetingId));
    formData.append('language', language);
    formData.append('audio', audioBlob, `meeting-${meetingId}.webm`);

    const { data } = await aiHttpClient.post('/stt/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });

    return data;
  } catch (error) {
    throw parseAiApiError(error);
  }
}
