import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Plus,
  X,
  Loader2,
  ChefHat,
  QrCode,
  Star,
  MessageSquare,
} from 'lucide-react';
import { createMenuSchema, type CreateMenuInput } from '@damga/shared';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

interface Menu {
  id: string;
  date: string;
  main_dish: string;
  description?: string | null;
  photo_url?: string | null;
  calories?: number | null;
  allergens: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  rsvp_count: number;
  avg_rating: number | null;
}

export function MenuPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const canCreate = !!me && ['admin', 'owner'].includes(me.role);
  const isManager = !!me && ['manager', 'admin', 'owner'].includes(me.role);

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const end = sevenDaysLater.toISOString().slice(0, 10);

  const [creating, setCreating] = useState(false);
  const [showQrFor, setShowQrFor] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<Menu | null>(null);

  const { data } = useQuery<{ items: Menu[] }>({
    queryKey: ['menus', today, end],
    queryFn: async () => (await api.get(`/menus?date_from=${today}&date_to=${end}`)).data,
  });

  const rsvpMut = useMutation({
    mutationFn: async ({ id, will }: { id: string; will: boolean }) =>
      api.post(`/menus/${id}/rsvp`, { will_eat: will }),
    onSuccess: () => {
      toast.success('RSVP kaydedildi');
      qc.invalidateQueries({ queryKey: ['menus'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const rateMut = useMutation({
    mutationFn: async ({ id, rating }: { id: string; rating: number }) =>
      api.post(`/menus/${id}/rate`, { rating }),
    onSuccess: () => {
      toast.success('Yıldız verildi');
      qc.invalidateQueries({ queryKey: ['menus'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl flex items-center gap-2">
          <ChefHat className="size-7 text-orange-500" /> Bu hafta menü
        </h1>
        <div className="flex gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowQrFor(true)}
              className="btn-outline text-sm"
              title="Mutfaktaki QR kodu — yazdır ve yapıştır"
            >
              <QrCode className="size-4" />
              Mutfak QR
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary text-sm"
            >
              <Plus className="size-4" />
              Yeni Menü
            </button>
          )}
        </div>
      </div>

      {(data?.items ?? []).length === 0 ? (
        <div className="card text-center text-muted py-10">
          <ChefHat className="size-10 mx-auto opacity-40 mb-2" />
          <p>Bu hafta henüz menü yayınlanmadı.</p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-3 text-sm text-orange-600 underline-offset-4 hover:underline"
            >
              İlk menüyü ekle →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {data!.items.map((m) => (
            <div key={m.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted">
                    {new Intl.DateTimeFormat('tr-TR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    }).format(new Date(m.date))}
                  </div>
                  <h3 className="text-xl font-display">{m.main_dish}</h3>
                  {m.description && (
                    <p className="text-sm text-muted mt-1 whitespace-pre-wrap">
                      {m.description}
                    </p>
                  )}
                </div>
                {m.calories && (
                  <span className="chip bg-orange-100 text-orange-700">
                    {m.calories} kcal
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {m.is_vegetarian && (
                  <span className="chip bg-success/10 text-success">🌱 Vejetaryen</span>
                )}
                {m.is_vegan && <span className="chip bg-success/10 text-success">🌿 Vegan</span>}
                {m.allergens.map((a) => (
                  <span key={a} className="chip bg-warning/10 text-warning">
                    ⚠ {a}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-orange-100 flex-wrap gap-2">
                <span className="text-sm text-muted">
                  {m.rsvp_count} kişi yiyecek{' '}
                  {m.avg_rating && `· ⭐ ${m.avg_rating.toFixed(1)}`}
                </span>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => rsvpMut.mutate({ id: m.id, will: true })}
                    className="btn-outline text-xs py-1 px-2"
                  >
                    ✋ Yiyeceğim
                  </button>
                  <select
                    onChange={(e) =>
                      e.target.value &&
                      rateMut.mutate({ id: m.id, rating: Number(e.target.value) })
                    }
                    className="input text-xs py-1 px-2 w-auto"
                    defaultValue=""
                  >
                    <option value="">Yıldız ver</option>
                    <option value="5">⭐⭐⭐⭐⭐</option>
                    <option value="4">⭐⭐⭐⭐</option>
                    <option value="3">⭐⭐⭐</option>
                    <option value="2">⭐⭐</option>
                    <option value="1">⭐</option>
                  </select>
                  <Link
                    to="/menu/feedback"
                    className="btn-outline text-xs py-1 px-2"
                    title="Yorumla"
                  >
                    <MessageSquare className="size-3.5" />
                    Yorum
                  </Link>
                  {isManager && (
                    <button
                      onClick={() => setFeedbackFor(m)}
                      className="btn-ghost text-xs py-1 px-2 text-orange-600"
                      title="Yorumları gör (yönetici)"
                    >
                      Yorumları gör
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateMenuModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['menus'] });
            setCreating(false);
          }}
        />
      )}
      {showQrFor && <CafeteriaQrModal onClose={() => setShowQrFor(false)} />}
      {feedbackFor && (
        <FeedbackListModal menu={feedbackFor} onClose={() => setFeedbackFor(null)} />
      )}
    </div>
  );
}

function CreateMenuModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateMenuInput>({
    resolver: zodResolver(createMenuSchema),
    defaultValues: {
      date: today,
      main_dish: '',
      description: '',
      calories: undefined,
      allergens: [],
      is_vegetarian: false,
      is_vegan: false,
    },
  });

  const allergens = watch('allergens') || [];
  const ALL_ALLERGENS = ['gluten', 'laktoz', 'fıstık', 'kuruyemiş', 'kabuklu', 'yumurta', 'soya'];

  const toggleAllergen = (a: string) => {
    const next = allergens.includes(a) ? allergens.filter((x) => x !== a) : [...allergens, a];
    setValue('allergens', next, { shouldDirty: true });
  };

  const createMut = useMutation({
    mutationFn: async (input: CreateMenuInput) => {
      const r = await api.post('/menus', {
        ...input,
        // boş string'leri temizle
        description: input.description || undefined,
        photo_url: input.photo_url || undefined,
      });
      return r.data.menu;
    },
    onSuccess: () => {
      toast.success('🍽️ Menü yayınlandı');
      onCreated();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <ChefHat className="size-3.5" /> Yeni Menü
            </div>
            <h2 className="font-display text-xl mt-1">Yemek menüsü ekle</h2>
            <p className="text-xs text-muted mt-1">
              Çalışanlar bu menüyü görür, RSVP yapar ve mutfaktan QR ile yorumlar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={createMut.isPending || isSubmitting}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Tarih *</label>
              <input type="date" className="input mt-1" {...register('date')} />
              {errors.date && (
                <p className="mt-1 text-xs text-danger">{errors.date.message}</p>
              )}
            </div>
            <div>
              <label className="label">Kalori (opsiyonel)</label>
              <input
                type="number"
                min={0}
                max={5000}
                className="input mt-1"
                placeholder="650"
                {...register('calories', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div>
            <label className="label">Ana yemek *</label>
            <input
              className="input mt-1"
              placeholder="Tavuk şinitzel + pirinç pilavı"
              {...register('main_dish')}
            />
            {errors.main_dish && (
              <p className="mt-1 text-xs text-danger">{errors.main_dish.message}</p>
            )}
          </div>

          <div>
            <label className="label">Açıklama (yan yemekler, çorba)</label>
            <textarea
              rows={3}
              className="input mt-1 resize-none"
              placeholder="Mercimek çorbası, salata, makarna, sütlaç"
              {...register('description')}
            />
          </div>

          <div>
            <label className="label">Alerjenler</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ALL_ALLERGENS.map((a) => {
                const on = allergens.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAllergen(a)}
                    className={`chip border ${
                      on
                        ? 'bg-warning/15 text-warning border-warning/40'
                        : 'bg-white text-muted border-orange-100 hover:bg-orange-50'
                    }`}
                  >
                    {on && '✓ '}
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('is_vegetarian')} />🌱 Vejetaryen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('is_vegan')} />🌿 Vegan
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={createMut.isPending}
              className="btn-outline flex-1"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="btn-primary flex-1"
            >
              {createMut.isPending && <Loader2 className="size-4 animate-spin" />}
              Yayınla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CafeteriaQrModal({ onClose }: { onClose: () => void }) {
  // Mutfaktaki QR'a basıldığında çalışan /menu/feedback'e gider.
  const url = `${window.location.origin}/menu/feedback`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}&margin=2&ecc=H&color=FF6B35&bgcolor=FFF4E8`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <QrCode className="size-3.5" /> Mutfak QR
            </div>
            <h2 className="font-display text-xl mt-1">Yemek yorumu için QR kod</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-sm text-muted">
          Bu QR'ı yazdır ve yemekhanenin görünür bir yerine yapıştır. Çalışan QR'ı okuttuğunda
          bugünkü menüye yorum ve yıldız verir.
        </p>

        <div className="flex items-center justify-center bg-cream rounded-xl p-4">
          <img
            src={qrUrl}
            alt="Mutfak QR Kodu"
            className="w-72 h-72 rounded-md"
            crossOrigin="anonymous"
          />
        </div>

        <div className="rounded-md bg-orange-50 border border-orange-100 px-3 py-2 text-xs text-muted break-all">
          {url}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-outline flex-1"
          >
            🖨️ Yazdır
          </button>
          <a
            href={qrUrl}
            download="damga-mutfak-qr.png"
            className="btn-primary flex-1 inline-flex items-center justify-center"
          >
            ⬇️ İndir
          </a>
        </div>

        <p className="text-[11px] text-muted text-center">
          Çalışanın damga hesabıyla giriş yapmış olması gerekir; QR sadece sayfaya yönlendirir.
        </p>
      </div>
    </div>
  );
}

interface FeedbackItem {
  user_name: string | null;
  department: string | null;
  rating: number | null;
  comment: string | null;
  feedback_at: string | null;
}

function FeedbackListModal({ menu, onClose }: { menu: Menu; onClose: () => void }) {
  const { data, isLoading } = useQuery<{
    menu: Menu;
    items: FeedbackItem[];
    stats: { avg_rating: number | null; rating_count: number; comment_count: number };
  }>({
    queryKey: ['menu', menu.id, 'feedback'],
    queryFn: async () => (await api.get(`/menus/${menu.id}/feedback`)).data,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-orange-600 text-xs font-medium uppercase tracking-wider">
              <MessageSquare className="size-3.5" /> Yorumlar
            </div>
            <h2 className="font-display text-xl mt-1">{menu.main_dish}</h2>
            <p className="text-xs text-muted mt-1">
              {new Intl.DateTimeFormat('tr-TR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date(menu.date))}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-orange-500" />
          </div>
        ) : (
          <>
            {data?.stats && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="card p-2">
                  <div className="text-2xl font-display">
                    {data.stats.avg_rating ? data.stats.avg_rating.toFixed(1) : '—'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">
                    ⭐ Ortalama
                  </div>
                </div>
                <div className="card p-2">
                  <div className="text-2xl font-display">{data.stats.rating_count}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">
                    Puan veren
                  </div>
                </div>
                <div className="card p-2">
                  <div className="text-2xl font-display">{data.stats.comment_count}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">Yorum</div>
                </div>
              </div>
            )}

            {(data?.items ?? []).length === 0 ? (
              <div className="text-center text-sm text-muted py-6">Henüz yorum yok.</div>
            ) : (
              <div className="space-y-2">
                {data!.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-orange-100 bg-orange-50/40 p-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">
                        {it.user_name ?? '—'}
                        {it.department && (
                          <span className="text-muted"> · {it.department}</span>
                        )}
                      </span>
                      {it.rating && (
                        <span className="inline-flex items-center gap-0.5 text-warning">
                          {Array.from({ length: it.rating }).map((_, i) => (
                            <Star key={i} className="size-3 fill-current" />
                          ))}
                        </span>
                      )}
                    </div>
                    {it.comment && (
                      <p className="mt-1.5 text-sm text-ink whitespace-pre-wrap">
                        {it.comment}
                      </p>
                    )}
                    {it.feedback_at && (
                      <div className="mt-1 text-[10px] text-muted">
                        {new Date(it.feedback_at).toLocaleString('tr-TR')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
