import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  AlertTriangle,
  Loader2,
  User as UserIcon,
  LogIn,
  LogOut,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatDateTimeTr } from '@/lib/utils';

interface PendingReview {
  id: string;
  type: 'check_in' | 'check_out' | string;
  server_time: string;
  client_time: string;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_department: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_m: number | null;
  distance_from_office_m: number | null;
  verification_score: number;
  verification_methods: string[];
  review_reasons: string[];
  selfie_url: string | null;
  flags: string[];
}

const REASON_TR: Record<string, string> = {
  no_gps: 'Konum (GPS) yok',
  out_of_geofence: 'Ofis dışı',
  low_gps_accuracy: 'GPS doğruluğu düşük',
  unknown_device: 'Tanınmayan cihaz',
  wrong_wifi: 'Şirket Wi-Fi dışı',
  low_trust: 'Doğrulama yetersiz',
  out_of_geofence_flag: 'Geofence dışı',
  unknown_nfc_tag: 'Tanınmayan NFC',
};

/**
 * Admin/Manager için onay bekleyen damgaları listeleyen sayfa.
 *
 * Akış:
 *  - Liste: anomali sebepleri + selfie thumbnail + kullanıcı bilgisi + saat + lokasyon
 *  - Tıklanınca selfie büyütülür + Onayla / Reddet butonları
 *  - Onay → event approved, hash chain bütünlüğü korunur
 *  - Red → event rejected (silinmez, "geçersiz" işaretlenir)
 */
