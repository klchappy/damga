import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCcw, Send, Loader2, AlertTriangle, ShieldCheck, FlipHorizontal2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';

interface Props {
  reasons: string[];
  reasonMessages?: string[];
  distanceMeters?: number | null;
  geofenceRadiusM?: number | null;
  /**
   * autoCapture true ise modal açılınca 3..2..1 geri sayımla otomatik snap +
   * otomatik upload yapılır. Kullanıcı tek tıklama yapmasa da fotoğraf çekildiği
   * EKRANDA görünür (KVKK md.6 — açık rıza için bilgilendirme).
   *
   * Kullanıcı isterse "X" ile iptal edebilir veya "Manuel çek" seçeneği ile
   * countdown'u durdurabilir.
   */
  autoCapture?: boolean;
  onUploaded: (selfieUrl: string) => void;
  onClose: () => void;
}

type Phase = 'starting' | 'streaming' | 'preview' | 'uploading' | 'error';
type Facing = 'user' | 'environment';

/**
 * Anomali tespit edildiğinde açılan selfie çekme modalı.
 *
 * Kritik düzeltmeler (önceki versiyondaki kara ekran bug'ı için):
 *  - getUserMedia + video.play()'i iki ayrı state'e bağlamadık;
 *    onloadedmetadata bekle, srcObject set'le, sonra play().
 *  - Snapshot ALMADAN önce videoWidth > 0 kontrol et — yoksa "kameranı tanıyamadık" hatası.
 *  - "Yeniden çek" eskiden window.location.reload() yapıyordu (modal kapanıyordu);
 *    şimdi sadece state reset + stream'i yeniden başlatır.
 *  - Ön kamera (front/user) açılamayan cihazda "Arkaya çevir" butonu fallback.
 *  - Phase 'error' iken net mesaj + "Tekrar dene" butonu (reload yok).
 */
