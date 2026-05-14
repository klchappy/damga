import { useEffect } from 'react';
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
  /** Her damgada otomatik selfie zorla (KVKK uyumlu, ekranda bilgilendirilir) */
  auto_selfie_every_stamp?: boolean;
  /** Onboarding tamamlandıysa ISO timestamp */
  onboarding_completed_at?: string;
  /** Owner "atla" derse ISO timestamp — wizard tekrar gösterilmez */
  onboarding_skipped_at?: string;
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
  username?: string | null;
  phone?: string | null;
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

/**
 * App boot'ta çağrılır — Supabase session dinler, /v1/auth/me ile profil çeker.
 *
 * StrictMode (dev) iki kez mount eder. Daha önce useRef ile early-return ediyorduk;
 * ama bu davranış unmount → cleanup → remount sonrası dinleyici BIRAKMADAN
 * dönüyordu → sign-in sonrası onAuthStateChange asla işlenmiyordu (üretimde de
 * remount olabiliyor). Şimdi her mount kendi scope'unu kuruyor; eski mount'ların
 * `cancelled` bayrağı stale yazımları engelliyor.
 */
export function useAuthBoot() {
  useEffect(() => {
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

/**
 * Identifier ile giriş — email VEYA username VEYA phone kabul eder.
 * Önce backend'den identifier → email lookup yapılır, sonra Supabase login.
 */
export async function signInWithIdentifier(identifier: string, password: string) {
  let email = identifier.trim();
  if (!email.includes('@')) {
    // username veya phone olabilir, backend'den email'i bul
    try {
      const { data } = await api.post<{ email: string | null }>('/auth/resolve-identifier', {
        identifier: email,
      });
      if (!data.email) {
        throw new Error('Bu bilgiyle kayıtlı kullanıcı bulunamadı');
      }
      email = data.email;
    } catch (err) {
      // Axios 4xx hatası ile gelir, Error olarak fırlat
      if (err instanceof Error) throw err;
      throw new Error('Kullanıcı arama başarısız');
    }
  }
  const supabase = getSupabase();
  const { error, data: authData } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    // Server'a başarısız denemeyi raporla (account lockout sayacı için)
    void api
      .post('/auth/login-result', {
        identifier: identifier.trim(),
        success: false,
        reason: 'invalid_password',
      })
      .catch(() => {});
    throw error;
  }
  // Başarılı login'i raporla (audit + sayaç sıfırlama)
  void api
    .post('/auth/login-result', {
      identifier: identifier.trim(),
      success: true,
    })
    .catch(() => {});
  const { setUser, setOrg, setSession } = useAuthStore.getState();
  if (authData?.session) setSession(authData.session);

  // 2FA kontrolü: kullanıcının verified MFA factor'ı var mı?
  // aal1 (sadece şifre) → aal2 (şifre + TOTP) gerekiyorsa challenge döndür
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
    // Kullanıcı 2FA aktif, kod istenmeli — caller'a MFA gerekli sinyali ver
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const totpFactor = factorsData?.totp.find((f) => f.status === 'verified');
    if (totpFactor) {
      return { needsMfa: true, factorId: totpFactor.id };
    }
  }

  try {
    const { data: profile } = await api.get<{ user: AuthUser; org: AuthOrg | null }>(
      '/auth/me',
    );
    setUser(profile.user);
    setOrg(profile.org);
    if (profile.user) {
      void import('@/lib/analytics').then(({ identify, track }) => {
        identify(profile.user.id, {
          role: profile.user.role,
          org_id: profile.org?.id,
        });
        track('signed_in');
      });
    }
  } catch (err) {
    console.warn('[auth] post-signin /auth/me failed:', err);
  }
  return { needsMfa: false };
}

/**
 * 2FA challenge + verify — sign-in akışında MFA gerekiyorsa çağrılır.
 */
export async function verifyMfaChallenge(factorId: string, code: string) {
  const supabase = getSupabase();
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr) throw cErr;
  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (vErr) throw vErr;
  // MFA başarılı — şimdi profili çek
  const { setUser, setOrg } = useAuthStore.getState();
  try {
    const { data: profile } = await api.get<{ user: AuthUser; org: AuthOrg | null }>(
      '/auth/me',
    );
    setUser(profile.user);
    setOrg(profile.org);
    if (profile.user) {
      void import('@/lib/analytics').then(({ identify, track }) => {
        identify(profile.user.id, { role: profile.user.role, org_id: profile.org?.id });
        track('signed_in');
      });
    }
  } catch (err) {
    console.warn('[auth] post-mfa-verify /auth/me failed:', err);
  }
}

/** @deprecated geriye uyum için — yeni kod signInWithIdentifier kullansın */
export const signInWithEmail = signInWithIdentifier;

export async function sendMagicLink(email: string) {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

export async function signOut() {
  void import('@/lib/analytics').then(({ track, resetUser }) => {
    track('signed_out');
    resetUser();
  });
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
