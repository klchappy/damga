import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  Calendar,
  AlertTriangle,
  ShieldCheck,
  Camera,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeTr } from '@/lib/utils';
import { LocationBadge } from '@/pages/history';

interface Event {
  id: string;
  type: string;
  server_time: string;
  verification_score: number;
  flags: string[];
  latitude?: number | null;
  longitude?: number | null;
  distance_from_office_m?: number | null;
  verification_methods?: string[];
  review_status?: 'approved' | 'pending_review' | 'rejected';
  review_reasons?: string[];
  selfie_url?: string | null;
  user?: { full_name: string; email: string };
  location?: { name: string };
}

interface Leave {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
  user?: { full_name: string };
}

export function ManagerHomePage() {
  const { data: events } = useQuery<{ items: Event[] }>({
    queryKey: ['manager', 'events'],
    queryFn: async () => (await api.get('/events?limit=50')).data,
    refetchInterval: 15_000,
  });
  const { data: pending } = useQuery<{ items: Leave[] }>({
    queryKey: ['manager', 'leaves', 'pending'],
    queryFn: async () => (await api.get('/leaves?status=pending')).data,
  });
  const { data: pendingReviews } = useQuery<{ items: { id: string }[] }>({
    queryKey: ['manager', 'pending-reviews'],
    queryFn: async () => (await api.get('/admin/pending-reviews')).data,
    refetchInterval: 30_000,
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = (events?.items ?? []).filter((e) => e.server_time.startsWith(today));
  const pendingReviewCount = pendingReviews?.items.length ?? 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl">Ekip Yönetimi</h1>
          <p className="text-muted">Bugünkü tablo</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/admin/live-feed" className="btn-outline text-sm">
            <Activity className="size-4" /> Damga Akışı
          </Link>
          {pendingReviewCount > 0 ? (
            <Link to="/admin/pending-reviews" className="btn-primary text-sm">
              <Camera className="size-4" /> {pendingReviewCount} Onay Bekliyor
            </Link>
          ) : (
            <Link to="/admin/pending-reviews" className="btn-outline text-sm">
              <Camera className="size-4" /> Onay Bekleyen
            </Link>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat
          icon={<Users className="size-5" />}
          label="Bugün gelen"
          value={todayEvents.filter((e) => e.type === 'check_in').length}
        />
        <Stat
          icon={<ShieldCheck className="size-5" />}
          label="Konum doğrulandı"
          value={
            todayEvents.filter(
              (e) =>
                e.review_status === 'approved' &&
                !(e.review_reasons ?? []).includes('out_of_geofence'),
            ).length
          }
          color="success"
        />
        <Stat
          icon={<Camera className="size-5" />}
          label="Onay bekliyor"
          value={pendingReviewCount}
          color="warning"
        />
        <Stat
          icon={<AlertTriangle className="size-5" />}
          label="Lokasyon dışı"
          value={
            todayEvents.filter((e) => (e.review_reasons ?? []).includes('out_of_geofence')).length
          }
          color="warning"
        />
        <Stat
          icon={<Calendar className="size-5" />}
          label="Bekleyen izin"
          value={pending?.items.length ?? 0}
          color="orange"
        />
      </div>

      {/* Bugünün canlı feed */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl">⚡ Bugünün damgaları (canlı)</h2>
          <Link
            to="/admin/live-feed"
            className="text-xs text-orange-600 hover:underline inline-flex items-center gap-0.5"
          >
            Tümünü gör <ChevronRight className="size-3" />
          </Link>
        </div>
        {todayEvents.length === 0 ? (
          <p className="text-sm text-muted">Bugün kimse damga vurmadı.</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {todayEvents.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-start justify-between py-2.5 gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="font-medium">
                    {e.user?.full_name ?? 'Bilinmeyen'} ·{' '}
                    {e.type === 'check_in' ? '⏱️ Giriş' : e.type === 'check_out' ? '🏃 Çıkış' : e.type}
                  </div>
                  <div className="text-xs text-muted">
                    {formatDateTimeTr(e.server_time)}
                    {e.location && ` · ${e.location.name}`}
                    {e.distance_from_office_m != null && (
                      <span
                        className={
                          (e.review_reasons ?? []).includes('out_of_geofence')
                            ? 'ml-1 text-warning font-medium'
                            : 'ml-1 text-muted'
                        }
                      >
                        ({e.distance_from_office_m}m)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <LocationBadge event={e} />
                  </div>
                </div>
                <span
                  className={`chip ${
                    e.verification_score >= 80
                      ? 'bg-success/10 text-success'
                      : e.verification_score >= 60
                        ? 'bg-warning/10 text-warning'
                        : 'bg-danger/10 text-danger'
                  } shrink-0`}
                >
                  {e.verification_score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bekleyen izinler */}
      <div className="card">
        <h2 className="text-xl mb-3">📅 Bekleyen izin talepleri</h2>
        {(pending?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted">Onay bekleyen izin yok.</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {pending!.items.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-medium">
                    {l.user?.full_name ?? 'Bilinmeyen'} · {l.type}
                  </div>
                  <div className="text-xs text-muted">
                    {l.start_date} → {l.end_date}
                  </div>
                </div>
                <div className="flex gap-2">
                  <ApproveBtn id={l.id} />
                  <RejectBtn id={l.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  color = 'orange',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: 'orange' | 'success' | 'warning';
}) {
  const colorMap = {
    orange: 'bg-orange-50 text-orange-700',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };
  return (
    <div className="card flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-md ${colorMap[color]}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-display font-semibold">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}

function ApproveBtn({ id }: { id: string }) {
  return (
    <button
      onClick={async () => {
        await api.patch(`/leaves/${id}/approve`);
        window.location.reload();
      }}
      className="btn-primary text-sm py-1.5"
    >
      ✓ Onayla
    </button>
  );
}

function RejectBtn({ id }: { id: string }) {
  return (
    <button
      onClick={async () => {
        const reason = prompt('Red sebebi (en az 5 karakter):');
        if (!reason || reason.length < 5) return;
        await api.patch(`/leaves/${id}/reject`, { rejection_reason: reason });
        window.location.reload();
      }}
      className="btn-outline text-sm py-1.5"
    >
      ✗ Red
    </button>
  );
}
