import { httpClient } from './httpClient';

function parseApiError(error) {
  const message =
    error?.response?.data?.errorMessage ||
    error?.response?.data?.message ||
    error?.message ||
    'Request failed';
  return new Error(typeof message === 'string' ? message : 'Request failed');
}

export async function signup(payload) {
  try {
    const { data } = await httpClient.post('/users/sign-up', payload);
    return data?.message || 'Signup completed';
  } catch (error) {
    throw parseApiError(error);
  }
}

export async function login(payload) {
  try {
    const { data } = await httpClient.post('/users/login', payload);
    const token = data?.data?.accessToken;
    if (!token) {
      throw new Error('Token is missing in response');
    }
    return token;
  } catch (error) {
    throw parseApiError(error);
  }
}

export async function getMe() {
  try {
    const { data } = await httpClient.get('/users/me');
    return data?.data || null;
  } catch (error) {
    throw parseApiError(error);
  }
}
