/**
 * QR kod tarayıcı — hızlı hybrid implementasyon.
 *
 * Strateji:
 *   1) Native `BarcodeDetector` API (Chrome Android, Safari 16.4+, Edge) —
 *      donanım hızlandırması, ~30-80ms decode.
 *   2) Fallback: `jsQR` (pure WASM-benzeri JS, sadece QR, 50 KB, hızlı).
 *
 * Avantajlar (eski @zxing/browser'a göre):
 *   - 5-10x hızlanma (multi-format taraması yok)
 *   - 200 KB bundle tasarrufu
 *   - Aktif geliştirilen library
 *
 * Mobilde **arka kamera (environment)** default açılır. "Ön/Arka" çevirme butonu var.
 */
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera, RefreshCcw, FlipHorizontal2 } from 'lucide-react';

interface Props {
  onResult: (text: string) => void;
  onClose: () => void;
}

type CameraFacing = 'environment' | 'user';

// BarcodeDetector tip beyanı (henüz TS lib.dom'a dahil değil her ortamda)
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource | ImageBitmapSource) => Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorCtor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const hasNativeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

export function QrScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'init' | 'permission' | 'scanning'>('init');
  const [facing, setFacing] = useState<CameraFacing>('environment');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;

    const finish = (text: string) => {
      if (cancelled) return;
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      onResult(text);
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Tarayıcı kamera API desteklemiyor. Chrome/Safari'nin güncel sürümünü kullan.",
          );
        }
        setPhase('permission');

        // 1. ideal facingMode + düşürülmüş çözünürlük (QR için 480p yeterli, CPU 2x az)
        const videoConstraints: MediaTrackConstraints = {
          facingMode: { ideal: facing },
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 30 },
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          // 2. arka kamera ise exact zorla
          if (facing === 'environment') {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { exact: 'environment' }, width: { ideal: 640 } },
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
                    video: { deviceId: { exact: backCam.deviceId }, width: { ideal: 640 } },
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

        // Continuous focus + exposure (destekleyen tarayıcılarda anlık fokus)
        try {
          const track = stream.getVideoTracks()[0];
          if (track) {
            await track
              .applyConstraints({
                advanced: [
                  { focusMode: 'continuous' } as unknown as MediaTrackConstraintSet,
                  { exposureMode: 'continuous' } as unknown as MediaTrackConstraintSet,
                ],
              })
              .catch(() => {});
          }
        } catch {
          /* destek yoksa sessizce geç */
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});

        setPhase('scanning');
        setError(null);

        // Native BarcodeDetector öncelik
        let detector: BarcodeDetectorLike | null = null;
        if (hasNativeDetector) {
          try {
            const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
              .BarcodeDetector;
            if (Ctor.getSupportedFormats) {
              const formats = await Ctor.getSupportedFormats();
              if (formats.includes('qr_code')) {
                detector = new Ctor({ formats: ['qr_code'] });
              }
            } else {
              detector = new Ctor({ formats: ['qr_code'] });
            }
          } catch {
            detector = null;
          }
        }

        // Canvas (jsQR fallback için)
        const canvas =
          canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const scanFrame = async () => {
          if (cancelled || !video) return;
          if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            rafId = requestAnimationFrame(scanFrame);
            return;
          }

          try {
            if (detector) {
              // Native — donanım hızlandırması, video'dan direkt oku
              const barcodes = await detector.detect(video);
              if (barcodes.length > 0 && barcodes[0]?.rawValue) {
                finish(barcodes[0].rawValue);
                return;
              }
            } else if (ctx) {
              // Fallback: jsQR (canvas + image data)
              const w = video.videoWidth;
              const h = video.videoHeight;
              if (w > 0 && h > 0) {
                if (canvas.width !== w) canvas.width = w;
                if (canvas.height !== h) canvas.height = h;
                ctx.drawImage(video, 0, 0, w, h);
                const imageData = ctx.getImageData(0, 0, w, h);
                const code = jsQR(imageData.data, w, h, {
                  inversionAttempts: 'dontInvert',
                });
                if (code?.data) {
                  finish(code.data);
                  return;
                }
              }
            }
          } catch {
            /* her frame'de hatayı yutuyoruz — bir sonraki frame'de tekrar dene */
          }

          rafId = requestAnimationFrame(scanFrame);
        };

        rafId = requestAnimationFrame(scanFrame);
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
      if (rafId !== null) cancelAnimationFrame(rafId);
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
