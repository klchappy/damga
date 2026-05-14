import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  MapPin,
  ShieldCheck,
  Camera,
  Lock,
  ShieldAlert,
  Smartphone,
  Loader2,
  Filter,
  RefreshCw,
  LogIn,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeTr } from '@/lib/utils';

interface FeedEvent {
  id: string;
  type: string;
  server_time: string;
  verification_score: number;
  flags: string[];
  latitude: number | null;
  longitude: number | null;
  distance_from_office_m: number | null;
  verification_methods: string[];
  review_status: 'approved' | 'pending_review' | 'rejected';
  review_reasons: string[];
  selfie_url: string | null;
  user: { full_name: string; email: string; avatar_url: string | null } | null;
  location: { name: string } | null;
}

const REASON_TR: Record<string, string> = {
  no_gps: 'GPS yok',
  out_of_geofence: 'Ofis dışı',
  low_gps_accuracy: 'GPS doğruluğu düşük',
  unknown_device: 'Yeni cihaz',
  wrong_wifi: 'Wi-Fi dışı',
  low_trust: 'Düşük güven',
};

type FilterMode = 'all' | 'pending' | 'out_of_geofence' | 'nfc' | 'today';

/**
 * Manager / Admin / Owner için canlı damga akışı.
 *
 * Bugünkü tüm damga'ları gösterir + her birinin **konum doğrulama rozeti**:
 *   ✅ Konum doğrulandı (15m)
 *   📸 Onay bekliyor (selfie ile)
 *   ❌ Reddedildi
 *   🔒 NFC ile (lokasyon atlandı)
 *   ⚠️ Lokasyon dışı (admin esnemiş)
 *
 * Ayrıca filtre + 30sn auto-refresh.
 */
