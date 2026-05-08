import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@damga/shared';
import { toast } from 'sonner';
import { Loader2, AtSign } from 'lucide-react';
import { signInWithIdentifier, sendMagicLink, useAuthStore } from '@/hooks/use-auth';
import { isSupabaseConfigured } from '@/lib/env';
import { api } from '@/lib/api';

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // QR landing → sign-in → giriş sonrası tekrar QR landing'e dönsün
  const returnPath = searchParams.get('return') || '/';
  const [submitting, setSubmitting] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = async (data: SignInInput) => {
    setSubmitting(true);
    try {
      await signInWithIdentifier(data.identifier, data.password);
      toast.success('Giriş başarılı 👋');
      useAuthStore.getState().startSignInTransition(5000);
      navigate(returnPath, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Giriş yapılamadı');
      setSubmitting(false);
    }
  };

  const onMagicLink = async () => {
    const idValue = getValues('identifier');
    if (!idValue) {
      toast.error('Önce e-posta, kullanıcı adı veya telefon gir');
      return;
    }
    setMagicLoading(true);
    try {
      // Magic link sadece email kabul eder → username/phone ise resolve et
      let email = idValue;
      if (!email.includes('@')) {
        const r = await api.post<{ email: string | null }>('/auth/resolve-identifier', {
          identifier: idValue,
        });
        if (!r.data.email) throw new Error('Bu bilgiyle kayıtlı kullanıcı bulunamadı');
        email = r.data.email;
      }
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
            <label className="label">E-posta, kullanıcı adı veya telefon</label>
            <div className="relative mt-1">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted/60" />
              <input
                type="text"
                autoComplete="username"
                className="input pl-9"
                placeholder="ornek@sirket.com / kullaniciadi / +905xx..."
                {...register('identifier')}
              />
            </div>
            {errors.identifier && (
              <p className="mt-1 text-xs text-danger">{errors.identifier.message}</p>
            )}
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
