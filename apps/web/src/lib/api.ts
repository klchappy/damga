import axios, { AxiosError } from 'axios';
import { env, isSupabaseConfigured } from './env';
import { getSupabase } from './supabase';

export const api = axios.create({
  baseURL: `${env.apiUrl}/v1`,
  withCredentials: false,
  timeout: 30_000,
});

api.interceptors.request.use(async (config) => {
  if (isSupabaseConfigured) {
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch {
      /* noop */
    }
  }
  return config;
});

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = (err as AxiosError<ApiError>).response?.data;
    if (data?.error) return data.error;
    return err.message ?? 'Bilinmeyen hata';
  }
  if (err instanceof Error) return err.message;
  return 'Bilinmeyen hata';
}
