import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  ChefHat,
  Loader2,
  MessageSquare,
  Plus,
  QrCode as QrCodeIcon,
  Star,
  Trash2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface KitchenQr {
  id: string;
  org_id: string;
  name: string;
  token: string;
  is_active: boolean;
  created_at: string;
  archived_at: string | null;
}

interface FeedbackItem {
  id: string;
  ate_on: string;
  rating: number;
  comment: string | null;
  created_at: string;
  kitchen_qr_id: string;
  kitchen_name: string | null;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
}

interface FeedbackSummary {
  ate_on: string;
  count: number;
  avg_rating: number;
}

type TabKey = 'qrs' | 'reports';

const TABS: Array<{ key: TabKey; label: string; shortLabel: string }> = [
  { key: 'qrs', label: 'Mutfak QR Yönetimi', shortLabel: '🍽️ QR' },
  { key: 'reports', label: 'Yemek Geri Bildirimleri', shortLabel: '⭐ Rapor' },
];

export function AdminKitchenPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('qrs');
  const [newName, setNewName] = useState('');
  const [previewQr, setPreviewQr] = useState<KitchenQr | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const qrsQuery = useQuery<{ items: KitchenQr[] }>({
    queryKey: ['kitchen-qrs'],
    queryFn: async () => (await api.get('/kitchen-qrs')).data,
  });

  const feedbackQuery = useQuery<{ items: FeedbackItem[]; summary: FeedbackSummary[] }>({
    queryKey: ['admin-meal-feedback'],
    queryFn: async () => (await api.get('/admin/meal-feedback')).data,
    enabled: activeTab === 'reports',
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/kitchen-qrs', { name: newName.trim() })).data as KitchenQr,
    onSuccess: async (created) => {
      setNewName('');
      await qc.invalidateQueries({ queryKey: ['kitchen-qrs'] });
      toast.success('Mutfak QR\'ı oluşturuldu');
      await openPreview(created);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/kitchen-qrs/${id}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['kitchen-qrs'] });
      toast.success('Mutfak QR\'ı pasifleştirildi');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const qrs = qrsQuery.data?.items ?? [];
  const feedback = feedbackQuery.data?.items ?? [];
  const summary = feedbackQuery.data?.summary ?? [];

  const overallAvg = useMemo(() => {
    if (summary.length === 0) return 0;
    const totalCount = summary.reduce((s, r) => s + r.count, 0);
    if (totalCount === 0) return 0;
    const weighted = summary.reduce((s, r) => s + r.avg_rating * r.count, 0);
    return weighted / totalCount;
  }, [summary]);

  async function openPreview(qr: KitchenQr) {
    setPreviewQr(qr);
    const url = `${window.location.origin}/meal?qr=${encodeURIComponent(qr.token)}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 480, margin: 2 });
      setPreviewDataUrl(dataUrl);
    } catch {
      setPreviewDataUrl(null);
    }
  }

  function closePreview() {
    setPreviewQr(null);
    setPreviewDataUrl(null);
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-orange-500 text-white">
          <ChefHat className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl">Mutfak & Yemekhane</h1>
          <p className="text-sm text-muted">
            QR oluştur — personel okutarak günlük yemek puanlaması yapar (1-5 yıldız + yorum + 30 XP).
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
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* QR yönetim */}
      {activeTab === 'qrs' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-44 text-sm font-medium">
              Yeni QR adı
              <input
                className="input mt-1 w-full"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ana Yemekhane"
                maxLength={100}
              />
            </label>
            <button
              type="button"
              className="btn-primary h-10 px-3"
              disabled={createMutation.isPending || newName.trim().length < 2}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              QR Oluştur
            </button>
          </div>

          {qrsQuery.isLoading && (
            <div className="py-6 text-center text-muted">
              <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
              Yükleniyor
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {qrs.map((qr) => (
              <div
                key={qr.id}
                className="rounded-lg border border-orange-100 bg-white p-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{qr.name}</div>
                    <div className="text-[10px] text-muted">
                      {new Date(qr.created_at).toLocaleDateString('tr-TR')}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium',
                      qr.is_active
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-stone-100 text-stone-600',
                    )}
                  >
                    {qr.is_active ? 'aktif' : 'arşivli'}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-secondary flex-1 py-1.5 text-xs"
                    onClick={() => openPreview(qr)}
                  >
                    <QrCodeIcon className="size-3.5" />
                    Göster / Yazdır
                  </button>
                  {qr.is_active && (
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1.5 text-xs text-danger"
                      title="Pasifleştir"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`"${qr.name}" pasifleştirilsin mi?`)) {
                          deleteMutation.mutate(qr.id);
                        }
                      }}
                    >
                      <Archive className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {qrs.length === 0 && !qrsQuery.isLoading && (
              <div className="col-span-full rounded-lg border border-dashed border-orange-200 bg-orange-50/40 p-6 text-center text-sm text-muted">
                <ChefHat className="mx-auto size-8 text-orange-300 mb-2" />
                Henüz mutfak QR'ı yok. Yukarıdan bir tane oluştur ve yemekhanenize yapıştır.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rapor */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {/* Özet kartları */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="Toplam yorum" value={feedback.length.toLocaleString('tr-TR')} />
            <StatBox
              label="Ortalama puan"
              value={overallAvg > 0 ? `${overallAvg.toFixed(2)} ⭐` : '-'}
            />
            <StatBox
              label="Bugün katılan"
              value={summary[0]?.count?.toLocaleString('tr-TR') ?? '0'}
            />
            <StatBox
              label="Son 30 günde gün"
              value={summary.length.toLocaleString('tr-TR')}
            />
          </div>

          {/* Günlük özet */}
          {summary.length > 0 && (
            <div className="card">
              <h3 className="font-display text-lg mb-2 flex items-center gap-2">
                <Star className="size-4 text-orange-500" />
                Günlük Puan Ortalaması
              </h3>
              <div className="space-y-1.5">
                {summary.slice(0, 14).map((s) => (
                  <div key={s.ate_on} className="flex items-center gap-2 text-sm">
                    <span className="w-24 text-xs text-muted">
                      {new Date(s.ate_on).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                    <div className="flex-1 h-2 bg-orange-50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-400 to-orange-600"
                        style={{ width: `${(s.avg_rating / 5) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 text-right tabular-nums text-xs">
                      {s.avg_rating.toFixed(2)} ⭐
                    </span>
                    <span className="w-12 text-right text-xs text-muted">{s.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yorumlar */}
          <div className="card">
            <h3 className="font-display text-lg mb-3 flex items-center gap-2">
              <MessageSquare className="size-4 text-orange-500" />
              Tüm Yorumlar
            </h3>
            <div className="space-y-2">
              {feedback.map((f) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-orange-100 bg-white p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {f.user_name || f.user_email || 'Bilinmeyen'}
                        </span>
                        <span className="text-xs text-orange-600">
                          {'⭐'.repeat(f.rating)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted">
                        {f.kitchen_name} · {new Date(f.ate_on).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                  </div>
                  {f.comment && (
                    <p className="mt-2 text-sm whitespace-pre-wrap rounded bg-orange-50/40 p-2">
                      {f.comment}
                    </p>
                  )}
                </div>
              ))}
              {feedback.length === 0 && !feedbackQuery.isLoading && (
                <div className="rounded-lg border border-dashed border-orange-200 bg-orange-50/40 p-6 text-center text-sm text-muted">
                  Henüz geri bildirim yok.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR önizleme modal */}
      {previewQr && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl text-center">{previewQr.name}</h3>
            {previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt={previewQr.name}
                className="w-full max-w-sm mx-auto rounded-lg"
              />
            ) : (
              <div className="aspect-square bg-stone-100 flex items-center justify-center rounded-lg">
                <Loader2 className="size-8 animate-spin text-orange-500" />
              </div>
            )}
            <p className="text-xs text-center text-muted">
              Yemekhaneye yapıştır. Personel okutunca puan + yorum girişi açılır.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => {
                  if (previewDataUrl) {
                    const a = document.createElement('a');
                    a.href = previewDataUrl;
                    a.download = `mutfak-qr-${previewQr.name.replace(/\s+/g, '-')}.png`;
                    a.click();
                  }
                }}
              >
                İndir (.png)
              </button>
              <button type="button" className="btn-primary flex-1" onClick={closePreview}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-orange-100 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="text-xl font-display text-orange-700 mt-0.5">{value}</div>
    </div>
  );
}
