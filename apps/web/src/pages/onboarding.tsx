/**
 * Onboarding wizard — yeni org oluşturan owner için 3 adımlık başlatma akışı.
 *
 * Adımlar:
 *   1. İlk lokasyon ekle (ad + adres opsiyonel)
 *   2. İlk çalışanı davet et (email)
 *   3. NFC veya QR test et (lokasyondan üret)
 *
 * Bitir → POST /v1/orgs/me/onboarding/complete → settings.onboarding_completed_at
 * Atla  → POST /v1/orgs/me/onboarding/skip → settings.onboarding_skipped_at
 *
 * Gating: app.tsx içinde `OnboardingGate` wrapper'ı owner için completed/skipped
 * yoksa bu sayfaya yönlendirir.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  MapPin,
  ScanLine,
  Stamp,
  UserPlus,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';
import { track } from '@/lib/analytics';

type Step = 1 | 2 | 3 | 'done';

interface CreatedLocation {
  id: string;
  name: string;
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const org = useAuthStore((s) => s.org);
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>(1);
  const [createdLocation, setCreatedLocation] = useState<CreatedLocation | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  // Step 1: Lokasyon
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const createLocation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/locations', {
        name: locName.trim(),
        address: locAddress.trim() || undefined,
      });
      return data.location as CreatedLocation;
    },
    onSuccess: (loc) => {
      setCreatedLocation(loc);
      toast.success(`"${loc.name}" oluşturuldu`);
      track('location_created', { onboarding: true });
      setStep(2);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Step 2: Davet
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteDelivery, setInviteDelivery] = useState<
    'email' | 'fallback_link' | 'skipped' | null
  >(null);
  const [inviteResetLink, setInviteResetLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/users', {
        email: inviteEmail.trim().toLowerCase(),
        full_name: inviteFullName.trim() || inviteEmail.split('@')[0],
        role: 'employee',
        department: 'Diğer',
      });
      return data as {
        email_delivery?: 'email' | 'fallback_link' | 'skipped';
        password_reset_link?: string | null;
      };
    },
    onSuccess: (data) => {
      setInvitedEmail(inviteEmail);
      setInviteDelivery(data.email_delivery ?? 'skipped');
      setInviteResetLink(data.password_reset_link ?? null);
      if (data.email_delivery === 'email') {
        toast.success(`📧 ${inviteEmail} adresine davet maili gönderildi`);
      } else if (data.password_reset_link) {
        toast.success(`Çalışan eklendi — davet linkini manuel paylaş`);
      } else {
        toast.success(`${inviteEmail} eklendi`);
      }
      track('employee_invited', { onboarding: true });
      setStep(3);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Step 3: complete
  const complete = useMutation({
    mutationFn: async () => {
      await api.post('/orgs/me/onboarding/complete');
    },
    onSuccess: () => {
      toast.success('Tebrikler — kurulum tamamlandı 🎉');
      track('onboarding_completed');
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      setStep('done');
      setTimeout(() => navigate('/'), 1500);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Skip
  const skip = useMutation({
    mutationFn: async () => {
      await api.post('/orgs/me/onboarding/skip');
    },
    onSuccess: () => {
      track('onboarding_skipped');
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      navigate('/');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-zinc-50">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-700 text-white flex items-center justify-center">
              <Stamp className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-lg">Damga'ya hoşgeldin {user?.full_name?.split(' ')[0] ?? ''}</div>
              <div className="text-xs text-zinc-500">
                {org?.name ?? 'Şirketin'} için 3 adımda kurulum
              </div>
            </div>
          </div>
          {step !== 'done' && (
            <button
              type="button"
              onClick={() => skip.mutate()}
              disabled={skip.isPending}
              className="text-sm text-zinc-500 hover:text-zinc-900 px-3 py-1.5 inline-flex items-center gap-1"
              title="Şimdi atla — daha sonra Ayarlar'dan da yapabilirsin"
            >
              <X className="w-3.5 h-3.5" />
              Şimdi atla
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition ${
                step === 'done' || (step as number) >= s ? 'bg-purple-700' : 'bg-zinc-200'
              }`}
            />
          ))}
        </div>

        {/* Done state */}
        {step === 'done' && (
          <div className="rounded-2xl bg-white p-10 shadow-sm border border-emerald-200 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold">Harika! 🎉</h2>
            <p className="mt-2 text-zinc-600">
              Damga senin için hazır. Yönlendiriliyorsun…
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-purple-700 mx-auto mt-4" />
          </div>
        )}

        {/* Step 1: Lokasyon */}
        {step === 1 && (
          <div className="rounded-2xl bg-white p-8 shadow-sm border border-zinc-100">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold text-purple-700 bg-purple-50 rounded-full px-2 py-0.5">
                ADIM 1 / 3
              </span>
              <MapPin className="w-5 h-5 text-purple-700" />
            </div>
            <h2 className="text-2xl font-bold mt-2">İlk lokasyonunu ekle</h2>
            <p className="mt-2 text-zinc-600">
              Lokasyon = çalışanların check-in yapacağı fiziksel yer. Şube, ofis, depo,
              fabrika, restoran… Aynı şirket altında birden fazla lokasyon olabilir.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (locName.trim().length < 2) {
                  toast.error('Lokasyon adı en az 2 karakter olmalı');
                  return;
                }
                createLocation.mutate();
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Lokasyon adı <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  placeholder="Örn: Bağdat Caddesi Şubesi"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Adres <span className="text-zinc-400 text-xs">(opsiyonel)</span>
                </label>
                <input
                  type="text"
                  value={locAddress}
                  onChange={(e) => setLocAddress(e.target.value)}
                  placeholder="Caddebostan, Kadıköy / İstanbul"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  GPS koordinatlarını ileride harita üzerinden seçeceksin.
                </p>
              </div>
              <button
                type="submit"
                disabled={createLocation.isPending || locName.trim().length < 2}
                className="w-full rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-zinc-300 text-white py-2.5 font-semibold flex items-center justify-center gap-2 transition"
              >
                {createLocation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Devam et <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Davet */}
        {step === 2 && (
          <div className="rounded-2xl bg-white p-8 shadow-sm border border-zinc-100">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold text-purple-700 bg-purple-50 rounded-full px-2 py-0.5">
                ADIM 2 / 3
              </span>
              <UserPlus className="w-5 h-5 text-purple-700" />
            </div>
            <h2 className="text-2xl font-bold mt-2">İlk çalışanını davet et</h2>
            <p className="mt-2 text-zinc-600">
              Daveti alan kişi sign-up linkine tıklar, hesap açar, otomatik
              <strong> {org?.name ?? 'şirketin'}</strong>'a çalışan olarak eklenir.
              Şimdi atlasan da Yöneticiler → Takım sayfasından her zaman ekleyebilirsin.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const email = inviteEmail.trim();
                if (!email.includes('@')) {
                  toast.error('Geçerli email adresi gir');
                  return;
                }
                if (inviteFullName.trim().length < 2) {
                  toast.error('Çalışanın adı en az 2 karakter olmalı');
                  return;
                }
                invite.mutate();
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Çalışan adı soyadı <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  placeholder="Ali Yılmaz"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  E-posta adresi <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="ali@sirketin.com"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                  required
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Bu adrese davet maili — şifre belirleme linkiyle birlikte — otomatik gönderilecek.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-2.5 font-medium"
                >
                  Bunu atla
                </button>
                <button
                  type="submit"
                  disabled={invite.isPending}
                  className="flex-1 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-zinc-300 text-white py-2.5 font-semibold flex items-center justify-center gap-2 transition"
                >
                  {invite.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Davet et + devam <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 3: QR/NFC test */}
        {step === 3 && (
          <div className="rounded-2xl bg-white p-8 shadow-sm border border-zinc-100">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold text-purple-700 bg-purple-50 rounded-full px-2 py-0.5">
                ADIM 3 / 3
              </span>
              <ScanLine className="w-5 h-5 text-purple-700" />
            </div>
            <h2 className="text-2xl font-bold mt-2">Yoklamayı test et</h2>
            <p className="mt-2 text-zinc-600">
              QR kod veya NFC etiketiyle çalışanların check-in yapması için lokasyonuna
              bunlardan üretmelisin. Aşağıdaki tuşa basınca yönetici panelindeki ilgili
              sayfaya gideceksin.
            </p>

            {createdLocation && (
              <div className="mt-4 rounded-xl bg-purple-50 border border-purple-100 p-4 flex items-center gap-3">
                <Building2 className="w-5 h-5 text-purple-700" />
                <div>
                  <div className="font-semibold text-sm">{createdLocation.name}</div>
                  <div className="text-xs text-purple-800">Az önce oluşturuldu</div>
                </div>
              </div>
            )}

            {invitedEmail && (
              <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{invitedEmail}</div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    {inviteDelivery === 'email'
                      ? '📧 Davet maili gönderildi — çalışana iletilen linke tıklayıp şifre belirleyince giriş yapabilir.'
                      : 'Çalışan eklendi. Mail gönderilemediği için aşağıdaki şifre belirleme linkini sen ilet (WhatsApp, kurumsal mail, vs.).'}
                  </div>
                  {inviteDelivery !== 'email' && inviteResetLink && (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-[10px] bg-white border border-emerald-200 rounded px-2 py-1 break-all flex-1 overflow-hidden text-ellipsis">
                        {inviteResetLink}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteResetLink);
                          toast.success('Link panoya kopyalandı');
                        }}
                        className="text-xs px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded whitespace-nowrap"
                      >
                        Kopyala
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!createdLocation) {
                    toast.error('Önce lokasyon oluşturmalısın');
                    return;
                  }
                  // /admin/locations sayfasına git, kullanıcı orada NFC/QR üretebilir
                  complete.mutate();
                  setTimeout(() => navigate('/admin/locations'), 500);
                }}
                disabled={complete.isPending}
                className="rounded-lg border-2 border-purple-200 hover:border-purple-300 hover:bg-purple-50 p-4 text-left"
              >
                <ScanLine className="w-6 h-6 text-purple-700 mb-2" />
                <div className="font-semibold">NFC / QR üret</div>
                <div className="text-xs text-zinc-500 mt-1">
                  Lokasyonlar sayfasına git, üret + yazdır
                </div>
              </button>
              <button
                type="button"
                onClick={() => complete.mutate()}
                disabled={complete.isPending}
                className="rounded-lg bg-purple-700 hover:bg-purple-800 disabled:bg-zinc-300 text-white p-4 text-left"
              >
                <CheckCircle2 className="w-6 h-6 text-white mb-2" />
                <div className="font-semibold">
                  {complete.isPending ? 'Kaydediliyor...' : 'Tamamla, ben sonra hallederim'}
                </div>
                <div className="text-xs text-purple-100 mt-1">
                  Dashboard'a git, NFC/QR'i ayrı yap
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Footer hint */}
        <p className="text-center text-xs text-zinc-400 mt-6">
          Yardıma ihtiyacın olursa{' '}
          <a href="mailto:destek@deploi.net" className="text-purple-700 hover:underline">
            destek@deploi.net
          </a>
        </p>
      </div>
    </div>
  );
}
