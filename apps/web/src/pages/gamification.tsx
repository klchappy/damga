/**
 * Gamification — Sıralama + Ödül Mağazası + Aylık Özel Market
 *
 * 3 sekme tek sayfada. URL: ?tab=ranks|store|monthly (default: ranks).
 * Üstte kompakt "benim durumum" snapshot kartı, altta sticky tab bar.
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Trophy,
  Crown,
  Medal,
  Award,
  Sparkles,
  Loader2,
  Gift,
  Plus,
  Pencil,
  Trash2,
  X,
  Coins,
  CheckCircle2,
  Clock,
  Package,
  ShoppingBag,
  Lock,
  TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';

type Period = 'weekly' | 'monthly' | 'all';
type Tab = 'ranks' | 'store' | 'monthly';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LeaderboardItem {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  level: number;
  total_xp: number;
  period_xp: number;
  rank: number;
}

interface LeaderboardResponse {
  period: Period;
  items: LeaderboardItem[];
  me_rank: number | null;
  me_xp: number | null;
}

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
}

interface Redemption {
  id: string;
  reward_id: string;
  reward_name: string | null;
  reward_icon: string | null;
  cost_xp: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  created_at: string;
}

interface Credit {
  id: string;
  period: string;
  rank: number;
  credit_amount: number;
  spent_amount: number;
  expires_at: string;
}

interface MonthlyMarketResp {
  credits: Credit[];
  total_remaining: number;
  has_access: boolean;
  items: Reward[];
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function GamificationPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = !!me && ['admin', 'owner'].includes(me.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) ?? 'ranks';

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  // 3 farklı periyot için sıralama (snapshot için)
  const { data: lbWeek } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', 'weekly'],
    queryFn: async () => (await api.get('/leaderboard?period=weekly&limit=20')).data,
    refetchInterval: 60_000,
  });
  const { data: lbMonth } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', 'monthly'],
    queryFn: async () => (await api.get('/leaderboard?period=monthly&limit=20')).data,
    refetchInterval: 60_000,
  });
  const { data: lbAll } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', 'all'],
    queryFn: async () => (await api.get('/leaderboard?period=all&limit=20')).data,
    refetchInterval: 120_000,
  });

  // Aylık market erişimi (rozet için, tab gizleme için)
  const { data: market } = useQuery<MonthlyMarketResp>({
    queryKey: ['me', 'monthly-market'],
    queryFn: async () => (await api.get('/me/monthly-market')).data,
    staleTime: 60_000,
  });
  const hasMarketAccess = market?.has_access ?? false;
  const marketCredit = market?.total_remaining ?? 0;

  if (!me) return null;

  const xpToNext = Math.pow(me.level, 2) * 100 - me.total_xp;
  const xpProgress = Math.max(
    0,
    Math.min(
      100,
      ((me.total_xp - Math.pow(me.level - 1, 2) * 100) /
        (Math.pow(me.level, 2) * 100 - Math.pow(me.level - 1, 2) * 100)) *
        100,
    ),
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-4">
      {/* Sayfa başlığı */}
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
          <Trophy className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Performans & Ödüller</h1>
          <p className="text-sm text-muted">
            Sıralama · Ödül Mağazası · Liderlik Mağazası
          </p>
        </div>
      </div>

      {/* Snapshot */}
      <div className="card overflow-hidden relative">
        <div className="absolute -top-8 -right-8 size-32 rounded-full bg-orange-100/60 blur-2xl" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white font-display font-bold text-2xl shrink-0 overflow-hidden">
            {me.avatar_url ? (
              <img src={me.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              me.full_name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-xl truncate">{me.full_name}</div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="font-display text-base text-orange-600">L{me.level}</span>
              <span>·</span>
              <span>{me.total_xp.toLocaleString('tr-TR')} XP</span>
              {xpToNext > 0 && (
                <>
                  <span>·</span>
                  <span>{xpToNext} XP daha → L{me.level + 1}</span>
                </>
              )}
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-orange-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* 3-lü rank grid */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50/60 via-white to-cream p-2">
          <RankPill label="Bu hafta" rank={lbWeek?.me_rank ?? null} xp={lbWeek?.me_xp ?? 0} />
          <RankPill
            label="Bu ay"
            rank={lbMonth?.me_rank ?? null}
            xp={lbMonth?.me_xp ?? 0}
            divider
          />
          <RankPill
            label="Tüm zamanlar"
            rank={lbAll?.me_rank ?? null}
            xp={lbAll?.me_xp ?? 0}
            divider
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[60px] z-20 -mx-4 px-4 py-2 bg-cream/95 backdrop-blur border-b border-orange-100">
        <div className="flex gap-1.5">
          <TabButton active={tab === 'ranks'} onClick={() => setTab('ranks')} icon={<Trophy className="size-4" />}>
            Sıralama
          </TabButton>
          <TabButton
            active={tab === 'store'}
            onClick={() => setTab('store')}
            icon={<Gift className="size-4" />}
          >
            Ödül Mağazası
          </TabButton>
          <TabButton
            active={tab === 'monthly'}
            onClick={() => setTab('monthly')}
            icon={<ShoppingBag className="size-4" />}
            badge={hasMarketAccess ? marketCredit : null}
            highlighted={hasMarketAccess}
          >
            Liderlik Mağazası
          </TabButton>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'ranks' && (
        <RanksTab
          lbWeek={lbWeek}
          lbMonth={lbMonth}
          lbAll={lbAll}
          isAdmin={isAdmin}
          meId={me.id}
        />
      )}
      {tab === 'store' && <StoreTab isAdmin={isAdmin} totalXp={me.total_xp} />}
      {tab === 'monthly' && <MonthlyTab market={market} />}
    </div>
  );
}

