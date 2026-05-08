import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCcw, Send, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';

interface Props {
  /** Sebepler — backend'in döndürdüğü reasons array */
  reasons: string[];
  /** TR mesajları */
  reasonMessages?: string[];
  /** Mesafe bilgisi (varsa) */
  distanceMeters?: number | null;
  geofenceRadiusM?: number | null;
  /**
   * Selfie başarıyla yüklenince çağrılır — caller bu URL'yi /v1/stamp request'ine
   * ikinci kez gönderir (`selfie_url` field'ı), event pending_review olarak kaydedilir.
   */
  onUploaded: (selfieUrl: string) => void;
  onClose: () => void;
}

/**
 * Anomali tespit edildiğinde açılan selfie çekme modalı.
 *
 * Akış:
 *  1) Ön kamera açılır (getUserMedia facingMode: 'user')
 *  2) Kullanıcı "Çek" → canvas'a snapshot alınır
 *  3) "Yeniden çek" veya "Gönder"
 *  4) Gönder → POST /v1/stamp/selfie-upload → URL döner
 *  5) onUploaded(url) çağrılır (caller stamp request'ini selfie_url ile yeniler)
 */
export function SelfieCaptureModal({
  reasons,
  reasonMessages,
  distanceMeters,
  geofenceRadiusM,
  onUploaded,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'init' | 'streaming' | 'preview' | 'uploading' | 'error'>(
    'init',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [snapshotPreview, setSnapshotPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Tarayıcın kamera API desteklemiyor.');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase('streaming');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Kamera açılamadı';
        const tr = /Permission|NotAllowed/i.test(msg)
          ? 'Kamera izni verilmedi. Tarayıcı ayarlarından izin ver.'
          : /NotFound/i.test(msg)
            ? 'Kamera bulunamadı.'
            : msg;
        setErrorMsg(tr);
        setPhase('error');
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const takeSnapshot = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Ön kamera mirror — kullanıcının "doğal" görüntüsü için tekrar flip et
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setSnapshotBlob(blob);
        setSnapshotPreview(URL.createObjectURL(blob));
        setPhase('preview');
        // Stream'i kapat (preview sırasında kamera görüntüsü gerekmez)
        const stream = video.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
      },
      'image/jpeg',
      0.85,
    );
  };

  const retake = () => {
    if (snapshotPreview) URL.revokeObjectURL(snapshotPreview);
    setSnapshotBlob(null);
    setSnapshotPreview(null);
    setPhase('init');
    // useEffect tekrar çalışmaz; manuel re-init için pencereyi yeniden aç
    window.location.reload();
  };

  const upload = async () => {
    if (!snapshotBlob) return;
    setPhase('uploading');
    try {
      // Blob → base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1] ?? '');
        };
        reader.onerror = () => reject(new Error('Dosya okunamadı'));
        reader.readAsDataURL(snapshotBlob);
      });
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
          <div>
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
              Selfie çekip yüklersen yöneticin onayına gider; uygunsa damgan kayıt edilir.
            </p>
          </div>
        </div>

        <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-black border-2 border-orange-500">
          {phase === 'streaming' && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            />
          )}
          {phase === 'preview' && snapshotPreview && (
            <img
              src={snapshotPreview}
              alt="Selfie önizleme"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {phase === 'init' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
              <Camera className="size-10 opacity-80" />
              <span className="text-sm">Kamera başlatılıyor…</span>
            </div>
          )}
          {phase === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 px-4 text-center">
              <AlertTriangle className="size-10 opacity-80" />
              <span className="text-sm">{errorMsg}</span>
            </div>
          )}
          {phase === 'uploading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-black/40">
              <Loader2 className="size-8 animate-spin" />
              <span className="text-sm">Yükleniyor…</span>
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
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary flex-1"
            >
              <RefreshCcw className="size-4" /> Yeniden dene
            </button>
          )}
        </div>

        <p className="text-[10px] text-muted text-center">
          Selfie sadece yöneticin tarafından doğrulama için görülür. KVKK gereği 90 gün sonra silinir.
        </p>
      </div>
    </div>
  );
}
