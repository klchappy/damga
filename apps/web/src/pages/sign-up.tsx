import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema, type SignUpInput } from '@damga/shared';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

export function SignUpPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      full_name: '',
      org_name: '',
      department: 'Diğer',
      kvkk_consent: undefined as unknown as true,
    },
  });

  const onSubmit = async (data: SignUpInput) => {
    setSubmitting(true);
    try {
      await api.post('/auth/sign-up', data);
      toast.success('🎉 Hesap oluşturuldu — e-postanı kontrol et (onay linki)');
      navigate('/auth/sign-in', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md card space-y-5">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white font-display font-bold text-2xl">
            D
          </div>
          <h1 className="mt-3 text-2xl">Şirketini Damga'ya kaydet</h1>
          <p className="text-sm text-muted">İlk 3 kullanıcı ücretsiz, kart gerekmez.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="label">Adın Soyadın</label>
            <input className="input mt-1" {...register('full_name')} />
            {errors.full_name && (
              <p className="mt-1 text-xs text-danger">{errors.full_name.message}</p>
            )}
          </div>
          <div>
            <label className="label">Şirket Adı</label>
            <input className="input mt-1" placeholder="Acme Yazılım A.Ş." {...register('org_name')} />
            {errors.org_name && (
              <p className="mt-1 text-xs text-danger">{errors.org_name.message}</p>
            )}
          </div>
          <div>
            <label className="label">Departmanın</label>
            <select className="input mt-1" {...register('department')}>
              <option value="Satış">Satış</option>
              <option value="Sevk">Sevk</option>
              <option value="Muhasebe">Muhasebe</option>
              <option value="Diğer">Diğer</option>
            </select>
            <p className="mt-1 text-xs text-muted">
              Yönetici sonra değiştirebilir veya yeni departman ekleyebilir.
            </p>
          </div>
          <div>
            <label className="label">Kurumsal E-posta</label>
            <input
              type="email"
              autoComplete="email"
              className="input mt-1"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">Şifre</label>
            <input
              type="password"
              autoComplete="new-password"
              className="input mt-1"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
            )}
          </div>

          <label className="flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" className="mt-0.5" {...register('kvkk_consent')} />
            <span>
              <strong className="text-ink">KVKK Aydınlatma Metni</strong>'ni okudum, onaylıyorum.
              Damga, çalışan giriş/çıkış verilerini sözleşmesel zorunluluk gereği işler.
              Detaylar: <Link to="/legal/kvkk" className="text-orange-600 underline">/legal/kvkk</Link>
            </span>
          </label>
          {errors.kvkk_consent && (
            <p className="text-xs text-danger">{errors.kvkk_consent.message}</p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Şirketi Kaydet
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Hesabın var mı?{' '}
          <Link to="/auth/sign-in" className="text-orange-600 underline-offset-4 hover:underline">
            Giriş yap
          </Link>
        </p>
      </div>
    </div>
  );
}
