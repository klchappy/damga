import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Loader2,
  Mail,
  MessageCircle,
  Smartphone,
  CheckCircle2,
  Copy,
  KeyRound,
} from 'lucide-react';
import { updatePassword } from '@/hooks/use-auth';
import { getSupabase } from '@/lib/supabase';
import { api, getErrorMessage } from '@/lib/api';

/* ============== Şifremi unuttum — 3 yöntem ============== */

type ForgotMethod = 'email' | 'whatsapp' | 'sms';

const identifierSchema = z.object({
  identifier: z.string().min(1, 'E-posta, kullanıcı adı veya telefon gir'),
});

interface ForgotResponse {
  ok: true;
  method: ForgotMethod;
  delivered?: 'sent' | 'fallback' | 'link_generated';
  fallback_url?: string | null;
  password?: string | null;
  action_link?: string;
  message?: string;
}

export function ForgotPasswordPage() {
  const [step, setStep] = useState<'identifier' | 'method' | 'done'>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [method, setMethod] = useState<ForgotMethod>('email');
  const [result, setResult] = useState<ForgotResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof identifierSchema>>({
    resolver: zodResolver(identifierSchema),
    defaultValues: { identifier: '' },
  });

  const handleIdentifier = (data: { identifier: string }) => {
    setIdentifier(data.identifier.trim());
    setStep('method');
  };

  const submitForgot = async (m: ForgotMethod) => {
    setMethod(m);
    setSubmitting(true);
    try {
      const r = await api.post<ForgotResponse>('/auth/forgot', {
        identifier,
        method: m,
      });
      setResult(r.data);
      setStep('done');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md card space-y-4">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <KeyRound className="size-6" />
          </div>
          <h1 className="mt-2 text-2xl">Şifremi unuttum</h1>
        </div>

        {step === 'identifier' && (
          <form onSubmit={handleSubmit(handleIdentifier)} className="space-y-3">
            <div>
              <label className="label">E-posta, kullanıcı adı veya telefon</label>
              <input
                className="input mt-1"
                placeholder="ornek@sirket.com / kullaniciadi / +905xx..."
                {...register('identifier')}
              />
              {errors.identifier && (
                <p className="mt-1 text-xs text-danger">{errors.identifier.message}</p>
              )}
            </div>
            <button type="submit" className="btn-primary w-full">
              Devam
            </button>
          </form>
        )}

        {step === 'method' && (
          <div className="space-y-3">
            <p className="text-sm text-muted text-center">
              <strong className="text-ink">{identifier}</strong> için hangi yöntemle yeni
              şifre/sıfırlama bilgisi alalım?
            </p>
            <div className="grid grid-cols-1 gap-2">
              <MethodButton
                icon={<Mail className="size-5 text-orange-500" />}
                title="E-posta ile sıfırlama linki"
                desc="Kayıtlı e-postana sıfırlama linki gönderilir."
                onClick={() => submitForgot('email')}
                disabled={submitting && method === 'email'}
                loading={submitting && method === 'email'}
              />
              <MethodButton
                icon={<MessageCircle className="size-5 text-[#25D366]" />}
                title="WhatsApp ile yeni şifre"
                desc="Yeni güçlü şifre üretilir ve WhatsApp'a gönderilir."
                onClick={() => submitForgot('whatsapp')}
                disabled={submitting && method === 'whatsapp'}
                loading={submitting && method === 'whatsapp'}
              />
              <MethodButton
                icon={<Smartphone className="size-5 text-orange-500" />}
                title="SMS ile yeni şifre"
                desc="Yeni güçlü şifre üretilir ve telefonuna SMS gönderilir."
                onClick={() => submitForgot('sms')}
                disabled={submitting && method === 'sms'}
                loading={submitting && method === 'sms'}
              />
            </div>
            <button
              type="button"
              onClick={() => setStep('identifier')}
              className="text-xs text-muted hover:text-orange-600 underline-offset-4 hover:underline w-full text-center"
            >
              ← Geri
            </button>
          </div>
        )}

        {step === 'done' && result && <ForgotDoneCard result={result} method={method} />}

        <p className="text-center text-sm text-muted">
          <Link to="/auth/sign-in" className="text-orange-600 underline-offset-4 hover:underline">
            Giriş sayfasına dön
          </Link>
        </p>
      </div>
    </div>
  );
}

function MethodButton({
  icon,
  title,
  desc,
  onClick,
  disabled,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-left rounded-lg border-2 border-orange-100 bg-white p-3 transition hover:border-orange-300 hover:bg-orange-50/40 disabled:opacity-60"
    >
      <div className="flex items-center gap-2.5">
        <div className="shrink-0">{loading ? <Loader2 className="size-5 animate-spin" /> : icon}</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-ink">{title}</div>
          <div className="text-[11px] text-muted mt-0.5">{desc}</div>
        </div>
      </div>
    </button>
  );
}

function ForgotDoneCard({ result, method }: { result: ForgotResponse; method: ForgotMethod }) {
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} kopyalandı`);
    } catch {
      toast.error('Kopyalanamadı');
    }
  };

  // Email yöntemi → sıfırlama linki üretildi
  if (method === 'email') {
    if (result.action_link) {
      return (
        <div className="space-y-3">
          <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm flex items-start gap-2">
            <CheckCircle2 className="size-5 text-success shrink-0" />
            <div>
              <strong className="text-ink">Sıfırlama linki hazır.</strong>
              <p className="text-muted mt-0.5">
                Aşağıdaki linke tıkla veya kopyalayıp tarayıcıda aç:
              </p>
            </div>
          </div>
          <div className="rounded-md bg-orange-50/60 border border-orange-200 p-2 font-mono text-[11px] break-all select-all">
            {result.action_link}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleCopy(result.action_link!, 'Link')}
              className="btn-outline flex-1 text-sm"
            >
              <Copy className="size-4" /> Kopyala
            </button>
            <a
              href={result.action_link}
              className="btn-primary flex-1 inline-flex items-center justify-center text-sm"
            >
              Linki aç
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm">
        ✅ {result.message ?? 'İşlem yapıldı.'}
      </div>
    );
  }

  // SMS / WhatsApp → yeni şifre üretildi + iletildi
  const sent = result.delivered === 'sent';
  return (
    <div className="space-y-3">
      <div
        className={`rounded-md border p-3 text-sm flex items-start gap-2 ${
          sent ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'
        }`}
      >
        <CheckCircle2 className={`size-5 shrink-0 ${sent ? 'text-success' : 'text-warning'}`} />
        <div>
          <strong className="text-ink">
            {sent
              ? `Yeni şifre ${method === 'sms' ? 'SMS' : 'WhatsApp'} ile gönderildi.`
              : 'Yeni şifre hazır.'}
          </strong>
          <p className="text-muted mt-0.5">
            {sent
              ? `Mesajını kontrol et, yeni şifrenle giriş yap.`
              : `${method === 'sms' ? 'SMS' : 'WhatsApp'} gateway konfig'siz olduğu için aşağıdaki linki kullanarak elle gönderebilirsin.`}
          </p>
        </div>
      </div>

      {result.password && (
        <div className="rounded-md border-2 border-orange-300 bg-orange-50/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-orange-600 mb-1">
            Yeni şifren
          </div>
          <div className="font-mono text-base break-all select-all">{result.password}</div>
          <button
            type="button"
            onClick={() => handleCopy(result.password!, 'Şifre')}
            className="mt-2 btn-outline text-xs w-full"
          >
            <Copy className="size-3" /> Şifreyi kopyala
          </button>
        </div>
      )}

      {result.fallback_url && (
        <a
          href={result.fallback_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full text-sm"
        >
          {method === 'whatsapp' ? '💚 WhatsApp ile aç' : '📱 SMS uygulamasını aç'}
        </a>
      )}

      <Link to="/auth/sign-in" className="btn-outline w-full text-sm">
        Giriş sayfasına dön
      </Link>
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