export function AdminLiveFeedPage() {
  const [filter, setFilter] = useState<FilterMode>('today');

  const dateFrom =
    filter === 'today'
      ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, isLoading, refetch } = useQuery<{
    items: FeedEvent[];
    total: number;
  }>({
    queryKey: ['admin', 'live-feed', dateFrom],
    queryFn: async () =>
      (await api.get(`/events?date_from=${dateFrom}&limit=200`)).data,
    refetchInterval: 10_000, // canlı akış — 10sn poll
  });

  const items = data?.items ?? [];
  const filtered = items.filter((e) => {
    if (filter === 'pending') return e.review_status === 'pending_review';
    if (filter === 'out_of_geofence')
      return (e.review_reasons ?? []).includes('out_of_geofence');
    if (filter === 'nfc') return (e.verification_methods ?? []).includes('nfc');
    return true;
  });

  // Özet stats
  const totalToday = items.length;
  const pending = items.filter((e) => e.review_status === 'pending_review').length;
  const rejected = items.filter((e) => e.review_status === 'rejected').length;
  const outOfFence = items.filter((e) =>
    (e.review_reasons ?? []).includes('out_of_geofence'),
  ).length;
  const verified = items.filter(
    (e) =>
      e.review_status === 'approved' &&
      !(e.review_reasons ?? []).includes('out_of_geofence'),
  ).length;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <Activity className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Damga Akışı</h1>
            <p className="text-sm text-muted">
              Tüm çalışanların damgalarını ve konum doğrulamalarını canlı takip et.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="btn-outline text-sm"
          title="Yenile"
        >
          <RefreshCw className="size-4" />
          Yenile
        </button>
      </div>

      {/* Özet stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard
          label="Bugün toplam"
          value={totalToday}
          color="bg-orange-500/10 text-orange-600"
          icon={<Activity className="size-4" />}
        />
        <StatCard
          label="Konum doğrulandı"
          value={verified}
          color="bg-success/10 text-success"
          icon={<ShieldCheck className="size-4" />}
        />
        <StatCard
          label="Onay bekliyor"
          value={pending}
          color="bg-warning/10 text-warning"
          icon={<Camera className="size-4" />}
        />
        <StatCard
          label="Lokasyon dışı"
          value={outOfFence}
          color="bg-warning/10 text-warning"
          icon={<MapPin className="size-4" />}
        />
        <StatCard
          label="Reddedildi"
          value={rejected}
          color="bg-danger/10 text-danger"
          icon={<ShieldAlert className="size-4" />}
        />
      </div>

      {/* Filter chip'leri */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="size-4 text-muted" />
        {(
          [
            { v: 'today', label: 'Bugün hepsi' },
            { v: 'all', label: 'Son 7 gün' },
            { v: 'pending', label: 'Onay bekleyen' },
            { v: 'out_of_geofence', label: 'Lokasyon dışı' },
            { v: 'nfc', label: 'NFC ile' },
          ] as Array<{ v: FilterMode; label: string }>
        ).map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFilter(f.v)}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              filter === f.v
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-muted border-orange-100 hover:bg-orange-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center py-12 text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-muted">
          {filter === 'today' ? 'Bugün henüz damga yok.' : 'Bu filtreye uygun damga yok.'}
        </div>
      ) : (
        <div className="card divide-y divide-orange-100">
          {filtered.map((e) => (
            <FeedRow key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card p-3">
      <div className={`inline-flex items-center gap-1 chip ${color} text-[10px]`}>
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-2xl">{value}</div>
    </div>
  );
}

function FeedRow({ event: e }: { event: FeedEvent }) {
  const isCheckIn = e.type === 'check_in';
  const isNfc = (e.verification_methods ?? []).includes('nfc');
  const isOutOfFence = (e.review_reasons ?? []).includes('out_of_geofence');

  return (
    <div className="py-3 flex items-start gap-3 flex-wrap">
      {/* Avatar / initials */}
      <div className="flex size-10 items-center justify-center rounded-lg bg-orange-100 font-display font-semibold text-orange-700 shrink-0 overflow-hidden">
        {e.user?.avatar_url ? (
          <img
            src={e.user.avatar_url}
            alt={e.user.full_name}
            className="size-full object-cover"
          />
        ) : (
          e.user?.full_name.charAt(0).toUpperCase() ?? '?'
        )}
      </div>

      {/* İçerik */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {isCheckIn ? (
            <LogIn className="size-3.5 text-success" />
          ) : (
            <LogOut className="size-3.5 text-warning" />
          )}
          <span>{e.user?.full_name ?? '—'}</span>
          <span className="text-xs text-muted">
            {isCheckIn ? 'giriş' : 'çıkış'}
          </span>
        </div>
        <div className="text-xs text-muted">
          {formatDateTimeTr(e.server_time)}
          {e.location?.name && <> · 📍 {e.location.name}</>}
          {e.distance_from_office_m != null && (
            <span
              className={
                isOutOfFence ? 'text-warning ml-1.5 font-medium' : 'text-muted ml-1.5'
              }
            >
              ({e.distance_from_office_m}m)
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {/* Lokasyon doğrulama rozeti — durum bazlı */}
          {e.review_status === 'rejected' ? (
            <span className="chip bg-danger/10 text-danger border border-danger/30 text-[10px]">
              <ShieldAlert className="size-3" />
              Reddedildi
            </span>
          ) : e.review_status === 'pending_review' ? (
            <span className="chip bg-warning/10 text-warning border border-warning/30 text-[10px]">
              <Camera className="size-3" />
              Onay bekliyor
            </span>
          ) : isNfc ? (
            <span className="chip bg-orange-100 text-orange-700 border border-orange-200 text-[10px]">
              <Lock className="size-3" />
              NFC (fiziksel temas)
            </span>
          ) : isOutOfFence ? (
            <span className="chip bg-warning/10 text-warning border border-warning/30 text-[10px]">
              <MapPin className="size-3" />
              Lokasyon dışı (onaylandı)
            </span>
          ) : e.distance_from_office_m != null ? (
            <span className="chip bg-success/10 text-success border border-success/30 text-[10px]">
              <ShieldCheck className="size-3" />
              Konum doğrulandı
            </span>
          ) : (
            <span className="chip bg-muted/10 text-muted border border-muted/20 text-[10px]">
              <Smartphone className="size-3" />
              Konum verisi yok
            </span>
          )}

          {/* Doğrulama yöntemleri */}
          {e.verification_methods?.length > 0 && (
            <span className="chip bg-orange-50 text-orange-700 border border-orange-100 text-[10px]">
              {e.verification_methods.join(' · ')}
            </span>
          )}

          {/* Anomali sebepleri (varsa) */}
          {(e.review_reasons ?? [])
            .filter((r) => r !== 'out_of_geofence') // zaten yukarıda gösterildi
            .map((r) => (
              <span
                key={r}
                className="chip bg-warning/10 text-warning border border-warning/20 text-[10px]"
              >
                {REASON_TR[r] ?? r}
              </span>
            ))}
        </div>
      </div>

      {/* Selfie thumbnail (varsa) */}
      {e.selfie_url && (
        <a
          href={e.selfie_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 block size-16 rounded-md overflow-hidden border border-warning/40 relative"
          title="Selfie'yi büyüt"
        >
          <img src={e.selfie_url} alt="Selfie" className="size-full object-cover" />
          <span className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition">
            <ExternalLink className="size-4 text-white" />
          </span>
        </a>
      )}

      {/* Trust score */}
      <div className="text-right shrink-0">
        <span
          className={`chip ${
            e.verification_score >= 80
              ? 'bg-success/10 text-success'
              : e.verification_score >= 60
                ? 'bg-warning/10 text-warning'
                : 'bg-danger/10 text-danger'
          } text-xs`}
        >
          {e.verification_score}/100
        </span>
      </div>
    </div>
  );
}
