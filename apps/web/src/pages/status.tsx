/**
 * Public status page — auth gerektirmez.
 *
 * Damga'nın iki ana endpoint'ini (web + api) son 24 saat boyunca gösterir:
 *   • Up/down rozet
 *   • Son ping latency
 *   • Uptime yüzdesi
 *   • Saatlik bucket grafiği (yeşil/kırmızı bar)
 *
 * Veri: GET /v1/status?range=24h|7d|30d (anon, no auth)
 */
import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, Clock, Globe, Server } from 'lucide-react';
import { env } from '@/lib/env';

interface Bucket {
  ts: string;
  up: number;
  down: number;
  avg_latency_ms: number;
}
interface ServiceStatus {
  target: 'web' | 'api';
  current: 'up' | 'down' | 'unknown';
  last_checked_at: string | null;
  last_status_code: number | null;
  last_latency_ms: number | null;
  uptime_pct: number;
  total_checks: number;
  up_checks: number;
  avg_latency_ms: number;
  buckets: Bucket[];
}
interface StatusResponse {
  range: string;
  generated_at: string;
  services: ServiceStatus[];
}

const RANGES: Array<{ key: '24h' | '7d' | '30d'; label: string }> = [
  { key: '24h', label: 'Son 24 saat' },
  { key: '7d', label: 'Son 7 gün' },
  { key: '30d', label: 'Son 30 gün' },
];

const SERVICE_INFO: Record<'web' | 'api', { name: string; url: string; Icon: typeof Globe }> = {
  web: { name: 'Web (damga.deploi.net)', url: 'https://damga.deploi.net', Icon: Globe },
  api: { name: 'API (api.damga.deploi.net/v1/health)', url: 'https://api.damga.deploi.net/v1/health', Icon: Server },
};

export function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    fetch(`${env.apiUrl}/status?range=${range}`)
      .then((r) => r.json())
      .then((d: StatusResponse) => {
        if (!cancel) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError(e instanceof Error ? e.message : 'Bilinmeyen hata');
          setLoading(false);
        }
      });
    // 30 saniyede bir refresh (canlı görünüm)
    const id = setInterval(() => {
      fetch(`${env.apiUrl}/status?range=${range}`)
        .then((r) => r.json())
        .then((d: StatusResponse) => {
          if (!cancel) setData(d);
        })
        .catch(() => {});
    }, 30_000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [range]);

  const allUp = useMemo(() => {
    if (!data) return null;
    return data.services.every((s) => s.current === 'up');
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Damga Status</h1>
              <p className="text-sm text-zinc-500">Şeffaf çalışma raporu</p>
            </div>
          </div>
          <a
            href="https://damga.deploi.net"
            className="text-sm text-blue-600 hover:underline"
          >
            damga.deploi.net →
          </a>
        </div>

        {/* Overall banner */}
        <div
          className={`rounded-2xl p-6 mb-6 flex items-center gap-4 ${
            allUp === null
              ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600'
              : allUp
              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
        >
          {allUp === null ? (
            <Clock className="w-8 h-8" />
          ) : allUp ? (
            <CheckCircle2 className="w-8 h-8" />
          ) : (
            <AlertTriangle className="w-8 h-8" />
          )}
          <div>
            <div className="text-lg font-semibold">
              {allUp === null
                ? 'Veri yükleniyor...'
                : allUp
                ? 'Tüm sistemler çalışıyor'
                : 'Bazı servislerde sorun var'}
            </div>
            {data && (
              <div className="text-xs opacity-70">
                Son güncelleme: {new Date(data.generated_at).toLocaleString('tr-TR')}
              </div>
            )}
          </div>
        </div>

        {/* Range tabs */}
        <div className="flex gap-2 mb-4">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                range === r.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Service cards */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-4 mb-4">
            Status verisi alınamadı: {error}
          </div>
        )}
        {!loading && data && (
          <div className="space-y-4">
            {data.services.map((svc) => (
              <ServiceCard key={svc.target} svc={svc} />
            ))}
          </div>
        )}
        {loading && !data && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl bg-white dark:bg-zinc-800 p-6 h-40 animate-pulse"
              />
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-zinc-500">
          Damga internal monitor • 5 dakika interval • Her saat saatlik özet • 90 gün veri saklama
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ svc }: { svc: ServiceStatus }) {
  const info = SERVICE_INFO[svc.target];
  const Icon = info.Icon;
  const statusColor =
    svc.current === 'up'
      ? 'bg-emerald-500'
      : svc.current === 'down'
      ? 'bg-red-500'
      : 'bg-zinc-400';
  const statusLabel =
    svc.current === 'up' ? 'Çalışıyor' : svc.current === 'down' ? 'Çalışmıyor' : 'Bilinmiyor';

  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-800 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-zinc-500" />
          <div>
            <div className="font-semibold">{info.name}</div>
            <a href={info.url} className="text-xs text-blue-600 hover:underline">
              {info.url}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
          <span className="text-sm font-medium">{statusLabel}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 text-center mb-4">
        <div>
          <div className="text-xs text-zinc-500">Uptime</div>
          <div className="text-xl font-bold">
            {svc.total_checks > 0 ? `${svc.uptime_pct.toFixed(2)}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Son yanıt</div>
          <div className="text-xl font-bold">
            {svc.last_latency_ms !== null ? `${svc.last_latency_ms}ms` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Ort. yanıt</div>
          <div className="text-xl font-bold">
            {svc.avg_latency_ms > 0 ? `${svc.avg_latency_ms}ms` : '—'}
          </div>
        </div>
      </div>

      {/* Bucket bars */}
      <div className="flex gap-px h-10 items-end" title="Her bar bir zaman dilimi (yeşil=up, kırmızı=down)">
        {svc.buckets.length === 0 ? (
          <div className="text-xs text-zinc-500 self-center px-2">
            Henüz veri yok (5 dk sonra ilk ping)
          </div>
        ) : (
          svc.buckets.map((b, i) => {
            const total = b.up + b.down;
            const upPct = total > 0 ? b.up / total : 0;
            const color =
              upPct === 1
                ? 'bg-emerald-500'
                : upPct >= 0.95
                ? 'bg-emerald-400'
                : upPct >= 0.5
                ? 'bg-amber-400'
                : 'bg-red-500';
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm ${color}`}
                style={{ height: '100%' }}
                title={`${new Date(b.ts).toLocaleString('tr-TR')}: ${b.up} up / ${b.down} down · avg ${b.avg_latency_ms}ms`}
              />
            );
          })
        )}
      </div>
      <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
        <span>Eski</span>
        <span>{svc.total_checks} ölçüm</span>
        <span>Şimdi</span>
      </div>

      {svc.last_checked_at && (
        <div className="text-xs text-zinc-500 mt-3">
          Son kontrol: {new Date(svc.last_checked_at).toLocaleString('tr-TR')}
          {svc.last_status_code !== null && ` · HTTP ${svc.last_status_code}`}
        </div>
      )}
    </div>
  );
}
