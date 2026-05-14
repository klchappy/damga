/**
 * 2FA (TOTP) yönetim paneli — profil sayfasında.
 *
 * Supabase Auth MFA kullanılır (server-side state-of-the-art TOTP).
 *
 * Akış:
 *   1. "2FA'yı aç" → supabase.auth.mfa.enroll({factorType: 'totp'})
 *      → QR code + secret + factor_id döner
 *   2. Kullanıcı QR'ı Google Authenticator / Authy ile tarat
 *   3. Authenticator'dan 6 haneli kod gir → mfa.challenge + mfa.verify
 *   4. Aktif olur, sonraki sign-in'de challenge çıkar
 *
 * Backup codes: Supabase MFA backup codes desteklemiyor (Şu an). Eğer kullanıcı
 * cihazını kaybederse → "I lost my device" akışı: admin'e başvurur (manuel disable).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Shield, ShieldCheck, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';

interface FactorRow {
  id: string;
  status: 'verified' | 'unverified';
  factor_type: string;
  friendly_name?: string;
  created_at?: string;
}

export function TwoFactorAuth() {
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState<null | {
    factorId: string;
    qrCode: string;
    secret: string;
  }>(null);
  const [otp, setOtp] = useState('');
  const [showDisable, setShowDisable] = useState<string | null>(null);

  // Mevcut factor'ları listele
  const { data: factors, refetch } = useQuery<{ totp: FactorRow[]; all: FactorRow[] }>({
    queryKey: ['mfa', 'factors'],
    queryFn: async () => {
      const { data, error } = await getSupabase().auth.mfa.listFactors();
      if (error) throw error;
      return {
        totp: data.totp ?? [],
        all: data.all ?? [],
      };
    },
    staleTime: 30_000,
  });

  const activeTotp = factors?.totp.find((f) => f.status === 'verified');

  // 1. Enroll başlat
  const enrollMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabase().auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Damga TOTP — ${new Date().toLocaleDateString('tr-TR')}`,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setEnrolling({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 2. Verify (6 haneli kod)
  const verifyMut = useMutation({
    mutationFn: async () => {
      if (!enrolling) throw new Error('Enrollment yok');
      const { data: challenge, error: cErr } = await getSupabase().auth.mfa.challenge({
        factorId: enrolling.factorId,
      });
      if (cErr) throw cErr;
      const { error: vErr } = await getSupabase().auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: challenge.id,
        code: otp,
      });
      if (vErr) throw vErr;
    },
    onSuccess: () => {
      toast.success('2FA aktifleştirildi 🎉');
      setEnrolling(null);
      setOtp('');
      qc.invalidateQueries({ queryKey: ['mfa', 'factors'] });
      void refetch();
    },
    onError: (e: Error) => toast.error(`Doğrulama başarısız: ${e.message}`),
  });

  // 3. Disable
  const unenrollMut = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('2FA kapatıldı');
      setShowDisable(null);
      qc.invalidateQueries({ queryKey: ['mfa', 'factors'] });
      void refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Cleanup unenrolled factors on mount (Supabase enroll sırasında bırakılır)
  useEffect(() => {
    if (!factors?.all) return;
    const stale = factors.all.filter((f) => f.status === 'unverified');
    stale.forEach((f) => {
      // Sessizce temizle, kullanıcıya gösterme
      void getSupabase().auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    });
  }, [factors]);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div
          className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${
            activeTotp
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          {activeTotp ? <ShieldCheck className="size-5" /> : <Shield className="size-5" />}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-ink">
            İki adımlı doğrulama (2FA)
            {activeTotp && (
              <span className="ml-2 chip bg-emerald-100 text-emerald-700 text-xs">
                <CheckCircle2 className="size-3" />
                Aktif
              </span>
            )}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Hesabını ekstra koruma altına al. Sign-in'de şifreden sonra Google
            Authenticator veya Authy üstünden 6 haneli kod istenir.
          </p>
        </div>
      </div>

      {!activeTotp && !enrolling && (
        <button
          type="button"
          onClick={() => enrollMut.mutate()}
          disabled={enrollMut.isPending}
          className="btn-primary w-full sm:w-auto"
        >
          {enrollMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
          2FA'yı aç
        </button>
      )}

      {activeTotp && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowDisable(activeTotp.id)}
            className="btn-outline text-sm"
          >
            <X className="size-3.5" />
            2FA'yı kapat
          </button>
        </div>
      )}

      {/* Enrollment modal */}
      {enrolling && (
        <div className="rounded-lg bg-white border border-emerald-300 p-4 space-y-3">
          <h4 className="font-semibold text-sm">QR'ı taratın</h4>
          <p className="text-xs text-muted">
            Google Authenticator, Authy veya 1Password ile bu QR'ı tarat:
          </p>
          <img
            src={enrolling.qrCode}
            alt="2FA QR"
            className="mx-auto w-44 h-44 bg-white border rounded"
          />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted">
              QR taranamıyorsa kodu manuel gir
            </summary>
            <code className="block mt-1 font-mono text-xs bg-zinc-100 p-2 rounded select-all break-all">
              {enrolling.secret}
            </code>
          </details>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Authenticator'dan 6 haneli kodu gir
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="input font-mono text-center text-lg tracking-widest"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (enrolling) {
                  void getSupabase()
                    .auth.mfa.unenroll({ factorId: enrolling.factorId })
                    .catch(() => {});
                }
                setEnrolling(null);
                setOtp('');
              }}
              disabled={verifyMut.isPending}
              className="btn-outline flex-1"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => verifyMut.mutate()}
              disabled={verifyMut.isPending || otp.length !== 6}
              className="btn-primary flex-1"
            >
              {verifyMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Doğrula
            </button>
          </div>
        </div>
      )}

      {/* Disable confirmation */}
      {showDisable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-3">
            <h2 className="text-lg font-bold">2FA'yı kapatmak istiyor musun?</h2>
            <p className="text-sm text-muted">
              Hesabın daha az güvenli olacak. Tekrar açmak için QR taratman gerekecek.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDisable(null)}
                className="btn-outline flex-1"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => unenrollMut.mutate(showDisable)}
                disabled={unenrollMut.isPending}
                className="btn-danger flex-1"
              >
                {unenrollMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
