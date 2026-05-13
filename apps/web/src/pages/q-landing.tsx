import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Stamp,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/use-auth';
import { useGeolocation } from '@/hooks/use-geolocation';
import { api, getErrorMessage } from '@/lib/api';
import { generateDeviceId } from '@/lib/utils';

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
    userName: string;
    locationName: string | null;
    serverTime: string | null;
    score: number;
    distance: number | null;
  } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const returnPath = `/q/${locationId}?t=${encodeURIComponent(token)}`;
      navigate(`/auth/sign-in?return=${encodeURIComponent(returnPath)}`, { replace: true });
    }
  }, [loading, user, locationId, token, navigate]);

  const { data: todayEvents, refetch: refetchToday } = useQuery({
    queryKey: ['events', 'me', 'today', user?.id],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const params = new URLSearchParams({
        date_from: start.toISOString(),
        date_to: end.toISOString(),
        limit: '20',
      });
      if (user?.id) params.set('user_id', user.id);
      const r = await api.get<{ items: Array<{ type: string; server_time: string }> }>(
        `/events?${params.toString()}`,
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
        app_version: 'web-q-0.3.0',
        device_info: {
          platform: 'web',
          user_agent: navigator.userAgent,
        },
        qr_code_payload: token,
        latitude: pos.latitude,
        longitude: pos.longitude,
        gps_accuracy_m: pos.accuracy,
      });
      return {
        ...data,
        type: (data.type ?? nextAction) as 'check_in' | 'check_out',
        distance: data.distance_from_office_m,
      };
    },
    onSuccess: (d) => {
      const actor = d.user?.full_name ?? user?.full_name ?? 'Kullanici';
      const label = d.type === 'check_in' ? 'giris' : 'cikis';
      setStamped({
        type: d.type,
        userName: actor,
        locationName: d.location?.name ?? null,
        serverTime: d.server_time ?? null,
        score: d.verification_score,
        distance: d.distance ?? null,
      });
      void refetchToday();
      toast.success(`${actor} icin ${label} kaydedildi`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!token) {
    return (
      <CardWrapper>
        <ErrorState
          title="QR linki eksik"
          message="QR koddan gelen URL'de dogrulama tokeni yok. Yeni QR olusturulmasi gerekebilir."
        />
      </CardWrapper>
    );
  }

  if (stamped) {
    const title =
      stamped.type === 'check_in'
        ? `${stamped.userName} icin giris kaydedildi`
        : `${stamped.userName} icin cikis kaydedildi`;

    return (
      <CardWrapper>
        <div className="space-y-3 text-center">
          <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 className="size-9" />
          </div>
          <h1 className="font-display text-2xl">{title}</h1>
          <p className="text-sm text-muted">
            {stamped.locationName && (
              <>
                Lokasyon: <strong className="text-ink">{stamped.locationName}</strong> ·{' '}
              </>
            )}
            Trust skor: <strong className="text-ink">{stamped.score}/100</strong>
            {stamped.distance != null && <> · {Math.round(stamped.distance)}m mesafe</>}
          </p>
          {stamped.serverTime && (
            <p className="text-xs text-muted">
              Islem zamani: {new Date(stamped.serverTime).toLocaleString('tr-TR')}
            </p>
          )}
          <div className="flex justify-center gap-2 pt-2">
            <Link to="/" className="btn-primary text-sm">
              Ana sayfa
            </Link>
            <Link to="/history" className="btn-outline text-sm">
              Gecmisim
            </Link>
          </div>
        </div>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper>
      <div className="space-y-3 text-center">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white">
          <Stamp className="size-9" />
        </div>
        <h1 className="font-display text-2xl">
          Damga vurmaya hazir misin, {user.full_name?.split(' ')[0] ?? ''}?
        </h1>
        <p className="text-sm text-muted">
          Bu islem <strong className="text-ink">{user.full_name}</strong> kullanicisi icin
          kaydedilecek. Siradaki:{' '}
          {nextAction === 'check_in' ? (
            <strong className="text-success">Giris</strong>
          ) : (
            <strong className="text-warning">Cikis</strong>
          )}
        </p>
      </div>

      <div className="flex items-start gap-1.5 rounded-md border border-orange-100 bg-orange-50/60 p-3 text-xs text-muted">
        <MapPin className="mt-0.5 size-4 shrink-0 text-orange-500" />
        <div>
          <strong className="text-ink">Konum dogrulanacak.</strong> GPS bilgin yalnizca bu damga
          kaydinin lokasyonda yapildigini dogrulamak icin kullanilir.
        </div>
      </div>

      {geo.error && (
        <div className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <strong className="text-ink">GPS hatasi:</strong> {geo.error}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => stampMut.mutate()}
        disabled={stampMut.isPending || geo.loading}
        className="btn-primary w-full py-3 text-base"
      >
        {stampMut.isPending || geo.loading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : nextAction === 'check_in' ? (
          <LogIn className="size-5" />
        ) : (
          <LogOut className="size-5" />
        )}
        {nextAction === 'check_in' ? 'Girisi Damgala' : 'Cikisi Damgala'}
      </button>

      {stampMut.isError && (
        <button type="button" onClick={() => stampMut.reset()} className="btn-ghost w-full text-xs">
          <RefreshCw className="size-3.5" />
          Tekrar dene
        </button>
      )}

      <div className="text-center text-xs text-muted">
        <Link to="/" className="underline-offset-4 hover:text-orange-600 hover:underline">
          QR'i tarayip damga vurmadan ana sayfaya git
        </Link>
      </div>
    </CardWrapper>
  );
}

function CardWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="card w-full max-w-md space-y-4">{children}</div>
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
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
