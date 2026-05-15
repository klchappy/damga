import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save,
  Eye,
  EyeOff,
  Loader2,
  Settings as SettingsIcon,
  ShieldCheck,
  Camera,
  CalendarClock,
  Clock3,
  Gift,
  MapPin,
  Radio,
  Upload,
  Users,
  Tags,
  Plug,
  Webhook,
} from 'lucide-react';
import {
  useAuthStore,
  DEFAULT_EMPLOYEE_PAGES,
  type EmployeePageKey,
  type AuthOrg,
} from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';

interface PageOption {
  key: EmployeePageKey;
  label: string;
  desc: string;
  alwaysOn?: boolean;
}

interface IntegrationStatus {
  counts: {
    active_api_keys: number;
    active_webhooks: number;
  };
  services: Record<'database' | 'supabase' | 'resend' | 'redis' | 'web_push', boolean>;
}

function ToggleRow({
  checked,
  onChange,
  icon,
  label,
  desc,
  warn,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
  warn?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full text-left rounded-lg border-2 p-3 transition ${
        checked
          ? 'border-orange-400 bg-orange-50/60'
          : 'border-orange-100 bg-white hover:border-orange-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1">
          <div className="text-sm font-medium text-ink">{label}</div>
          <div className="text-[11px] text-muted mt-0.5">{desc}</div>
          {checked && warn && (
            <div className="text-[10px] text-warning mt-1 font-medium">⚠ {warn}</div>
          )}
        </div>
        <div
          className={`shrink-0 inline-flex h-5 w-9 items-center rounded-full transition ${
            checked ? 'bg-orange-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </div>
      </div>
    </button>
  );
}

const PAGE_OPTIONS: PageOption[] = [
  {
    key: 'home',
    label: 'Bugün (Damga vur)',
    desc: 'Giriş/çıkış damgası — her çalışan görmeli.',
    alwaysOn: true,
  },
  {
    key: 'menu',
    label: 'Yemek Menüsü',
    desc: 'Bugünkü menü, RSVP ve puanlama.',
  },
  {
    key: 'announcements',
    label: 'Duyurular',
    desc: 'Şirket duyuruları ve okundu işareti.',
  },
  {
    key: 'history',
    label: 'Geçmiş',
    desc: 'Geçmiş giriş/çıkış kayıtları, hash chain doğrulama.',
  },
  {
    key: 'leaves',
    label: 'İzinler',
    desc: 'İzin talebi oluşturma + kalan kota.',
  },
  {
    key: 'mood',
    label: 'Mood / Ruh Hali',
    desc: 'Günlük mood ifadesi (😄🙂😐😕😫).',
  },
  {
    key: 'status',
    label: 'Durum (Ekip durumu)',
    desc: 'Geç kaldım / öğle arası / WFH gibi anlık durum.',
  },
  {
    key: 'profile',
    label: 'Profil',
    desc: 'Kullanıcının kendi bilgisi + çıkış. Kapatılması önerilmez.',
    alwaysOn: true,
  },
];

/**
 * Admin/owner için şirket ayarları sayfası.
 *
 * Şu an: çalışan rolünün hangi sayfaları göreceğini açıp kapatabilir.
 * "alwaysOn" işaretli sayfalar (home, profile) her zaman açık kalır — UX zorunluluğu.
 */
export function AdminSettingsPage() {
  const org = useAuthStore((s) => s.org);
  const user = useAuthStore((s) => s.user);
  const setOrg = useAuthStore((s) => s.setOrg);
  const qc = useQueryClient();

  const { data: platformMe } = useQuery<{ is_platform_admin: boolean }>({
    queryKey: ['platform-me'],
    queryFn: async () => (await api.get('/platform/me')).data,
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isPlatformAdmin = platformMe?.is_platform_admin === true;

  const { data: integrationStatus } = useQuery<IntegrationStatus>({
    queryKey: ['admin', 'integrations', 'status'],
    queryFn: async () => (await api.get('/integrations/status')).data,
    enabled: isPlatformAdmin,
    retry: false,
  });

  const initialVisible: Set<EmployeePageKey> = new Set(
    org?.settings?.employee_visible_pages && org.settings.employee_visible_pages.length > 0
      ? org.settings.employee_visible_pages
      : DEFAULT_EMPLOYEE_PAGES,
  );

  const [activeTab, setActiveTab] = useState<TabKey>('visibility');
  const [selected, setSelected] = useState<Set<EmployeePageKey>>(initialVisible);
  const [autoSelfie, setAutoSelfie] = useState<boolean>(
    !!org?.settings?.auto_selfie_every_stamp,
  );
  const [allowOutside, setAllowOutside] = useState<boolean>(
    !!org?.settings?.allow_outside_geofence,
  );
  const [dirty, setDirty] = useState(false);

  // org store değişirse formu sync et (örn. başka tab güncellemiş)
  useEffect(() => {
    const next = new Set<EmployeePageKey>(
      org?.settings?.employee_visible_pages && org.settings.employee_visible_pages.length > 0
        ? org.settings.employee_visible_pages
        : DEFAULT_EMPLOYEE_PAGES,
    );
    setSelected(next);
    setAutoSelfie(!!org?.settings?.auto_selfie_every_stamp);
    setAllowOutside(!!org?.settings?.allow_outside_geofence);
    setDirty(false);
  }, [org?.settings]);

  const toggle = (key: EmployeePageKey, alwaysOn?: boolean) => {
    if (alwaysOn) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setDirty(true);
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // alwaysOn olanları her zaman dahil et
      const pages = Array.from(
        new Set([
          ...PAGE_OPTIONS.filter((o) => o.alwaysOn).map((o) => o.key),
          ...selected,
        ]),
      );
      const r = await api.patch('/orgs/me/settings', {
        employee_visible_pages: pages,
        auto_selfie_every_stamp: autoSelfie,
        allow_outside_geofence: allowOutside,
      });
      return r.data.org as AuthOrg;
    },
    onSuccess: (newOrg) => {
      setOrg(newOrg);
      setDirty(false);
      toast.success('Ayarlar kaydedildi · çalışan menüsü güncellendi');
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const reset = () => {
    setSelected(new Set(DEFAULT_EMPLOYEE_PAGES));
    setDirty(true);
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-5">
      {/* Hero */}
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-lg bg-orange-500 text-white">
          <SettingsIcon className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Ayarlar</h1>
          <p className="text-sm text-muted">
            Çalışan deneyimi, güvenlik ve yönetim kısayolları.
          </p>
        </div>
      </div>

      {/* Tab Navigation — mobile + desktop friendly */}
      <div className="flex flex-wrap gap-1 p-1 bg-orange-50 rounded-xl border border-orange-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === t.key
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-orange-700 hover:bg-orange-100'
            }`}
          >
            <t.Icon className="size-4" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card space-y-4 min-h-[400px]">
        {/* TAB 1: Görünüm — çalışanların hangi sayfaları göreceği */}
        {activeTab === 'visibility' && (
          <>
            <div className="flex items-start gap-2 pb-3 border-b border-orange-100">
              <Eye className="size-5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-display text-lg">Çalışan Sayfa Görünürlüğü</h2>
                <p className="text-sm text-muted mt-0.5">
                  Yönetici/admin hepsini görür. Bu seçimler sadece <strong>çalışan</strong> rolündekileri etkiler.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PAGE_OPTIONS.map((opt) => {
                const isOn = opt.alwaysOn || selected.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggle(opt.key, opt.alwaysOn)}
                    disabled={opt.alwaysOn}
                    className={`text-left rounded-lg border-2 p-3 transition ${
                      isOn
                        ? 'border-orange-400 bg-orange-50/60'
                        : 'border-orange-100 bg-white hover:border-orange-200'
                    } ${opt.alwaysOn ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-ink">{opt.label}</div>
                        <div className="text-xs text-muted mt-0.5">{opt.desc}</div>
                      </div>
                      <div
                        className={`shrink-0 mt-0.5 inline-flex size-5 items-center justify-center rounded-full ${
                          isOn ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {isOn ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                      </div>
                    </div>
                    {opt.alwaysOn && (
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-orange-600">
                        Sabit · kapatılamaz
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-orange-100">
              <button
                type="button"
                onClick={reset}
                disabled={saveMutation.isPending}
                className="text-xs text-muted underline-offset-4 hover:underline hover:text-orange-600"
              >
                Önerilen sade preset'e döndür
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={!dirty || saveMutation.isPending}
                className="btn-primary"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Kaydet
              </button>
            </div>
          </>
        )}

        {/* TAB 2: Güvenlik — selfie + geofence ayarları */}
        {activeTab === 'security' && (
          <>
            <div className="flex items-start gap-2 pb-3 border-b border-orange-100">
              <ShieldCheck className="size-5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-display text-lg">Güvenlik & Doğrulama</h2>
                <p className="text-sm text-muted mt-0.5">
                  Damga vurma akışındaki doğrulama davranışları. Hatalı ayar sahtekârlık riskini artırır.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <ToggleRow
                checked={autoSelfie}
                onChange={(v) => {
                  setAutoSelfie(v);
                  setDirty(true);
                }}
                icon={<Camera className="size-4 text-orange-500" />}
                label="Her damgada otomatik selfie"
                desc="Çalışan damga vurduğunda 3 saniye geri sayım sonra otomatik selfie çekilir ve kayda eklenir. KVKK gereği ekranda bilgilendirilir."
                warn="KVKK aydınlatma metnine bu maddeyi eklemen önerilir."
              />

              <ToggleRow
                checked={allowOutside}
                onChange={(v) => {
                  setAllowOutside(v);
                  setDirty(true);
                }}
                icon={<MapPin className="size-4 text-orange-500" />}
                label="Geofence dışı damgaya izin"
                desc="Açık olursa: lokasyon dışı GPS damgası selfie istemeden kabul edilir. Saha çalışanları, dış ekip için."
                warn="Sahtekarlık riskini artırır. Sadece güvendiğin org'lar için aç."
              />
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-orange-100">
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={!dirty || saveMutation.isPending}
                className="btn-primary"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Kaydet
              </button>
            </div>
          </>
        )}

        {/* TAB 3: Yönetim Kısayolları */}
        {activeTab === 'shortcuts' && (
          <>
            <div className="flex items-start gap-2 pb-3 border-b border-orange-100">
              <Plug className="size-5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-display text-lg">Yönetim Kısayolları</h2>
                <p className="text-sm text-muted mt-0.5">
                  En sık kullanılan admin sayfalarına hızlı erişim.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <QuickLink
                to="/admin/team"
                icon={<Users className="size-4" />}
                title="Ekip"
                desc="Kullanıcı, rol ve şifre"
              />
              <QuickLink
                to="/admin/departments"
                icon={<Tags className="size-4" />}
                title="Departman"
                desc="Organizasyon sınıfları"
              />
              <QuickLink
                to="/admin/locations"
                icon={<MapPin className="size-4" />}
                title="Lokasyon"
                desc="NFC, QR ve geofence"
              />
              <QuickLink
                to="/manager/schedule"
                icon={<CalendarClock className="size-4" />}
                title="Vardiya Planı"
                desc="Haftalık ekip çizelgesi"
              />
              <QuickLink
                to="/admin/shifts"
                icon={<Clock3 className="size-4" />}
                title="Vardiya Şablonları"
                desc="Saat ve mesai eşiği"
              />
              <QuickLink
                to="/admin/overtime"
                icon={<Clock3 className="size-4" />}
                title="Fazla Mesai"
                desc="Onay ve bordro çıktısı"
              />
              <QuickLink
                to="/admin/live-feed"
                icon={<Radio className="size-4" />}
                title="Canlı Kayıtlar"
                desc="Anlık damga akışı"
              />
              <QuickLink
                to="/admin/redemptions"
                icon={<Gift className="size-4" />}
                title="Ödül Teslimleri"
                desc="Market talepleri"
              />
              <QuickLink
                to="/admin/bulk-import"
                icon={<Upload className="size-4" />}
                title="Toplu Aktarım"
                desc="Menü ve izin import"
              />
              {isPlatformAdmin && (
                <QuickLink
                  to="/admin/integrations"
                  icon={<Webhook className="size-4" />}
                  title="API & Entegrasyon"
                  desc="Key, webhook ve servisler"
                />
              )}
            </div>
          </>
        )}

        {/* TAB 4: Sistem Durumu */}
        {activeTab === 'system' && (
          <>
            <div className="flex items-start gap-2 pb-3 border-b border-orange-100">
              <ShieldCheck className="size-5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-display text-lg">Sistem Durumu</h2>
                <p className="text-sm text-muted mt-0.5">
                  API key, webhook ve dış servis sağlığı.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <MiniStat
                label="API key"
                value={
                  isPlatformAdmin ? integrationStatus?.counts.active_api_keys ?? '—' : 'ana admin'
                }
              />
              <MiniStat
                label="Webhook"
                value={
                  isPlatformAdmin ? integrationStatus?.counts.active_webhooks ?? '—' : 'ana admin'
                }
              />
            </div>

            {isPlatformAdmin ? (
              <div className="space-y-2 text-sm">
                <ServiceRow label="Database" ok={integrationStatus?.services.database} />
                <ServiceRow label="Supabase" ok={integrationStatus?.services.supabase} />
                <ServiceRow label="Resend (E-posta)" ok={integrationStatus?.services.resend} />
                <ServiceRow label="Web Push" ok={integrationStatus?.services.web_push} />
              </div>
            ) : (
              <div className="rounded-md bg-cream p-3 text-xs text-muted">
                API, webhook ve dış servis bağlantıları sistem ana admini tarafından yönetilir.
                İhtiyaç olduğunda{' '}
                <Link to="/support" className="text-orange-600 underline">
                  Destek Talebi
                </Link>{' '}
                oluştur.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'visibility' as const, label: 'Görünüm', shortLabel: '👁️', Icon: Eye },
  { key: 'security' as const, label: 'Güvenlik', shortLabel: '🔐', Icon: ShieldCheck },
  { key: 'shortcuts' as const, label: 'Kısayollar', shortLabel: '🔗', Icon: Plug },
  { key: 'system' as const, label: 'Sistem', shortLabel: '📊', Icon: SettingsIcon },
];
type TabKey = (typeof TABS)[number]['key'];

function QuickLink({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-md border border-orange-100 bg-white p-3 text-sm hover:border-orange-300 hover:bg-orange-50"
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-orange-50 text-orange-600">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-cream p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="font-display text-xl">{value}</div>
    </div>
  );
}

function ServiceRow({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-cream px-3 py-2">
      <span className="text-muted">{label}</span>
      <span className={ok ? 'text-success' : 'text-warning'}>{ok ? 'hazır' : 'eksik'}</span>
    </div>
  );
}
