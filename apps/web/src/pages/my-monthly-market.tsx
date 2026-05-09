import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ShoppingBag,
  Loader2,
  Crown,
  Medal,
  Award,
  Clock,
  Coins,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface Credit {
  id: string;
  period: string;
  rank: number;
  credit_amount: number;
  spent_amount: number;
  expires_at: string;
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
}

interface MarketResp {
  credits: Credit[];
  total_remaining: number;
  has_access: boolean;
  items: Reward[];
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (d.getTime() - now.getTime()) / 3600000;
  if (diffH < 0) return 'Süresi doldu';
  if (diffH < 24) return `${Math.round(diffH)} saat sonra`;
  return `${Math.round(diffH / 24)} gün sonra`;
}

export function MyMonthlyMarketPage() {
  const qc = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);

  const { data, isLoading } = useQuery<MarketResp>({
    queryKey: ['me', 'monthly-market'],
    queryFn: async () => (await api.get('/me/monthly-market')).data,
  });

  const redeemMut = useMutation({
    mutationFn: async (rewardId: string) =>
      (await api.post(`/monthly-market/redeem/${rewardId}`)).data,
    onSuccess: (r: { remaining_credit: number; reward: Reward }) => {
      toast.success(`🎁 ${r.reward.name} satın alındı! Kalan kredi: ${r.remaining_credit}`);
      void qc.invalidateQueries({ queryKey: ['me', 'monthly-market'] });
      setBuying(null);
    },
    onError: (e) => {
      toast.error(getErrorMessage(e));
      setBuying(null);
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-12 flex justify-center">
        <Loader2 className="size-6 animate-spin text-orange-500" />
      </div>
    );
  }

  // Erişim yok ekranı
  if (!data?.has_access) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-purple-500 text-white">
            <ShoppingBag className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Aylık Özel Market</h1>
            <p className="text-sm text-muted">Ay sonu top 3'üne özel ödüller.</p>
          </div>
        </div>

        <div className="card text-center py-10 space-y-4">
          <div className="size-16 mx-auto rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
            <Lock className="size-7" />
          </div>
          <div>
            <h3 className="font-display text-xl">Henüz erişimin yok</h3>
            <p className="text-sm text-muted mt-1 max-w-md mx-auto">
              Aylık özel market <strong>sadece her ayın ilk 3 sıradaki personeline</strong>{' '}
              açılır. Pencere ayın 1'inden 8'ine kadardır. Bakiye kullanılmazsa yanar.
            </p>
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            <Link to="/leaderboard" className="btn-primary text-sm">
              <Crown className="size-4" />
              Sıralamayı Gör
            </Link>
            <Link to="/rewards" className="btn-outline text-sm">
              Normal Ödüller
            </Link>
          </div>
        </div>

        <div className="card bg-purple-50/40 border-purple-200">
          <h3 className="font-display text-lg mb-2">📋 Nasıl çalışır?</h3>
          <ul className="text-sm text-muted space-y-1.5 list-disc list-inside">
            <li>Her ay sonu (1'inci günü 09:00) ilk 3'e otomatik kredi yatar</li>
            <li>Kredi miktarı = o ay kazandığın XP + sıra bonusu (2000/1000/500)</li>
            <li>Kredinle SADECE bu sayfadaki "monthly_top3" ödüllerini alabilirsin</li>
            <li>Pencere 7 gün açık (ayın 8'i 23:59'da kapanır)</li>
            <li>Kullanılmayan kredi yanar, sıfırlanır</li>
          </ul>
        </div>
      </div>
    );
  }

  // Erişim var
  const earliestExpiry = data.credits[0]?.expires_at;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-purple-500 text-white">
          <ShoppingBag className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Aylık Özel Market 👑</h1>
          <p className="text-sm text-muted">
            Tebrikler — bu ay top 3'tesin. Krediyi süresi dolmadan kullan!
          </p>
        </div>
      </div>

      {/* Credit cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.credits.map((c) => {
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
              className={`rounded-2xl p-4 text-white bg-gradient-to-br ${colorClass} shadow-lg`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="size-5" />
                  <span className="font-display text-sm">{c.period} ·  {c.rank}.</span>
                </div>
                <span className="text-[10px] opacity-90 inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatExpiry(c.expires_at)}
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold">{remaining}</span>
                  <span className="text-xs opacity-90">/ {c.credit_amount} kredi</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/30 overflow-hidden">
                  <div
                    className="h-full bg-white"
                    style={{ width: `${100 - pct}%` }}
                  />
                </div>
                <div className="text-[10px] opacity-90 mt-1">
                  {c.spent_amount > 0 ? `${c.spent_amount} harcandı` : 'Hiç harcanmadı'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toplam kredi summary */}
      <div className="card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">
            Toplam harcanabilir
          </div>
          <div className="font-display text-3xl flex items-center gap-2">
            <Coins className="size-6 text-purple-500" />
            {data.total_remaining}
            <span className="text-base text-muted font-sans">kredi</span>
          </div>
        </div>
        {earliestExpiry && (
          <div className="rounded-md bg-warning/10 text-warning px-3 py-1.5 text-xs flex items-center gap-1.5">
            <Clock className="size-3.5" />
            En yakın expire: {new Date(earliestExpiry).toLocaleString('tr-TR')}
          </div>
        )}
      </div>

      {/* Reward grid */}
      {data.items.length === 0 ? (
        <div className="card text-center py-10 text-muted">
          Bu markette henüz ödül tanımlanmamış. Admin'in ürün eklemesini bekle.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.items.map((r) => {
            const canAfford = data.total_remaining >= r.cost_xp;
            const isBuying = buying === r.id;
            return (
              <div
                key={r.id}
                className="card flex flex-col gap-2 hover:shadow-md transition"
                style={{ borderTop: '4px solid #a855f7' }}
              >
                <div className="flex items-start gap-3">
                  <div className="text-4xl shrink-0">{r.icon}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg leading-tight">{r.name}</h3>
                    {r.description && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-2">
                        {r.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-auto pt-2">
                  <div className="font-display text-lg flex items-center gap-1">
                    <Coins className="size-4 text-purple-500" />
                    {r.cost_xp.toLocaleString('tr-TR')}
                  </div>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `"${r.name}" satın al? ${r.cost_xp} kredi düşülecek.`,
                        )
                      ) {
                        setBuying(r.id);
                        redeemMut.mutate(r.id);
                      }
                    }}
                    disabled={!canAfford || redeemMut.isPending}
                    className="btn-primary text-xs bg-purple-500 hover:bg-purple-600 border-purple-500"
                  >
                    {isBuying ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : canAfford ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <Lock className="size-3.5" />
                    )}
                    {canAfford ? 'Satın Al' : 'Yetersiz'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-md bg-purple-50 border border-purple-200 px-3 py-2 text-xs text-purple-700">
        🛒 Satın alınan ödül teslim için <Link to="/me/redemptions" className="underline font-medium">talep listesi</Link>'ne düşer. Admin teslim ettikten sonra "fulfilled" olur.
      </div>
    </div>
  );
}
