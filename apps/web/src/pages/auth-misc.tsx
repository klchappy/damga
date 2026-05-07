import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { sendPasswordReset, updatePassword } from '@/hooks/use-auth';
import { getSupabase } from '@/lib/supabase';

/* ============== Şifremi unuttum ============== */
const forgotSchema = z.object({ email: z.string().email() });

export function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md card space-y-4">
        <h1 className="text-2xl">Şifremi unuttum</h1>
        {sentTo ? (
          <div className="rounded-md border border-success/30 bg-success/5 p-4 text-sm">
            📧 <span className="font-mono">{sentTo}</span> adresine sıfırlama linki gönderildi.
            Gelen kutunu (ve spam) kontrol et.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(async (data) => {
              setSubmitting(true);
              try {
                await sendPasswordReset(data.email);
                setSentTo(data.email);
                toast.success('Mail gönderildi');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Hata');
              } finally {
                setSubmitting(false);
              }
            })}
            className="space-y-3"
          >
            <div>
              <label className="label">E-posta</label>
              <input className="input mt-1" type="email" {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Sıfırlama linki gönder
            </button>
          </form>
        )}
        <p className="text-center text-sm text-muted">
          <Link to="/auth/sign-in" className="text-orange-600 underline-offset-4 hover:underline">
            Giriş sayfasına dön
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ============== Yeni şifre ============== */
const resetSchema = z
  .object({ password: z.string().min(8), confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: 'Şifreler eşleşmiyor', path: ['confirm'] });

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setHasSession(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md card space-y-4">
        <h1 className="text-2xl">Yeni şifre belirle</h1>
        {hasSession === null && (
          <p className="text-sm text-muted flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Oturum kontrol...
          </p>
        )}
        {hasSession === false && (
          <div className="rounded-md border border-danger/30 bg-danger/5 p-4 text-sm">
            Geçerli bir sıfırlama oturumu yok. Mailden tekrar bağlantıya tıkla.
          </div>
        )}
        {hasSession === true && (
          <form
            onSubmit={handleSubmit(async (data) => {
              setSubmitting(true);
              try {
                await updatePassword(data.password);
                toast.success('🔐 Şifre güncellendi');
                navigate('/auth/sign-in', { replace: true });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Hata');
              } finally {
                setSubmitting(false);
              }
            })}
            className="space-y-3"
          >
            <div>
              <label className="label">Yeni şifre</label>
              <input type="password" className="input mt-1" {...register('password')} />
              {errors.password && (
                <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
              )}
            </div>
            <div>
              <label className="label">Tekrar</label>
              <input type="password" className="input mt-1" {...register('confirm')} />
              {errors.confirm && (
                <p className="mt-1 text-xs text-danger">{errors.confirm.message}</p>
              )}
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Güncelle
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ============== Auth callback (magic link sonrası) ============== */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const supabase = getSupabase();
    void supabase.auth.getSession().then(() => navigate('/', { replace: true }));
  }, [navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="size-8 animate-spin text-orange-500" />
    </div>
  );
}
