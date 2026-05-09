import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema, type SignUpInput } from '@damga/shared';
import { toast } from 'sonner';
import { Loader2, Building2, UserPlus, ArrowRight, Sparkles } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

/**
 * Sign-up — sadece çalışan/birey hesabı oluşturma.
 *
 * Şirket açmak isteyenler için: sayfanın üstünde "Şirketin için Damga'ya başvur"
 * butonu var → /apply-org rotasına gider.
 *
 * Çalışan ister organizasyon davet kodu ile (ileride), istemezse
 * pending modda kayıt olur — yöneticisi onu bir org'a atayana kadar
 * sistemde "bekleme" durumunda görünür.
 */
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
      username: '',
      phone: '',
      department: 'Diğer',
      kvkk_consent: undefined as unknown as true,
    },
  });

  const onSubmit = async (data: SignUpInput) => {
    setSubmitting(true);
    try {
      // Çalışan modu — şirket adı veya invite_code göndermiyoruz
      const payload: SignUpInput = {
        email: data.email,
        password: data.password,
        full_name: data.full_name,
        username: data.username || undefined,
        phone: data.phone || undefined,
        department: data.department,
        kvkk_consent: data.kvkk_consent,
      };
      const r = await api.post('/auth/sign-up', payload);
      const isPending = r.data?.user?.is_pending ?? true;
      if (isPending) {
        toast.success(
          '🎉 Hesabın oluşturuldu — yönetici seni bir şirkete atayana kadar bekleme ekranı göreceksin.',
        );
      } else {
        toast.success('🎉 Hesabın oluşturuldu — şimdi giriş yapabilirsin.');
      }
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
          <h1 className="mt-3 text-2xl font-display">Hesap oluştur</h1>
          <p className="text-sm text-muted">
            Damga'ya çalışan olarak katıl. Yöneticin seni şirketine atayacak.
          </p>
        </div>

        {/* Self-org-signup CTA'sı (yeni, hızlı) */}
        <Link
          to="/auth/sign-up-org"
          className="flex items-center justify-between gap-3 rounded-lg border-2 border-orange-400 bg-orange-50 px-4 py-3 transition hover:bg-orange-100"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 text-white shrink-0">
              <Sparkles className="size-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-ink">Şirketini hızlıca aç</div>
              <div className="text-xs text-muted">Anında owner ol — admin onayı beklemeden</div>
            </div>
          </div>
          <ArrowRight className="size-4 text-orange-600 shrink-0" />
        </Link>

        {/* Kurumsal başvuru (mevcut akış, korundu) */}
        <Link
          to="/apply-org"
          className="flex items-center justify-between gap-3 rounded-lg border-2 border-dashed border-orange-300 bg-orange-50/40 px-4 py-3 transition hover:bg-orange-50 hover:border-orange-400"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-orange-500 text-white shrink-0">
              <Building2 className="size-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-ink">Kurumsal başvuru</div>
              <div className="text-xs text-muted">Admin onayı ile owner hesabı</div>
            </div>
          </div>
          <ArrowRight className="size-4 text-orange-600 shrink-0" />
        </Link>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-orange-100" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-muted">veya bireysel kayıt</span>
          </div>
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
            <label className="label">Kurumsal E-posta</label>
            <input
              type="email"
              autoComplete="email"
              className="input mt-1"
              placeholder="ornek@sirket.com"
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
              placeholder="En az 8 karakter"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Kullanıcı adı (opsiyonel)</label>
              <input
                className="input mt-1"
                placeholder="kaank"
                autoComplete="username"
                {...register('username')}
              />
              {errors.username && (
                <p className="mt-1 text-xs text-danger">{errors.username.message}</p>
              )}
              <p className="mt-1 text-[10px] text-muted">Sign-in'de email yerine kullanılır</p>
            </div>
            <div>
              <label className="label">Telefon (opsiyonel)</label>
              <input
                type="tel"
                className="input mt-1"
                placeholder="+905xxxxxxxxx"
                autoComplete="tel"
                {...register('phone')}
              />
              {errors.phone && (
                <p className="mt-1 text-xs text-danger">{errors.phone.message}</p>
              )}
              <p className="mt-1 text-[10px] text-muted">SMS / WhatsApp ile şifre alabilirsin</p>
            </div>
          </div>
          <div>
            <label className="label">Departmanın</label>
            <select className="input mt-1" {...register('department')}>
              <option value="Satış">Satış</option>
              <option value="Sevk">Sevk</option>
              <option value="Muhasebe">Muhasebe</option>
              <option value="Diğer">Diğer</option>
            </select>
            <p className="mt-1 text-xs text-muted">Yöneticin sonra değiştirebilir.</p>
          </div>

          <label className="flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" className="mt-0.5" {...register('kvkk_consent')} />
            <span>
              <Link to="/legal/kvkk" className="text-orange-600 underline">
                KVKK Aydınlatma Metni
              </Link>
              'ni ve{' '}
              <Link to="/legal/terms" className="text-orange-600 underline">
                Kullanım Şartları
              </Link>
              'nı okudum, onaylıyorum. Damga, çalışan giriş/çıkış verilerini sözleşmesel zorunluluk
              gereği işler.
            </span>
          </label>
          {errors.kvkk_consent && (
            <p className="text-xs text-danger">{errors.kvkk_consent.message}</p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            <UserPlus className="size-4" />
            Hesap Oluştur
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