export function AdminPendingReviewsPage() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<PendingReview | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery<{ items: PendingReview[] }>({
    queryKey: ['admin', 'pending-reviews'],
    queryFn: async () => (await api.get('/admin/pending-reviews')).data,
    refetchInterval: 60_000, // dakikada bir auto refresh
  });

  const reviewMut = useMutation({
    mutationFn: async (payload: { id: string; decision: 'approve' | 'reject'; notes?: string }) =>
      api.post(`/admin/events/${payload.id}/review`, {
        decision: payload.decision,
        notes: payload.notes,
      }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.decision === 'approve'
          ? '✅ Damga onaylandı'
          : '❌ Damga reddedildi',
      );
      void qc.invalidateQueries({ queryKey: ['admin', 'pending-reviews'] });
      setViewing(null);
      setDecision(null);
      setNotes('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const items = data?.items ?? [];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <ShieldCheck className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Onay Bekleyen Damgalar</h1>
          <p className="text-sm text-muted">
            Anomali tespit edilen damgalar — selfie'yi incele, onayla veya reddet.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center py-12 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle2 className="size-10 mx-auto text-success/60" />
          <p className="mt-3 text-sm text-muted">Şu an onay bekleyen damga yok. 👍</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((it) => (
            <div key={it.id} className="card space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg flex items-center gap-1.5">
                    {it.type === 'check_in' ? (
                      <LogIn className="size-4 text-success" />
                    ) : (
                      <LogOut className="size-4 text-warning" />
                    )}
                    {it.type === 'check_in' ? 'Giriş' : 'Çıkış'}
                  </h3>
                  <div className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                    <UserIcon className="size-3" />
                    <span className="text-ink">{it.user_name ?? '—'}</span>
                    {it.user_department && <span>· {it.user_department}</span>}
                  </div>
                </div>
                <span className="chip bg-warning/10 text-warning border border-warning/30 text-[10px]">
                  Bekliyor
                </span>
              </div>

              {it.selfie_url && (
                <button
                  type="button"
                  onClick={() => setViewing(it)}
                  className="block w-full overflow-hidden rounded-md border border-orange-100 hover:border-orange-300 transition"
                >
                  <img
                    src={it.selfie_url}
                    alt="Selfie"
                    className="w-full h-44 object-cover"
                  />
                </button>
              )}

              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-1.5 text-muted">
                  <Clock className="size-3.5 shrink-0 mt-0.5" />
                  <span>{formatDateTimeTr(it.server_time)}</span>
                </div>
                {it.location_name && (
                  <div className="flex items-start gap-1.5 text-muted">
                    <MapPin className="size-3.5 shrink-0 mt-0.5" />
                    <span>
                      {it.location_name}
                      {it.distance_from_office_m != null && (
                        <strong className="text-warning ml-1">
                          ({it.distance_from_office_m}m uzakta)
                        </strong>
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {it.review_reasons.map((r) => (
                  <span
                    key={r}
                    className="chip bg-warning/10 text-warning border border-warning/20 text-[10px]"
                  >
                    <AlertTriangle className="size-2.5" />
                    {REASON_TR[r] ?? r}
                  </span>
                ))}
              </div>

              <div className="text-[11px] text-muted">
                Trust: <strong className="text-ink">{it.verification_score}/100</strong>
                {it.verification_methods.length > 0 && (
                  <> · {it.verification_methods.join(', ')}</>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setViewing(it);
                    setDecision('approve');
                  }}
                  className="btn-primary flex-1 text-xs"
                  disabled={reviewMut.isPending}
                >
                  <CheckCircle2 className="size-3.5" /> Onayla
                </button>
                <button
                  onClick={() => {
                    setViewing(it);
                    setDecision('reject');
                  }}
                  className="btn-outline flex-1 text-xs border-danger/40 text-danger hover:bg-danger/5"
                  disabled={reviewMut.isPending}
                >
                  <XCircle className="size-3.5" /> Reddet
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <ReviewDetailModal
          item={viewing}
          decision={decision}
          notes={notes}
          onNotesChange={setNotes}
          onDecisionChange={setDecision}
          onClose={() => {
            setViewing(null);
            setDecision(null);
            setNotes('');
          }}
          onSubmit={() =>
            decision &&
            reviewMut.mutate({ id: viewing.id, decision, notes: notes.trim() || undefined })
          }
          isPending={reviewMut.isPending}
        />
      )}
    </div>
  );
}

function ReviewDetailModal({
  item,
  decision,
  notes,
  onNotesChange,
  onDecisionChange,
  onClose,
  onSubmit,
  isPending,
}: {
  item: PendingReview;
  decision: 'approve' | 'reject' | null;
  notes: string;
  onNotesChange: (v: string) => void;
  onDecisionChange: (d: 'approve' | 'reject' | null) => void;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md card space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">{item.user_name ?? '—'}</h2>
            <p className="text-xs text-muted">
              {item.type === 'check_in' ? 'Giriş' : 'Çıkış'} ·{' '}
              {formatDateTimeTr(item.server_time)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        {item.selfie_url && (
          <div className="overflow-hidden rounded-xl border-2 border-orange-200 bg-cream">
            <img src={item.selfie_url} alt="Selfie" className="w-full max-h-96 object-contain" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-orange-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">Trust</div>
            <div className="font-mono">{item.verification_score}/100</div>
          </div>
          <div className="rounded-md bg-orange-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted">Mesafe</div>
            <div className="font-mono">
              {item.distance_from_office_m != null
                ? `${item.distance_from_office_m}m`
                : '—'}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-ink">Anomali sebepleri</div>
          <div className="flex flex-wrap gap-1">
            {item.review_reasons.map((r) => (
              <span
                key={r}
                className="chip bg-warning/10 text-warning border border-warning/20 text-[10px]"
              >
                {REASON_TR[r] ?? r}
              </span>
            ))}
          </div>
        </div>

        {item.user_email && (
          <div className="text-xs text-muted">
            E-posta: <span className="font-mono text-ink">{item.user_email}</span>
            {item.user_phone && (
              <>
                {' · '}Tel:{' '}
                <a
                  href={`tel:${item.user_phone}`}
                  className="font-mono text-orange-600 hover:underline"
                >
                  {item.user_phone}
                </a>
              </>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">Karar gerekçesi (opsiyonel)</label>
          <textarea
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Örn: Şirketin etkinlik nedeniyle dış mekan damgası uygundur."
            className="input resize-none text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onDecisionChange('reject')}
            disabled={isPending}
            className={`btn-outline border-danger/40 text-danger hover:bg-danger/5 text-sm ${
              decision === 'reject' ? 'ring-2 ring-danger/40' : ''
            }`}
          >
            <XCircle className="size-4" /> Reddet
          </button>
          <button
            type="button"
            onClick={() => onDecisionChange('approve')}
            disabled={isPending}
            className={`btn-primary text-sm ${
              decision === 'approve' ? 'ring-2 ring-orange-400' : ''
            }`}
          >
            <CheckCircle2 className="size-4" /> Onayla
          </button>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!decision || isPending}
          className="btn-primary w-full"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          Kararı uygula
        </button>
      </div>
    </div>
  );
}
