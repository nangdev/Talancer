import { httpClient } from './httpClient';

function parseSummaryApiError(error) {
  const message =
    error?.response?.data?.errorMessage ||
    error?.response?.data?.message ||
    error?.message ||
    'Summary request failed';
  return new Error(typeof message === 'string' ? message : 'Summary request failed');
}

export async function summarizeText(content) {
  try {
    const { data } = await httpClient.post('/ai/summarize/text', content, {
      headers: { 'Content-Type': 'text/plain' },
    });
    return data;
  } catch (error) {
    throw parseSummaryApiError(error);
  }
}

export async function summarizeFile(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await httpClient.post('/ai/summarize/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  } catch (error) {
    throw parseSummaryApiError(error);
  }
}
