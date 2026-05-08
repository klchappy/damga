import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@damga/shared';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { signInWithEmail, sendMagicLink, useAuthStore } from '@/hooks/use-auth';
import { isSupabaseConfigured } from '@/lib/env';

export function SignInPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: SignInInput) => {
    setSubmitting(true);
    try {
      await signInWithEmail(data.email, data.password);
      toast.success('Giriş başarılı 👋');
      // 5 saniyelik damga splash → arka planda fetchProfile çalışıyor olacak.
      // PrivateRoute (loading || signInTransition) ise DamgaSplash gösteriyor.
      useAuthStore.getState().startSignInTransition(5000);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Giriş yapılamadı');
      setSubmitting(false);
    }
  };

  const onMagicLink = async () => {
    const email = getValues('email');
    if (!email) {
      toast.error('Önce e-posta gir');
      return;
    }
    setMagicLoading(true);
    try {
      await sendMagicLink(email);
      toast.success('📧 Sihirli link e-postana gönderildi');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Link gönderilemedi');
    } finally {
      setMagicLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md card space-y-5">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white font-display font-bold text-2xl">
            D
          </div>
          <h1 className="mt-3 text-2xl">Damga'ya hoş geldin</h1>
          <p className="text-sm text-muted">Hesabına gir, ekibinin damgasını gör.</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            ⚠️ Supabase yapılandırılmamış. <code>.env</code> dosyasını doldurman lazım.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="label">E-posta</label>
            <input
              type="email"
              autoComplete="email"
              className="input mt-1"
              placeholder="ornek@damga.app"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">Şifre</label>
            <input
              type="password"
              autoComplete="current-password"
              className="input mt-1"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
            )}
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Giriş Yap
          </button>
        </form>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-orange-100" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-muted">veya</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onMagicLink}
          disabled={magicLoading}
          className="btn-outline w-full"
        >
          {magicLoading && <Loader2 className="size-4 animate-spin" />}
          ✨ Sihirli link ile gir
        </button>

        <div className="text-center text-sm">
          <Link to="/auth/forgot-password" className="text-muted hover:text-orange-600 underline-offset-4 hover:underline">
            Şifremi unuttum
          </Link>
        </div>

        <div className="text-center text-sm text-muted space-y-1">
          <p>
            Hesabın yok mu?{' '}
            <Link to="/auth/sign-up" className="text-orange-600 underline-offset-4 hover:underline">
              Hesap oluştur
            </Link>
          </p>
          <p>
            Şirketini Damga'ya katmak ister misin?{' '}
            <Link to="/apply-org" className="text-orange-600 underline-offset-4 hover:underline">
              Başvur
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
