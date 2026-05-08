import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Trophy,
  Crown,
  Medal,
  Award,
  TrendingUp,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';

type Period = 'weekly' | 'monthly' | 'all';

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
  period_start: string | null;
  items: LeaderboardItem[];
  me_rank: number | null;
  me_xp: number | null;
}

export function LeaderboardPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = !!me && ['admin', 'owner'].includes(me.role);
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>('weekly');

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', period],
    queryFn: async () => (await api.get(`/leaderboard?period=${period}&limit=20`)).data,
    refetchInterval: 60_000,
  });

  const finalizeMut = useMutation({
    mutationFn: async () => {
      if (period === 'all') return;
      await api.post('/admin/leaderboard/finalize', { period });
    },
    onSuccess: () => {
      toast.success(`🏆 ${period === 'weekly' ? 'Haftalık' : 'Aylık'} ilk 3 ödülü verildi`);
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const items = data?.items ?? [];
  const top3 = items.slice(0, 3);
  const rest = items.slice(3);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <Trophy className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Liderlik Tablosu</h1>
            <p className="text-sm text-muted">Ekibin XP yarışı — zamanında damga, streak ve ödüller</p>
          </div>
        </div>
        {isAdmin && period !== 'all' && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `${period === 'weekly' ? 'Bu haftanın' : 'Bu ayın'} ilk 3'üne bonus XP verilecek (${
                    period === 'weekly' ? '500/300/100' : '2000/1000/500'
                  } XP). Onaylıyor musun?`,
                )
              )
                finalizeMut.mutate();
            }}
            disabled={finalizeMut.isPending}
            className="btn-primary text-sm"
          >
            <Sparkles className="size-4" />
            İlk 3'e bonus ver
          </button>
        )}
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {([
          { v: 'weekly', label: 'Bu Hafta', desc: 'Pzt–Pzr' },
          { v: 'monthly', label: 'Bu Ay', desc: 'Ay başı' },
          { v: 'all', label: 'Tüm zamanlar', desc: 'Toplam XP' },
        ] as Array<{ v: Period; label: string; desc: string }>).map((p) => (
          <button
            key={p.v}
            type="button"
            onClick={() => setPeriod(p.v)}
            className={`flex-1 rounded-lg border-2 p-3 text-left transition ${
              period === p.v
                ? 'border-orange-400 bg-orange-50/60'
                : 'border-orange-100 bg-white hover:border-orange-200'
            }`}
          >
            <div className="text-sm font-medium text-ink">{p.label}</div>
            <div className="text-[10px] text-muted">{p.desc}</div>
          </button>
        ))}
      </div>

      {/* Kendi sıram */}
      {data?.me_rank != null && (
        <div className="card flex items-center justify-between bg-orange-50/50">
          <div>
            <div className="text-xs text-muted">Senin sıran</div>
            <div className="font-display text-2xl flex items-center gap-2">
              <TrendingUp className="size-5 text-orange-500" />#{data.me_rank}
              <span className="text-sm text-muted font-normal">/ {items.length}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">
              {period === 'weekly' ? 'Bu hafta' : period === 'monthly' ? 'Bu ay' : 'Toplam'} XP
            </div>
            <div className="font-display text-2xl text-orange-600">{data.me_xp ?? 0}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-orange-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-10 text-muted">
          {period === 'weekly'
            ? 'Bu hafta henüz XP kazanan yok.'
            : period === 'monthly'
              ? 'Bu ay henüz XP kazanan yok.'
              : 'Henüz lider yok — ilk damgayı sen vur!'}
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length > 0 && (
            <div className="grid grid-cols-3 gap-2 items-end">
              {/* 2nd */}
              {top3[1] && <PodiumCard item={top3[1]} place={2} />}
              {/* 1st */}
              {top3[0] && <PodiumCard item={top3[0]} place={1} />}
              {/* 3rd */}
              {top3[2] && <PodiumCard item={top3[2]} place={3} />}
            </div>
          )}

          {/* Rest list */}
          {rest.length > 0 && (
            <div className="card divide-y divide-orange-100">
              {rest.map((it) => (
                <RestRow key={it.user_id} item={it} isMe={it.user_id === me?.id} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Bilgi kartı */}
      <div className="card bg-orange-50/40 text-xs space-y-1.5">
        <div className="flex items-center gap-1.5 font-medium text-ink">
          <Award className="size-4 text-orange-500" /> XP nasıl kazanılır?
        </div>
        <ul className="space-y-1 text-muted ml-5 list-disc">
          <li>Her giriş/çıkış damgası: <strong className="text-ink">+10 XP</strong></li>
          <li>
            Zamanında giriş (mesai başlangıcı önce/15dk içi):{' '}
            <strong className="text-ink">+5 XP</strong> bonus
          </li>
          <li>
            Tam doğrulama (NFC + GPS + WiFi · trust 100):{' '}
            <strong className="text-ink">+5 XP</strong> bonus
          </li>
          <li>
            Mood paylaşımı: <strong className="text-ink">+2 XP</strong>
          </li>
          <li>
            Streak (7/30/100 günlük seri):{' '}
            <strong className="text-ink">+50 / +200 / +1000 XP</strong>
          </li>
        </ul>
        <div className="flex items-center gap-1.5 font-medium text-ink mt-2">
          <Crown className="size-4 text-warning" /> İlk 3 bonusu (admin tarafından verilir)
        </div>
        <ul className="space-y-1 text-muted ml-5 list-disc">
          <li>Haftalık: <strong className="text-ink">500 / 300 / 100 XP</strong></li>
          <li>Aylık: <strong className="text-ink">2.000 / 1.000 / 500 XP</strong></li>
        </ul>
      </div>
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
  const heights = place === 1 ? 'pt-12 pb-6' : place === 2 ? 'pt-8 pb-4' : 'pt-6 pb-3';
  const Icon = place === 1 ? Crown : place === 2 ? Medal : Award;
  return (
    <div className={`card text-center border-2 ${colors} ${heights} px-2`}>
      <Icon className="size-6 mx-auto mb-1" />
      <div
        className={`mx-auto rounded-full bg-white shadow-sm overflow-hidden ${
          place === 1 ? 'size-16' : 'size-12'
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
      <div className="mt-1 text-sm font-medium text-ink truncate">
        {item.full_name ?? '—'}
      </div>
      {item.department && (
        <div className="text-[10px] text-muted truncate">{item.department}</div>
      )}
      <div className="mt-1 font-display text-xl">{item.period_xp}</div>
      <div className="text-[10px] text-muted">XP · L{item.level}</div>
    </div>
  );
}

function RestRow({ item, isMe }: { item: LeaderboardItem; isMe: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 py-2.5 ${isMe ? 'bg-orange-50/40 -mx-4 px-4 rounded' : ''}`}
    >
      <div className="font-mono text-xs text-muted w-6 text-right">#{item.rank}</div>
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
          {isMe && <span className="ml-1 chip bg-orange-500 text-white text-[9px]">sen</span>}
        </div>
        <div className="text-xs text-muted">
          L{item.level} · {item.department ?? '—'}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-display text-base">{item.period_xp}</div>
        <div className="text-[10px] text-muted">XP</div>
      </div>
    </div>
  );
}
