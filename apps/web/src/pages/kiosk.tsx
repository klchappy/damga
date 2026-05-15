/**
 * Kiosk modu — paylaşımlı tablette her çalışanın kişisel QR badge'ini okutması.
 *
 * Akış:
 *   1. Manager logged-in olarak `/kiosk/:locationId` açar
 *   2. Tam ekran kameraya basılır (büyük yazıyla "QR'ını okut")
 *   3. Çalışan kartını gösterir → API çağırılır → animasyonlu başarı
 *   4. 3 saniye sonra otomatik sıfırlanır, sıradaki çalışan
 *
 * Güvenlik:
 *   - Sadece auth'lu kullanıcı bu sayfaya gelebilir
 *   - Her stamp backend'de "kiosk_operator_id" + "kiosk_operator_name" ile log'lanır
 *   - Velocity check arka planda çalışır (aynı kişi 30 sn'de bir kez)
 *
 * UX:
 *   - "Wake lock" API ile ekran kapanması engellenir (mobil cihazda)
 *   - Stamp sonrası 3 sn'lik animasyon (yeşil/kırmızı badge)
 *   - Yöneticisi "exit kiosk" butonuyla çıkar (PIN korumalı OPSİYONEL)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import jsQR from 'jsqr';
import { ArrowLeft, CheckCircle2, Loader2, MapPin, ScanLine, XCircle } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

interface StampResponse {
  event_id: string;
  type: 'check_in' | 'check_out';
  user: {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
  };
  location: {
    id: string;
    name: string;
  };
  verification_score: number;
}

type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'submitting' }
  | { kind: 'success'; data: StampResponse }
  | { kind: 'error'; message: string };

export function KioskPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastScanRef = useRef<string>(''); // debounce: aynı QR 5 saniye tekrar etmesin
  const lastScanTsRef = useRef<number>(0);

  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stampMut = useMutation({
    mutationFn: async (personalCredential: string) => {
      const { data } = await api.post<StampResponse>('/kiosk-stamp', {
        personal_credential: personalCredential,
        location_id: locationId,
      });
      return data;
    },
    onSuccess: (data) => {
      setState({ kind: 'success', data });
      // 3 saniye sonra idle'a dön
      setTimeout(() => setState({ kind: 'scanning' }), 3000);
    },
    onError: (err) => {
      setState({ kind: 'error', message: getErrorMessage(err) });
      setTimeout(() => setState({ kind: 'scanning' }), 3000);
    },
  });

  // Wake lock — ekran kapanmasın (kiosk için kritik)
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const wl = await navigator.wakeLock.request('screen');
        if (!cancelled) wakeLockRef.current = wl;
      } catch {
        /* ignore */
      }
    })();
    const onVis = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        navigator.wakeLock?.request('screen').then((wl) => (wakeLockRef.current = wl)).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // Kamera başlat
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setState({ kind: 'scanning' });
        }
      } catch (e) {
        setCameraError(e instanceof Error ? e.message : 'Kamera başlatılamadı');
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // QR scan loop
  useEffect(() => {
    if (state.kind !== 'scanning') return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code && code.data) {
            const now = Date.now();
            // Aynı QR 5 sn içinde tekrar tetiklenmesin
            if (code.data !== lastScanRef.current || now - lastScanTsRef.current > 5000) {
              lastScanRef.current = code.data;
              lastScanTsRef.current = now;
              setState({ kind: 'submitting' });
              stampMut.mutate(code.data.trim());
              return;
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.kind, stampMut]);

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 p-3 flex items-center justify-between bg-black/60 backdrop-blur">
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="size-4" />
          <span className="font-medium">{org?.name ?? 'Damga'}</span>
          <span className="text-white/50">·</span>
          <span className="text-white/80">Kiosk modu</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('Kiosk modundan çıkmak istediğine emin misin?')) {
              navigate(-1);
            }
          }}
          className="text-xs text-white/70 hover:text-white px-3 py-1 rounded border border-white/20"
        >
          <ArrowLeft className="size-3.5 inline mr-1" />
          Çıkış
        </button>
      </div>

      {/* Kamera arka planda */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover opacity-50"
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Karartma overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Camera error */}
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center z-10 p-8">
          <div className="bg-red-950/90 border border-red-500/50 rounded-2xl p-6 max-w-md text-left space-y-3">
            <div className="text-center">
              <XCircle className="size-12 mx-auto mb-2 text-red-400" />
              <h2 className="text-xl font-bold">Kamera açılamadı</h2>
              <p className="mt-1 text-xs text-red-200/80">{cameraError}</p>
            </div>
            <div className="text-xs text-red-100/90 space-y-1.5 bg-black/30 rounded-lg p-3">
              <p className="font-semibold mb-1">Çözüm adımları:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Tarayıcı URL çubuğundaki 🔒 / 🎥 simgesine tıkla → izin "İzin ver"</li>
                <li>Chrome: Ayarlar → Site Ayarları → Kamera → bu siteye izin</li>
                <li>iPad/iPhone: Ayarlar → Safari → Kamera → "İzin ver"</li>
                <li>Başka bir uygulama kamera kullanıyorsa onu kapat</li>
              </ol>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium border border-white/20 transition"
                onClick={() => window.location.reload()}
              >
                Tekrar Dene
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ana içerik — duruma göre */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none p-8">
        {state.kind === 'idle' || state.kind === 'scanning' ? (
          <>
            <div className="relative">
              <div className="w-64 h-64 sm:w-80 sm:h-80 border-4 border-white/70 rounded-3xl relative">
                <span className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl" />
                <span className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl" />
                <span className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl" />
                <span className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl" />
              </div>
            </div>
            <h1 className="mt-8 text-3xl sm:text-5xl font-bold text-center">
              <ScanLine className="size-10 inline mr-2 animate-pulse text-emerald-400" />
              QR kodunu göster
            </h1>
            <p className="mt-3 text-white/70 text-center max-w-md">
              Çalışan kartını kameraya doğru tut. Giriş veya çıkışı otomatik
              algılanacak.
            </p>
          </>
        ) : null}

        {state.kind === 'submitting' && (
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-12 text-center">
            <Loader2 className="size-16 mx-auto animate-spin text-emerald-400" />
            <p className="mt-4 text-xl">İşleniyor…</p>
          </div>
        )}

        {state.kind === 'success' && (
          <div
            className={`bg-emerald-500/95 rounded-3xl p-8 sm:p-12 text-center max-w-md pointer-events-auto animate-in fade-in zoom-in duration-300`}
          >
            <CheckCircle2 className="size-20 sm:size-24 mx-auto mb-3" />
            <h2 className="text-2xl sm:text-4xl font-bold">
              {state.data.user.full_name ?? 'Çalışan'}
            </h2>
            <p className="mt-2 text-xl sm:text-2xl">
              {state.data.type === 'check_in' ? 'Giriş yaptın ✓' : 'Çıkış yaptın ✓'}
            </p>
            <p className="mt-3 text-sm text-emerald-100">
              📍 {state.data.location.name} · Güven: {state.data.verification_score}/100
            </p>
            <p className="mt-2 text-xs text-emerald-200">3 saniye sonra hazır olacak…</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="bg-red-500/95 rounded-3xl p-8 sm:p-12 text-center max-w-md pointer-events-auto">
            <XCircle className="size-20 sm:size-24 mx-auto mb-3" />
            <h2 className="text-2xl sm:text-3xl font-bold">Geçersiz veya pasif kart</h2>
            <p className="mt-2 text-sm">{state.message}</p>
            <p className="mt-3 text-xs text-red-200">Yöneticinle iletişime geç.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 inset-x-0 z-20 p-3 bg-black/60 backdrop-blur text-center text-xs text-white/60">
        {user?.full_name && (
          <>
            Kiosk operator: <span className="text-white/90">{user.full_name}</span>{' '}
            · Damga · Tüm damgalar kayıt altına alınır
          </>
        )}
      </div>
    </div>
  );
}
