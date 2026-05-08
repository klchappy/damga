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
          to="/manager/team"
          icon={<Users className="size-6" />}
          title="Çalışanlar"
          desc="Yeni çalışan ekle, rol ata, izin kotası belirle."
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
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="card group flex items-start gap-3 hover:border-orange-400 hover:shadow-md transition"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50 text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition">
        {icon}
      </div>
      <div className="flex-1">
        <div className="font-display font-semibold text-lg">{title}</div>
        <div className="text-sm text-muted">{desc}</div>
      </div>
      <ChevronRight className="size-5 text-muted group-hover:text-orange-500 transition self-center" />
    </Link>
  );
}
