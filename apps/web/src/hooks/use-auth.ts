import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/env';
import { api } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'manager' | 'admin' | 'owner';
  org_id: string | null;
  department?: string | null;
  title?: string | null;
  avatar_url?: string | null;
  current_streak: number;
  longest_streak: number;
  total_xp: number;
  level: number;
  shields: number;
  annual_leave_quota_days: number;
  annual_leave_used_days: number;
}

interface AuthStore {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  setSession: (s: Session | null) => void;
  setLoading: (b: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  // İlk render: bootlanmamış, splash gerekir.
  // useAuthBoot session/profile akışını bitirince false'a çeker.
  loading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),
}));

/** App boot'ta çağrılır — Supabase session dinler, /v1/auth/me ile profil çeker. */
export function useAuthBoot() {
  const bootedRef = useRef(false);

  useEffect(() => {
    // StrictMode double-mount koruması: useRef ile tek seferlik koşum
    if (bootedRef.current) return;
    bootedRef.current = true;

    const { setUser, setSession, setLoading } = useAuthStore.getState();

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let supabase: ReturnType<typeof getSupabase>;
    try {
      supabase = getSupabase();
    } catch (err) {
      console.error('[auth] getSupabase init failed:', err);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const { data } = await api.get<{ user: AuthUser }>('/auth/me');
        if (!cancelled) setUser(data.user);
      } catch (err) {
        console.warn('[auth] /auth/me failed:', err);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Hard timeout: 3 saniye — Supabase getSession bazen sessizce hang ediyor
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        console.warn('[auth] boot timeout 3s, forcing loading=false');
        setLoading(false);
      }
    }, 3000);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        if (error) console.warn('[auth] getSession error:', error.message);
        setSession(data?.session ?? null);
        if (data?.session) void fetchProfile();
        else setLoading(false);
      })
      .catch((err) => {
        console.error('[auth] getSession threw:', err);
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setLoading(false);
        }
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) void fetchProfile();
      else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function sendMagicLink(email: string) {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}

export async function sendPasswordReset(email: string) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw error;
}
