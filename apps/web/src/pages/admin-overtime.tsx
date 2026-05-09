import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  AlertTriangle,
  Filter,
  Coins,
  User as UserIcon,
  Download,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatDateTimeTr } from '@/lib/utils';

interface Overtime {
  id: string;
  user_id: string;
  shift_assignment_id: string | null;
  event_id: string | null;
  overtime_minutes: number;
  expected_end: string;
  actual_end: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  user_name: string | null;
  user_department: string | null;
}

const STATUS_TR = {
  pending: 'Bekliyor',
  approved: 'Onaylı',
  rejected: 'Red',
} as const;

const STATUS_STYLE = {
  pending: 'bg-warning/10 text-warning border-warning/30',
  approved: 'bg-success/10 text-success border-success/30',
  rejected: 'bg-danger/10 text-danger border-danger/30',
} as const;

function formatMinutes(m: number): string {
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} sa` : `${h}sa ${rem}dk`;
}

export function AdminOvertimePage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>(
    'pending',
  );
  const [acting, setActing] = useState<{
    rec: Overtime;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [notes, setNotes] = useState('');
  const [xpBonus, setXpBonus] = useState(50);

  const { data, isLoading } = useQuery<{ items: Overtime[] }>({
    queryKey: ['admin', 'overtime'],
    queryFn: async () => (await api.get('/overtime?limit=200')).data,
    refetchInterval: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: async (payload: { id: string; xp_bonus?: number; notes?: string }) =>
      api.post(`/overtime/${payload.id}/approve`, {
        xp_bonus: payload.xp_bonus,
        notes: payload.notes,
      }),
    onSuccess: () => {
      toast.success('✅ Fazla mesai onaylandı');
      void qc.invalidateQueries({ queryKey: ['admin', 'overtime'] });
      setActing(null);
      setNotes('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const rejectMut = useMutation({
    mutationFn: async (payload: { id: string; rejection_reason: string }) =>
      api.post(`/overtime/${payload.id}/reject`, {
        rejection_reason: payload.rejection_reason,
      }),
    onSuccess: () => {
      toast.success('❌ Fazla mesai reddedildi');
      void qc.invalidateQueries({ queryKey: ['admin', 'overtime'] });
      setActing(null);
      setNotes('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const items = (data?.items ?? []).filter((r) =>
    filter === 'all' ? true : r.status === filter,
  );
  const pendingCount = (data?.items ?? []).filter((r) => r.status === 'pending').length;
  const totalApprovedMinutes = (data?.items ?? [])
    .filter((r) => r.status === 'approved')
    .reduce((s, r) => s + r.overtime_minutes, 0);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <Clock className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Fazla Mesai</h1>
            <p className="text-sm text-muted">
              Çalışanların vardiya bitiminden sonra çalıştığı süreler. Onayla veya reddet.
            </p>
          </div>
        </div>
        <ExportButton />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3">
          <div className="text-xs text-muted">Bekleyen</div>
          <div className="font-display text-2xl text-warning">{pendingCount}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Onaylı (toplam)</div>
          <div className="font-display text-2xl text-success">
            {formatMinutes(totalApprovedMinutes)}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Toplam kayıt</div>
          <div className="font-display text-2xl">{(data?.items ?? []).length}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="size-4 text-muted" />
        {(
          [
            { v: 'pending', label: `Bekleyen (${pendingCount})` },
            { v: 'approved', label: 'Onaylı' },
            { v: 'rejected', label: 'Red' },
            { v: 'all', label: 'Tümü' },
          ] as const
        ).map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFilter(f.v)}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              filter === f.v
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-muted border-orange-100 hover:bg-orange-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-orange-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-10 text-muted">
          {filter === 'pending'
            ? '👍 Bekleyen fazla mesai yok.'
            : 'Bu durumda kayıt yok.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex size-9 items-center justify-center rounded-md bg-warning/10 text-warning shrink-0">
                    <Clock className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-1.5 flex-wrap">
                      <UserIcon className="size-3.5 text-orange-500" />
                      {r.user_name ?? '—'}
                      {r.user_department && (
                        <span className="text-xs text-muted">· {r.user_department}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      Beklenen çıkış: <strong>{r.expected_end}</strong> · Gerçek:{' '}
                      <strong>{formatDateTimeTr(r.actual_end)}</strong>
                    </div>
                  </div>
                </div>
                <span className={`chip text-[10px] border ${STATUS_STYLE[r.status]}`}>
                  {STATUS_TR[r.status]}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
                <div className="flex items-center gap-1.5 font-display text-lg text-warning">
                  <AlertTriangle className="size-4" />
                  {formatMinutes(r.overtime_minutes)}
                  <span className="text-xs text-muted font-sans">fazla</span>
                </div>
                {r.reason && (
                  <div className="text-xs text-muted bg-orange-50/60 px-2 py-1 rounded-md">
                    💬 {r.reason}
                  </div>
                )}
                {r.rejection_reason && (
                  <div className="text-xs text-danger bg-danger/5 px-2 py-1 rounded-md">
                    Red: {r.rejection_reason}
                  </div>
                )}
              </div>

              {r.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActing({ rec: r, decision: 'approve' });
                      setNotes('');
                      setXpBonus(Math.min(100, Math.max(20, Math.round(r.overtime_minutes / 2))));
                    }}
                    className="btn-primary flex-1 text-xs"
                  >
                    <CheckCircle2 className="size-3.5" /> Onayla
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActing({ rec: r, decision: 'reject' });
                      setNotes('');
                    }}
                    className="btn-outline flex-1 text-xs border-danger/40 text-danger hover:bg-danger/5"
                  >
                    <XCircle className="size-3.5" /> Reddet
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {acting && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
          onClick={() => setActing(null)}
        >
          <div
            className="w-full max-w-md card space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl">
                  {acting.decision === 'approve' ? 'Onayla' : 'Reddet'}
                </h3>
                <p className="text-xs text-muted">
                  {acting.rec.user_name} · {formatMinutes(acting.rec.overtime_minutes)}
                </p>
              </div>
              <button onClick={() => setActing(null)} className="btn-ghost p-1.5">
                <X className="size-4" />
              </button>
            </div>

            {acting.decision === 'approve' ? (
              <>
                <div>
                  <label className="label inline-flex items-center gap-1.5">
                    <Coins className="size-3.5 text-orange-500" />
                    Bonus XP (opsiyonel)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    className="input mt-1"
                    value={xpBonus}
                    onChange={(e) => setXpBonus(Number(e.target.value))}
                  />
                  <p className="text-[10px] text-muted mt-1">
                    Çalışanın hesabına bonus XP ekle. 0 = sadece onay, XP yok.
                  </p>
                </div>
                <div>
                  <label className="label">Not (opsiyonel)</label>
                  <textarea
                    rows={2}
                    className="input mt-1 resize-none text-sm"
                    placeholder="Bordroda manuel saatlik takip..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActing(null)}
                    className="btn-outline flex-1"
                    disabled={approveMut.isPending}
                  >
                    Vazgeç
                  </button>
                  <button
                    onClick={() =>
                      approveMut.mutate({
                        id: acting.rec.id,
                        xp_bonus: xpBonus > 0 ? xpBonus : undefined,
                        notes: notes.trim() || undefined,
                      })
                    }
                    disabled={approveMut.isPending}
                    className="btn-primary flex-1"
                  >
                    {approveMut.isPending && <Loader2 className="size-4 animate-spin" />}
                    Onayla
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">Red sebebi</label>
                  <textarea
                    rows={3}
                    className="input mt-1 resize-none text-sm"
                    placeholder="Geçerli bir gerekçe yok, vardiya bitti..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActing(null)}
                    className="btn-outline flex-1"
                    disabled={rejectMut.isPending}
                  >
                    Vazgeç
                  </button>
                  <button
                    onClick={() =>
                      rejectMut.mutate({
                        id: acting.rec.id,
                        rejection_reason: notes.trim(),
                      })
                    }
                    disabled={rejectMut.isPending || notes.trim().length < 2}
                    className="btn-primary flex-1 bg-danger hover:bg-danger/90 border-danger"
                  >
                    {rejectMut.isPending && <Loader2 className="size-4 animate-spin" />}
                    Reddet
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExportButton() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [status, setStatus] = useState<'approved' | 'pending' | 'rejected' | 'all'>(
    'approved',
  );
  const [downloading, setDownloading] = useState(false);

  const handleExport = async () => {
    setDownloading(true);
    try {
      const r = await api.get(
        `/reports/overtime?month=${month}&status=${status}&format=csv`,
        { responseType: 'blob' },
      );
      const blob = new Blob([r.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `overtime-${month}-${status}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('📥 CSV indirildi');
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-outline text-sm">
        <Download className="size-4" />
        CSV İndir
      </button>
    );
  }

  return (
    <div className="card flex flex-col sm:flex-row items-stretch sm:items-end gap-2 p-3">
      <div>
        <label className="label text-[10px]">Ay</label>
        <input
          type="month"
          className="input mt-1 text-xs"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>
      <div>
        <label className="label text-[10px]">Durum</label>
        <select
          className="input mt-1 text-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="approved">Onaylı</option>
          <option value="pending">Bekleyen</option>
          <option value="rejected">Reddedilen</option>
          <option value="all">Hepsi</option>
        </select>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={handleExport}
          disabled={downloading}
          className="btn-primary text-xs"
        >
          {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          İndir
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={downloading}
          className="btn-ghost text-xs p-2"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
