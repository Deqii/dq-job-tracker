import axios, { AxiosError } from 'axios';

import type { AuthResponse, User } from '../types';

const baseURL: string = import.meta.env.VITE_API_URL ?? '';

export const TOKEN_KEY = 'jobtracker.token';
export const USER_KEY = 'jobtracker.user';

export const api = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

export function getStoredAuth(): { token: string | null; user: User | null } {
  let user: User | null = null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) user = JSON.parse(raw) as User;
  } catch {
    user = null;
  }
  return { token: localStorage.getItem(TOKEN_KEY), user };
}

export function storeAuth(auth: AuthResponse): void {
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const hadSession = Boolean(localStorage.getItem(TOKEN_KEY));
      clearStoredAuth();
      if (hadSession && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

interface ApiErrorBody {
  message?: string;
  errors?: Record<string, string[]>;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body?.message) return body.message;
    if (body?.errors) {
      const first = Object.values(body.errors)[0];
      if (first && first.length > 0) return first[0] as string;
    }
    if (error.response?.status === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (error.code === 'ERR_NETWORK') {
      return 'Cannot reach the server. Make sure the API is running and that VITE_API_URL is correct.';
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}