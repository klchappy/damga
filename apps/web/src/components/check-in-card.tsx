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
import { sendBrowserNotification } from '@/lib/notifications';

interface Props {
  locationId?: string;
  onSuccess?: (result: { event_id: string; verification_score: number; flags: string[] }) => void;
}

type Method = 'nfc' | 'qr' | 'gps';

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
    useState<{ score: number; flags: string[]; methods: string[]; type: string } | null>(null);
  const [showMoodPrompt, setShowMoodPrompt] = useState(false);

  const qc = useQueryClient();
  const geo = useGeolocation();
  const nfc = useNfc();

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
      latitude?: number;
      longitude?: number;
      gps_accuracy_m?: number;
      nfc_tag_id?: string;
      qr_code_payload?: string;
    }) => {
      const { data } = await api.post('/stamp', {
        location_id: locationId,
        client_time: new Date().toISOString(),
        device_id: generateDeviceId(),
        app_version: 'web-0.1.0',
        device_info: {
          platform: 'web',
          user_agent: navigator.userAgent,
        },
        ...payload,
      });
      return data;
    },
    onSuccess: (data) => {
      const score = data.verification_score;
      const flags: string[] = data.flags ?? [];
      const methods: string[] = data.verification_methods ?? [];
      // Backend hangi tipi seçtiyse — response'da event_id var ama type yok; nextAction'ı kullan
      const type = nextAction;
      setLastResult({ score, flags, methods, type });
      const emoji = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌';
      const labelTr = type === 'check_in' ? 'Giriş' : 'Çıkış';
      toast.success(`${emoji} ${labelTr} kaydedildi · trust ${score}/100`);
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
      stampMutation.mutate({
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

      {lastResult && (
        <div
          className={`rounded-md border p-3 text-sm ${
            lastResult.score >= 80
              ? 'border-success/30 bg-success/5'
              : lastResult.score >= 60
                ? 'border-warning/30 bg-warning/5'
                : 'border-danger/30 bg-danger/5'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {lastResult.score >= 80 ? (
              <CheckCircle2 className="size-5 text-success" />
            ) : (
              <AlertCircle className="size-5 text-warning" />
            )}
            <span>
              {lastResult.type === 'check_in' ? '⏱️ Giriş' : '🏃 Çıkış'} kaydedildi · trust{' '}
              {lastResult.score}/100
            </span>
          </div>
          <div className="mt-1.5 text-xs text-muted">
            Yöntemler: {lastResult.methods.join(', ') || '—'}
            {lastResult.flags.length > 0 && (
              <>
                <br />
                Bayraklar: <span className="font-mono text-warning">{lastResult.flags.join(', ')}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Damga sonrası ruh hali sorma modalı */}
      <MoodPrompt
        forceOpen={showMoodPrompt}
        onClose={() => setShowMoodPrompt(false)}
        cooldownKey="mood-prompt-stamp"
      />
    </div>
  );
}
