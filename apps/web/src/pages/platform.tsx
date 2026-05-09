/**
 * Platform Sahibi Paneli — TÜM org'ları görüntüler.
 *
 * Sadece public.platform_admins tablosunda kayıtlı email'ler erişebilir.
 * Backend GET /v1/platform/me ile yetki kontrol edilir.
 *
 * View-only: ücretsiz dönem, askıya alma/tier değiştirme YOK.
 * Gelir hedefi gelince platform.ts'e PATCH endpoint + UI eklenir.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Globe,
  Building2,
  Users,
  MapPin,
  Activity,
  Loader2,
  Shield,
  Briefcase,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';

interface PlatformOrg {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  org_type: string;
  created_at: string;
  user_count: number;
  location_count: number;
  department_count: number;
  check_in_count: number;
  last_activity: string | null;
}

interface PlatformStats {
  summary: {
    org_count: number;
    total_users: number;
    total_locations: number;
    total_departments: number;
    total_check_ins: number;
    check_ins_24h: number;
  };
  plan_breakdown: Array<{ plan: string; count: number }>;
}

interface PlatformMe {
  is_platform_admin: boolean;
  admin: { id: string; email: string; full_name: string | null } | null;
}

const PLAN_COLOR: Record<string, string> = {
  free: 'bg-stone-100 text-stone-700',
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  business: 'bg-emerald-100 text-emerald-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

export function PlatformPage() {
  const { data: me, isLoading: meLoading } = useQuery<PlatformMe>({
    queryKey: ['platform-me'],
    queryFn: async () => (await api.get('/platform/me')).data,
  });

  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ['platform-stats'],
    queryFn: async () => (await api.get('/platform/stats')).data,
    enabled: !!me?.is_platform_admin,
  });

  const { data: orgsData } = useQuery<{ items: PlatformOrg[] }>({
    queryKey: ['platform-orgs'],
    queryFn: async () => (await api.get('/platform/orgs')).data,
    enabled: !!me?.is_platform_admin,
  });

  if (meLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-12 text-center">
        <Loader2 className="size-8 animate-spin text-orange-600 mx-auto" />
      </div>
    );
  }

  if (!me?.is_platform_admin) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="card">
          <Shield className="size-12 text-danger mx-auto mb-2" />
          <h1 className="font-display text-xl mb-1">Erişim Yok</h1>
          <p className="text-sm text-muted">
            Bu sayfa Damga platform sahibi içindir. Sen org admin'isin, platform sahibi değilsin.
          </p>
        </div>
      </div>
    );
  }

  const orgs = orgsData?.items ?? [];
  const summary = stats?.summary;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 text-white">
          <Globe className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Platform Paneli</h1>
          <p className="text-sm text-muted">
            Tüm Damga org'larını görüntüle · {me.admin?.email}
          </p>
        </div>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<Building2 className="size-4" />}
            label="Toplam Org"
            value={summary.org_count}
            color="orange"
          />
          <StatCard
            icon={<Users className="size-4" />}
            label="Toplam Kullanıcı"
            value={summary.total_users}
            sub={`${summary.total_departments} departman`}
            color="blue"
          />
          <StatCard
            icon={<MapPin className="size-4" />}
            label="Lokasyon"
            value={summary.total_locations}
            color="purple"
          />
          <StatCard
            icon={<Activity className="size-4" />}
            label="Toplam Check-in"
            value={summary.total_check_ins}
            sub={`son 24sa: ${summary.check_ins_24h}`}
            color="emerald"
          />
        </div>
      )}

      {/* Org list */}
      <div className="card">
        <h2 className="font-display text-lg mb-3 flex items-center gap-2">
          <Building2 className="size-5 text-orange-600" />
          Tüm Organizasyonlar ({orgs.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted border-b border-orange-100">
              <tr>
                <th className="text-left py-2">Şirket</th>
                <th className="text-left py-2">Plan</th>
                <th className="text-right py-2">Kullanıcı</th>
                <th className="text-right py-2">Lokasyon</th>
                <th className="text-right py-2">Departman</th>
                <th className="text-right py-2">Check-in</th>
                <th className="text-left py-2">Son Aktivite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="py-2">
                    <div className="font-medium">{o.name}</div>
                    <div className="text-[10px] text-muted">
                      {o.slug ?? o.id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        PLAN_COLOR[o.plan] ?? 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {o.plan}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{o.user_count}</td>
                  <td className="text-right tabular-nums">{o.location_count}</td>
                  <td className="text-right tabular-nums">{o.department_count}</td>
                  <td className="text-right tabular-nums">{o.check_in_count}</td>
                  <td className="py-2 text-xs text-muted">
                    {o.last_activity
                      ? new Date(o.last_activity).toLocaleDateString('tr-TR')
                      : '—'}
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted text-xs">
                    Henüz organizasyon yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan breakdown */}
      {stats?.plan_breakdown && stats.plan_breakdown.length > 0 && (
        <div className="card">
          <h2 className="font-display text-lg mb-3 flex items-center gap-2">
            <TrendingUp className="size-5 text-orange-600" />
            Plan Dağılımı
          </h2>
          <div className="space-y-2">
            {stats.plan_breakdown.map((t) => {
              const total = stats.plan_breakdown.reduce((s, x) => s + x.count, 0);
              const pct = total > 0 ? (t.count / total) * 100 : 0;
              return (
                <div key={t.plan}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium flex items-center gap-2">
                      <Briefcase className="size-3.5 text-muted" />
                      {t.plan}
                    </span>
                    <span className="tabular-nums text-muted">
                      {t.count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-orange-50 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-400 to-orange-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted text-center pt-2">
        View-only · Askıya alma ve plan değiştirme ücretli sürümde gelecek
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: 'orange' | 'blue' | 'purple' | 'emerald';
}) {
  const colors = {
    orange: 'from-orange-500 to-orange-700 text-orange-700',
    blue: 'from-blue-500 to-blue-700 text-blue-700',
    purple: 'from-purple-500 to-purple-700 text-purple-700',
    emerald: 'from-emerald-500 to-emerald-700 text-emerald-700',
  } as const;
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs text-muted">{label}</span>
        <div
          className={`flex size-7 items-center justify-center rounded-md bg-gradient-to-br ${colors[color]} text-white`}
        >
          {icon}
        </div>
      </div>
      <div className={`font-display font-bold text-2xl tabular-nums ${colors[color].split(' ')[2]}`}>
        {value.toLocaleString('tr-TR')}
      </div>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
