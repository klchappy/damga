import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { applyOrgSchema, type ApplyOrgInput } from '@damga/shared';
import { toast } from 'sonner';
import { Loader2, Building2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

/**
 * Şirket başvuru formu — public.
 *
 * POST /v1/auth/apply-org →
 *   Damga sistem admini Damga arayüzünden onayı verince
 *   org + owner kullanıcı + 4 default departman oluşturulur,
 *   başvurana magic link / şifre belirleme maili gönderilir.
 */
export function ApplyOrgPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ application_id: string; email: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplyOrgInput>({
    resolver: zodResolver(applyOrgSchema),
    defaultValues: {
      org_name: '',
      tax_id: '',
      industry: '',
      employee_count_estimate: '11-50',
      applicant_full_name: '',
      applicant_email: '',
      applicant_phone: '',
      applicant_title: '',
      notes: '',
      kvkk_consent: undefined as unknown as true,
    },
  });

  const onSubmit = async (data: ApplyOrgInput) => {
    setSubmitting(true);
    try {
      const r = await api.post('/auth/apply-org', data);
      setDone({
        application_id: r.data.application_id,
        email: data.applicant_email,
      });
      toast.success('🎉 Başvurun alındı');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md card space-y-5 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success mx-auto">
            <CheckCircle2 className="size-9" />
          </div>
          <div>
            <h1 className="text-2xl font-display">Başvurun alındı</h1>
            <p className="mt-2 text-sm text-muted">
              Damga ekibi başvuruyu inceleyecek. Onaylanırsa{' '}
              <strong className="text-ink">{done.email}</strong> adresine giriş bilgilerin
              gönderilecek.
            </p>
          </div>
          <div className="rounded-md bg-orange-50 p-3 text-xs text-muted">
            Başvuru No: <span className="font-mono text-ink">{done.application_id.slice(0, 8)}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/auth/sign-in', { replace: true })}
            className="btn-primary w-full"
          >
            Giriş ekranına dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl card space-y-5">
        <div>
          <Link
            to="/auth/sign-up"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-orange-600"
          >
            <ArrowLeft className="size-4" /> Geri
          </Link>
        </div>

        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <Building2 className="size-7" />
          </div>
          <h1 className="mt-3 text-2xl font-display">Şirketini Damga'ya başvur</h1>
          <p className="text-sm text-muted">
            Bilgilerin Damga ekibine ulaştırılır; onay sonrası owner hesabın aktive edilir.
            <br />
            <strong className="text-ink">İlk 3 kullanıcı ücretsiz</strong>, kart gerekmez.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Şirket bilgileri */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-medium uppercase tracking-wide text-orange-600">
              Şirket bilgileri
            </legend>
            <div>
              <label className="label">Şirket Adı *</label>
              <input
                className="input mt-1"
                placeholder="Acme Yazılım A.Ş."
                {...register('org_name')}
              />
              {errors.org_name && (
                <p className="mt-1 text-xs text-danger">{errors.org_name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Vergi No (opsiyonel)</label>
                <input
                  className="input mt-1"
                  placeholder="10 veya 11 hane"
                  {...register('tax_id')}
                />
                {errors.tax_id && (
                  <p className="mt-1 text-xs text-danger">{errors.tax_id.message}</p>
                )}
              </div>
              <div>
                <label className="label">Sektör (opsiyonel)</label>
                <input
                  className="input mt-1"
                  placeholder="Yazılım / Tekstil / Lojistik..."
                  {...register('industry')}
                />
              </div>
            </div>
            <div>
              <label className="label">Tahmini Çalışan Sayısı</label>
              <select className="input mt-1" {...register('employee_count_estimate')}>
                <option value="1-10">1-10</option>
                <option value="11-50">11-50</option>
                <option value="51-200">51-200</option>
                <option value="200+">200+</option>
              </select>
            </div>
          </fieldset>

          <hr className="border-orange-100" />

          {/* Başvuran bilgileri */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-medium uppercase tracking-wide text-orange-600">
              Yetkili / Başvuran
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Adın Soyadın *</label>
                <input className="input mt-1" {...register('applicant_full_name')} />
                {errors.applicant_full_name && (
                  <p className="mt-1 text-xs text-danger">{errors.applicant_full_name.message}</p>
                )}
              </div>
              <div>
                <label className="label">Ünvan (opsiyonel)</label>
                <input
                  className="input mt-1"
                  placeholder="İK Müdürü"
                  {...register('applicant_title')}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Kurumsal E-posta *</label>
                <input
                  type="email"
                  className="input mt-1"
                  placeholder="ik@sirket.com"
                  {...register('applicant_email')}
                />
                {errors.applicant_email && (
                  <p className="mt-1 text-xs text-danger">{errors.applicant_email.message}</p>
                )}
                <p className="mt-1 text-xs text-muted">
                  Onay sonrası giriş linki bu adrese gönderilir.
                </p>
              </div>
              <div>
                <label className="label">Telefon (opsiyonel)</label>
                <input
                  type="tel"
                  className="input mt-1"
                  placeholder="+90 5xx xxx xx xx"
                  {...register('applicant_phone')}
                />
                {errors.applicant_phone && (
                  <p className="mt-1 text-xs text-danger">{errors.applicant_phone.message}</p>
                )}
              </div>
            </div>
            <div>
              <label className="label">Notlar (opsiyonel)</label>
              <textarea
                rows={3}
                className="input mt-1 resize-none"
                placeholder="Neden Damga'yı seçiyorsun? Mevcut çözümünüz var mı?"
                {...register('notes')}
              />
              {errors.notes && <p className="mt-1 text-xs text-danger">{errors.notes.message}</p>}
            </div>
          </fieldset>

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
              'nı okudum, onaylıyorum. Damga başvuru bilgilerimi yalnızca değerlendirme amacıyla
              işler.
            </span>
          </label>
          {errors.kvkk_consent && (
            <p className="text-xs text-danger">{errors.kvkk_consent.message}</p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Başvuruyu Gönder
          </button>
        </form>
      </div>
    </div>
  );
}
