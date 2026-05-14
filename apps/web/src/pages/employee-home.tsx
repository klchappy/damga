import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { CheckInCard } from '@/components/check-in-card';
import { api } from '@/lib/api';
import { formatDateTimeTr, formatTimeTr } from '@/lib/utils';
import { useAuthStore } from '@/hooks/use-auth';

interface EventDTO {
  id: string;
  user_id?: string;
  type: string;
  server_time: string;
  verification_score: number;
  flags: string[];
  verification_methods: string[];
  review_status?: 'approved' | 'pending_review' | 'rejected';
  distance_from_office_m?: number | null;
  location?: { name: string } | null;
  /** Manager/admin/owner çağırırsa user info da gelir; çalışan kendi event'inde null kalır */
  user?: { full_name: string; email: string; avatar_url?: string | null } | null;
}

interface MyShift {
  id: string;
  shift_date: string;
  template_name: string;
  template_color: string;
  template_start: string;
  template_end: string;
  override_start: string | null;
  override_end: string | null;
  location_name: string | null;
  status: 'scheduled' | 'completed' | 'absent' | 'swapped';
  notes: string | null;
}

export function EmployeeHomePage() {
  const user = useAuthStore((s) => s.user);
  const isManager = !!user && ['manager', 'admin', 'owner'].includes(user.role);

  const { data: eventsData, refetch } = useQuery<{ items: EventDTO[] }>({
    queryKey: ['events', 'home-feed', isManager ? 'org' : 'me'],
    // Manager/admin/owner için TÜM org event'leri (kim damga vurdu görsün);
    // çalışan için sadece kendi event'leri (API zaten otomatik filtreler ama explicit).
    queryFn: async () => (await api.get('/events?limit=10')).data,
    refetchInterval: 30_000,
  });

  const events = eventsData?.items ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter((e) => e.server_time.startsWith(today));
  const lastCheckIn = todayEvents.find((e) => e.type === 'check_in');
  const lastCheckOut = todayEvents.find((e) => e.type === 'check_out');

  const { data: myShifts } = useQuery<{ items: MyShift[] }>({
    queryKey: ['me', 'shifts'],
    queryFn: async () => (await api.get('/me/shifts')).data,
    staleTime: 60_000,
  });
  const todayShift = (myShifts?.items ?? []).find((s) => s.shift_date === today);
  const upcomingShift = (myShifts?.items ?? []).find(
    (s) => s.shift_date > today && s.status === 'scheduled',
  );
  const shiftToShow = todayShift ?? upcomingShift;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl">Merhaba {user?.full_name?.split(' ')[0] ?? 'arkadaş'} 👋</h1>
        <p className="text-muted">{formatDateTimeTr(new Date())}</p>
      </div>

      <CheckInCard onSuccess={() => void refetch()} />

      {/* Vardiyam */}
      {shiftToShow && (
        <Link
          to="/me/shifts"
          className="card flex items-center gap-3 hover:border-orange-400 hover:shadow-md transition relative overflow-hidden"
          style={{ borderLeft: `4px solid ${shiftToShow.template_color}` }}
        >
          <div
            className="flex size-12 items-center justify-center rounded-xl text-white shrink-0"
            style={{ backgroundColor: shiftToShow.template_color }}
          >
            <CalendarClock className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted">
              {todayShift ? 'Bugünkü vardiyan' : 'Yaklaşan vardiyan'}
            </div>
            <div className="font-display text-lg leading-tight truncate">
              {shiftToShow.template_name}
              <span className="text-sm text-muted ml-2">
                {(shiftToShow.override_start ?? shiftToShow.template_start).slice(0, 5)} –{' '}
                {(shiftToShow.override_end ?? shiftToShow.template_end).slice(0, 5)}
              </span>
            </div>
            <div className="text-xs text-muted">
              {!todayShift && new Date(shiftToShow.shift_date).toLocaleDateString('tr-TR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              {shiftToShow.location_name && ` · ${shiftToShow.location_name}`}
            </div>
          </div>
          <ArrowRight className="size-4 text-muted shrink-0" />
        </Link>
      )}

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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl">
              {isManager ? '⚡ Son 10 damga (tüm ekip)' : 'Son 10 damga'}
            </h2>
            {isManager && (
              <Link
                to="/admin/live-feed"
                className="text-xs text-orange-600 hover:underline inline-flex items-center gap-0.5"
              >
                Tümünü gör <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
          <ul className="divide-y divide-orange-100">
            {events.map((e) => {
              // Manager için "kim damga vurdu" görünür; çalışan kendi event'lerinde
              // user null gelir veya kendi adıdır — biz tekrar isim göstermeyiz.
              const showActor = isManager && e.user && e.user_id !== user?.id;
              const isOutOfFence = (e as { review_reasons?: string[] }).review_reasons?.includes('out_of_geofence');
              const isPending = e.review_status === 'pending_review';
              return (
                <li key={e.id} className="flex items-start justify-between gap-3 py-3 flex-wrap">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {/* Avatar / initials — sadece manager view'da */}
                    {showActor && (
                      <div className="flex size-9 items-center justify-center rounded-lg bg-orange-100 font-semibold text-orange-700 shrink-0 overflow-hidden text-sm">
                        {e.user!.avatar_url ? (
                          <img src={e.user!.avatar_url} alt={e.user!.full_name} className="size-full object-cover" />
                        ) : (
                          e.user!.full_name.charAt(0).toUpperCase()
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium flex items-center gap-1.5 flex-wrap">
                        {showActor && (
                          <span className="font-semibold">{e.user!.full_name}</span>
                        )}
                        <span>
                          {e.type === 'check_in'
                            ? '⏱️ Giriş'
                            : e.type === 'check_out'
                              ? '🏃 Çıkış'
                              : '📝 ' + e.type}
                        </span>
                        {isPending && (
                          <span className="chip bg-warning/10 text-warning text-[10px]">
                            📸 onay bekliyor
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {formatDateTimeTr(e.server_time)}
                        {e.location && ` · 📍 ${e.location.name}`}
                        {e.distance_from_office_m != null && (
                          <span
                            className={
                              isOutOfFence ? 'text-warning ml-1 font-medium' : 'text-muted ml-1'
                            }
                          >
                            ({e.distance_from_office_m}m)
                          </span>
                        )}
                        {e.verification_methods.length > 0 && (
                          <span className="ml-1">· {e.verification_methods.join('+')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`chip shrink-0 ${
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
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
