import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  MapPin,
  Smartphone,
  QrCode,
  Loader2,
  AlertCircle,
  LogIn,
  LogOut,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { generateDeviceId } from '@/lib/utils';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useNfc } from '@/hooks/use-nfc';
import { QrScanner } from './qr-scanner';
import { MoodPrompt } from './mood-prompt';
import { SelfieCaptureModal } from './selfie-capture';
import { sendBrowserNotification } from '@/lib/notifications';

interface Props {
  locationId?: string;
  onSuccess?: (result: { event_id: string; verification_score: number; flags: string[] }) => void;
}

type Method = 'nfc' | 'qr' | 'gps';

interface LocationOption {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
}

interface PrecheckState {
  location: LocationOption | null;
  distance_m: number | null;
  accuracy_m: number;
  inside: boolean | null;
}

/**
 * Damga kartı — kullanıcı giriş/çıkış SEÇMEZ.
 * Backend bugünkü son event'e bakıp otomatik karar verir (`POST /v1/stamp`).
 *
 * UI'da sadece "sıradaki aksiyon" gösterilir (Giriş veya Çıkış).
 */
export function CheckInCard({ locationId, onSuccess }: Props) {
  const [method, setMethod] = useState<Method | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [lastResult, setLastResult] =
    useState<{
      score: number;
      flags: string[];
      methods: string[];
      type: string;
      review_status?: 'approved' | 'pending_review' | 'rejected';
      distance_m?: number | null;
      review_reasons?: string[];
    } | null>(null);
  const [showMoodPrompt, setShowMoodPrompt] = useState(false);
  const [selfiePrompt, setSelfiePrompt] = useState<{
    reasons: string[];
    reason_messages?: string[];
    distance_m?: number | null;
    geofence_radius_m?: number | null;
    auto?: boolean;
    pendingPayload: Record<string, unknown>;
  } | null>(null);
  const [precheck, setPrecheck] = useState<PrecheckState | null>(null);
  const [precheckLoading, setPrecheckLoading] = useState(false);

  const qc = useQueryClient();
  const geo = useGeolocation();
  const nfc = useNfc();

  const { data: locationsData } = useQuery<{ items: LocationOption[] }>({
    queryKey: ['locations', 'stamp-precheck'],
    queryFn: async () => (await api.get('/locations')).data,
    staleTime: 5 * 60_000,
  });

  // Bugünün mood'u var mı? Damga sonrası tekrar sormamak için bilelim.
  const { data: todayMoodData } = useQuery<{ mood: { id: string } | null }>({
    queryKey: ['mood', 'today'],
    queryFn: async () => (await api.get('/moods/today')).data,
    staleTime: 5 * 60 * 1000,
  });

  // Bugünkü son event'i çek → "sıradaki aksiyon" hint'i için
  const { data: todayEvents, refetch: refetchToday } = useQuery({
    queryKey: ['events', 'me', 'today'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const r = await api.get<{ items: Array<{ type: string; server_time: string }> }>(
        `/events?date_from=${start.toISOString()}&date_to=${end.toISOString()}&limit=20`,
      );
      return r.data;
    },
  });

  const todaySorted = (todayEvents?.items ?? []).slice().sort(
    (a, b) => new Date(b.server_time).getTime() - new Date(a.server_time).getTime(),
  );
  const lastTodayType = todaySorted[0]?.type;
  const nextAction: 'check_in' | 'check_out' =
    !lastTodayType || lastTodayType === 'check_out' ? 'check_in' : 'check_out';

  const stampMutation = useMutation({
    mutationFn: async (payload: {
      location_id?: string;
      latitude?: number;
      longitude?: number;
      gps_accuracy_m?: number;
      nfc_tag_id?: string;
      qr_code_payload?: string;
      selfie_url?: string;
    }) => {
      const fullPayload = {
        location_id: payload.location_id ?? locationId,
        client_time: new Date().toISOString(),
        device_id: generateDeviceId(),
        app_version: 'web-0.1.0',
        device_info: {
          platform: 'web',
          user_agent: navigator.userAgent,
        },
        ...payload,
      };
      const { data } = await api.post('/stamp', fullPayload);
      return { data, payload: fullPayload };
    },
    onSuccess: ({ data, payload }) => {
      // 1) Backend selfie istiyor → modal aç (auto:true ise countdown ile otomatik)
      if (data?.needs_selfie) {
        setMethod(null);
        setSelfiePrompt({
          reasons: data.reasons ?? [],
          reason_messages: data.reason_messages,
          distance_m: data.distance_m,
          geofence_radius_m: data.geofence_radius_m,
          auto: !!data.auto,
          pendingPayload: payload,
        });
        return;
      }
      // 2) Normal kayıt
      const score = data.verification_score;
      const flags: string[] = data.flags ?? [];
      const methods: string[] = data.verification_methods ?? [];
      const type = nextAction;
      setLastResult({
        score,
        flags,
        methods,
        type,
        review_status: data.review_status,
        distance_m: data.distance_from_office_m ?? null,
        review_reasons: data.review_reasons ?? [],
      });
      const emoji = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌';
      const labelTr = type === 'check_in' ? 'Giriş' : 'Çıkış';
      if (data.review_status === 'pending_review') {
        toast.success(
          `📸 ${labelTr} kaydedildi · yönetici onayı bekleniyor (selfie eklendi)`,
        );
      } else {
        toast.success(`${emoji} ${labelTr} kaydedildi · trust ${score}/100`);
      }
      if (onSuccess) onSuccess(data);
      setMethod(null);
      void refetchToday();

      // Damga sonrası: bugün mood logged mı? değilse modal aç + bildirim gönder.
      const hasTodayMood = !!todayMoodData?.mood;
      if (!hasTodayMood) {
        // Sayfa odakta değilse browser notification → tıklayınca app açılır;
        // odaktaysa zaten modal göstereceğiz.
        if (document.visibilityState === 'hidden') {
          sendBrowserNotification({
            title: `${emoji} ${labelTr} kaydedildi`,
            body: 'Bugün nasıl hissediyorsun? Tek tıkla bildir.',
            tag: 'damga-mood-prompt',
            url: '/',
            autoClose: 12_000,
          });
        }
        // Toast sonrası küçük gecikme ile modal aç (UX olarak akıcı)
        window.setTimeout(() => setShowMoodPrompt(true), 700);
      } else {
        void qc.invalidateQueries({ queryKey: ['mood', 'today'] });
      }
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      setMethod(null);
    },
  });

  const handleNfc = async () => {
    setMethod('nfc');
    try {
      const result = await nfc.read();
      const gpsPos = await geo.getCurrent().catch(() => null);
      stampMutation.mutate({
        nfc_tag_id: result.rawData,
        latitude: gpsPos?.latitude,
        longitude: gpsPos?.longitude,
        gps_accuracy_m: gpsPos?.accuracy,
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setMethod(null);
    }
  };

  const handleQrScanned = async (qrText: string) => {
    setShowQrScanner(false);
    setMethod('qr');
    try {
      const gpsPos = await geo.getCurrent().catch(() => null);
      stampMutation.mutate({
        location_id: extractLocationIdFromQrUrl(qrText) ?? undefined,
        qr_code_payload: qrText,
        latitude: gpsPos?.latitude,
        longitude: gpsPos?.longitude,
        gps_accuracy_m: gpsPos?.accuracy,
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setMethod(null);
    }
  };

  const handleGpsOnly = async () => {
    setMethod('gps');
    try {
      const pos = await geo.getCurrent();
      const nearest = findBestLocation(locationsData?.items ?? [], pos.latitude, pos.longitude, locationId);
      stampMutation.mutate({
        location_id: nearest?.id,
        latitude: pos.latitude,
        longitude: pos.longitude,
        gps_accuracy_m: pos.accuracy,
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setMethod(null);
    }
  };

  const isPending = stampMutation.isPending || method !== null;

  const handlePrecheck = async () => {
    setPrecheckLoading(true);
    try {
      const pos = await geo.getCurrent();
      const nearest = findBestLocation(locationsData?.items ?? [], pos.latitude, pos.longitude, locationId);
      const distance = nearest
        ? Math.round(haversineMeters(pos.latitude, pos.longitude, nearest.latitude, nearest.longitude))
        : null;
      setPrecheck({
        location: nearest ?? null,
        distance_m: distance,
        accuracy_m: pos.accuracy,
        inside: nearest && distance != null ? distance <= nearest.geofence_radius_m : null,
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPrecheckLoading(false);
    }
  };

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-2xl">Damga vur</h2>
          <p className="text-sm text-muted">
            Sistem bugünkü hareketine göre otomatik karar verir.
          </p>
        </div>
        {/* Sıradaki aksiyon — sadece bilgi (kullanıcı seçmez) */}
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
            nextAction === 'check_in'
              ? 'bg-success/10 text-success'
              : 'bg-warning/10 text-warning'
          }`}
        >
          {nextAction === 'check_in' ? (
            <>
              <LogIn className="size-4" /> Sıradaki: Giriş
            </>
          ) : (
            <>
              <LogOut className="size-4" /> Sıradaki: Çıkış
            </>
          )}
        </div>
      </div>

      <div
        className={`rounded-lg border p-3 text-sm ${
          precheck?.inside === true
            ? 'border-success/30 bg-success/5'
            : precheck?.inside === false
              ? 'border-warning/30 bg-warning/5'
              : 'border-orange-100 bg-cream'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">Konum ön kontrolü</div>
            <div className="text-xs text-muted">
              {precheck
                ? precheck.location
                  ? `${precheck.location.name} · ${precheck.distance_m}m uzaklık · GPS doğruluğu ${precheck.accuracy_m}m`
                  : `Lokasyon seçilemedi · GPS doğruluğu ${precheck.accuracy_m}m`
                : 'Damga basmadan önce GPS ve geofence durumunu kontrol et.'}
            </div>
          </div>
          <button
            type="button"
            onClick={handlePrecheck}
            disabled={precheckLoading || isPending}
            className="btn-outline px-3 py-1.5 text-xs"
          >
            {precheckLoading && <Loader2 className="size-3 animate-spin" />}
            Kontrol et
          </button>
        </div>
        {precheck && (
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            {precheck.inside === true && (
              <span className="chip bg-success/10 text-success border border-success/30">
                Geofence içinde
              </span>
            )}
            {precheck.inside === false && (
              <span className="chip bg-warning/10 text-warning border border-warning/30">
                Geofence dışında · selfie/onay gerekebilir
              </span>
            )}
            {precheck.accuracy_m > 200 && (
              <span className="chip bg-warning/10 text-warning border border-warning/30">
                GPS doğruluğu düşük
              </span>
            )}
            {!precheck.location && (
              <span className="chip bg-danger/10 text-danger border border-danger/30">
                Lokasyon bulunamadı
              </span>
            )}
          </div>
        )}
      </div>

      {showQrScanner ? (
        <QrScanner onResult={handleQrScanned} onClose={() => setShowQrScanner(false)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleNfc}
            disabled={isPending || !nfc.supported}
            className="card flex flex-col items-center gap-2 p-4 hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 transition"
            title={!nfc.supported ? 'Tarayıcı NFC desteklemiyor (Android Chrome gerekli)' : undefined}
          >
            {method === 'nfc' ? (
              <Loader2 className="size-7 animate-spin text-orange-500" />
            ) : (
              <Smartphone className="size-7 text-orange-500" />
            )}
            <div className="text-sm font-medium">📱 NFC</div>
            <div className="text-xs text-muted text-center">
              {nfc.supported ? "Telefonu tag'a yaklaştır" : 'Bu cihazda NFC yok'}
            </div>
          </button>

          <button
            onClick={() => setShowQrScanner(true)}
            disabled={isPending}
            className="card flex flex-col items-center gap-2 p-4 hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 transition"
          >
            <QrCode className="size-7 text-orange-500" />
            <div className="text-sm font-medium">📷 QR Kod</div>
            <div className="text-xs text-muted text-center">Kameradan tara</div>
          </button>

          <button
            onClick={handleGpsOnly}
            disabled={isPending}
            className="card flex flex-col items-center gap-2 p-4 hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 transition"
          >
            {method === 'gps' || geo.loading ? (
              <Loader2 className="size-7 animate-spin text-orange-500" />
            ) : (
              <MapPin className="size-7 text-orange-500" />
            )}
            <div className="text-sm font-medium">📍 Sadece Konum</div>
            <div className="text-xs text-muted text-center">Geofence (düşük güven)</div>
          </button>
        </div>
      )}

      {lastResult && (() => {
        const isPending = lastResult.review_status === 'pending_review';
        const isOutOfFence = (lastResult.review_reasons ?? []).includes('out_of_geofence');
        const isNfc = lastResult.methods.includes('nfc');
        return (
          <div
            className={`rounded-md border p-3 text-sm space-y-2 ${
              isPending
                ? 'border-warning/30 bg-warning/5'
                : lastResult.score >= 60
                  ? 'border-success/30 bg-success/5'
                  : 'border-warning/30 bg-warning/5'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {isPending ? (
                <AlertCircle className="size-5 text-warning" />
              ) : (
                <CheckCircle2 className="size-5 text-success" />
              )}
              <span>
                {lastResult.type === 'check_in' ? '⏱️ Giriş' : '🏃 Çıkış'}{' '}
                {isPending ? 'onaya gönderildi' : 'kaydedildi'} · trust{' '}
                {lastResult.score}/100
              </span>
            </div>

            {/* Konum doğrulama durumu net göster */}
            <div className="flex flex-wrap gap-1 text-[10px]">
              {isPending ? (
                <span className="chip bg-warning/10 text-warning border border-warning/30">
                  📸 Yönetici onayı bekliyor
                </span>
              ) : isNfc ? (
                <span className="chip bg-orange-100 text-orange-700 border border-orange-200">
                  🔒 NFC ile (fiziksel temas)
                </span>
              ) : isOutOfFence ? (
                <span className="chip bg-warning/10 text-warning border border-warning/30">
                  ⚠️ Lokasyon dışı (onaylandı)
                </span>
              ) : lastResult.distance_m != null ? (
                <span className="chip bg-success/10 text-success border border-success/30">
                  ✅ Konum doğrulandı ({lastResult.distance_m}m)
                </span>
              ) : (
                <span className="chip bg-muted/10 text-muted border border-muted/20">
                  Konum verisi yok
                </span>
              )}
              {lastResult.methods.length > 0 && (
                <span className="chip bg-orange-50 text-orange-700 border border-orange-100">
                  {lastResult.methods.join(' · ')}
                </span>
              )}
            </div>

            {lastResult.flags.length > 0 && (
              <div className="text-[10px] text-muted">
                Bayraklar:{' '}
                <span className="font-mono text-warning">{lastResult.flags.join(', ')}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Damga sonrası ruh hali sorma modalı */}
      <MoodPrompt
        forceOpen={showMoodPrompt}
        onClose={() => setShowMoodPrompt(false)}
        cooldownKey="mood-prompt-stamp"
      />

      {/* Anomali tespit edildiğinde selfie iste — auto:true ise otomatik countdown */}
      {selfiePrompt && (
        <SelfieCaptureModal
          reasons={selfiePrompt.reasons}
          reasonMessages={selfiePrompt.reason_messages}
          distanceMeters={selfiePrompt.distance_m ?? null}
          geofenceRadiusM={selfiePrompt.geofence_radius_m ?? null}
          autoCapture={selfiePrompt.auto}
          onClose={() => setSelfiePrompt(null)}
          onUploaded={(selfieUrl) => {
            const payload = { ...selfiePrompt.pendingPayload, selfie_url: selfieUrl } as Record<
              string,
              unknown
            >;
            setSelfiePrompt(null);
            stampMutation.mutate(payload as Parameters<typeof stampMutation.mutate>[0]);
          }}
        />
      )}
    </div>
  );
}

function findBestLocation(
  locations: LocationOption[],
  latitude: number,
  longitude: number,
  preferredId?: string,
) {
  if (preferredId) return locations.find((location) => location.id === preferredId) ?? null;
  if (locations.length === 0) return null;
  return locations
    .map((location) => ({
      location,
      distance: haversineMeters(latitude, longitude, location.latitude, location.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.location ?? null;
}

function extractLocationIdFromQrUrl(raw: string) {
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    const qIndex = parts.indexOf('q');
    return qIndex >= 0 ? parts[qIndex + 1] : null;
  } catch {
    return null;
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusM = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
