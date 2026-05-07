import { useQuery } from '@tanstack/react-query';
import { Users, Calendar, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeTr } from '@/lib/utils';

interface Event {
  id: string;
  type: string;
  server_time: string;
  verification_score: number;
  flags: string[];
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
    queryFn: async () => (await api.get('/events?limit=20')).data,
    refetchInterval: 15_000,
  });
  const { data: pending } = useQuery<{ items: Leave[] }>({
    queryKey: ['manager', 'leaves', 'pending'],
    queryFn: async () => (await api.get('/leaves?status=pending')).data,
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = (events?.items ?? []).filter((e) => e.server_time.startsWith(today));
  const flagged = todayEvents.filter((e) => e.flags.length > 0 || e.verification_score < 80);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl">Ekip Yönetimi</h1>
        <p className="text-muted">Bugünkü tablo</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<Users className="size-5" />}
          label="Bugün gelen"
          value={todayEvents.filter((e) => e.type === 'check_in').length}
        />
        <Stat
          icon={<ShieldCheck className="size-5" />}
          label="Yüksek güven"
          value={todayEvents.filter((e) => e.verification_score >= 80).length}
          color="success"
        />
        <Stat
          icon={<AlertTriangle className="size-5" />}
          label="Bayraklı"
          value={flagged.length}
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
        <h2 className="text-xl mb-3">⚡ Bugünün damgaları (canlı)</h2>
        {todayEvents.length === 0 ? (
          <p className="text-sm text-muted">Bugün kimse damga vurmadı.</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {todayEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-medium">
                    {e.user?.full_name ?? 'Bilinmeyen'} ·{' '}
                    {e.type === 'check_in' ? '⏱️ Giriş' : e.type === 'check_out' ? '🏃 Çıkış' : e.type}
                  </div>
                  <div className="text-xs text-muted">
                    {formatDateTimeTr(e.server_time)}
                    {e.location && ` · ${e.location.name}`}
                    {e.flags.length > 0 && (
                      <span className="ml-2 text-warning font-mono">⚠ {e.flags.join(', ')}</span>
                    )}
                  </div>
                </div>
                <span
                  className={`chip ${
                    e.verification_score >= 80
                      ? 'bg-success/10 text-success'
                      : e.verification_score >= 60
                        ? 'bg-warning/10 text-warning'
                        : 'bg-danger/10 text-danger'
                  }`}
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