// ─── Tab Button ─────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  children,
  badge,
  highlighted,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: number | null;
  highlighted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm font-medium transition relative ${
        active
          ? 'border-orange-500 bg-orange-500 text-white'
          : highlighted
            ? 'border-purple-200 bg-purple-50/40 text-purple-700 hover:border-purple-400'
            : 'border-orange-100 bg-white text-muted hover:border-orange-200 hover:text-ink'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
      {badge != null && badge > 0 && (
        <span
          className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-bold ${
            active ? 'bg-white text-orange-600' : 'bg-purple-500 text-white'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Rank Pill ─────────────────────────────────────────────────────────────

function RankPill({
  label,
  rank,
  xp,
  divider,
}: {
  label: string;
  rank: number | null;
  xp: number;
  divider?: boolean;
}) {
  const Icon = rank === 1 ? Crown : rank === 2 ? Medal : rank === 3 ? Award : Trophy;
  const color =
    rank === 1
      ? 'text-yellow-500'
      : rank === 2
        ? 'text-zinc-400'
        : rank === 3
          ? 'text-orange-500'
          : 'text-orange-300';
  return (
    <div className={`text-center px-2 ${divider ? 'border-l border-orange-100' : ''}`}>
      <div className="flex items-center justify-center gap-1">
        <Icon className={`size-3.5 ${color}`} />
        <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      </div>
      <div className="font-display text-base leading-tight">{rank ? `#${rank}` : '—'}</div>
      <div className="text-[10px] text-muted">{xp} XP</div>
    </div>
  );
}

// ─── Tab 1: Sıralama ────────────────────────────────────────────────────────

function RanksTab({
  lbWeek,
  lbMonth,
  lbAll,
  isAdmin,
  meId,
}: {
  lbWeek?: LeaderboardResponse;
  lbMonth?: LeaderboardResponse;
  lbAll?: LeaderboardResponse;
  isAdmin: boolean;
  meId: string;
}) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>('weekly');

  const data =
    period === 'weekly' ? lbWeek : period === 'monthly' ? lbMonth : lbAll;

  const finalizeMut = useMutation({
    mutationFn: async () => {
      if (period === 'all') return;
      await api.post('/admin/leaderboard/finalize', { period });
    },
    onSuccess: () => {
      toast.success(
        `🏆 ${period === 'weekly' ? 'Haftalık' : 'Aylık'} ilk 3 ödülü verildi`,
      );
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const items = data?.items ?? [];
  const top3 = items.slice(0, 3);
  const rest = items.slice(3);

  return (
    <div className="space-y-4">
      {/* Period chips */}
      <div className="flex gap-2 flex-wrap">
        {(
          [
            { v: 'weekly', label: 'Bu Hafta' },
            { v: 'monthly', label: 'Bu Ay' },
            { v: 'all', label: 'Tüm Zamanlar' },
          ] as Array<{ v: Period; label: string }>
        ).map((p) => (
          <button
            key={p.v}
            onClick={() => setPeriod(p.v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              period === p.v
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-muted border-orange-100 hover:bg-orange-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        {isAdmin && period !== 'all' && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  `${period === 'weekly' ? 'Bu haftanın' : 'Bu ayın'} ilk 3'üne bonus XP verilecek (${
                    period === 'weekly' ? '500/300/100' : '2000/1000/500'
                  }). Onaylıyor musun?`,
                )
              ) {
                finalizeMut.mutate();
              }
            }}
            disabled={finalizeMut.isPending}
            className="ml-auto text-xs px-3 py-1.5 rounded-full bg-orange-500 text-white hover:bg-orange-600 inline-flex items-center gap-1.5"
          >
            <Sparkles className="size-3.5" />
            İlk 3'e bonus ver
          </button>
        )}
      </div>

      {!data ? (
        <div className="card flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-orange-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-10 text-muted">
          {period === 'all' ? 'Henüz lider yok.' : 'Bu dönem henüz XP kazanan yok.'}
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length > 0 && (
            <div className="grid grid-cols-3 gap-2 items-end">
              {top3[1] && <PodiumCard item={top3[1]} place={2} />}
              {top3[0] && <PodiumCard item={top3[0]} place={1} />}
              {top3[2] && <PodiumCard item={top3[2]} place={3} />}
            </div>
          )}

          {/* Senin sıran kartı (top3 dışındaysan) */}
          {data.me_rank && data.me_rank > 3 && (
            <div className="card flex items-center justify-between bg-orange-50/50 border-orange-200">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-orange-500" />
                <div>
                  <div className="text-xs text-muted">Senin sıran</div>
                  <div className="font-display text-xl">#{data.me_rank}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted">XP</div>
                <div className="font-display text-xl text-orange-600">{data.me_xp ?? 0}</div>
              </div>
            </div>
          )}

          {/* Rest list */}
          {rest.length > 0 && (
            <div className="card divide-y divide-orange-100 p-0 overflow-hidden">
              {rest.map((it) => (
                <RestRow key={it.user_id} item={it} isMe={it.user_id === meId} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Bilgi kartı */}
      <details className="card bg-orange-50/40 text-xs space-y-1.5 cursor-pointer group">
        <summary className="flex items-center gap-1.5 font-medium text-ink list-none">
          <Award className="size-4 text-orange-500" />
          XP nasıl kazanılır?
          <span className="ml-auto text-muted text-[10px] group-open:hidden">aç ▾</span>
          <span className="ml-auto text-muted text-[10px] hidden group-open:inline">kapat ▴</span>
        </summary>
        <div className="mt-2 space-y-1.5 text-muted">
          <div>• Her giriş/çıkış: <strong className="text-ink">+10 XP</strong></div>
          <div>
            • Zamanında giriş: <strong className="text-ink">+5</strong> · 30+ dk geç:{' '}
            <strong className="text-danger">−5</strong> · 60+ dk geç:{' '}
            <strong className="text-danger">−10</strong>
          </div>
          <div>• Tam doğrulama (trust 100): <strong className="text-ink">+5</strong></div>
          <div>• Mood paylaşımı: <strong className="text-ink">+2</strong></div>
          <div>• Streak 7/30/100 gün: <strong className="text-ink">+50/+200/+1000</strong></div>
          <div>
            • Haftalık ilk 3: <strong className="text-ink">500/300/100</strong> · Aylık:{' '}
            <strong className="text-ink">2000/1000/500</strong>
          </div>
        </div>
      </details>
    </div>
  );
}

function PodiumCard({ item, place }: { item: LeaderboardItem; place: 1 | 2 | 3 }) {
  const colors =
    place === 1
      ? 'bg-gradient-to-b from-yellow-50 to-yellow-100 border-yellow-300 text-yellow-700'
      : place === 2
        ? 'bg-gradient-to-b from-slate-50 to-slate-100 border-slate-300 text-slate-700'
        : 'bg-gradient-to-b from-orange-50 to-orange-100 border-orange-300 text-orange-700';
  const heights = place === 1 ? 'pt-10 pb-5' : place === 2 ? 'pt-7 pb-4' : 'pt-5 pb-3';
  const Icon = place === 1 ? Crown : place === 2 ? Medal : Award;
  return (
    <div className={`card text-center border-2 ${colors} ${heights} px-2`}>
      <Icon className="size-5 mx-auto mb-1" />
      <div
        className={`mx-auto rounded-full bg-white shadow-sm overflow-hidden ${
          place === 1 ? 'size-14' : 'size-11'
        }`}
      >
        {item.avatar_url ? (
          <img src={item.avatar_url} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full flex items-center justify-center font-display font-bold text-orange-600 bg-orange-50">
            {item.full_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
        )}
      </div>
      <div className="mt-1 text-xs font-medium text-ink truncate">
        {item.full_name ?? '—'}
      </div>
      <div className="font-display text-lg leading-tight">{item.period_xp}</div>
      <div className="text-[10px] text-muted">XP · L{item.level}</div>
    </div>
  );
}

function RestRow({ item, isMe }: { item: LeaderboardItem; isMe: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 ${isMe ? 'bg-orange-50/60' : ''}`}
    >
      <div className="font-mono text-xs text-muted w-7 text-right">#{item.rank}</div>
      <div className="size-9 rounded-full bg-orange-100 flex items-center justify-center font-display font-semibold text-orange-700 overflow-hidden shrink-0">
        {item.avatar_url ? (
          <img src={item.avatar_url} alt="" className="size-full object-cover" />
        ) : (
          item.full_name?.charAt(0).toUpperCase() ?? '?'
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">
          {item.full_name ?? '—'}
          {isMe && (
            <span className="ml-1 inline-block bg-orange-500 text-white text-[9px] px-1.5 rounded">
              sen
            </span>
          )}
        </div>
        <div className="text-xs text-muted">
          L{item.level} {item.department && `· ${item.department}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-sm">{item.period_xp}</div>
        <div className="text-[10px] text-muted">XP</div>
      </div>
    </div>
  );
}

// ─── Tab 2: Mağaza ──────────────────────────────────────────────────────────

function StoreTab({ isAdmin, totalXp }: { isAdmin: boolean; totalXp: number }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Reward | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery<{ items: Reward[] }>({
    queryKey: ['rewards', 'standard'],
    queryFn: async () => (await api.get('/rewards?market_type=standard')).data,
  });
  const { data: myRedemptions } = useQuery<{ items: Redemption[] }>({
    queryKey: ['me', 'redemptions'],
    queryFn: async () => (await api.get('/me/redemptions')).data,
  });

  const redeemMut = useMutation({
    mutationFn: async (rewardId: string) =>
      (await api.post(`/rewards/${rewardId}/redeem`)).data,
    onSuccess: (d) => {
      toast.success(`🎉 ${d.reward.name} satın alındı`);
      void qc.invalidateQueries({ queryKey: ['rewards'] });
      void qc.invalidateQueries({ queryKey: ['me', 'redemptions'] });
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-sm">
          <Coins className="size-4 text-orange-500" />
          <span className="text-muted">Bakiyen:</span>
          <span className="font-display text-base text-orange-600">
            {totalXp.toLocaleString('tr-TR')} XP
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            className="btn-primary text-xs"
          >
            <Plus className="size-3.5" />
            Yeni Ödül
          </button>
        )}
      </div>

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
              onClick={() => setCreating(true)}
              className="mt-3 text-sm text-orange-600 underline-offset-4 hover:underline"
            >
              İlk ödülü tanımla →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data!.items.map((r) => (
            <RewardCard
              key={r.id}
              reward={r}
              canAfford={totalXp >= r.cost_xp}
              missingXp={Math.max(0, r.cost_xp - totalXp)}
              isAdmin={isAdmin}
              loading={redeemMut.isPending && redeemMut.variables === r.id}
              onBuy={() => redeemMut.mutate(r.id)}
              onEdit={() => setEditing(r)}
              onDelete={() => {
                if (window.confirm(`"${r.name}" pasifleştirilsin mi?`)) {
                  deleteMut.mutate(r.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Aldığım ödüller */}
      {(myRedemptions?.items ?? []).length > 0 && (
        <details className="card group">
          <summary className="flex items-center gap-1.5 font-medium cursor-pointer list-none">
            <Package className="size-4 text-orange-500" />
            Aldığım Ödüller ({myRedemptions!.items.length})
            <span className="ml-auto text-muted text-[10px] group-open:hidden">aç ▾</span>
            <span className="ml-auto text-muted text-[10px] hidden group-open:inline">kapat ▴</span>
          </summary>
          <ul className="mt-3 divide-y divide-orange-100">
            {myRedemptions!.items.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0">{r.reward_icon ?? '🎁'}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.reward_name ?? '—'}
                    </div>
                    <div className="text-[10px] text-muted">
                      {new Date(r.created_at).toLocaleString('tr-TR')} ·{' '}
                      {r.cost_xp.toLocaleString('tr-TR')} XP
                    </div>
                  </div>
                </div>
                <span
                  className={`chip text-[10px] shrink-0 ${
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
        </details>
      )}

      {(creating || editing) && isAdmin && (
        <RewardFormModal
          reward={editing ?? undefined}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['rewards'] });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function RewardCard({
  reward: r,
  canAfford,
  missingXp,
  isAdmin,
  loading,
  onBuy,
  onEdit,
  onDelete,
  theme,
}: {
  reward: Reward;
  canAfford: boolean;
  missingXp: number;
  isAdmin: boolean;
  loading?: boolean;
  onBuy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  theme?: 'standard' | 'monthly';
}) {
  const isPurple = theme === 'monthly';
  return (
    <div
      className="card space-y-2 relative"
      style={isPurple ? { borderTop: '4px solid #a855f7' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-3xl shrink-0">{r.icon}</span>
          <div className="min-w-0">
            <h3 className="font-display text-base leading-tight truncate">{r.name}</h3>
            {r.description && (
              <p className="text-xs text-muted line-clamp-2">{r.description}</p>
            )}
          </div>
        </div>
        {isAdmin && onEdit && onDelete && (
          <div className="flex gap-0.5 shrink-0">
            <button onClick={onEdit} className="btn-ghost p-1" title="Düzenle">
              <Pencil className="size-3" />
            </button>
            <button
              onClick={onDelete}
              className="btn-ghost p-1 text-danger"
              title="Pasifleştir"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-sm">
        <Coins className={`size-4 ${isPurple ? 'text-purple-500' : 'text-orange-500'}`} />
        <span
          className={`font-display font-semibold ${
            isPurple ? 'text-purple-600' : 'text-orange-600'
          }`}
        >
          {r.cost_xp.toLocaleString('tr-TR')}
        </span>
        {r.stock !== null && (
          <span className="text-[10px] text-muted">· {r.stock} adet</span>
        )}
        {r.per_user_limit && (
          <span className="text-[10px] text-muted">· kişi başı {r.per_user_limit}x</span>
        )}
      </div>

      <button
        onClick={onBuy}
        disabled={!canAfford || loading}
        className={`w-full text-xs py-2 rounded-md font-medium transition flex items-center justify-center gap-1.5 ${
          canAfford
            ? isPurple
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'bg-orange-500 text-white hover:bg-orange-600'
            : 'bg-orange-100 text-orange-300 cursor-not-allowed'
        }`}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : canAfford ? (
          <>
            <CheckCircle2 className="size-3.5" />
            Satın Al
          </>
        ) : (
          `${missingXp.toLocaleString('tr-TR')} ${isPurple ? 'kredi' : 'XP'} daha`
        )}
      </button>
    </div>
  );
}

// ─── Tab 3: Aylık Market ────────────────────────────────────────────────────

function MonthlyTab({ market }: { market?: MonthlyMarketResp }) {
  const qc = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);

  const redeemMut = useMutation({
    mutationFn: async (rewardId: string) =>
      (await api.post(`/monthly-market/redeem/${rewardId}`)).data,
    onSuccess: (r: { remaining_credit: number; reward: Reward }) => {
      toast.success(
        `🎁 ${r.reward.name} satın alındı! Kalan kredi: ${r.remaining_credit}`,
      );
      void qc.invalidateQueries({ queryKey: ['me', 'monthly-market'] });
      setBuying(null);
    },
    onError: (e) => {
      toast.error(getErrorMessage(e));
      setBuying(null);
    },
  });

  if (!market) {
    return (
      <div className="card flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!market.has_access) {
    return (
      <div className="space-y-4">
        <div className="card text-center py-10 space-y-3 border-purple-200">
          <div className="size-14 mx-auto rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
            <Lock className="size-6" />
          </div>
          <div>
            <h3 className="font-display text-lg">Bu dönem yetkin yok</h3>
            <p className="text-sm text-muted mt-1 max-w-md mx-auto">
              Liderlik Mağazası <strong>sadece her ayın ilk 3 sıradaki personeline</strong>{' '}
              açılır. Pencere ayın 1'inden 8'ine kadar — 7 gün geçerli.
            </p>
          </div>
        </div>
        <div className="card bg-purple-50/40 border-purple-200 text-xs space-y-1.5">
          <div className="font-medium text-purple-700 mb-1">Program kuralları</div>
          <ul className="space-y-1 text-purple-700 list-disc list-inside">
            <li>Ay sonunda ilk 3 personele otomatik kredi yatırılır</li>
            <li>Kredi tutarı = o ay kazanılan XP + sıralama bonusu (2.000 / 1.000 / 500)</li>
            <li>Krediler yalnızca bu kataloğa özel ödüllerde geçerlidir</li>
            <li>Kullanılmayan kredi pencere kapandığında geçersiz olur</li>
          </ul>
        </div>
      </div>
    );
  }

  // Erişim var
  return (
    <div className="space-y-4">
      {/* Credit kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {market.credits.map((c) => {
          const Icon = c.rank === 1 ? Crown : c.rank === 2 ? Medal : Award;
          const colorClass =
            c.rank === 1
              ? 'from-yellow-400 to-yellow-500'
              : c.rank === 2
                ? 'from-zinc-400 to-zinc-500'
                : 'from-orange-400 to-orange-500';
          const remaining = c.credit_amount - c.spent_amount;
          const pct = (c.spent_amount / c.credit_amount) * 100;
          return (
            <div
              key={c.id}
              className={`rounded-xl p-3 text-white bg-gradient-to-br ${colorClass}`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1">
                  <Icon className="size-3.5" /> #{c.rank} · {c.period}
                </span>
                <span className="opacity-90 inline-flex items-center gap-0.5">
                  <Clock className="size-3" />
                  {formatExpiry(c.expires_at)}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-2xl font-bold">{remaining}</span>
                <span className="text-[10px] opacity-90">/ {c.credit_amount}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-white/30 overflow-hidden">
                <div
                  className="h-full bg-white"
                  style={{ width: `${100 - pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Toplam */}
      <div className="card flex items-center justify-between gap-3 bg-purple-50/40 border-purple-200">
        <div className="flex items-center gap-2">
          <Coins className="size-5 text-purple-500" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Harcanabilir
            </div>
            <div className="font-display text-2xl text-purple-700">
              {market.total_remaining}
              <span className="text-xs text-muted ml-1 font-sans">kredi</span>
            </div>
          </div>
        </div>
        <Link
          to="/me/redemptions"
          className="text-xs text-purple-600 hover:underline"
        >
          Talep listesi →
        </Link>
      </div>

      {/* Reward grid */}
      {market.items.length === 0 ? (
        <div className="card text-center py-10 text-muted">
          Bu markette henüz ödül tanımlanmamış. Admin'in eklemesini bekle.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {market.items.map((r) => (
            <RewardCard
              key={r.id}
              reward={r}
              canAfford={market.total_remaining >= r.cost_xp}
              missingXp={Math.max(0, r.cost_xp - market.total_remaining)}
              isAdmin={false}
              loading={buying === r.id}
              theme="monthly"
              onBuy={() => {
                if (
                  window.confirm(
                    `"${r.name}" satın al? ${r.cost_xp} kredi düşülecek.`,
                  )
                ) {
                  setBuying(r.id);
                  redeemMut.mutate(r.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (d.getTime() - now.getTime()) / 3600000;
  if (diffH < 0) return 'Bitti';
  if (diffH < 24) return `${Math.round(diffH)}sa`;
  return `${Math.round(diffH / 24)} gün`;
}

// ─── Reward Form Modal ──────────────────────────────────────────────────────

function RewardFormModal({
  reward,
  onClose,
  onSaved,
}: {
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
    market_type: reward?.market_type ?? ('standard' as 'standard' | 'monthly_top3'),
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
        market_type: form.market_type,
      };
      if (reward) await api.patch(`/rewards/${reward.id}`, payload);
      else await api.post('/rewards', payload);
    },
    onSuccess: () => {
      toast.success(reward ? 'Ödül güncellendi' : '🎁 Ödül eklendi');
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
          <h3 className="font-display text-xl">
            {reward ? 'Ödülü düzenle' : 'Yeni ödül'}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="size-4" />
          </button>
        </div>

        <div>
          <label className="label text-xs">Market</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, market_type: 'standard' })}
              className={`text-xs px-3 py-2 rounded-md border-2 transition ${
                form.market_type === 'standard'
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-orange-100 text-muted hover:border-orange-200'
              }`}
            >
              <Gift className="size-3.5 mx-auto mb-0.5" />
              <div className="font-medium">Standart</div>
              <div className="text-[10px] opacity-80">Herkes XP'siyle alır</div>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, market_type: 'monthly_top3' })}
              className={`text-xs px-3 py-2 rounded-md border-2 transition ${
                form.market_type === 'monthly_top3'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-orange-100 text-muted hover:border-purple-200'
              }`}
            >
              <ShoppingBag className="size-3.5 mx-auto mb-0.5" />
              <div className="font-medium">Liderlik</div>
              <div className="text-[10px] opacity-80">Sadece ay top 3</div>
            </button>
          </div>
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
          <label className="label text-xs">
            {form.market_type === 'monthly_top3' ? 'Kredi fiyatı' : 'XP fiyatı'}
          </label>
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
                setForm({
                  ...form,
                  stock: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
          <div>
            <label className="label text-xs">Kişi başı limit</label>
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
          <button onClick={onClose} className="btn-outline flex-1" disabled={mut.isPending}>
            İptal
          </button>
          <button
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

