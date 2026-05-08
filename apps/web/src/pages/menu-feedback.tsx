import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChefHat,
  Star,
  Send,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

interface Menu {
  id: string;
  date: string;
  main_dish: string;
  description?: string | null;
  is_vegetarian: boolean;
  is_vegan: boolean;
  allergens: string[];
}

/**
 * Mutfak QR'ından gelen çalışan için tek-akış sayfası:
 *  1) Bugünün menülerini listele (genelde 1 tane)
 *  2) Her birine yıldız + yorum gir + gönder
 *
 * Auth gerekli (PrivateRoute ile sarmalı). Çalışan giriş yapmamışsa zaten
 * sign-in'e yönlenir — QR'ı okutup giriş yapacak.
 */
export function MenuFeedbackPage() {
  const { data, isLoading } = useQuery<{ items: Menu[]; date: string }>({
    queryKey: ['menus', 'today'],
    queryFn: async () => (await api.get('/menus/today')).data,
  });

  return (
    <div className="container mx-auto max-w-xl px-4 py-6 space-y-4">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-orange-600">
        <ArrowLeft className="size-4" /> Geri
      </Link>

      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-white mx-auto">
          <ChefHat className="size-7" />
        </div>
        <h1 className="font-display text-2xl">Bugünkü Menüye Yorum</h1>
        <p className="text-sm text-muted">
          Yemekhanedeki QR'ı okuttuğun için teşekkürler. Yıldız ver, yorumunu yaz.
        </p>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center py-10 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="card text-center py-10">
          <ChefHat className="size-10 mx-auto opacity-40 mb-2" />
          <p className="text-sm text-muted">Bugün için henüz menü yayınlanmamış.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data!.items.map((m) => (
            <FeedbackCard key={m.id} menu={m} />
          ))}
        </div>
      )}

      <div className="text-center text-xs text-muted">
        Yorumun kendi adına kaydedilir; ekip yöneticilerin görür.
      </div>
    </div>
  );
}

function FeedbackCard({ menu }: { menu: Menu }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submitMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (rating !== null) payload.rating = rating;
      if (comment.trim()) payload.comment = comment.trim();
      const r = await api.post(`/menus/${menu.id}/rate`, payload);
      return r.data;
    },
    onSuccess: () => {
      toast.success('🍽️ Yorumun kaydedildi · teşekkürler');
      setSubmitted(true);
      void qc.invalidateQueries({ queryKey: ['menus'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (submitted) {
    return (
      <div className="card text-center py-8 space-y-2 border-success/40 bg-success/5">
        <CheckCircle2 className="size-10 text-success mx-auto" />
        <h3 className="font-display text-lg">Teşekkürler!</h3>
        <p className="text-sm text-muted">
          Görüşün <strong className="text-ink">{menu.main_dish}</strong> için kaydedildi.
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setRating(null);
            setComment('');
          }}
          className="text-xs text-orange-600 underline-offset-4 hover:underline"
        >
          Yeniden yorum yap
        </button>
      </div>
    );
  }

  const canSubmit = (rating !== null || comment.trim().length > 0) && !submitMut.isPending;

  return (
    <div className="card space-y-4">
      <div>
        <div className="text-xs text-muted">
          {new Intl.DateTimeFormat('tr-TR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(new Date(menu.date))}
        </div>
        <h2 className="font-display text-2xl mt-0.5">{menu.main_dish}</h2>
        {menu.description && (
          <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{menu.description}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {menu.is_vegetarian && (
            <span className="chip bg-success/10 text-success text-xs">🌱 Vejetaryen</span>
          )}
          {menu.is_vegan && (
            <span className="chip bg-success/10 text-success text-xs">🌿 Vegan</span>
          )}
          {menu.allergens.map((a) => (
            <span key={a} className="chip bg-warning/10 text-warning text-xs">
              ⚠ {a}
            </span>
          ))}
        </div>
      </div>

      <hr className="border-orange-100" />

      <div>
        <label className="text-sm font-medium text-ink">Puanın</label>
        <div className="mt-2 flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = rating !== null && n <= rating;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                disabled={submitMut.isPending}
                className={`size-12 rounded-lg border-2 transition flex items-center justify-center ${
                  active
                    ? 'border-warning/60 bg-warning/10 scale-105'
                    : 'border-orange-100 bg-white hover:border-orange-300'
                }`}
                aria-label={`${n} yıldız`}
              >
                <Star
                  className={`size-6 ${active ? 'fill-warning text-warning' : 'text-muted'}`}
                />
              </button>
            );
          })}
          {rating !== null && (
            <button
              type="button"
              onClick={() => setRating(null)}
              className="ml-1 text-xs text-muted hover:text-orange-600 underline-offset-4 hover:underline"
            >
              temizle
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-ink flex items-center gap-1.5">
          <MessageSquare className="size-4 text-orange-500" />
          Yorumun (opsiyonel)
        </label>
        <textarea
          rows={3}
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={submitMut.isPending}
          className="input mt-1.5 resize-none"
          placeholder="Tavuk biraz kuruydu / pilav harikaydı / çorba güzeldi..."
        />
        <div className="mt-1 text-right text-[10px] text-muted">{comment.length}/500</div>
      </div>

      <button
        type="button"
        onClick={() => submitMut.mutate()}
        disabled={!canSubmit}
        className="btn-primary w-full"
      >
        {submitMut.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        Gönder
      </button>
    </div>
  );
}
