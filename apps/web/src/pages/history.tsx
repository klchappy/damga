import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Camera,
  Lock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTr, formatTimeTr } from '@/lib/utils';

interface Event {
  id: string;
  type: string;
  server_time: string;
  verification_score: number;
  flags: string[];
  // Lokasyon doğrulama
  latitude?: number | null;
  longitude?: number | null;
  distance_from_office_m?: number | null;
  verification_methods?: string[];
  review_status?: 'approved' | 'pending_review' | 'rejected';
  review_reasons?: string[];
  selfie_url?: string | null;
}

/**
 * Bir damga için "konum doğrulama rozeti" — yönetici/admin/owner için açıkça
 * görünür şekilde anomali var mı yok mu, nasıl doğrulandı.
 */
function LocationBadge({ event }: { event: Event }) {
  const methods = event.verification_methods ?? [];
  const isNfc = methods.includes('nfc');
  const reviewStatus = event.review_status ?? 'approved';
  const isOutOfFence = (event.review_reasons ?? []).includes('out_of_geofence');

  if (reviewStatus === 'rejected') {
    return (
      <span className="chip bg-danger/10 text-danger border border-danger/30 text-[10px]">
        <ShieldAlert className="size-3" />
        Reddedildi
      </span>
    );
  }
  if (reviewStatus === 'pending_review') {
    return (
      <span className="chip bg-warning/10 text-warning border border-warning/30 text-[10px]">
        <Camera className="size-3" />
        Onay bekliyor (selfie)
      </span>
    );
  }
  if (isNfc) {
    return (
      <span className="chip bg-orange-100 text-orange-700 border border-orange-200 text-[10px]">
        <Lock className="size-3" />
        NFC ile (fiziksel)
      </span>
    );
  }
  if (isOutOfFence) {
    // Onaylı ama dışarıdan damga (admin esnemiş veya allow_outside=true)
    return (
      <span className="chip bg-warning/10 text-warning border border-warning/30 text-[10px]">
        <MapPin className="size-3" />
        Lokasyon dışı (onaylandı)
      </span>
    );
  }
  if (event.distance_from_office_m != null) {
    return (
      <span className="chip bg-success/10 text-success border border-success/30 text-[10px]">
        <ShieldCheck className="size-3" />
        Konum doğrulandı ({event.distance_from_office_m}m)
      </span>
    );
  }
  return (
    <span className="chip bg-muted/10 text-muted border border-muted/20 text-[10px]">
      <Smartphone className="size-3" />
      Konum verisi yok
    </span>
  );
}

export { LocationBadge };

export function HistoryPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const startISO = useMemo(
    () => new Date(Date.UTC(month.year, month.month, 1)).toISOString(),
    [month],
  );
  const endISO = useMemo(
    () => new Date(Date.UTC(month.year, month.month + 1, 0, 23, 59, 59)).toISOString(),
    [month],
  );

  const { data } = useQuery<{ items: Event[] }>({
    queryKey: ['events', 'me', month.year, month.month],
    queryFn: async () =>
      (await api.get(`/events?date_from=${startISO}&date_to=${endISO}&limit=200`)).data,
  });

  // Günlere göre grupla
  const byDay: Record<string, Event[]> = {};
  for (const e of data?.items ?? []) {
    const day = e.server_time.slice(0, 10);
    (byDay[day] ??= []).push(e);
  }

  const monthName = new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(month.year, month.month));

  // Calendar grid (basit)
  const firstDay = new Date(month.year, month.month, 1);
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7; // Pazartesi=0

  const cells: Array<{ day?: number; events?: Event[] }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({});
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, events: byDay[dateStr] ?? [] });
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">📅 Geçmişim</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setMonth(({ year, month: m }) =>
                m === 0 ? { year: year - 1, month: 11 } : { year, month: m - 1 },
              )
            }
            className="btn-ghost p-2"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-display text-lg min-w-[140px] text-center capitalize">
            {monthName}
          </span>
          <button
            onClick={() =>
              setMonth(({ year, month: m }) =>
                m === 11 ? { year: year + 1, month: 0 } : { year, month: m + 1 },
              )
            }
            className="btn-ghost p-2"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted mb-2">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => (
            <div
              key={i}
              className={`aspect-square rounded-md border ${
                c.day
                  ? c.events && c.events.length > 0
                    ? 'border-success/40 bg-success/5'
                    : 'border-orange-100 bg-cream'
                  : 'border-transparent'
              } p-1.5 text-xs`}
            >
              {c.day && (
                <>
                  <div className="font-medium text-ink">{c.day}</div>
                  {c.events && c.events.length > 0 && (
                    <div className="mt-1 flex gap-0.5 flex-wrap">
                      {c.events.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          title={`${e.type} ${formatTimeTr(e.server_time)} · trust ${e.verification_score}`}
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            e.verification_score >= 80
                              ? 'bg-success'
                              : e.verification_score >= 60
                                ? 'bg-warning'
                                : 'bg-danger'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="card">
        <h2 className="text-xl mb-3">Detay</h2>
        {(data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted">Bu ayda damga yok.</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {data!.items.map((e) => (
              <li key={e.id} className="flex items-start justify-between py-3 gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="font-medium">
                    {e.type === 'check_in' ? '⏱️ Giriş' : e.type === 'check_out' ? '🏃 Çıkış' : e.type}
                  </div>
                  <div className="text-xs text-muted">
                    {formatDateTr(e.server_time)} · {formatTimeTr(e.server_time)}
                    {e.flags.length > 0 && (
                      <span className="ml-2 text-warning">⚠ {e.flags.join(', ')}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <LocationBadge event={e} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`chip ${
                      e.verification_score >= 80
                        ? 'bg-success/10 text-success'
                        : e.verification_score >= 60
                          ? 'bg-warning/10 text-warning'
                          : 'bg-danger/10 text-danger'
                    }`}
                  >
                    Trust {e.verification_score}/100
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
