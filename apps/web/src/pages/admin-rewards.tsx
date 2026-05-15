import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Award,
  Crown,
  Edit2,
  Gift,
  Loader2,
  Medal,
  Package,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Reward {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  cost_xp: number;
  stock: number | null;
  per_user_limit: number | null;
  is_active: boolean;
  market_type: 'standard' | 'monthly_top3';
  created_at: string;
}

interface PendingRedemption {
  id: string;
  user_id: string;
  reward_id: string;
  cost_xp: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  notes: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
  reward_name?: string;
  reward_icon?: string;
}

interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  email: string;
  total_xp: number;
  period_xp: number;
  level: number;
  rank: number;
}

type TabKey = 'rewards' | 'redemptions' | 'top3';

const TABS: Array<{ key: TabKey; label: string; shortLabel: string; Icon: typeof Gift }> = [
  { key: 'rewards', label: 'Ödüller', shortLabel: '🎁', Icon: Gift },
  { key: 'redemptions', label: 'Talepler', shortLabel: '📦', Icon: Package },
  { key: 'top3', label: 'Aylık Top-3', shortLabel: '🏆', Icon: Trophy },
];

const ICONS = ['🎁', '🏆', '⭐', '🍕', '☕', '🎟️', '🅿️', '🎫', '💝', '🌟', '💎', '⏰'];

const EMPTY_DRAFT = {
  name: '',
  description: '',
  icon: '🎁',
  cost_xp: 100,
  stock: '' as string | number,
  per_user_limit: '' as string | number,
  market_type: 'standard' as 'standard' | 'monthly_top3',
};

