import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CalendarClock,
  Loader2,
  MapPin,
  Clock,
  Repeat,
  X,
  ArrowRight,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

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
  const [swapping, setSwapping] = useState<MyShift | null>(null);

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <CalendarClock className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Vardiyalarım</h1>
            <p className="text-sm text-muted">
              Yaklaşan ve geçmiş vardiyalar. "Devret" ile arkadaşına aktar.
            </p>
          </div>
        </div>
        <Link to="/me/shift-swaps" className="btn-outline text-sm">
          <Repeat className="size-4" /> Devir Talepleri
        </Link>
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
                  <ShiftRow
                    key={s.id}
                    shift={s}
                    highlight={s.shift_date === today}
                    onSwap={() => setSwapping(s)}
                  />
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

      {swapping && (
        <SwapModal
          shift={swapping}
          onClose={() => setSwapping(null)}
          onSubmitted={() => setSwapping(null)}
        />
      )}
    </div>
  );
}

function SwapModal({
  shift,
  onClose,
  onSubmitted,
}: {
  shift: MyShift;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [toUserId, setToUserId] = useState('');
  const [twoWay, setTwoWay] = useState(false);
  const [message, setMessage] = useState('');

  const { data: usersData } = useQuery<{ items: { id: string; full_name: string; department: string | null }[] }>({
    queryKey: ['users-for-swap'],
    queryFn: async () => (await api.get('/users')).data,
  });
  const candidates = (usersData?.items ?? []).filter(
    (u) => u.id !== me?.id,
  );

  const { data: theirShifts } = useQuery<{ items: MyShift[] }>({
    queryKey: ['shift-assignments-day', shift.shift_date, toUserId],
    queryFn: async () =>
      (
        await api.get(
          `/shift-assignments?date_from=${shift.shift_date}&date_to=${shift.shift_date}&user_id=${toUserId}`,
        )
      ).data,
    enabled: !!toUserId && twoWay,
  });
  const theirShift = (theirShifts?.items ?? [])[0];

  const submitMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        from_assignment_id: shift.id,
        to_user_id: toUserId,
      };
      if (twoWay && theirShift) payload.to_assignment_id = theirShift.id;
      if (message.trim()) payload.message = message.trim();
      return (await api.post('/shift-swaps', payload)).data;
    },
    onSuccess: () => {
      toast.success('🔁 Devir talebi gönderildi');
      void qc.invalidateQueries({ queryKey: ['me', 'shift-swaps'] });
      onSubmitted();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md card space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <Repeat className="size-3.5" /> Vardiya Devri
            </div>
            <h3 className="font-display text-xl mt-1">
              {shift.template_name}
            </h3>
            <p className="text-xs text-muted">
              {shift.shift_date} ·{' '}
              {(shift.override_start ?? shift.template_start).slice(0, 5)}–
              {(shift.override_end ?? shift.template_end).slice(0, 5)}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="size-4" />
          </button>
        </div>

        <div>
          <label className="label">Kime devretmek istiyorsun?</label>
          <select
            className="input mt-1"
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
          >
            <option value="">— Çalışan seç —</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
                {u.department ? ` · ${u.department}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={twoWay}
              onChange={(e) => setTwoWay(e.target.checked)}
              className="size-4 accent-orange-500"
            />
            <span className="text-sm">Karşılıklı takas (onun da o gün vardiyası varsa)</span>
          </label>
          {twoWay && toUserId && (
            <div className="mt-2 text-xs">
              {theirShift ? (
                <div
                  className="rounded-md p-2 flex items-center gap-2"
                  style={{ backgroundColor: theirShift.template_color + '20' }}
                >
                  <ArrowRight className="size-3.5 text-orange-500" />
                  <span>
                    Onun vardiyası: <strong>{theirShift.template_name}</strong>
                    {' '}
                    {(theirShift.override_start ?? theirShift.template_start).slice(0, 5)}–
                    {(theirShift.override_end ?? theirShift.template_end).slice(0, 5)}
                    {' '}— sen alacaksın
                  </span>
                </div>
              ) : (
                <div className="rounded-md bg-warning/10 text-warning p-2">
                  Bu kişinin o gün vardiyası yok — karşılıklı takas yapılamaz.
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="label">Mesaj (opsiyonel)</label>
          <textarea
            className="input mt-1 resize-none text-sm"
            rows={2}
            placeholder="Doktora gitmem gerekiyor, alabilir misin?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-outline flex-1" disabled={submitMut.isPending}>
            İptal
          </button>
          <button
            onClick={() => submitMut.mutate()}
            disabled={
              submitMut.isPending ||
              !toUserId ||
              (twoWay && !theirShift)
            }
            className="btn-primary flex-1"
          >
            {submitMut.isPending && <Loader2 className="size-4 animate-spin" />}
            <Repeat className="size-4" />
            Devir Talep Et
          </button>
        </div>
      </div>
    </div>
  );
}

function ShiftRow({
  shift: s,
  highlight,
  onSwap,
}: {
  shift: MyShift;
  highlight?: boolean;
  onSwap?: () => void;
}) {
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
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className={`chip text-[10px] ${STATUS_STYLE[s.status]}`}>
          {STATUS_TR[s.status]}
        </span>
        {onSwap && s.status === 'scheduled' && (
          <button
            onClick={onSwap}
            className="text-[11px] px-2 py-0.5 rounded-md border border-orange-200 text-orange-700 hover:bg-orange-50 transition inline-flex items-center gap-1"
          >
            <Repeat className="size-3" /> Devret
          </button>
        )}
      </div>
    </li>
  );
}
