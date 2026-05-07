import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X } from 'lucide-react';

interface Props {
  onResult: (text: string) => void;
  onClose: () => void;
}

/**
 * QR kod tarayıcı — kameradan canlı tarama (zxing-js).
 * Kamera izni gerekir. iPhone'da Safari/Chrome çalışır.
 */
export function QrScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let controls: { stop: () => void } | null = null;

    const start = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          throw new Error('Tarayıcı kamera API desteklemiyor');
        }
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (devices.length === 0) {
          throw new Error('Kamera bulunamadı');
        }
        // Arka kamera tercih (varsa)
        const backCam =
          devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
        setScanning(true);

        controls = await reader.decodeFromVideoDevice(
          backCam!.deviceId,
          videoRef.current!,
          (result, _err) => {
            if (stopped) return;
            if (result) {
              const text = result.getText();
              stopped = true;
              controls?.stop();
              onResult(text);
            }
          },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Kamera açılamadı';
        setError(msg);
        setScanning(false);
      }
    };

    void start();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [onResult]);

  return (
    <div className="space-y-3">
      <div className="qr-viewport">
        <video ref={videoRef} playsInline muted />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{scanning ? '📷 QR aranıyor...' : '...'}</span>
        <button onClick={onClose} className="btn-outline text-sm">
          <X className="size-4" /> İptal
        </button>
      </div>
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
