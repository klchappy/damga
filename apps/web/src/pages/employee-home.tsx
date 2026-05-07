import { useQuery } from '@tanstack/react-query';
import { CheckInCard } from '@/components/check-in-card';
import { api } from '@/lib/api';
import { formatDateTimeTr, formatTimeTr } from '@/lib/utils';
import { useAuthStore } from '@/hooks/use-auth';

interface EventDTO {
  id: string;
  type: string;
  server_time: string;
  verification_score: number;
  flags: string[];
  verification_methods: string[];
  location?: { name: string } | null;
}

export function EmployeeHomePage() {
  const user = useAuthStore((s) => s.user);

  const { data: eventsData, refetch } = useQuery<{ items: EventDTO[] }>({
    queryKey: ['events', 'me'],
    queryFn: async () => (await api.get('/events?limit=10')).data,
    refetchInterval: 30_000,
  });

  const events = eventsData?.items ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter((e) => e.server_time.startsWith(today));
  const lastCheckIn = todayEvents.find((e) => e.type === 'check_in');
  const lastCheckOut = todayEvents.find((e) => e.type === 'check_out');

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl">Merhaba {user?.full_name?.split(' ')[0] ?? 'arkadaş'} 👋</h1>
        <p className="text-muted">{formatDateTimeTr(new Date())}</p>
      </div>

      <CheckInCard onSuccess={() => void refetch()} />

      {/* Bugünün özeti */}
      <div className="card">
        <h2 className="text-xl mb-3">Bugünün damgaları</h2>
        {todayEvents.length === 0 ? (
          <p className="text-sm text-muted">Henüz damga vurmadın. Yukarıdaki kart ile başla.</p>
        ) : (
          <div className="space-y-2">
            {lastCheckIn && (
              <div className="flex items-center justify-between rounded-md bg-success/5 p-3">
                <div>
                  <div className="font-medium">⏱️ Giriş</div>
                  <div className="text-sm text-muted">{formatTimeTr(lastCheckIn.server_time)}</div>
                </div>
                <span className="chip bg-success/10 text-success">
                  Trust {lastCheckIn.verification_score}/100
                </span>
              </div>
            )}
            {lastCheckOut && (
              <div className="flex items-center justify-between rounded-md bg-orange-50 p-3">
                <div>
                  <div className="font-medium">🏃 Çıkış</div>
                  <div className="text-sm text-muted">{formatTimeTr(lastCheckOut.server_time)}</div>
                </div>
                <span className="chip bg-orange-100 text-orange-700">
                  Trust {lastCheckOut.verification_score}/100
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Geçmiş */}
      {events.length > 0 && (
        <div className="card">
          <h2 className="text-xl mb-3">Son 10 damga</h2>
          <ul className="divide-y divide-orange-100">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">
                    {e.type === 'check_in' ? '⏱️ Giriş' : e.type === 'check_out' ? '🏃 Çıkış' : '📝 ' + e.type}
                  </div>
                  <div className="text-xs text-muted">
                    {formatDateTimeTr(e.server_time)}
                    {e.location && ` · ${e.location.name}`}
                    {e.verification_methods.length > 0 && ` · ${e.verification_methods.join('+')}`}
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
                  {e.verification_score}/100
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
