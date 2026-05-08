import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { X, Camera, RefreshCcw, FlipHorizontal2 } from 'lucide-react';

interface Props {
  onResult: (text: string) => void;
  onClose: () => void;
}

type CameraFacing = 'environment' | 'user';

/**
 * QR kod tarayıcı.
 *
 * Mobilde **arka kamera (environment)** default açılır.
 * Arka kamera bozuksa veya kullanıcı isterse "Ön kamera" butonu ile çevirir.
 */
export function QrScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'init' | 'permission' | 'scanning'>('init');
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;
    const reader = new BrowserMultiFormatReader();

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Tarayıcı kamera API desteklemiyor. Chrome/Safari\'nin güncel sürümünü kullan.',
          );
        }
        setPhase('permission');

        // 1. ideal facingMode
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // 2. arka kamera ise exact zorla
          if (facing === 'environment') {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { exact: 'environment' } },
                audio: false,
              });
            } catch {
              // 3. enumerate ile back/rear/arka label'lı device bul
              const devices = await navigator.mediaDevices.enumerateDevices();
              const backCam = devices.find(
                (d) =>
                  d.kind === 'videoinput' &&
                  /back|rear|environment|arka/i.test(d.label),
              );
              stream = backCam
                ? await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: backCam.deviceId } },
                    audio: false,
                  })
                : await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }
          } else {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        setPhase('scanning');
        setError(null);

        controls = await reader.decodeFromStream(stream, videoRef.current!, (result) => {
          if (cancelled || !result) return;
          const text = result.getText();
          cancelled = true;
          controls?.stop();
          stream?.getTracks().forEach((t) => t.stop());
          onResult(text);
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Kamera açılamadı';
        const tr = /Permission|NotAllowed/i.test(msg)
          ? 'Kamera izni verilmedi. Tarayıcı ayarlarından izin ver.'
          : /NotFound/i.test(msg)
            ? 'Kamera bulunamadı.'
            : /NotReadable/i.test(msg)
              ? 'Başka bir uygulama kamerayı kullanıyor — kapat ve tekrar dene.'
              : /OverConstrained/i.test(msg)
                ? `${facing === 'environment' ? 'Arka' : 'Ön'} kamera bulunamadı — diğerini dene.`
                : msg;
        setError(tr);
        setPhase('init');
      }
    };

    void start();

    return () => {
      cancelled = true;
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult, facing, reloadKey]);

  const toggleCamera = () =>
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  const retry = () => {
    setError(null);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-black border-2 border-orange-500">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
        />

        {phase === 'scanning' && (
          <>
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/5 aspect-square border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-black/60 text-white text-[11px] font-medium">
              {facing === 'environment' ? '📸 Arka' : '🤳 Ön'} kamera
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-orange-500 text-white text-xs font-medium flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />
              QR aranıyor…
            </div>
            <button
              onClick={toggleCamera}
              type="button"
              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 hover:bg-white text-ink flex items-center justify-center shadow-md transition"
              title={facing === 'environment' ? 'Ön kameraya geç' : 'Arka kameraya geç'}
            >
              <FlipHorizontal2 className="size-4" />
            </button>
          </>
        )}

        {phase !== 'scanning' && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
            <Camera className="size-10 opacity-80" />
            <span className="text-sm">
              {phase === 'init' ? 'Kamera başlatılıyor…' : 'Kamera izni bekleniyor…'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted">QR'ı çerçeveye yerleştir — otomatik tarar.</p>
        <div className="flex gap-2">
          {phase === 'scanning' && (
            <button onClick={toggleCamera} className="btn-outline text-sm" type="button">
              <FlipHorizontal2 className="size-4" />
              {facing === 'environment' ? 'Ön' : 'Arka'} kamera
            </button>
          )}
          <button onClick={onClose} className="btn-outline text-sm" type="button">
            <X className="size-4" /> İptal
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger flex items-center justify-between gap-2 flex-wrap">
          <span>⚠ {error}</span>
          <div className="flex gap-1">
            <button onClick={toggleCamera} className="btn-outline text-xs" type="button">
              <FlipHorizontal2 className="size-3.5" />
              {facing === 'environment' ? 'Ön' : 'Arka'}
            </button>
            <button onClick={retry} className="btn-outline text-xs" type="button">
              <RefreshCcw className="size-3.5" /> Yeniden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