export function AdminRewardsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('rewards');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const rewardsQuery = useQuery<{ items: Reward[] }>({
    queryKey: ['admin-rewards-all'],
    queryFn: async () => (await api.get('/rewards?market_type=all&all=1')).data,
  });

  const redemptionsQuery = useQuery<{ items: PendingRedemption[] }>({
    queryKey: ['admin-redemptions-pending'],
    queryFn: async () => (await api.get('/admin/redemptions?status=pending')).data,
    enabled: activeTab === 'redemptions',
  });

  const monthlyLb = useQuery<{ items: LeaderboardEntry[]; period: string }>({
    queryKey: ['leaderboard-month'],
    queryFn: async () => (await api.get('/leaderboard?period=monthly&limit=10')).data,
    enabled: activeTab === 'top3',
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        icon: draft.icon,
        cost_xp: Number(draft.cost_xp),
        stock: draft.stock === '' ? null : Number(draft.stock),
        per_user_limit: draft.per_user_limit === '' ? null : Number(draft.per_user_limit),
        market_type: draft.market_type,
      };
      if (editingId) {
        return (await api.patch(`/rewards/${editingId}`, payload)).data;
      }
      return (await api.post('/rewards', payload)).data;
    },
    onSuccess: async () => {
      setShowForm(false);
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      await qc.invalidateQueries({ queryKey: ['admin-rewards-all'] });
      toast.success(editingId ? 'Ödül güncellendi' : 'Ödül eklendi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      (await api.patch(`/rewards/${id}`, { is_active: active })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-rewards-all'] });
      toast.success('Durum güncellendi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const fulfillMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'fulfilled' | 'cancelled' }) =>
      (await api.post(`/admin/redemptions/${id}/fulfill`, { status })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-redemptions-pending'] });
      toast.success('Talep işlendi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const rewards = rewardsQuery.data?.items ?? [];
  const redemptions = redemptionsQuery.data?.items ?? [];
  const top10 = monthlyLb.data?.items ?? [];
  const top3 = top10.slice(0, 3);

  const standardRewards = useMemo(
    () => rewards.filter((r) => r.market_type === 'standard'),
    [rewards],
  );
  const monthlyTop3Rewards = useMemo(
    () => rewards.filter((r) => r.market_type === 'monthly_top3'),
    [rewards],
  );

  function openForm(r?: Reward) {
    if (r) {
      setEditingId(r.id);
      setDraft({
        name: r.name,
        description: r.description ?? '',
        icon: r.icon,
        cost_xp: r.cost_xp,
        stock: r.stock ?? '',
        per_user_limit: r.per_user_limit ?? '',
        market_type: r.market_type,
      });
    } else {
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
    }
    setShowForm(true);
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-orange-500 text-white">
          <Sparkles className="size-5" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-2xl">Ödül Marketi</h1>
          <p className="text-sm text-muted">
            Şirketin kendi ödülleri — XP ile satılan standart market + aylık top-3'e özel market.
            Ay sonu otomatik kredilendirme aktiftir.
          </p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 bg-orange-50 rounded-xl border border-orange-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition',
              activeTab === t.key
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-orange-700 hover:bg-orange-100',
            )}
          >
            <t.Icon className="size-4" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Ödüller tab'ı */}
      {activeTab === 'rewards' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted">
              {rewards.length} ödül · {standardRewards.length} standart · {monthlyTop3Rewards.length} top-3
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => openForm()}
            >
              <Plus className="size-4" /> Yeni Ödül
            </button>
          </div>

          {/* Inline form */}
          {showForm && (
            <div className="card border-orange-300 space-y-3">
              <h3 className="font-display text-lg">
                {editingId ? 'Ödülü Düzenle' : 'Yeni Ödül'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Ad
                  <input
                    className="input mt-1 w-full"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Kahve hediye çeki"
                    maxLength={100}
                  />
                </label>
                <label className="text-sm font-medium">
                  XP maliyeti
                  <input
                    className="input mt-1 w-full"
                    type="number"
                    min={1}
                    max={100000}
                    value={draft.cost_xp}
                    onChange={(e) => setDraft({ ...draft, cost_xp: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Açıklama (opsiyonel)
                <input
                  className="input mt-1 w-full"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Bizonkafede 1 büyük kahve"
                  maxLength={500}
                />
              </label>

              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted mb-1">
                  İkon
                </div>
                <div className="flex flex-wrap gap-1">
                  {ICONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={cn(
                        'w-9 h-9 rounded-lg text-lg flex items-center justify-center transition border',
                        draft.icon === emoji
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-stone-200 hover:bg-stone-50',
                      )}
                      onClick={() => setDraft({ ...draft, icon: emoji })}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium">
                  Stok (boş = sınırsız)
                  <input
                    className="input mt-1 w-full"
                    type="number"
                    min={0}
                    value={draft.stock}
                    onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                    placeholder="∞"
                  />
                </label>
                <label className="text-sm font-medium">
                  Kişi başı limit (boş = sınırsız)
                  <input
                    className="input mt-1 w-full"
                    type="number"
                    min={0}
                    value={draft.per_user_limit}
                    onChange={(e) => setDraft({ ...draft, per_user_limit: e.target.value })}
                    placeholder="∞"
                  />
                </label>
                <label className="text-sm font-medium">
                  Market tipi
                  <select
                    className="input mt-1 w-full"
                    value={draft.market_type}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        market_type: e.target.value as 'standard' | 'monthly_top3',
                      })
                    }
                  >
                    <option value="standard">Standart (XP ile satılır)</option>
                    <option value="monthly_top3">Aylık Top-3 (sadece kazananlar)</option>
                  </select>
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                >
                  İptal
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saveMutation.isPending || draft.name.trim().length < 2}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  {editingId ? 'Kaydet' : 'Ekle'}
                </button>
              </div>
            </div>
          )}

          {/* Ödül listesi — 2 kolon: standart + top-3 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <RewardListSection
              title="Standart Market (XP ile)"
              icon={<Gift className="size-4" />}
              rewards={standardRewards}
              onEdit={openForm}
              onToggle={(id, active) => toggleActiveMutation.mutate({ id, active })}
              isPending={toggleActiveMutation.isPending}
            />
            <RewardListSection
              title="Aylık Top-3 Marketi"
              icon={<Trophy className="size-4" />}
              rewards={monthlyTop3Rewards}
              onEdit={openForm}
              onToggle={(id, active) => toggleActiveMutation.mutate({ id, active })}
              isPending={toggleActiveMutation.isPending}
              accent
            />
          </div>
        </div>
      )}

      {/* Talepler tab'ı */}
      {activeTab === 'redemptions' && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg flex items-center gap-2">
              <Package className="size-4 text-orange-500" />
              Bekleyen Talepler ({redemptions.length})
            </h3>
            <Link to="/admin/redemptions" className="btn-secondary text-xs px-3 py-1.5">
              Tüm Geçmiş
            </Link>
          </div>

          <div className="space-y-2">
            {redemptions.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-orange-100 bg-white p-3 flex flex-wrap items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <span>{r.reward_icon ?? '🎁'}</span>
                    <span>{r.reward_name ?? 'Ödül'}</span>
                    <span className="text-xs text-orange-700">{r.cost_xp} XP</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {r.user_name || r.user_email} ·{' '}
                    {new Date(r.created_at).toLocaleString('tr-TR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    className="btn-primary px-2 py-1 text-xs"
                    disabled={fulfillMutation.isPending}
                    onClick={() => fulfillMutation.mutate({ id: r.id, status: 'fulfilled' })}
                  >
                    Teslim Et
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs text-danger"
                    disabled={fulfillMutation.isPending}
                    onClick={() => fulfillMutation.mutate({ id: r.id, status: 'cancelled' })}
                  >
                    İptal (XP iade)
                  </button>
                </div>
              </div>
            ))}
            {redemptions.length === 0 && !redemptionsQuery.isLoading && (
              <div className="rounded-lg border border-dashed border-orange-200 bg-orange-50/40 p-6 text-center text-sm text-muted">
                Bekleyen ödül talebi yok.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aylık Top-3 tab'ı */}
      {activeTab === 'top3' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-display text-lg mb-3 flex items-center gap-2">
              <Crown className="size-4 text-orange-500" />
              Bu Ayın Top-3 Adayları ({monthlyLb.data?.period ?? ''})
            </h3>

            {monthlyLb.isLoading && (
              <div className="py-6 text-center text-muted">
                <Loader2 className="mx-auto size-5 animate-spin" />
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-3 mb-4">
              {top3.map((u, i) => (
                <div
                  key={u.user_id}
                  className={cn(
                    'rounded-xl p-4 text-center border',
                    i === 0
                      ? 'bg-gradient-to-br from-amber-50 to-yellow-100 border-amber-300'
                      : i === 1
                        ? 'bg-gradient-to-br from-slate-50 to-stone-100 border-stone-300'
                        : 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200',
                  )}
                >
                  <div className="text-3xl mb-1">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </div>
                  <div className="font-semibold text-sm truncate">{u.full_name}</div>
                  <div className="text-xs text-muted truncate">{u.email}</div>
                  <div className="mt-2 font-display text-lg text-orange-700">
                    {u.period_xp.toLocaleString('tr-TR')} XP
                  </div>
                </div>
              ))}
              {top3.length === 0 && !monthlyLb.isLoading && (
                <div className="col-span-3 rounded-lg border border-dashed border-orange-200 bg-orange-50/40 p-6 text-center text-sm text-muted">
                  Bu ay için henüz veri yok.
                </div>
              )}
            </div>

            {/* 4-10 sıralama */}
            {top10.length > 3 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                  Sıralama (4-10)
                </div>
                {top10.slice(3).map((u) => (
                  <div
                    key={u.user_id}
                    className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-orange-50/50"
                  >
                    <span className="w-6 text-xs text-muted tabular-nums">#{u.rank}</span>
                    <span className="flex-1 truncate">{u.full_name}</span>
                    <span className="text-xs text-orange-700 tabular-nums">
                      {u.period_xp.toLocaleString('tr-TR')} XP
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bilgilendirme */}
          <div className="card bg-orange-50/50 border-orange-200">
            <div className="flex gap-3">
              <Award className="size-5 text-orange-600 shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <strong className="text-orange-900">Otomatik aylık dağıtım</strong>
                <p className="text-muted">
                  Ay sonu (her ayın 1'inde 09:00 Europe/Istanbul) sistem otomatik olarak top-3'ü
                  hesaplar ve sıraya göre 1.→2000 XP, 2.→1000 XP, 3.→500 XP bonus + o ay
                  kazandıkları puana eşit credit verir. Bu credit ile sadece "Aylık Top-3 Marketi"
                  kategorisindeki ödülleri 7 gün içinde satın alabilirler (ayın 8'i 23:59'da
                  yanar).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RewardListSection({
  title,
  icon,
  rewards,
  onEdit,
  onToggle,
  isPending,
  accent = false,
}: {
  title: string;
  icon: React.ReactNode;
  rewards: Reward[];
  onEdit: (r: Reward) => void;
  onToggle: (id: string, active: boolean) => void;
  isPending: boolean;
  accent?: boolean;
}) {
  return (
    <div className={cn('card space-y-2', accent && 'border-orange-200 bg-orange-50/30')}>
      <h3 className="font-display text-sm flex items-center gap-2">
        {icon}
        {title} ({rewards.length})
      </h3>

      {rewards.map((r) => (
        <div
          key={r.id}
          className={cn(
            'rounded-lg border bg-white p-2.5 flex items-start gap-2',
            r.is_active ? 'border-orange-100' : 'border-stone-200 opacity-60',
          )}
        >
          <span className="text-2xl">{r.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-sm">{r.name}</span>
              <span className="chip bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded">
                {r.cost_xp} XP
              </span>
              {r.stock !== null && (
                <span className="text-[10px] text-muted">stok: {r.stock}</span>
              )}
              {!r.is_active && (
                <span className="text-[10px] text-stone-500">pasif</span>
              )}
            </div>
            {r.description && (
              <p className="text-xs text-muted mt-0.5 line-clamp-2">{r.description}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              className="btn-ghost p-1"
              title="Düzenle"
              onClick={() => onEdit(r)}
            >
              <Edit2 className="size-3.5" />
            </button>
            <button
              type="button"
              className="btn-ghost p-1"
              title={r.is_active ? 'Pasifleştir' : 'Aktifleştir'}
              disabled={isPending}
              onClick={() => onToggle(r.id, !r.is_active)}
            >
              <Trash2 className={cn('size-3.5', r.is_active && 'text-danger')} />
            </button>
          </div>
        </div>
      ))}
      {rewards.length === 0 && (
        <p className="text-xs text-muted text-center py-3">Henüz ödül yok</p>
      )}
    </div>
  );
}
