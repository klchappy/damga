import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, CheckCircle2, ShieldCheck, Users } from 'lucide-react';
import { AdminPendingReviewsPage } from '@/pages/admin-pending-reviews';
import { ManagerAnalyticsPage } from '@/pages/manager-analytics';
import { ManagerTeamPage } from '@/pages/manager-team';
import { api } from '@/lib/api';

type WorkforceView = 'operations' | 'analytics';

interface PendingReviewsResponse {
  items: Array<{ id: string }>;
}

interface UsersResponse {
  items: Array<{ id: string; is_active: boolean }>;
}

function normalizeView(value: string | null): WorkforceView {
  return value === 'analytics' ? 'analytics' : 'operations';
}

export function ManagerWorkforcePage() {
  const [params, setParams] = useSearchParams();
  const activeView = normalizeView(params.get('tab'));

  const { data: pendingData } = useQuery<PendingReviewsResponse>({
    queryKey: ['admin', 'pending-reviews'],
    queryFn: async () => (await api.get('/admin/pending-reviews')).data,
    refetchInterval: 60_000,
  });

  const { data: usersData } = useQuery<UsersResponse>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const pendingCount = pendingData?.items.length ?? 0;
  const activeUserCount = (usersData?.items ?? []).filter((user) => user.is_active).length;
  const passiveUserCount = (usersData?.items ?? []).filter((user) => !user.is_active).length;

  const setView = (view: WorkforceView) => {
    setParams(view === 'operations' ? {} : { tab: view });
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Yonetim</p>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Ekip operasyonu ve performans
          </h1>
          <p className="mt-1 text-sm text-muted">
            Calisan listesi, onay bekleyen damgalar ve performans metrikleri tek yerden yonetilir.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
          <MiniStat icon={<Users className="size-4" />} label="Aktif" value={activeUserCount} />
          <MiniStat icon={<AlertTriangle className="size-4" />} label="Pasif" value={passiveUserCount} />
          <MiniStat
            icon={pendingCount > 0 ? <ShieldCheck className="size-4" /> : <CheckCircle2 className="size-4" />}
            label="Onay"
            value={pendingCount}
            tone={pendingCount > 0 ? 'orange' : 'green'}
          />
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-orange-100 bg-white p-1">
        <button
          type="button"
          onClick={() => setView('operations')}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            activeView === 'operations'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-muted hover:bg-orange-50 hover:text-ink'
          }`}
        >
          Ekip ve Onaylar
        </button>
        <button
          type="button"
          onClick={() => setView('analytics')}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            activeView === 'analytics'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-muted hover:bg-orange-50 hover:text-ink'
          }`}
        >
          <BarChart3 className="mr-1 inline size-4" />
          Performans
        </button>
      </div>

      {activeView === 'operations' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <div className="[&>.container]:max-w-none [&>.container]:px-0 [&>.container]:py-0">
            <ManagerTeamPage />
          </div>

          <aside className="card h-fit">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg">Damga Onaylari</h2>
                <p className="text-xs text-muted">Konum, cihaz veya selfie gerektiren kayitlar.</p>
              </div>
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  pendingCount > 0 ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {pendingCount}
              </span>
            </div>
            <AdminPendingReviewsPage compact />
          </aside>
        </div>
      ) : (
        <div className="[&>.container]:max-w-none [&>.container]:px-0 [&>.container]:py-0">
          <ManagerAnalyticsPage />
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone = 'orange',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'orange' | 'green';
}) {
  return (
    <div className="rounded-lg border border-orange-100 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{label}</span>
        <span className={tone === 'green' ? 'text-emerald-600' : 'text-orange-600'}>{icon}</span>
      </div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
