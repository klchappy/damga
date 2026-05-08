import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  Trash2,
  X,
  Plus,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  is_active: boolean;
  location_name: string | null;
}

interface User {
  id: string;
  full_name: string;
  department: string | null;
  is_active: boolean;
}

interface Assignment {
  id: string;
  user_id: string;
  shift_template_id: string;
  shift_date: string;
  status: 'scheduled' | 'completed' | 'absent' | 'swapped';
  override_start: string | null;
  override_end: string | null;
  template_name: string;
  template_color: string;
  template_start: string;
  template_end: string;
  user_name: string | null;
  user_department: string | null;
  notes: string | null;
}

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ManagerSchedulePage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [picker, setPicker] = useState<{ user: User; date: string } | null>(null);

  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const dateFrom = fmtDate(days[0]!);
  const dateTo = fmtDate(days[6]!);

  const { data: users } = useQuery<{ items: User[] }>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const { data: shifts } = useQuery<{ items: ShiftTemplate[] }>({
    queryKey: ['shifts', 'active'],
    queryFn: async () => (await api.get('/shifts')).data,
  });

  const { data: assigns, isLoading } = useQuery<{ items: Assignment[] }>({
    queryKey: ['shift-assignments', dateFrom, dateTo],
    queryFn: async () =>
      (await api.get(`/shift-assignments?date_from=${dateFrom}&date_to=${dateTo}`)).data,
  });

  // userId-date → assignment lookup
  const assignByCell = useMemo(() => {
    const m: Record<string, Assignment> = {};
    for (const a of assigns?.items ?? []) {
      m[`${a.user_id}_${a.shift_date}`] = a;
    }
    return m;
  }, [assigns]);

  const createMut = useMutation({
    mutationFn: async (payload: {
      user_id: string;
      shift_date: string;
      shift_template_id: string;
    }) => (await api.post('/shift-assignments', payload)).data,
    onSuccess: () => {
      toast.success('✅ Vardiya atandı');
      void qc.invalidateQueries({ queryKey: ['shift-assignments'] });
      setPicker(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/shift-assignments/${id}`),
    onSuccess: () => {
      toast.success('🗑️ Vardiya kaldırıldı');
      void qc.invalidateQueries({ queryKey: ['shift-assignments'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const employees = (users?.items ?? []).filter((u) => u.is_active);
  const activeShifts = (shifts?.items ?? []).filter((s) => s.is_active);

  const weekRange = `${days[0]!.getDate()} ${days[0]!.toLocaleDateString('tr-TR', {
    month: 'short',
  })} – ${days[6]!.getDate()} ${days[6]!.toLocaleDateString('tr-TR', {
    month: 'short',
  })}`;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <CalendarDays className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Vardiya Planı</h1>
            <p className="text-sm text-muted">
              Çalışanlara haftalık vardiya ata. Hücreye tıkla → vardiya seç.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(d);
            }}
            className="btn-ghost p-2"
            aria-label="Önceki hafta"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="font-display text-base min-w-[180px] text-center">
            {weekRange}
          </span>
          <button
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + 7);
              setWeekStart(d);
            }}
            className="btn-ghost p-2"
            aria-label="Sonraki hafta"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="btn-outline text-xs"
          >
            Bu hafta
          </button>
        </div>
      </div>

      {activeShifts.length === 0 ? (
        <div className="card text-center py-10 text-muted">
          Önce <a href="/admin/shifts" className="text-orange-600 underline">
            vardiya şablonu
          </a>{' '}
          oluşturmalısın.
        </div>
      ) : isLoading ? (
        <div className="card flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-orange-500" />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white text-left text-xs text-muted font-medium px-2 py-1.5 z-10">
                  Çalışan
                </th>
                {days.map((d, i) => {
                  const isToday = fmtDate(d) === fmtDate(new Date());
                  return (
                    <th
                      key={i}
                      className={`text-center text-xs font-medium px-2 py-1.5 min-w-[100px] ${
                        isToday ? 'bg-orange-50 rounded-md text-orange-700' : 'text-muted'
                      }`}
                    >
                      <div>{DAY_LABELS[i]}</div>
                      <div className="font-display text-base text-ink">{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((u) => (
                <tr key={u.id}>
                  <td className="sticky left-0 bg-white px-2 py-1.5 z-10">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-md bg-orange-100 text-orange-700 font-semibold text-xs">
                        {u.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium leading-tight">{u.full_name}</div>
                        {u.department && (
                          <div className="text-[10px] text-muted leading-tight">
                            {u.department}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const dateStr = fmtDate(d);
                    const a = assignByCell[`${u.id}_${dateStr}`];
                    return (
                      <td key={dateStr} className="px-1 py-1">
                        {a ? (
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `${u.full_name} – ${a.template_name} (${a.template_start}-${a.template_end}) vardiyasını kaldırılsın mı?`,
                                )
                              ) {
                                delMut.mutate(a.id);
                              }
                            }}
                            className="w-full rounded-md px-2 py-1.5 text-[11px] text-white text-center font-medium hover:opacity-80 transition"
                            style={{ backgroundColor: a.template_color }}
                            title={`${a.template_name} ${a.template_start}-${a.template_end}`}
                          >
                            <div className="truncate">{a.template_name}</div>
                            <div className="text-[9px] opacity-90">
                              {a.template_start.slice(0, 5)}–{a.template_end.slice(0, 5)}
                            </div>
                          </button>
                        ) : (
                          <button
                            onClick={() => setPicker({ user: u, date: dateStr })}
                            className="w-full rounded-md border border-dashed border-orange-200 hover:border-orange-400 hover:bg-orange-50 py-2 text-muted hover:text-orange-600 transition"
                          >
                            <Plus className="size-3.5 mx-auto" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
          onClick={() => setPicker(null)}
        >
          <div
            className="w-full max-w-sm card space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg">
                  {picker.user.full_name}
                </h3>
                <p className="text-xs text-muted">
                  {new Date(picker.date).toLocaleDateString('tr-TR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
              </div>
              <button onClick={() => setPicker(null)} className="btn-ghost p-1.5">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-muted">Vardiya seç:</p>
            <div className="grid gap-2">
              {activeShifts.map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    createMut.mutate({
                      user_id: picker.user.id,
                      shift_date: picker.date,
                      shift_template_id: s.id,
                    })
                  }
                  disabled={createMut.isPending}
                  className="flex items-center justify-between gap-3 rounded-lg p-3 text-left hover:opacity-90 transition"
                  style={{ backgroundColor: s.color, color: '#fff' }}
                >
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs opacity-90">
                      {s.start_time} – {s.end_time}
                      {s.location_name && ` · ${s.location_name}`}
                    </div>
                  </div>
                  {createMut.isPending && <Loader2 className="size-4 animate-spin" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
