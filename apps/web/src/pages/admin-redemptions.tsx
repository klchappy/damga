import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Gift,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Mail,
  Phone,
  User as UserIcon,
  X,
  Filter,
  Coins,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatDateTimeTr } from '@/lib/utils';

interface Redemption {
  id: string;
  user_id: string;
  reward_id: string;
  cost_xp: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  created_at: string;
  fulfilled_at: string | null;
  notes: string | null;
  reward_name: string | null;
  reward_icon: string | null;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
}

const STATUS_TR = {
  pending: 'Bekliyor',
  fulfilled: 'Teslim',
  cancelled: 'İptal',
} as const;

const STATUS_STYLE = {
  pending: 'bg-warning/10 text-warning border-warning/30',
  fulfilled: 'bg-success/10 text-success border-success/30',
  cancelled: 'bg-muted/10 text-muted border-muted/20',
} as const;

export function AdminRedemptionsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'fulfilled' | 'cancelled' | 'all'>(
    'pending',
  );
  const [acting, setActing] = useState<{
    redemption: Redemption;
    decision: 'fulfilled' | 'cancelled';
  } | null>(null);
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery<{ items: Redemption[] }>({
    queryKey: ['admin', 'redemptions'],
    queryFn: async () => (await api.get('/admin/redemptions')).data,
    refetchInterval: 30_000,
  });

  const fulfillMut = useMutation({
    mutationFn: async (payload: {
      id: string;
      status: 'fulfilled' | 'cancelled';
      notes?: string;
    }) =>
      api.post(`/admin/redemptions/${payload.id}/fulfill`, {
        status: payload.status,
        notes: payload.notes,
      }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.status === 'fulfilled'
          ? '✅ Ödül teslim edildi'
          : '↩️ Ödül iptal edildi (XP iade edildi)',
      );
      void qc.invalidateQueries({ queryKey: ['admin', 'redemptions'] });
      setActing(null);
      setNotes('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const items = (data?.items ?? []).filter((r) =>
    filter === 'all' ? true : r.status === filter,
  );
  const pendingCount = (data?.items ?? []).filter((r) => r.status === 'pending').length;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
          <Gift className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Ödül Talepleri</h1>
          <p className="text-sm text-muted">
            Çalışanların satın aldığı ödülleri burada teslim et veya iptal et.
          </p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="size-4 text-muted" />
        {(
          [
            { v: 'pending', label: `Bekleyen (${pendingCount})` },
            { v: 'fulfilled', label: 'Teslim edildi' },
            { v: 'cancelled', label: 'İptal' },
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
            ? '👍 Bekleyen talep yok.'
            : 'Bu durumda kayıt yok.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((r) => (
            <div key={r.id} className="card space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-3xl shrink-0">{r.reward_icon ?? '🎁'}</span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg leading-tight truncate">
                      {r.reward_name ?? '—'}
                    </h3>
                    <div className="text-xs text-muted flex items-center gap-1">
                      <Coins className="size-3 text-orange-500" />
                      {r.cost_xp.toLocaleString('tr-TR')} XP
                    </div>
                  </div>
                </div>
                <span
                  className={`chip text-[10px] border ${STATUS_STYLE[r.status]} shrink-0`}
                >
                  {r.status === 'pending' && <Clock className="size-3" />}
                  {r.status === 'fulfilled' && <CheckCircle2 className="size-3" />}
                  {r.status === 'cancelled' && <XCircle className="size-3" />}
                  {STATUS_TR[r.status]}
                </span>
              </div>

              <div className="text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-muted">
                  <UserIcon className="size-3.5 text-orange-500" />
                  <span className="text-ink">{r.user_name ?? '—'}</span>
                </div>
                {r.user_email && (
                  <div className="flex items-center gap-1.5 text-muted">
                    <Mail className="size-3.5 text-orange-500" />
                    <a
                      href={`mailto:${r.user_email}`}
                      className="text-ink hover:text-orange-600 truncate"
                    >
                      {r.user_email}
                    </a>
                  </div>
                )}
                {r.user_phone && (
                  <div className="flex items-center gap-1.5 text-muted">
                    <Phone className="size-3.5 text-orange-500" />
                    <a
                      href={`tel:${r.user_phone}`}
                      className="text-ink hover:text-orange-600"
                    >
                      {r.user_phone}
                    </a>
                  </div>
                )}
                <div className="text-muted">
                  Talep: {formatDateTimeTr(r.created_at)}
                </div>
                {r.fulfilled_at && (
                  <div className="text-muted">
                    İşlem: {formatDateTimeTr(r.fulfilled_at)}
                  </div>
                )}
                {r.notes && (
                  <div className="rounded-md bg-orange-50/60 px-2 py-1 mt-1">
                    💬 {r.notes}
                  </div>
                )}
              </div>

              {r.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActing({ redemption: r, decision: 'fulfilled' });
                      setNotes('');
                    }}
                    disabled={fulfillMut.isPending}
                    className="btn-primary flex-1 text-xs"
                  >
                    <CheckCircle2 className="size-3.5" /> Teslim Ettim
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActing({ redemption: r, decision: 'cancelled' });
                      setNotes('');
                    }}
                    disabled={fulfillMut.isPending}
                    className="btn-outline flex-1 text-xs border-danger/40 text-danger hover:bg-danger/5"
                  >
                    <XCircle className="size-3.5" /> İptal (XP iade)
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
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
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
                  {acting.decision === 'fulfilled' ? (
                    <CheckCircle2 className="size-3.5 text-success" />
                  ) : (
                    <XCircle className="size-3.5 text-danger" />
                  )}
                  {acting.decision === 'fulfilled' ? 'Teslim et' : 'İptal'}
                </div>
                <h3 className="font-display text-xl mt-1">
                  {acting.redemption.reward_icon} {acting.redemption.reward_name}
                </h3>
                <p className="text-xs text-muted">
                  {acting.redemption.user_name} ·{' '}
                  {acting.redemption.cost_xp.toLocaleString('tr-TR')} XP
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActing(null)}
                className="btn-ghost p-1.5 -mt-1 -mr-1"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-sm text-muted">
              {acting.decision === 'fulfilled'
                ? 'Bu ödülü kullanıcıya teslim ettiğini onaylıyor musun? Bu işlem geri alınamaz.'
                : 'İptal edersen kullanıcının harcadığı XP geri yüklenir. Onaylıyor musun?'}
            </p>

            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notlar (opsiyonel)"
              className="input resize-none text-sm"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActing(null)}
                className="btn-outline flex-1"
                disabled={fulfillMut.isPending}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() =>
                  fulfillMut.mutate({
                    id: acting.redemption.id,
                    status: acting.decision,
                    notes: notes.trim() || undefined,
                  })
                }
                disabled={fulfillMut.isPending}
                className={`flex-1 ${
                  acting.decision === 'fulfilled' ? 'btn-primary' : 'btn-primary bg-danger hover:bg-danger/90 border-danger'
                }`}
              >
                {fulfillMut.isPending && <Loader2 className="size-4 animate-spin" />}
                {acting.decision === 'fulfilled' ? 'Teslim Ettim' : 'İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
