import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChefHat, CheckCircle2, Loader2, Star } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TodayFeedback {
  today: string;
  has_feedback: boolean;
  feedback: {
    id: string;
    rating: number;
    comment: string | null;
    ate_on: string;
  } | null;
}

export function MealFeedbackPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('qr') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');

  const todayQuery = useQuery<TodayFeedback>({
    queryKey: ['me-meal-feedback-today'],
    queryFn: async () => (await api.get('/me/meal-feedback/today')).data,
  });

  const submitMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post('/meal-feedback', {
          token,
          rating,
          comment: comment.trim() || undefined,
        })
      ).data,
    onSuccess: async (data: { kitchen_name?: string; xp_awarded?: number }) => {
      toast.success(
        `✅ Geri bildirim alındı — ${data.xp_awarded ?? 30} XP kazandın!${
          data.kitchen_name ? ` (${data.kitchen_name})` : ''
        }`,
      );
      await qc.invalidateQueries({ queryKey: ['me-meal-feedback-today'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  useEffect(() => {
    if (!token) {
      toast.error('Geçersiz QR — token eksik');
    }
  }, [token]);

  if (!token) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <div className="card">
          <ChefHat className="mx-auto size-12 text-orange-300 mb-2" />
          <h1 className="font-display text-xl mb-2">QR Geçersiz</h1>
          <p className="text-sm text-muted">
            Mutfak QR'ı eksik veya bozuk. Yemekhanedeki QR'ı tekrar okutun.
          </p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => navigate('/')}
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  if (todayQuery.isLoading) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Bugün zaten feedback verilmiş
  if (todayQuery.data?.has_feedback) {
    const f = todayQuery.data.feedback;
    return (
      <div className="container mx-auto max-w-md px-4 py-12 text-center">
        <div className="card">
          <CheckCircle2 className="mx-auto size-12 text-emerald-500 mb-2" />
          <h1 className="font-display text-xl mb-2">Bugün İçin Verildi</h1>
          <p className="text-sm text-muted mb-3">
            Bugünkü yemek geri bildirimini zaten gönderdin. Yarın tekrar deneyebilirsin.
          </p>
          {f && (
            <div className="rounded-lg bg-orange-50 p-3 text-left text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-orange-600 text-lg">{'⭐'.repeat(f.rating)}</span>
                <span className="text-xs text-muted">— senin puanlaman</span>
              </div>
              {f.comment && (
                <p className="text-sm whitespace-pre-wrap text-ink/80">{f.comment}</p>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={() => navigate('/')}
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  // Feedback formu
  const canSubmit = rating >= 1 && rating <= 5 && !submitMutation.isPending;
  const currentStar = hoverRating || rating;

  return (
    <div className="container mx-auto max-w-md px-4 py-8 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex size-11 items-center justify-center rounded-xl bg-orange-500 text-white">
          <ChefHat className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl">Yemek Geri Bildirimi</h1>
          <p className="text-xs text-muted">
            Bugünkü yemeği puanla ve yorum yaz. 30 XP kazanırsın 🎁
          </p>
        </div>
      </div>

      <div className="card space-y-5">
        {/* Yıldız puanlama */}
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            Yemek nasıldı?
          </div>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="p-1 transition-transform hover:scale-110"
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(n)}
                aria-label={`${n} yıldız`}
              >
                <Star
                  className={cn(
                    'size-10',
                    n <= currentStar
                      ? 'fill-orange-500 text-orange-500'
                      : 'text-stone-300',
                  )}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <div className="text-sm font-medium text-orange-700 mt-2">
              {rating}/5 — {ratingLabel(rating)}
            </div>
          )}
        </div>

        {/* Yorum */}
        <label className="block text-sm font-medium">
          Yorum (opsiyonel)
          <textarea
            className="input mt-1 min-h-24 w-full resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Beğendiğin ya da geliştirilebilecek noktaları yaz..."
            maxLength={2000}
          />
          <div className="text-[10px] text-muted text-right mt-1">
            {comment.length}/2000
          </div>
        </label>

        <button
          type="button"
          className="btn-primary w-full py-2.5"
          disabled={!canSubmit}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Star className="size-4" />
          )}
          Geri Bildirimi Gönder
        </button>

        <p className="text-[11px] text-center text-muted">
          Sadece sen ve yöneticilerin görür. Günde 1 kez gönderebilirsin.
        </p>
      </div>
    </div>
  );
}

function ratingLabel(r: number): string {
  if (r === 5) return 'Mükemmel';
  if (r === 4) return 'Güzel';
  if (r === 3) return 'İdare eder';
  if (r === 2) return 'Az iyi';
  return 'Beğenmedim';
}
