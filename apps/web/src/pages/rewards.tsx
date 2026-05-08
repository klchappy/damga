import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Gift,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  X,
  Coins,
  CheckCircle2,
  Clock,
  Package,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';

interface Reward {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  cost_xp: number;
  stock: number | null;
  per_user_limit: number | null;
  is_active: boolean;
}

interface Redemption {
  id: string;
  reward_id: string;
  reward_name: string | null;
  reward_icon: string | null;
  cost_xp: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  created_at: string;
  notes: string | null;
}

export function RewardsPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = !!me && ['admin', 'owner'].includes(me.role);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Reward | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery<{ items: Reward[] }>({
    queryKey: ['rewards'],
    queryFn: async () => (await api.get('/rewards')).data,
  });
  const { data: myRedemptions } = useQuery<{ items: Redemption[] }>({
    queryKey: ['me', 'redemptions'],
    queryFn: async () => (await api.get('/me/redemptions')).data,
  });

  const redeemMut = useMutation({
    mutationFn: async (rewardId: string) =>
      (await api.post(`/rewards/${rewardId}/redeem`)).data,
    onSuccess: (d) => {
      toast.success(`🎉 ${d.reward.name} satın alındı! Yöneticin teslim edecek.`);
      void qc.invalidateQueries({ queryKey: ['rewards'] });
      void qc.invalidateQueries({ queryKey: ['me', 'redemptions'] });
      // user'ın total_xp'sini güncelle
      const u = useAuthStore.getState().user;
      if (u && d.remaining_xp != null) {
        useAuthStore.getState().setUser({ ...u, total_xp: d.remaining_xp });
      }
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/rewards/${id}`),
    onSuccess: () => {
      toast.success('Ödül kaldırıldı');
      void qc.invalidateQueries({ queryKey: ['rewards'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <Gift className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Ödüller</h1>
            <p className="text-sm text-muted">XP'ni harca, ödülünü al</p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-primary text-sm"
          >
            <Plus className="size-4" /> Yeni Ödül
          </button>
        )}
      </div>

      {/* Mevcut bakiye */}
      {me && (
        <div className="card flex items-center justify-between bg-orange-50/40">
          <div>
            <div className="text-xs text-muted">Bakiyen</div>
            <div className="font-display text-3xl flex items-center gap-2 text-orange-600">
              <Coins className="size-6" />
              {me.total_xp.toLocaleString('tr-TR')}
            </div>
          </div>
          <div className="text-right text-xs text-muted">
            Seviye <span className="font-display text-lg text-ink">L{me.level}</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-orange-500" />
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="card text-center py-10 text-muted">
          <Gift className="size-10 mx-auto opacity-40 mb-2" />
          <p>Henüz tanımlı ödül yok.</p>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-3 text-sm text-orange-600 underline-offset-4 hover:underline"
            >
              İlk ödülü tanımla →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data!.items.map((r) => {
            const canAfford = (me?.total_xp ?? 0) >= r.cost_xp;
            return (
              <div key={r.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-3xl shrink-0">{r.icon}</span>
                    <div className="min-w-0">
                      <h3 className="font-display text-lg leading-tight truncate">{r.name}</h3>
                      {r.description && (
                        <p className="text-xs text-muted line-clamp-2">{r.description}</p>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="btn-ghost p-1.5"
                        title="Düzenle"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`"${r.name}" ödülü pasifleştirilecek.`)) {
                            deleteMut.mutate(r.id);
                          }
                        }}
                        className="btn-ghost p-1.5 text-danger"
                        title="Pasifleştir"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-sm">
                  <Coins className="size-4 text-orange-500" />
                  <span className="font-display font-semibold text-orange-600">
                    {r.cost_xp.toLocaleString('tr-TR')} XP
                  </span>
                  {r.stock !== null && (
                    <span className="text-[10px] text-muted">· {r.stock} adet</span>
                  )}
                  {r.per_user_limit && (
                    <span className="text-[10px] text-muted">
                      · kişi başı {r.per_user_limit}x
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => redeemMut.mutate(r.id)}
                  disabled={!canAfford || redeemMut.isPending}
                  className={`w-full text-sm py-2 rounded-md font-medium transition ${
                    canAfford
                      ? 'bg-orange-500 text-white hover:bg-orange-600'
                      : 'bg-orange-100 text-orange-300 cursor-not-allowed'
                  }`}
                >
                  {redeemMut.isPending && redeemMut.variables === r.id ? (
                    <Loader2 className="size-4 animate-spin inline" />
                  ) : canAfford ? (
                    'Satın Al'
                  ) : (
                    `${(r.cost_xp - (me?.total_xp ?? 0)).toLocaleString('tr-TR')} XP daha`
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bekleyen redemption'lar */}
      {(myRedemptions?.items ?? []).length > 0 && (
        <div className="card">
          <h2 className="font-display text-lg mb-2 flex items-center gap-1.5">
            <Package className="size-4 text-orange-500" /> Aldığım Ödüller
          </h2>
          <ul className="divide-y divide-orange-100">
            {myRedemptions!.items.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{r.reward_icon ?? '🎁'}</span>
                  <div>
                    <div className="text-sm font-medium">{r.reward_name ?? '—'}</div>
                    <div className="text-[10px] text-muted">
                      {new Date(r.created_at).toLocaleString('tr-TR')} ·{' '}
                      {r.cost_xp.toLocaleString('tr-TR')} XP
                    </div>
                  </div>
                </div>
                <span
                  className={`chip text-[10px] ${
                    r.status === 'fulfilled'
                      ? 'bg-success/10 text-success'
                      : r.status === 'cancelled'
                        ? 'bg-muted/10 text-muted'
                        : 'bg-warning/10 text-warning'
                  }`}
                >
                  {r.status === 'fulfilled' && <CheckCircle2 className="size-3" />}
                  {r.status === 'pending' && <Clock className="size-3" />}
                  {r.status === 'pending'
                    ? 'Bekliyor'
                    : r.status === 'fulfilled'
                      ? 'Teslim'
                      : 'İptal'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && isAdmin && (
        <RewardFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['rewards'] });
            setCreating(false);
          }}
        />
      )}
      {editing && isAdmin && (
        <RewardFormModal
          mode="edit"
          reward={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['rewards'] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RewardFormModal({
  mode,
  reward,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  reward?: Reward;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: reward?.name ?? '',
    description: reward?.description ?? '',
    icon: reward?.icon ?? '🎁',
    cost_xp: reward?.cost_xp ?? 100,
    stock: reward?.stock ?? null,
    per_user_limit: reward?.per_user_limit ?? null,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        icon: form.icon || '🎁',
        cost_xp: Number(form.cost_xp),
        stock: form.stock ?? null,
        per_user_limit: form.per_user_limit ?? null,
      };
      if (mode === 'create') {
        await api.post('/rewards', payload);
      } else if (reward) {
        await api.patch(`/rewards/${reward.id}`, payload);
      }
    },
    onSuccess: () => {
      toast.success(mode === 'create' ? '🎁 Ödül eklendi' : 'Ödül güncellendi');
      onSaved();
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
          <h3 className="font-display text-xl">{mode === 'create' ? 'Yeni Ödül' : 'Düzenle'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            disabled={mut.isPending}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-[80px_1fr] gap-2">
          <div>
            <label className="label text-xs">İkon</label>
            <input
              className="input mt-1 text-center text-2xl"
              maxLength={4}
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            />
          </div>
          <div>
            <label className="label text-xs">Ödül adı</label>
            <input
              className="input mt-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Streak Shield, Erken Çıkış, Park yeri..."
            />
          </div>
        </div>

        <div>
          <label className="label text-xs">Açıklama</label>
          <textarea
            rows={2}
            className="input mt-1 resize-none"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div>
          <label className="label text-xs">XP fiyatı</label>
          <input
            type="number"
            min={1}
            className="input mt-1"
            value={form.cost_xp}
            onChange={(e) => setForm({ ...form, cost_xp: Number(e.target.value) })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-xs">Stok (boş = sınırsız)</label>
            <input
              type="number"
              min={0}
              className="input mt-1"
              value={form.stock ?? ''}
              onChange={(e) =>
                setForm({ ...form, stock: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
          <div>
            <label className="label text-xs">Kişi başı limit (boş = sınırsız)</label>
            <input
              type="number"
              min={1}
              className="input mt-1"
              value={form.per_user_limit ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  per_user_limit: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={mut.isPending}
            className="btn-outline flex-1"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || form.name.length < 2 || form.cost_xp < 1}
            className="btn-primary flex-1"
          >
            {mut.isPending && <Loader2 className="size-4 animate-spin" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