export function SelfieCaptureModal({
  reasons,
  reasonMessages,
  distanceMeters,
  geofenceRadiusM,
  autoCapture = false,
  onUploaded,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>('user');
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [snapshotPreview, setSnapshotPreview] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Auto-capture countdown
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  const [autoMode, setAutoMode] = useState<boolean>(autoCapture);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setPhase('starting');
    setErrorMsg(null);
    stopStream();

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Tarayıcın kamera API desteklemiyor — Chrome/Safari güncel olmalı.');
        }

        let stream: MediaStream;
        // 1. ideal facing ile dene
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 720 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // 2. exact facing ile zorla (bazı cihazlarda ideal sessiz fail)
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { exact: facing } },
              audio: false,
            });
          } catch {
            // 3. herhangi bir kamera ile devam et (selfie için arka kamera kabul, kullanıcı ayna gibi tutar)
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        // metadata yüklendiğinde play et — autoplay policy ihlali olmaz
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) {
            resolve();
            return;
          }
          const onMeta = () => {
            video.removeEventListener('loadedmetadata', onMeta);
            resolve();
          };
          video.addEventListener('loadedmetadata', onMeta);
          // 5 saniyede gelmezse zorla devam et
          window.setTimeout(resolve, 5000);
        });
        if (cancelled) return;
        try {
          await video.play();
        } catch (playErr) {
          // Bazı browser'lar muted olmadan play'i reddeder
          video.muted = true;
          await video.play().catch(() => {});
        }
        if (cancelled) return;
        setPhase('streaming');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Kamera açılamadı';
        const tr = /Permission|NotAllowed/i.test(msg)
          ? 'Kamera izni verilmedi. Tarayıcı ayarlarından izin verip tekrar dene.'
          : /NotFound|DevicesNotFound/i.test(msg)
            ? 'Cihazda kamera bulunamadı.'
            : /NotReadable/i.test(msg)
              ? 'Kamera başka bir uygulama tarafından kullanılıyor — kapat ve tekrar dene.'
              : msg;
        setErrorMsg(tr);
        setPhase('error');
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopStream();
    };
    // facing veya reloadKey değiştiğinde stream'i yeniden başlat
  }, [facing, reloadKey]);

  // Auto-capture: stream hazır olunca 3..2..1 geri sayım, sonra otomatik snap
  useEffect(() => {
    if (!autoMode || phase !== 'streaming') {
      setAutoCountdown(null);
      return;
    }
    setAutoCountdown(3);
    const interval = window.setInterval(() => {
      setAutoCountdown((c) => {
        if (c == null) return null;
        if (c <= 1) {
          window.clearInterval(interval);
          // Bir tick sonra snap (state güncellemesinin tamamlanması için)
          window.setTimeout(() => takeSnapshot(), 100);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, phase]);

  // Auto-mode preview hazır olunca auto upload tetikle
  useEffect(() => {
    if (autoMode && phase === 'preview' && snapshotBlob) {
      window.setTimeout(() => upload(), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, phase, snapshotBlob]);

  const takeSnapshot = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      toast.error('Kamera henüz hazır değil');
      return;
    }
    const w = video.videoWidth || 0;
    const h = video.videoHeight || 0;
    if (w === 0 || h === 0) {
      toast.error('Kamera görüntü vermiyor — "Tekrar dene" ile yeniden başlat');
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast.error('Canvas context açılamadı');
      return;
    }
    if (facing === 'user') {
      // Ön kamera mirror — kullanıcının "doğal" görüntüsü için flip et
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size < 1000) {
          toast.error('Boş fotoğraf — kamera görüntüsü alamadık, tekrar dene');
          return;
        }
        if (snapshotPreview) URL.revokeObjectURL(snapshotPreview);
        setSnapshotBlob(blob);
        setSnapshotPreview(URL.createObjectURL(blob));
        setPhase('preview');
        // Stream'i kapat (preview sırasında batarya tasarrufu)
        stopStream();
      },
      'image/jpeg',
      0.85,
    );
  };

  const retake = () => {
    if (snapshotPreview) URL.revokeObjectURL(snapshotPreview);
    setSnapshotBlob(null);
    setSnapshotPreview(null);
    setPhase('starting');
    setReloadKey((k) => k + 1);
  };

  const flipFacing = () => {
    setFacing((f) => (f === 'user' ? 'environment' : 'user'));
  };

  const upload = async () => {
    if (!snapshotBlob) return;
    setPhase('uploading');
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1] ?? '');
        };
        reader.onerror = () => reject(new Error('Dosya okunamadı'));
        reader.readAsDataURL(snapshotBlob);
      });
      if (!base64 || base64.length < 1000) {
        throw new Error('Fotoğraf çok küçük / boş — tekrar çek');
      }
      const r = await api.post<{ url: string; path: string }>('/stamp/selfie-upload', {
        contentType: 'image/jpeg',
        base64,
      });
      toast.success('📸 Selfie yüklendi, onaya gönderiliyor');
      onUploaded(r.data.url);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPhase('preview');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 px-3 py-4 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-warning text-xs font-medium uppercase tracking-wider">
              <ShieldCheck className="size-3.5" /> Doğrulama
            </div>
            <h2 className="font-display text-xl mt-1">Selfie ile onay</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'uploading'}
            className="btn-ghost p-1.5 -mt-1 -mr-1"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="rounded-md bg-warning/5 border border-warning/20 px-3 py-2 text-xs flex items-start gap-1.5">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            {autoMode ? (
              <>
                <strong className="text-ink">Otomatik selfie alınıyor</strong>
                <p className="text-muted mt-0.5">
                  KVKK gereği fotoğraf çekildiği bilgisi sana gösterilmek zorunda.
                  3 saniye sonra otomatik çekilir ve yöneticinle paylaşılır.
                </p>
              </>
            ) : (
              <>
                <strong className="text-ink">Doğrulama yetersiz:</strong>
                <ul className="text-muted mt-1 list-disc list-inside">
                  {(reasonMessages ?? reasons).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                {distanceMeters != null && geofenceRadiusM != null && (
                  <p className="text-muted mt-1">
                    {distanceMeters}m uzakta · sınır {geofenceRadiusM}m
                  </p>
                )}
                <p className="text-muted mt-1">
                  Selfie çek + gönder → yöneticin onayına gider; uygunsa damgan kaydolur.
                </p>
              </>
            )}
          </div>
          {autoMode && (
            <button
              type="button"
              onClick={() => {
                setAutoMode(false);
                setAutoCountdown(null);
              }}
              className="text-[10px] text-orange-600 hover:underline shrink-0"
              title="Otomatik mod yerine manuel çekime geç"
            >
              Manuel
            </button>
          )}
        </div>

        <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-black border-2 border-orange-500">
          {/* Video her zaman render edilir — phase 'streaming' olunca görünür */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${
              facing === 'user' ? 'scale-x-[-1]' : ''
            } ${phase !== 'streaming' ? 'invisible' : ''}`}
          />
          {phase === 'preview' && snapshotPreview && (
            <img
              src={snapshotPreview}
              alt="Selfie önizleme"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {phase === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-black/80">
              <Loader2 className="size-10 animate-spin opacity-80" />
              <span className="text-sm">Kamera başlatılıyor…</span>
            </div>
          )}
          {phase === 'error' && errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 px-4 text-center bg-black/80">
              <AlertTriangle className="size-10 opacity-80 text-warning" />
              <span className="text-sm">{errorMsg}</span>
            </div>
          )}
          {phase === 'uploading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-black/40">
              <Loader2 className="size-10 animate-spin" />
              <span className="text-sm">Yükleniyor…</span>
            </div>
          )}
          {phase === 'streaming' && (
            <button
              type="button"
              onClick={flipFacing}
              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 hover:bg-white text-ink flex items-center justify-center shadow-md transition"
              title={facing === 'user' ? 'Arka kameraya geç' : 'Ön kameraya geç'}
              aria-label="Kamera çevir"
            >
              <FlipHorizontal2 className="size-4" />
            </button>
          )}

          {/* Auto-capture countdown overlay */}
          {phase === 'streaming' && autoMode && autoCountdown != null && autoCountdown > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="size-32 rounded-full bg-orange-500/90 flex items-center justify-center font-display text-7xl font-bold text-white shadow-2xl animate-pulse">
                {autoCountdown}
              </div>
              <span className="mt-3 text-white text-sm bg-black/60 px-3 py-1 rounded-full">
                Otomatik çekiliyor…
              </span>
            </div>
          )}
          {phase === 'streaming' && autoMode && autoCountdown === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-white/20">
              <div className="size-32 rounded-full bg-success flex items-center justify-center font-display text-2xl font-bold text-white shadow-2xl">
                ✓
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex gap-2">
          {phase === 'streaming' && (
            <button type="button" onClick={takeSnapshot} className="btn-primary flex-1">
              <Camera className="size-4" /> Çek
            </button>
          )}
          {phase === 'preview' && (
            <>
              <button type="button" onClick={retake} className="btn-outline flex-1">
                <RefreshCcw className="size-4" />
                Yeniden çek
              </button>
              <button type="button" onClick={upload} className="btn-primary flex-1">
                <Send className="size-4" />
                Gönder
              </button>
            </>
          )}
          {phase === 'error' && (
            <>
              <button
                type="button"
                onClick={flipFacing}
                className="btn-outline flex-1"
              >
                <FlipHorizontal2 className="size-4" />
                {facing === 'user' ? 'Arka' : 'Ön'} kamera
              </button>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="btn-primary flex-1"
              >
                <RefreshCcw className="size-4" /> Tekrar dene
              </button>
            </>
          )}
        </div>

        <p className="text-[10px] text-muted text-center">
          Selfie sadece yöneticin tarafından doğrulama için görülür. KVKK gereği 90 gün sonra silinir.
        </p>
      </div>
    </div>
  );
}
