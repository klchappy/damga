import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Loader2,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  LogOut,
  Stamp,
  RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/use-auth';
import { api, getErrorMessage } from '@/lib/api';
import { useGeolocation } from '@/hooks/use-geolocation';
import { generateDeviceId } from '@/lib/utils';

/**
 * /q/:locationId — Mutfak/giriş kapısı QR kodunun açtığı landing.
 *
 * Akış:
 *  1. URL'de location_id + token (?t=...) var
 *  2. Kullanıcı login değilse → /auth/sign-in?return=/q/<id>?t=<token>
 *  3. GPS izni iste (ZORUNLU — server-side de hard reject ediyor)
 *  4. Bugünün son event'ine bakarak check_in/check_out belirle
 *  5. POST /v1/stamp ile damga at (qr_code_payload = token)
 *  6. Server: HMAC valid + GPS geofence içi + velocity OK → kabul
 *
 * Bu akış proxy attack'a karşı dirençli:
 *  - Statik QR poster fotoğraflanır → evden okutursa GPS evi gösterir → REJECT
 *  - Aynı QR'ı 2 kez okutursa → velocity check (30sn) → REJECT
 *  - Login zorunlu → başkası onun adına okutamaz
 */
export function QLandingPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t') ?? '';
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  const geo = useGeolocation();
  const [stamped, setStamped] = useState<{
    type: 'check_in' | 'check_out';
    score: number;
    distance: number | null;
  } | null>(null);

  // Login değilse sign-in'e yönlendir, sonra geri dön
  useEffect(() => {
    if (loading) return;
    if (!user) {
      const returnPath = `/q/${locationId}?t=${encodeURIComponent(token)}`;
      navigate(`/auth/sign-in?return=${encodeURIComponent(returnPath)}`, {
        replace: true,
      });
    }
  }, [loading, user, locationId, token, navigate]);

  // Bugünkü son event → next action
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
    enabled: !!user,
  });

  const lastTodayType = (todayEvents?.items ?? [])
    .slice()
    .sort((a, b) => new Date(b.server_time).getTime() - new Date(a.server_time).getTime())[0]?.type;

  const nextAction: 'check_in' | 'check_out' =
    !lastTodayType || lastTodayType === 'check_out' ? 'check_in' : 'check_out';

  const stampMut = useMutation({
    mutationFn: async () => {
      const pos = await geo.getCurrent();
      const { data } = await api.post('/stamp', {
        location_id: locationId,
        client_time: new Date().toISOString(),
        device_id: generateDeviceId(),
        app_version: 'web-q-0.2.0',
        device_info: {
          platform: 'web',
          user_agent: navigator.userAgent,
        },
        qr_code_payload: token,
        latitude: pos.latitude,
        longitude: pos.longitude,
        gps_accuracy_m: pos.accuracy,
      });
      return { ...data, type: nextAction, distance: data.distance_from_office_m };
    },
    onSuccess: (d) => {
      setStamped({
        type: d.type,
        score: d.verification_score,
        distance: d.distance ?? null,
      });
      void refetchToday();
      const emoji = d.verification_score >= 80 ? '✅' : '⚠️';
      const label = d.type === 'check_in' ? 'Giriş' : 'Çıkış';
      toast.success(`${emoji} ${label} kaydedildi · trust ${d.verification_score}/100`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!token) {
    return (
      <CardWrapper>
        <ErrorState
          title="QR linki eksik"
          message="QR koddan gelen URL'de doğrulama tokenı yok. Yeni QR oluşturulması gerekebilir."
        />
      </CardWrapper>
    );
  }

  if (stamped) {
    return (
      <CardWrapper>
        <div className="text-center space-y-3">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success mx-auto">
            <CheckCircle2 className="size-9" />
          </div>
          <h1 className="font-display text-2xl">
            {stamped.type === 'check_in' ? '⏱️ Giriş kaydedildi' : '🏃 Çıkış kaydedildi'}
          </h1>
          <p className="text-sm text-muted">
            Trust skor: <strong className="text-ink">{stamped.score}/100</strong>
            {stamped.distance != null && (
              <> · {Math.round(stamped.distance)}m mesafe</>
            )}
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Link to="/" className="btn-primary text-sm">
              Ana sayfa
            </Link>
            <Link to="/history" className="btn-outline text-sm">
              Geçmişim
            </Link>
          </div>
        </div>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper>
      <div className="text-center space-y-3">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white mx-auto">
          <Stamp className="size-9" />
        </div>
        <h1 className="font-display text-2xl">
          Damga vurmaya hazır mısın, {user.full_name?.split(' ')[0] ?? ''}?
        </h1>
        <p className="text-sm text-muted">
          {nextAction === 'check_in' ? (
            <>
              Sıradaki: <strong className="text-success">Giriş</strong>
            </>
          ) : (
            <>
              Sıradaki: <strong className="text-warning">Çıkış</strong>
            </>
          )}
        </p>
      </div>

      <div className="rounded-md bg-orange-50/60 border border-orange-100 p-3 text-xs text-muted flex items-start gap-1.5">
        <MapPin className="size-4 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <strong className="text-ink">Konum doğrulanacak.</strong> "İzin Ver"
          dediğinde GPS'in alınır; lokasyon dışındaysan sistem reddeder. Bu sayede
          başkasının QR'ı evden okutması engellenir.
        </div>
      </div>

      {geo.error && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs flex items-start gap-1.5">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div>
            <strong className="text-ink">GPS hatası:</strong> {geo.error}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => stampMut.mutate()}
        disabled={stampMut.isPending || geo.loading}
        className="btn-primary w-full text-base py-3"
      >
        {stampMut.isPending || geo.loading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : nextAction === 'check_in' ? (
          <LogIn className="size-5" />
        ) : (
          <LogOut className="size-5" />
        )}
        {nextAction === 'check_in' ? 'Girişi Damgala' : 'Çıkışı Damgala'}
      </button>

      {stampMut.isError && (
        <button
          type="button"
          onClick={() => stampMut.reset()}
          className="btn-ghost text-xs w-full"
        >
          <RefreshCw className="size-3.5" />
          Tekrar dene
        </button>
      )}

      <div className="text-center text-xs text-muted">
        <Link to="/" className="hover:text-orange-600 underline-offset-4 hover:underline">
          QR'ı tarayıp damga vurmadan ana sayfaya git
        </Link>
      </div>
    </CardWrapper>
  );
}

function CardWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-cream">
      <div className="w-full max-w-md card space-y-4">{children}</div>
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="text-center space-y-3">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger mx-auto">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="font-display text-xl">{title}</h1>
      <p className="text-sm text-muted">{message}</p>
      <Link to="/" className="btn-primary inline-block text-sm">
        Ana sayfa
      </Link>
    </div>
  );
}
