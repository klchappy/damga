import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/env';
import { api } from '@/lib/api';

export type EmployeePageKey =
  | 'home'
  | 'history'
  | 'leaves'
  | 'menu'
  | 'announcements'
  | 'profile'
  | 'mood'
  | 'status';

export const DEFAULT_EMPLOYEE_PAGES: EmployeePageKey[] = [
  'home',
  'menu',
  'announcements',
  'profile',
];

export interface OrgSettings {
  logo_url?: string;
  primary_color?: string;
  default_timezone?: string;
  allow_self_edit_request?: boolean;
  allow_outside_geofence?: boolean;
  require_nfc?: boolean;
  allow_manual_entry?: boolean;
  /** undefined ise DEFAULT_EMPLOYEE_PAGES kullan */
  employee_visible_pages?: EmployeePageKey[];
}

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
  settings: OrgSettings;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'employee' | 'manager' | 'admin' | 'owner';
  org_id: string | null;
  is_pending: boolean;
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
  org: AuthOrg | null;
  session: Session | null;
  loading: boolean;
  /** Sign-in başarılı olduktan sonra 5 saniye boyunca damga splash'ı tutmak için */
  signInTransition: boolean;
  setUser: (u: AuthUser | null) => void;
  setOrg: (o: AuthOrg | null) => void;
  setSession: (s: Session | null) => void;
  setLoading: (b: boolean) => void;
  /** Sign-in başarılı olduğunda çağrılır — 5 sn damga animasyonu gösterilir */
  startSignInTransition: (durationMs?: number) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  org: null,
  session: null,
  // İlk render: bootlanmamış, splash gerekir.
  // useAuthBoot session/profile akışını bitirince false'a çeker.
  loading: true,
  signInTransition: false,
  setUser: (user) => set({ user }),
  setOrg: (org) => set({ org }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),
  startSignInTransition: (durationMs = 5000) => {
    set({ signInTransition: true });
    window.setTimeout(() => set({ signInTransition: false }), durationMs);
  },
}));

/** App boot'ta çağrılır — Supabase session dinler, /v1/auth/me ile profil çeker. */
export function useAuthBoot() {
  const bootedRef = useRef(false);

  useEffect(() => {
    // StrictMode double-mount koruması: useRef ile tek seferlik koşum
    if (bootedRef.current) return;
    bootedRef.current = true;

    const { setUser, setOrg, setSession, setLoading } = useAuthStore.getState();

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

    // Splash en az 2.5 sn görünsün (damga animasyonu güzel görünsün)
    const bootStart = Date.now();
    const MIN_SPLASH_MS = 2500;
    const finishLoading = () => {
      if (cancelled) return;
      const elapsed = Date.now() - bootStart;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      window.setTimeout(() => {
        if (!cancelled) setLoading(false);
      }, wait);
    };

    const fetchProfile = async () => {
      try {
        const { data } = await api.get<{ user: AuthUser; org: AuthOrg | null }>('/auth/me');
        if (!cancelled) {
          setUser(data.user);
          setOrg(data.org);
        }
      } catch (err) {
        console.warn('[auth] /auth/me failed:', err);
        if (!cancelled) {
          setUser(null);
          setOrg(null);
        }
      } finally {
        finishLoading();
      }
    };

    // Hard timeout: 5 saniye — Supabase getSession bazen sessizce hang ediyor
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        console.warn('[auth] boot timeout 5s, forcing loading=false');
        setLoading(false);
      }
    }, 5000);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        if (error) console.warn('[auth] getSession error:', error.message);
        setSession(data?.session ?? null);
        if (data?.session) void fetchProfile();
        else finishLoading();
      })
      .catch((err) => {
        console.error('[auth] getSession threw:', err);
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          finishLoading();
        }
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) void fetchProfile();
      else {
        setUser(null);
        setOrg(null);
        finishLoading();
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
