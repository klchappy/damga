import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLeaveSchema, type CreateLeaveInput } from '@damga/shared';
import { toast } from 'sonner';
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Loader2,
  MapPin,
  Plane,
  Plus,
  Repeat,
  X,
} from 'lucide-react';
import { DEFAULT_EMPLOYEE_PAGES, type EmployeePageKey, useAuthStore } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';
import { formatTimeTr } from '@/lib/utils';
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
}

interface Leave {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason?: string | null;
  business_days?: string | null;
  rejection_reason?: string | null;
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

type CalendarItem = 'history' | 'shifts' | 'leaves';

const LEAVE_TYPE_TR: Record<string, string> = {
  annual: 'Yıllık',
  sick: 'Hastalık',
  unpaid: 'Ücretsiz',
  maternity: 'Doğum',
  paternity: 'Babalık',
  compassionate: 'Mazeret',
};

const LEAVE_STATUS_TR: Record<Leave['status'], string> = {
  pending: 'Beklemede',
  approved: 'Onaylı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};

const SHIFT_STATUS_TR: Record<MyShift['status'], string> = {
  scheduled: 'Planlandı',
  completed: 'Tamamlandı',
  absent: 'Gelmedi',
  swapped: 'Devredildi',
};

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftTime(shift: MyShift) {
  return `${(shift.override_start ?? shift.template_start).slice(0, 5)}-${(
    shift.override_end ?? shift.template_end
  ).slice(0, 5)}`;
}

function leaveCoversDate(leave: Leave, dateKey: string) {
  return leave.start_date <= dateKey && leave.end_date >= dateKey;
}

export function MyRecordsPage() {
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  const qc = useQueryClient();
  const todayKey = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [swapping, setSwapping] = useState<MyShift | null>(null);

  const visibleSet =
    user?.role === 'employee'
      ? new Set<EmployeePageKey>(
          org?.settings?.employee_visible_pages?.length
            ? org.settings.employee_visible_pages
            : DEFAULT_EMPLOYEE_PAGES,
        )
      : new Set<EmployeePageKey>(['history', 'leaves']);

  const enabledItems = useMemo(() => {
    const items = new Set<CalendarItem>(['shifts']);
    if (visibleSet.has('history')) items.add('history');
    if (visibleSet.has('leaves')) items.add('leaves');
    return items;
  }, [visibleSet]);

  const monthStart = dateKeyFromParts(month.year, month.month, 1);
  const monthEnd = dateKeyFromParts(
    month.year,
    month.month,
    new Date(month.year, month.month + 1, 0).getDate(),
  );
  const startISO = new Date(Date.UTC(month.year, month.month, 1)).toISOString();
  const endISO = new Date(Date.UTC(month.year, month.month + 1, 0, 23, 59, 59)).toISOString();

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ items: Event[] }>({
    queryKey: ['events', 'me', 'calendar', month.year, month.month],
    queryFn: async () =>
      (await api.get(`/events?date_from=${startISO}&date_to=${endISO}&limit=300`)).data,
    enabled: enabledItems.has('history'),
  });

  const { data: shiftsData, isLoading: shiftsLoading } = useQuery<{ items: MyShift[] }>({
    queryKey: ['me', 'shifts', 'calendar', month.year, month.month],
    queryFn: async () =>
      (await api.get(`/me/shifts?date_from=${monthStart}&date_to=${monthEnd}`)).data,
  });

  const { data: leavesData, isLoading: leavesLoading } = useQuery<{ items: Leave[] }>({
    queryKey: ['leaves', 'me', 'calendar'],
    queryFn: async () => (await api.get('/leaves')).data,
    enabled: enabledItems.has('leaves'),
    staleTime: 60_000,
  });

  const eventsByDay = useMemo(() => {
    const map: Record<string, Event[]> = {};
    for (const event of eventsData?.items ?? []) {
      const day = event.server_time.slice(0, 10);
      (map[day] ??= []).push(event);
    }
    return map;
  }, [eventsData]);

  const shiftsByDay = useMemo(() => {
    const map: Record<string, MyShift[]> = {};
    for (const shift of shiftsData?.items ?? []) {
      (map[shift.shift_date] ??= []).push(shift);
    }
    return map;
  }, [shiftsData]);

  const leavesByDay = useMemo(() => {
    const map: Record<string, Leave[]> = {};
    for (const leave of leavesData?.items ?? []) {
      const start = new Date(`${leave.start_date}T00:00:00`);
      const end = new Date(`${leave.end_date}T00:00:00`);
      const cur = new Date(start);
      while (cur <= end) {
        const key = toDateKey(cur);
        (map[key] ??= []).push(leave);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [leavesData]);

  const firstDay = new Date(month.year, month.month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const monthName = new Intl.DateTimeFormat('tr-TR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(month.year, month.month));

  const cells: Array<{ day?: number; dateKey?: string }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({});
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, dateKey: dateKeyFromParts(month.year, month.month, day) });
  }

  const selectedEvents = enabledItems.has('history') ? eventsByDay[selectedDate] ?? [] : [];
  const selectedShifts = shiftsByDay[selectedDate] ?? [];
  const selectedLeaves = enabledItems.has('leaves') ? leavesByDay[selectedDate] ?? [] : [];
  const hasSelectedData =
    selectedEvents.length > 0 || selectedShifts.length > 0 || selectedLeaves.length > 0;
  const selectedLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const isLoading = eventsLoading || shiftsLoading || leavesLoading;

  const moveMonth = (delta: number) => {
    setMonth(({ year, month: currentMonth }) => {
      const next = new Date(year, currentMonth + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Takvimim
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Geçmiş, vardiya ve izin takvimi
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabledItems.has('leaves') && (
            <button onClick={() => setShowLeaveForm(true)} className="btn-primary text-sm">
              <Plus className="size-4" />
              Yeni izin
            </button>
          )}
          <Link to="/me/shift-swaps" className="btn-outline text-sm">
            <Repeat className="size-4" />
            Devir talepleri
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-orange-500" />
              <h2 className="font-display text-lg capitalize">{monthName}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => moveMonth(-1)} className="btn-ghost p-2" aria-label="Önceki ay">
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => {
                  const d = new Date();
                  setMonth({ year: d.getFullYear(), month: d.getMonth() });
                  setSelectedDate(toDateKey(d));
                }}
                className="btn-outline px-3 py-1.5 text-xs"
              >
                Bugün
              </button>
              <button onClick={() => moveMonth(1)} className="btn-ghost p-2" aria-label="Sonraki ay">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'].map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, index) => {
              const key = cell.dateKey;
              const events = key ? eventsByDay[key] ?? [] : [];
              const shifts = key ? shiftsByDay[key] ?? [] : [];
              const leaves = key ? leavesByDay[key] ?? [] : [];
              const isSelected = key === selectedDate;
              const isToday = key === todayKey;
              const hasItems = events.length > 0 || shifts.length > 0 || leaves.length > 0;

              return (
                <button
                  key={key ?? `empty-${index}`}
                  type="button"
                  disabled={!key}
                  onClick={() => key && setSelectedDate(key)}
                  className={`min-h-[82px] rounded-lg border p-2 text-left transition ${
                    !key
                      ? 'border-transparent bg-transparent'
                      : isSelected
                        ? 'border-orange-500 bg-orange-50 shadow-sm'
                        : hasItems
                          ? 'border-orange-200 bg-white hover:border-orange-300'
                          : 'border-orange-100 bg-cream hover:bg-white'
                  }`}
                >
                  {cell.day && (
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                            isToday ? 'bg-orange-500 text-white' : 'text-ink'
                          }`}
                        >
                          {cell.day}
                        </span>
                        {hasItems && (
                          <span className="text-[10px] text-muted">
                            {events.length + shifts.length + leaves.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        {shifts.slice(0, 1).map((shift) => (
                          <div key={shift.id} className="truncate rounded px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: shift.template_color }}>
                            {shiftTime(shift)}
                          </div>
                        ))}
                        {leaves.slice(0, 1).map((leave) => (
                          <div key={leave.id} className="truncate rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
                            {LEAVE_TYPE_TR[leave.type] ?? leave.type}
                          </div>
                        ))}
                        {events.length > 0 && (
                          <div className="flex gap-1 pt-0.5">
                            {events.slice(0, 4).map((event) => (
                              <span
                                key={event.id}
                                className={`size-1.5 rounded-full ${
                                  event.verification_score >= 80
                                    ? 'bg-success'
                                    : event.verification_score >= 60
                                      ? 'bg-warning'
                                      : 'bg-danger'
                                }`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 border-t border-orange-100 pt-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded bg-orange-500" />
              Bugün
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded bg-success" />
              Damga
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded bg-sky-100 ring-1 ring-sky-200" />
              İzin
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded bg-slate-400" />
              Vardiya
            </span>
          </div>
        </section>

        <aside className="card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                Seçili gün
              </p>
              <h2 className="font-display text-xl capitalize">{selectedLabel}</h2>
            </div>
            {isLoading && <Loader2 className="size-4 animate-spin text-orange-500" />}
          </div>

          {!hasSelectedData ? (
            <div className="rounded-lg border border-dashed border-orange-200 bg-cream p-4 text-sm text-muted">
              Bu güne ait vardiya, izin veya damga kaydı yok.
            </div>
          ) : (
            <div className="space-y-4">
              {selectedShifts.length > 0 && (
                <Section title="Vardiyalarım" icon={<Clock className="size-4" />}>
                  {selectedShifts.map((shift) => (
                    <ShiftCard key={shift.id} shift={shift} onSwap={() => setSwapping(shift)} />
                  ))}
                </Section>
              )}

              {selectedLeaves.length > 0 && enabledItems.has('leaves') && (
                <Section title="İzinlerim" icon={<Plane className="size-4" />}>
                  {selectedLeaves.map((leave) => (
                    <LeaveCard key={leave.id} leave={leave} selectedDate={selectedDate} />
                  ))}
                </Section>
              )}

              {selectedEvents.length > 0 && enabledItems.has('history') && (
                <Section title="Geçmişim" icon={<History className="size-4" />}>
                  {selectedEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </Section>
              )}
            </div>
          )}
        </aside>
      </div>

      {showLeaveForm && (
        <CreateLeaveModal
          initialDate={selectedDate}
          onClose={() => setShowLeaveForm(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['leaves', 'me'] });
            void qc.invalidateQueries({ queryKey: ['leaves', 'me', 'calendar'] });
          }}
        />
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

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-orange-500">{icon}</span>
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ShiftCard({ shift, onSwap }: { shift: MyShift; onSwap: () => void }) {
  const canSwap = shift.status === 'scheduled' && shift.shift_date >= toDateKey(new Date());
  return (
    <div className="rounded-lg border border-orange-100 bg-white p-3" style={{ borderLeft: `4px solid ${shift.template_color}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{shift.template_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{shiftTime(shift)}</span>
            {shift.location_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {shift.location_name}
              </span>
            )}
          </div>
          {shift.notes && <div className="mt-2 rounded bg-orange-50 px-2 py-1 text-xs text-muted">{shift.notes}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="chip bg-warning/10 text-warning text-[10px]">
            {SHIFT_STATUS_TR[shift.status]}
          </span>
          {canSwap && (
            <button onClick={onSwap} className="btn-outline px-2 py-1 text-xs">
              <Repeat className="size-3" />
              Devret
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaveCard({ leave, selectedDate }: { leave: Leave; selectedDate: string }) {
  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">{LEAVE_TYPE_TR[leave.type] ?? leave.type}</div>
          <div className="mt-1 text-xs text-muted">
            {leave.start_date} - {leave.end_date}
            {leave.business_days && ` · ${leave.business_days} iş günü`}
          </div>
          {leaveCoversDate(leave, selectedDate) && leave.reason && (
            <div className="mt-2 text-xs text-ink">{leave.reason}</div>
          )}
          {leave.rejection_reason && (
            <div className="mt-2 text-xs text-danger">Red: {leave.rejection_reason}</div>
          )}
        </div>
        <span
          className={`chip text-[10px] ${
            leave.status === 'approved'
              ? 'bg-success/10 text-success'
              : leave.status === 'rejected'
                ? 'bg-danger/10 text-danger'
                : leave.status === 'cancelled'
                  ? 'bg-muted/10 text-muted'
                  : 'bg-warning/10 text-warning'
          }`}
        >
          {LEAVE_STATUS_TR[leave.status]}
        </span>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
  const label =
    event.type === 'check_in'
      ? 'Giriş'
      : event.type === 'check_out'
        ? 'Çıkış'
        : event.type === 'break_start'
          ? 'Mola başlangıcı'
          : event.type === 'break_end'
            ? 'Mola bitişi'
            : event.type;
  return (
    <div className="rounded-lg border border-orange-100 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-semibold text-sm">
            {label} · {formatTimeTr(event.server_time)}
          </div>
          {event.flags.length > 0 && (
            <div className="text-xs text-warning">{event.flags.join(', ')}</div>
          )}
          <LocationBadge event={event} />
        </div>
        <span
          className={`chip text-[10px] ${
            event.verification_score >= 80
              ? 'bg-success/10 text-success'
              : event.verification_score >= 60
                ? 'bg-warning/10 text-warning'
                : 'bg-danger/10 text-danger'
          }`}
        >
          Trust {event.verification_score}
        </span>
      </div>
    </div>
  );
}

function CreateLeaveModal({
  initialDate,
  onClose,
  onCreated,
}: {
  initialDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateLeaveInput>({
    resolver: zodResolver(createLeaveSchema),
    defaultValues: {
      type: 'annual',
      start_date: initialDate,
      end_date: initialDate,
      half_day: false,
      reason: '',
    },
  });
  const mut = useMutation({
    mutationFn: async (data: CreateLeaveInput) => (await api.post('/leaves', data)).data,
    onSuccess: () => {
      toast.success('İzin talebi gönderildi');
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-4 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit((data) => mut.mutate(data))}
        className="card w-full max-w-md space-y-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Takvim aksiyonu
            </p>
            <h3 className="font-display text-xl">Yeni izin talebi</h3>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>

        <div>
          <label className="label">Tip</label>
          <select className="input mt-1" {...register('type')}>
            <option value="annual">Yıllık</option>
            <option value="sick">Hastalık</option>
            <option value="unpaid">Ücretsiz</option>
            <option value="maternity">Doğum</option>
            <option value="paternity">Babalık</option>
            <option value="compassionate">Mazeret</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Başlangıç</label>
            <input type="date" className="input mt-1" {...register('start_date')} />
            {errors.start_date && <p className="text-xs text-danger">{errors.start_date.message}</p>}
          </div>
          <div>
            <label className="label">Bitiş</label>
            <input type="date" className="input mt-1" {...register('end_date')} />
            {errors.end_date && <p className="text-xs text-danger">{errors.end_date.message}</p>}
          </div>
        </div>

        <div>
          <label className="label">Açıklama</label>
          <textarea className="input mt-1 resize-none" rows={3} {...register('reason')} />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-outline flex-1" disabled={mut.isPending}>
            İptal
          </button>
          <button className="btn-primary flex-1" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="size-4 animate-spin" />}
            Gönder
          </button>
        </div>
      </form>
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

  const { data: usersData } = useQuery<{
    items: { id: string; full_name: string; department: string | null }[];
  }>({
    queryKey: ['users-for-swap'],
    queryFn: async () => (await api.get('/users')).data,
  });
  const candidates = (usersData?.items ?? []).filter((candidate) => candidate.id !== me?.id);

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
      toast.success('Devir talebi gönderildi');
      void qc.invalidateQueries({ queryKey: ['me', 'shift-swaps'] });
      onSubmitted();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-4 sm:items-center sm:p-4" onClick={onClose}>
      <div className="card w-full max-w-md space-y-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Vardiya devri
            </p>
            <h3 className="font-display text-xl">{shift.template_name}</h3>
            <p className="text-xs text-muted">
              {shift.shift_date} · {shiftTime(shift)}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>

        <div>
          <label className="label">Kime devredilecek?</label>
          <select className="input mt-1" value={toUserId} onChange={(event) => setToUserId(event.target.value)}>
            <option value="">Çalışan seç</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.full_name}
                {candidate.department ? ` · ${candidate.department}` : ''}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={twoWay}
            onChange={(event) => setTwoWay(event.target.checked)}
            className="size-4 accent-orange-500"
          />
          Karşılıklı takas
        </label>

        {twoWay && toUserId && (
          <div className="text-xs">
            {theirShift ? (
              <div className="flex items-center gap-2 rounded-md bg-orange-50 p-2">
                <ArrowRight className="size-3.5 text-orange-500" />
                <span>
                  Onun vardiyası: <strong>{theirShift.template_name}</strong> ·{' '}
                  {shiftTime(theirShift)}
                </span>
              </div>
            ) : (
              <div className="rounded-md bg-warning/10 p-2 text-warning">
                Bu kişinin seçili günde vardiyası yok.
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">Mesaj</label>
          <textarea
            className="input mt-1 resize-none text-sm"
            rows={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-outline flex-1" disabled={submitMut.isPending}>
            İptal
          </button>
          <button
            onClick={() => submitMut.mutate()}
            disabled={submitMut.isPending || !toUserId || (twoWay && !theirShift)}
            className="btn-primary flex-1"
          >
            {submitMut.isPending && <Loader2 className="size-4 animate-spin" />}
            <Repeat className="size-4" />
            Talep et
          </button>
        </div>
      </div>
    </div>
  );
}
