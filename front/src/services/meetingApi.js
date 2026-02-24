import { httpClient } from './httpClient';

function parseMeetingApiError(error) {
  const message =
    error?.response?.data?.errorMessage ||
    error?.response?.data?.message ||
    error?.message ||
    'Meeting request failed';
  return new Error(typeof message === 'string' ? message : 'Meeting request failed');
}

export async function getMeetings() {
  try {
    const { data } = await httpClient.get('/meetings');
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}

export async function getMeeting(id) {
  try {
    const { data } = await httpClient.get(`/meetings/${id}`);
    return data;
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}

export async function createMeeting(payload) {
  try {
    const { data } = await httpClient.post('/meetings', payload);
    return data;
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}

export async function deleteMeeting(meetingId) {
  try {
    await httpClient.delete(`/meetings/${meetingId}`);
    return meetingId;
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}

export async function processMeetingAudio({ meetingId, audioBlob, language = 'ko' }) {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, `meeting-${meetingId}.webm`);
    formData.append('language', language);
    formData.append('min_speakers', '3');
    formData.append('max_speakers', '4');

    const { data } = await httpClient.post(`/stt/meetings/${meetingId}/process`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 240000,
    });
    return data;
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}

export async function getMeetingTranscript(meetingId) {
  try {
    const { data } = await httpClient.get(`/stt/meetings/${meetingId}/transcript`);
    return data;
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}

export async function updateMeetingSpeakers(meetingId, renames) {
  try {
    const safeRenames = Array.isArray(renames) ? renames : [];
    const { data } = await httpClient.patch(`/stt/meetings/${meetingId}/speakers`, {
      renames: safeRenames,
    });
    return data;
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}

export async function getMeetingAnalysis(meetingId) {
  try {
    const { data } = await httpClient.get(`/meetings/${meetingId}/analysis`);
    return data;
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}

function parseFilenameFromDisposition(disposition, fallbackName) {
  if (!disposition || typeof disposition !== 'string') return fallbackName;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) return plainMatch[1];

  return fallbackName;
}

export async function downloadMeetingAnalysis(meetingId) {
  try {
    const response = await httpClient.get(`/meetings/${meetingId}/analysis/download`, {
      responseType: 'blob',
    });

    const fallbackName = `meeting-${meetingId}-analysis.txt`;
    const fileName = parseFilenameFromDisposition(
      response.headers?.['content-disposition'],
      fallbackName
    );

    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    throw parseMeetingApiError(error);
  }
}
