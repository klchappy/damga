import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';

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
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const end = sevenDaysLater.toISOString().slice(0, 10);

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
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <h1 className="text-3xl">🍽️ Bu hafta menü</h1>
      {(data?.items ?? []).length === 0 ? (
        <div className="card text-center text-muted">Bu hafta henüz menü yayınlanmadı.</div>
      ) : (
        <div className="space-y-3">
          {data!.items.map((m) => (
            <div key={m.id} className="card space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted">
                    {new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(m.date))}
                  </div>
                  <h3 className="text-xl font-display">{m.main_dish}</h3>
                  {m.description && <p className="text-sm text-muted mt-1">{m.description}</p>}
                </div>
                {m.calories && (
                  <span className="chip bg-orange-100 text-orange-700">{m.calories} kcal</span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {m.is_vegetarian && <span className="chip bg-success/10 text-success">🌱 Vejetaryen</span>}
                {m.is_vegan && <span className="chip bg-success/10 text-success">🌿 Vegan</span>}
                {m.allergens.map((a) => (
                  <span key={a} className="chip bg-warning/10 text-warning">⚠ {a}</span>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-orange-100">
                <span className="text-sm text-muted">
                  {m.rsvp_count} kişi yiyecek {m.avg_rating && `· ⭐ ${m.avg_rating.toFixed(1)}`}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => rsvpMut.mutate({ id: m.id, will: true })}
                    className="btn-outline text-xs py-1 px-2"
                  >
                    ✋ Yiyeceğim
                  </button>
                  <select
                    onChange={(e) =>
                      e.target.value && rateMut.mutate({ id: m.id, rating: Number(e.target.value) })
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
