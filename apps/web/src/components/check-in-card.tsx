import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, MapPin, Smartphone, QrCode, Loader2, AlertCircle } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { generateDeviceId } from '@/lib/utils';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useNfc } from '@/hooks/use-nfc';
import { QrScanner } from './qr-scanner';

interface Props {
  /** Hangi tipte aksiyon — varsayılan check_in. Çift "kapasite" tek butonda toggle */
  defaultAction?: 'check_in' | 'check_out';
  locationId?: string;
  onSuccess?: (result: { event_id: string; verification_score: number; flags: string[] }) => void;
}

type Method = 'nfc' | 'qr' | 'gps';

export function CheckInCard({ defaultAction = 'check_in', locationId, onSuccess }: Props) {
  const [action, setAction] = useState<'check_in' | 'check_out'>(defaultAction);
  const [method, setMethod] = useState<Method | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; flags: string[]; methods: string[] } | null>(null);

  const geo = useGeolocation();
  const nfc = useNfc();

  const checkInMutation = useMutation({
    mutationFn: async (payload: {
      latitude?: number;
      longitude?: number;
      gps_accuracy_m?: number;
      nfc_tag_id?: string;
      qr_code_payload?: string;
    }) => {
      const path = action === 'check_in' ? '/check-in' : '/check-out';
      const { data } = await api.post(path, {
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
      setLastResult({ score, flags, methods });
      const emoji = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌';
      const labelTr = action === 'check_in' ? 'Giriş' : 'Çıkış';
      toast.success(`${emoji} ${labelTr} kaydedildi · trust ${score}/100`);
      if (onSuccess) onSuccess(data);
      setMethod(null);
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
      // NFC payload + isteğe bağlı GPS
      const gpsPos = await geo.getCurrent().catch(() => null);
      checkInMutation.mutate({
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
      checkInMutation.mutate({
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
      checkInMutation.mutate({
        latitude: pos.latitude,
        longitude: pos.longitude,
        gps_accuracy_m: pos.accuracy,
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setMethod(null);
    }
  };

  const isPending = checkInMutation.isPending || method !== null;

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl">Damga vur</h2>
          <p className="text-sm text-muted">
            {action === 'check_in' ? 'Mesai başlangıcı' : 'Mesai bitişi'}
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-orange-50 p-1">
          <button
            onClick={() => setAction('check_in')}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              action === 'check_in' ? 'bg-orange-500 text-white' : 'text-muted'
            }`}
          >
            ⏱️ Giriş
          </button>
          <button
            onClick={() => setAction('check_out')}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              action === 'check_out' ? 'bg-orange-500 text-white' : 'text-muted'
            }`}
          >
            🏃 Çıkış
          </button>
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
              {nfc.supported ? 'Telefonu tag\'a yaklaştır' : 'Bu cihazda NFC yok'}
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
            <div className="text-xs text-muted text-center">Geofence kontrolü (düşük güven)</div>
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
            <span>Son damga: trust {lastResult.score}/100</span>
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
    </div>
  );
}
