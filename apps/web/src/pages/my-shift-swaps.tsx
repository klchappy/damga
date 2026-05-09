import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Repeat,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatDateTimeTr } from '@/lib/utils';

interface SwapItem {
  id: string;
  org_id: string;
  from_user_id: string;
  from_assignment_id: string;
  to_user_id: string;
  to_assignment_id: string | null;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  response_reason: string | null;
  responded_at: string | null;
  created_at: string;
  shift_date: string;
  template_name: string;
  template_color: string;
  template_start: string;
  template_end: string;
  from_user_name: string | null;
  to_user_name: string | null;
  is_incoming: boolean;
}

const STATUS_TR = {
  pending: 'Bekliyor',
  accepted: 'Kabul edildi',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
  expired: 'Süresi geçti',
} as const;

const STATUS_STYLE = {
  pending: 'bg-warning/10 text-warning border-warning/30',
  accepted: 'bg-success/10 text-success border-success/30',
  rejected: 'bg-danger/10 text-danger border-danger/30',
  cancelled: 'bg-muted/10 text-muted border-muted/20',
  expired: 'bg-muted/10 text-muted border-muted/20',
} as const;

export function MyShiftSwapsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [rejecting, setRejecting] = useState<SwapItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery<{ items: SwapItem[] }>({
    queryKey: ['me', 'shift-swaps', filter],
    queryFn: async () =>
      (
        await api.get(
          `/me/shift-swaps?direction=${filter === 'all' ? 'all' : filter}`,
        )
      ).data,
    refetchInterval: 30_000,
  });

  const acceptMut = useMutation({
    mutationFn: async (id: string) => api.post(`/shift-swaps/${id}/accept`),
    onSuccess: () => {
      toast.success('✅ Devir kabul edildi');
      void qc.invalidateQueries({ queryKey: ['me', 'shift-swaps'] });
      void qc.invalidateQueries({ queryKey: ['me', 'shifts'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/shift-swaps/${id}/reject`, { response_reason: reason || undefined }),
    onSuccess: () => {
      toast.success('Devir reddedildi');
      void qc.invalidateQueries({ queryKey: ['me', 'shift-swaps'] });
      setRejecting(null);
      setRejectReason('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => api.post(`/shift-swaps/${id}/cancel`),
    onSuccess: () => {
      toast.success('Devir talebi iptal edildi');
      void qc.invalidateQueries({ queryKey: ['me', 'shift-swaps'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const items = data?.items ?? [];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
          <Repeat className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Vardiya Devir Talepleri</h1>
          <p className="text-sm text-muted">
            Sana gelen ve gönderdiğin talepleri buradan yönet.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="size-4 text-muted" />
        {(
          [
            { v: 'all', label: 'Tümü' },
            { v: 'incoming', label: 'Gelen' },
            { v: 'outgoing', label: 'Giden' },
          ] as const
        ).map((f) => (
          <button
            key={f.v}
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
          Talep yok. Vardiyalarım sayfasından "Devret" ile başlayabilirsin.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li
              key={s.id}
              className="card space-y-2"
              style={{ borderLeft: `4px solid ${s.template_color}` }}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className="flex size-9 items-center justify-center rounded-md text-white shrink-0"
                    style={{ backgroundColor: s.template_color }}
                  >
                    {s.is_incoming ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium">
                      {s.template_name}
                      <span className="text-sm text-muted ml-2">
                        {s.template_start.slice(0, 5)}–{s.template_end.slice(0, 5)}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {new Date(s.shift_date).toLocaleDateString('tr-TR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </div>
                    <div className="text-xs mt-1">
                      {s.is_incoming ? (
                        <>
                          <span className="text-orange-600 font-medium">
                            {s.from_user_name}
                          </span>
                          <span className="text-muted"> sana devretmek istiyor</span>
                          {s.to_assignment_id && (
                            <span className="text-muted"> (karşılıklı takas)</span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-muted">Hedef: </span>
                          <span className="text-orange-600 font-medium">
                            {s.to_user_name}
                          </span>
                          {s.to_assignment_id && (
                            <span className="text-muted"> (karşılıklı)</span>
                          )}
                        </>
                      )}
                    </div>
                    {s.message && (
                      <div className="mt-1 text-xs italic bg-orange-50/60 px-2 py-1 rounded-md">
                        💬 {s.message}
                      </div>
                    )}
                    {s.response_reason && (
                      <div className="mt-1 text-xs text-danger">
                        Red: {s.response_reason}
                      </div>
                    )}
                    <div className="text-[10px] text-muted mt-1">
                      Talep: {formatDateTimeTr(s.created_at)}
                      {s.responded_at && ` · Yanıt: ${formatDateTimeTr(s.responded_at)}`}
                    </div>
                  </div>
                </div>
                <span className={`chip text-[10px] border ${STATUS_STYLE[s.status]}`}>
                  {STATUS_TR[s.status]}
                </span>
              </div>

              {s.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  {s.is_incoming ? (
                    <>
                      <button
                        onClick={() => acceptMut.mutate(s.id)}
                        disabled={acceptMut.isPending}
                        className="btn-primary flex-1 text-xs"
                      >
                        <CheckCircle2 className="size-3.5" /> Kabul Et
                      </button>
                      <button
                        onClick={() => {
                          setRejecting(s);
                          setRejectReason('');
                        }}
                        className="btn-outline border-danger/40 text-danger hover:bg-danger/5 flex-1 text-xs"
                      >
                        <XCircle className="size-3.5" /> Reddet
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm('Bu talebi iptal etmek istediğine emin misin?')) {
                          cancelMut.mutate(s.id);
                        }
                      }}
                      disabled={cancelMut.isPending}
                      className="btn-outline border-muted/40 hover:bg-muted/5 w-full text-xs"
                    >
                      <X className="size-3.5" /> Talebi İptal Et
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
          onClick={() => setRejecting(null)}
        >
          <div
            className="w-full max-w-md card space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg">Devir talebini reddet</h3>
                <p className="text-xs text-muted mt-0.5">
                  {rejecting.from_user_name} · {rejecting.shift_date}
                </p>
              </div>
              <button
                onClick={() => setRejecting(null)}
                className="btn-ghost p-1.5"
              >
                <X className="size-4" />
              </button>
            </div>
            <div>
              <label className="label">Sebep (opsiyonel)</label>
              <textarea
                rows={3}
                className="input mt-1 resize-none text-sm"
                placeholder="Maalesef o gün ben de meşgulüm..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRejecting(null)}
                className="btn-outline flex-1"
                disabled={rejectMut.isPending}
              >
                Vazgeç
              </button>
              <button
                onClick={() =>
                  rejectMut.mutate({
                    id: rejecting.id,
                    reason: rejectReason.trim(),
                  })
                }
                disabled={rejectMut.isPending}
                className="btn-primary flex-1 bg-danger hover:bg-danger/90 border-danger"
              >
                {rejectMut.isPending && <Loader2 className="size-4 animate-spin" />}
                Reddet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
