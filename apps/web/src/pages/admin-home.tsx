import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin,
  Key,
  Users,
  ShieldCheck,
  Activity,
  Database,
  Webhook,
  ChevronRight,
  Tags,
  Building2,
  Settings as SettingsIcon,
  UserPlus,
  Gift,
  Clock,
  CalendarDays,
  BarChart3,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/use-auth';
import { api } from '@/lib/api';

export function AdminHomePage() {
  const user = useAuthStore((s) => s.user);

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const [users, locs, evs] = await Promise.all([
        api.get<{ items: unknown[] }>('/users').then((r) => r.data.items.length),
        api.get<{ items: unknown[] }>('/locations').then((r) => r.data.items.length),
        api
          .get<{ total: number }>('/events?limit=1')
          .then((r) => r.data.total ?? 0)
          .catch(() => 0),
      ]);
      return { users, locs, evs };
    },
  });

  const { data: chain } = useQuery({
    queryKey: ['admin', 'chain'],
    queryFn: async () =>
      (await api.get<{ total: number; valid: number; broken: number }>('/events/verify-chain'))
        .data,
  });

  const { data: redemptionsData } = useQuery({
    queryKey: ['admin', 'redemptions', 'pending-count'],
    queryFn: async () =>
      (await api.get<{ items: Array<{ status: string }> }>('/admin/redemptions')).data,
    refetchInterval: 30_000,
  });
  const pendingRedemptions = (redemptionsData?.items ?? []).filter(
    (r) => r.status === 'pending',
  ).length;

  const { data: overtimeCount } = useQuery({
    queryKey: ['admin', 'overtime', 'pending-count'],
    queryFn: async () =>
      (await api.get<{ count: number }>('/overtime/pending-count')).data,
    refetchInterval: 30_000,
  });
  const pendingOvertime = overtimeCount?.count ?? 0;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider opacity-80">
              {user?.role === 'owner' ? 'Şirket Sahibi' : 'Admin'}
            </div>
            <h1 className="font-display text-3xl mt-1">Hoş geldin, {user?.full_name}</h1>
            <p className="text-sm opacity-90 mt-1">
              Şirketinin Damga sistemini buradan yönet — lokasyonlar, API anahtarları,
              webhook'lar.
            </p>
          </div>
          <div className="text-6xl opacity-30">🪪</div>
        </div>
      </div>

      {/* Hızlı stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="size-5" />} label="Çalışan" value={stats?.users ?? '—'} />
        <StatCard icon={<MapPin className="size-5" />} label="Lokasyon" value={stats?.locs ?? '—'} />
        <StatCard
          icon={<Activity className="size-5" />}
          label="Damga (toplam)"
          value={stats?.evs ?? '—'}
        />
        <StatCard
          icon={<ShieldCheck className="size-5" />}
          label="Hash chain"
          value={chain ? (chain.broken === 0 ? '✓ bütün' : `${chain.broken} kırık`) : '—'}
          valueClass={chain && chain.broken > 0 ? 'text-danger' : 'text-success'}
        />
      </div>

      {/* Yönetim kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AdminCard
          to="/admin/locations"
          icon={<MapPin className="size-6" />}
          title="Lokasyonlar"
          desc="Ofis, şantiye veya mağaza ekle. NFC tag + QR kod + WiFi BSSID + geofence."
        />
        <AdminCard
          to="/admin/team"
          icon={<Users className="size-6" />}
          title="Çalışanlar"
          desc="Çalışan listesi, rol değiştir, departman ata, izin kotası, şifre sıfırla, pasifleştir."
        />
        <AdminCard
          to="/admin/departments"
          icon={<Tags className="size-6" />}
          title="Departmanlar"
          desc="Satış, Sevk, Muhasebe, Diğer + yeni departman ekle (renk + slug)."
        />
        <AdminCard
          to="/admin/api-keys"
          icon={<Key className="size-6" />}
          title="API Anahtarları"
          desc="Bordro, Slack, TahminIO entegrasyonları için API key + scope yönetimi."
        />
        <AdminCard
          to="/manager/reports"
          icon={<Database className="size-6" />}
          title="Raporlar"
          desc="Aylık devam, fazla mesai, izin kullanımı — CSV export."
        />
        <AdminCard
          to="/admin/applications"
          icon={<Building2 className="size-6" />}
          title="Şirket Başvuruları"
          desc="Damga'ya başvuran şirketleri incele, onayla → owner hesabı + departmanlar otomatik kurulur."
        />
        <AdminCard
          to="/admin/settings"
          icon={<SettingsIcon className="size-6" />}
          title="Şirket Ayarları"
          desc="Çalışanların hangi sayfaları görebileceğini seç (Bugün, Menü, Duyuru sade preset)."
        />
        <AdminCard
          to="/admin/pending-users"
          icon={<UserPlus className="size-6" />}
          title="Bekleyen Kullanıcılar"
          desc="Self-signup yapmış kullanıcıları kendi şirketine ekle (rol + departman ata)."
        />
        <AdminCard
          to="/admin/pending-reviews"
          icon={<ShieldCheck className="size-6" />}
          title="Onay Bekleyen Damgalar"
          desc="Lokasyon dışı veya yeni cihazdan damga vurmuş çalışanların selfie'sini incele, onayla veya reddet."
        />
        <AdminCard
          to="/admin/live-feed"
          icon={<Activity className="size-6" />}
          title="Damga Akışı"
          desc="Tüm çalışanların damgalarını canlı izle. Her damgada konum doğrulama durumu (yeşil/sarı/gri) gözükür."
        />
        <AdminCard
          to="/admin/redemptions"
          icon={<Gift className="size-6" />}
          title="Ödül Talepleri"
          desc="Çalışanların satın aldığı ödülleri burada teslim et veya iptal et (XP iade)."
          badge={pendingRedemptions > 0 ? pendingRedemptions : undefined}
        />
        <AdminCard
          to="/admin/shifts"
          icon={<Clock className="size-6" />}
          title="Vardiya Şablonları"
          desc="Sabah/akşam/gece vardiyalarını lokasyon + saat + mola ile tanımla."
        />
        <AdminCard
          to="/manager/schedule"
          icon={<CalendarDays className="size-6" />}
          title="Haftalık Vardiya Planı"
          desc="Çalışanlara vardiya ata: hücreye tıkla → şablon seç. Drag-drop yakında."
        />
        <AdminCard
          to="/admin/overtime"
          icon={<Clock className="size-6" />}
          title="Fazla Mesai"
          desc="Vardiya bitiminden sonra çalışanların kayıtları. Onayla, opsiyonel XP bonusu ver."
          badge={pendingOvertime > 0 ? pendingOvertime : undefined}
        />
        <AdminCard
          to="/manager/analytics"
          icon={<BarChart3 className="size-6" />}
          title="Analitik"
          desc="Geç gelme heatmap'i, departman karşılaştırması, günlük trend, en çok geç kalanlar."
        />
      </div>

      {/* Sistem durumu */}
      <div className="card">
        <h2 className="font-display text-xl mb-3 flex items-center gap-2">
          <Webhook className="size-5 text-orange-600" /> Sistem Sağlığı
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <div className="flex items-center justify-between p-2 rounded bg-cream">
            <span className="text-muted">API</span>
            <span className="text-success">● running</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-cream">
            <span className="text-muted">Database</span>
            <span className="text-success">● healthy</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-cream">
            <span className="text-muted">Hash Chain</span>
            <span className={chain && chain.broken === 0 ? 'text-success' : 'text-warning'}>
              {chain ? `● ${chain.valid}/${chain.total} valid` : '...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  valueClass = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  valueClass?: string;
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 text-muted text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 font-display text-2xl font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function AdminCard({
  to,
  icon,
  title,
  desc,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="card group flex items-start gap-3 hover:border-orange-400 hover:shadow-md transition relative"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50 text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition">
        {icon}
      </div>
      <div className="flex-1">
        <div className="font-display font-semibold text-lg flex items-center gap-2">
          {title}
          {typeof badge === 'number' && badge > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-danger text-white text-[10px] font-semibold animate-pulse">
              {badge}
            </span>
          )}
        </div>
        <div className="text-sm text-muted">{desc}</div>
      </div>
      <ChevronRight className="size-5 text-muted group-hover:text-orange-500 transition self-center" />
    </Link>
  );
}
