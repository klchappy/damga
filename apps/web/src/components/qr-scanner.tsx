import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { X, Camera } from 'lucide-react';

interface Props {
  onResult: (text: string) => void;
  onClose: () => void;
}

/**
 * QR kod tarayıcı — kameradan canlı tarama (zxing-js).
 *
 * Mobil + masaüstü uyumlu:
 *   - getUserMedia ile permission açıkça iste (label'lar permission sonrası dolar)
 *   - facingMode: 'environment' ile arka kamera tercih
 *   - autoPlay + playsInline + muted (iOS Safari uyum)
 *   - Hata mesajları net (Türkçe)
 */
export function QrScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'init' | 'permission' | 'scanning'>('init');

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
        // Önce permission al — bu olmadan listVideoInputDevices label'ları boş döner
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Stream'i video element'ine bağla
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {/* autoPlay ile zaten başladı */});
        }

        setPhase('scanning');

        // ZXing reader stream üzerinden okusun
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
        const msg =
          err instanceof Error ? err.message : 'Kamera açılamadı';
        // Permission hata mesajını Türkçeleştir
        const tr = msg.includes('Permission')
          ? 'Kamera izni verilmedi. Tarayıcı ayarlarından izin ver.'
          : msg.includes('NotFound')
            ? 'Kamera bulunamadı.'
            : msg.includes('NotReadable')
              ? 'Başka bir uygulama kamerayı kullanıyor — kapat ve tekrar dene.'
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
  }, [onResult]);

  return (
    <div className="space-y-3">
      <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-black border-2 border-orange-500">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* QR scan overlay */}
        {phase === 'scanning' && (
          <>
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/5 aspect-square border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-orange-500 text-white text-xs font-medium flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />
              QR aranıyor…
            </div>
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

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          QR'ı çerçevenin içine yerleştir — otomatik taranır.
        </p>
        <button onClick={onClose} className="btn-outline text-sm">
          <X className="size-4" /> İptal
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
