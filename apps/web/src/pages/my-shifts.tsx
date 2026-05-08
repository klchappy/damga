import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2, MapPin, Clock } from 'lucide-react';
import { api } from '@/lib/api';

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

const STATUS_TR = {
  scheduled: 'Planlandı',
  completed: 'Tamamlandı',
  absent: 'Gelmedi',
  swapped: 'Devredildi',
} as const;

const STATUS_STYLE = {
  scheduled: 'bg-warning/10 text-warning',
  completed: 'bg-success/10 text-success',
  absent: 'bg-danger/10 text-danger',
  swapped: 'bg-muted/10 text-muted',
} as const;

export function MyShiftsPage() {
  const { data, isLoading } = useQuery<{ items: MyShift[] }>({
    queryKey: ['me', 'shifts', 'all'],
    queryFn: async () => {
      const today = new Date();
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      const future = new Date(today);
      future.setDate(future.getDate() + 60);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      return (
        await api.get(`/me/shifts?date_from=${fmt(past)}&date_to=${fmt(future)}`)
      ).data;
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const grouped = useMemo(() => {
    const upcoming: MyShift[] = [];
    const past: MyShift[] = [];
    for (const s of data?.items ?? []) {
      if (s.shift_date >= today) upcoming.push(s);
      else past.push(s);
    }
    upcoming.sort((a, b) => a.shift_date.localeCompare(b.shift_date));
    past.sort((a, b) => b.shift_date.localeCompare(a.shift_date));
    return { upcoming, past };
  }, [data, today]);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
          <CalendarClock className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Vardiyalarım</h1>
          <p className="text-sm text-muted">
            Yaklaşan ve geçmiş vardiyalar. Hatırlatma için kalendere ekle.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="card flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-orange-500" />
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="card text-center py-10 text-muted">
          Sana atanmış vardiya yok. Manager seni bir vardiyaya eklediğinde burada görünecek.
        </div>
      ) : (
        <>
          <section>
            <h2 className="font-display text-xl mb-2">⏭️ Yaklaşan</h2>
            {grouped.upcoming.length === 0 ? (
              <div className="card text-sm text-muted text-center py-6">
                Yaklaşan vardiyan yok.
              </div>
            ) : (
              <ul className="space-y-2">
                {grouped.upcoming.map((s) => (
                  <ShiftRow key={s.id} shift={s} highlight={s.shift_date === today} />
                ))}
              </ul>
            )}
          </section>

          {grouped.past.length > 0 && (
            <section>
              <h2 className="font-display text-xl mb-2">📜 Geçmiş</h2>
              <ul className="space-y-2 opacity-80">
                {grouped.past.slice(0, 20).map((s) => (
                  <ShiftRow key={s.id} shift={s} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ShiftRow({ shift: s, highlight }: { shift: MyShift; highlight?: boolean }) {
  const start = (s.override_start ?? s.template_start).slice(0, 5);
  const end = (s.override_end ?? s.template_end).slice(0, 5);
  const dateLabel = new Date(s.shift_date).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  return (
    <li
      className={`card flex items-center gap-3 ${
        highlight ? 'ring-2 ring-orange-300' : ''
      }`}
      style={{ borderLeft: `4px solid ${s.template_color}` }}
    >
      <div
        className="flex size-11 items-center justify-center rounded-lg text-white shrink-0"
        style={{ backgroundColor: s.template_color }}
      >
        <Clock className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-base">
          {s.template_name}
          {highlight && (
            <span className="ml-2 text-[10px] text-orange-600 font-semibold">BUGÜN</span>
          )}
        </div>
        <div className="text-xs text-muted flex items-center gap-2 flex-wrap">
          <span>{dateLabel}</span>
          <span>·</span>
          <span>
            {start}–{end}
          </span>
          {s.location_name && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {s.location_name}
              </span>
            </>
          )}
        </div>
        {s.notes && (
          <div className="text-xs text-muted mt-1 bg-orange-50/60 rounded px-2 py-0.5 inline-block">
            💬 {s.notes}
          </div>
        )}
      </div>
      <span className={`chip text-[10px] ${STATUS_STYLE[s.status]}`}>
        {STATUS_TR[s.status]}
      </span>
    </li>
  );
}
