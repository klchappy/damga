import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  Clock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';

interface HeatmapResp {
  cells: { dow: number; hour: number; count: number }[];
  late_cells: { dow: number; hour: number; count: number }[];
}
interface DeptResp {
  items: {
    department: string;
    total_checkins: number;
    avg_trust: number;
    late_count: number;
    late_pct: number;
    unique_users: number;
    approved_overtime_minutes: number;
  }[];
}
interface TrendResp {
  items: { day: string; total: number; avg_trust: number; late: number }[];
}
interface TopLateResp {
  items: {
    user_id: string;
    full_name: string;
    department: string | null;
    avatar_url: string | null;
    late_count: number;
    avg_min_late: number;
  }[];
}

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];

export function ManagerAnalyticsPage() {
  const [days, setDays] = useState<number>(30);

  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [days]);
  const dateTo = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const range = `?date_from=${dateFrom}&date_to=${dateTo}`;

  const { data: heatmap, isLoading: hmLoad } = useQuery<HeatmapResp>({
    queryKey: ['analytics', 'heatmap', dateFrom, dateTo],
    queryFn: async () => (await api.get('/analytics/heatmap' + range)).data,
  });
  const { data: dept, isLoading: dpLoad } = useQuery<DeptResp>({
    queryKey: ['analytics', 'dept', dateFrom, dateTo],
    queryFn: async () => (await api.get('/analytics/dept-compare' + range)).data,
  });
  const { data: trend, isLoading: trLoad } = useQuery<TrendResp>({
    queryKey: ['analytics', 'trend', dateFrom, dateTo],
    queryFn: async () => (await api.get('/analytics/trend' + range)).data,
  });
  const { data: topLate } = useQuery<TopLateResp>({
    queryKey: ['analytics', 'top-late', dateFrom, dateTo],
    queryFn: async () => (await api.get('/analytics/top-late' + range)).data,
  });

  // Heatmap data: build 7×24 grid (dow 1-7, hour 0-23). Heatmap'te 06-22 arası göster.
  const grid = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of heatmap?.cells ?? []) map[`${c.dow}-${c.hour}`] = c.count;
    return map;
  }, [heatmap]);
  const lateGrid = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of heatmap?.late_cells ?? []) map[`${c.dow}-${c.hour}`] = c.count;
    return map;
  }, [heatmap]);
  const maxCount = useMemo(() => {
    let max = 0;
    for (const v of Object.values(grid)) if (v > max) max = v;
    return max;
  }, [grid]);

  const hours = Array.from({ length: 17 }).map((_, i) => i + 6); // 06-22

  // Trend chart - simple SVG line
  const trendItems = trend?.items ?? [];
  const maxTrend = Math.max(1, ...trendItems.map((i) => i.total));
  const trendW = 600;
  const trendH = 100;
  const trendPath = trendItems
    .map((p, i) => {
      const x = trendItems.length > 1 ? (i / (trendItems.length - 1)) * trendW : trendW / 2;
      const y = trendH - (p.total / maxTrend) * (trendH - 10) - 5;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const latePath = trendItems
    .map((p, i) => {
      const x = trendItems.length > 1 ? (i / (trendItems.length - 1)) * trendW : trendW / 2;
      const y = trendH - (p.late / maxTrend) * (trendH - 10) - 5;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const maxDept = Math.max(1, ...(dept?.items ?? []).map((d) => d.total_checkins));

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <BarChart3 className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Analitik</h1>
            <p className="text-sm text-muted">
              Geç gelme heatmap'i, departman karşılaştırması, günlük trend.
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                days === d
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-muted border-orange-100 hover:bg-orange-50'
              }`}
            >
              Son {d} gün
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap */}
      <section className="card">
        <h2 className="font-display text-xl mb-2 flex items-center gap-2">
          <Clock className="size-5 text-orange-500" />
          Geç Gelme Heatmap
        </h2>
        <p className="text-xs text-muted mb-3">
          Hangi gün hangi saatte kaç check_in oluyor. Koyu = yoğun, kırmızı kenar = geç (≥09:15).
        </p>
        {hmLoad ? (
          <Loader2 className="size-5 animate-spin text-orange-500 mx-auto my-8" />
        ) : (
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-[10px]">
              <thead>
                <tr>
                  <th></th>
                  {hours.map((h) => (
                    <th key={h} className="text-center text-muted font-normal w-7">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_LABELS.map((d, idx) => {
                  const dow = idx + 1; // ISO 1-7
                  return (
                    <tr key={d}>
                      <th className="text-right pr-2 text-muted font-normal">{d}</th>
                      {hours.map((h) => {
                        const count = grid[`${dow}-${h}`] ?? 0;
                        const lateCount = lateGrid[`${dow}-${h}`] ?? 0;
                        const intensity =
                          maxCount > 0 ? Math.min(1, count / maxCount) : 0;
                        const bg = `rgba(249, 115, 22, ${0.05 + intensity * 0.85})`;
                        return (
                          <td
                            key={h}
                            className={`size-7 rounded-sm border text-center align-middle font-medium ${
                              lateCount > 0 ? 'border-danger/50' : 'border-orange-100'
                            } ${count === 0 ? 'text-transparent' : 'text-ink'}`}
                            style={{ backgroundColor: bg }}
                            title={`${d} ${h}:00 — ${count} check_in${
                              lateCount > 0 ? ` (${lateCount} geç)` : ''
                            }`}
                          >
                            {count || ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Trend */}
      <section className="card">
        <h2 className="font-display text-xl mb-2 flex items-center gap-2">
          <TrendingUp className="size-5 text-orange-500" />
          Günlük Trend
        </h2>
        <p className="text-xs text-muted mb-3">
          Turuncu = toplam check_in, kırmızı = geç gelen.
        </p>
        {trLoad ? (
          <Loader2 className="size-5 animate-spin text-orange-500 mx-auto my-8" />
        ) : trendItems.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted">Bu aralıkta veri yok.</div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${trendW} ${trendH + 20}`}
              className="w-full h-32"
              preserveAspectRatio="none"
            >
              {/* y-axis lines */}
              {[0.25, 0.5, 0.75].map((p) => (
                <line
                  key={p}
                  x1={0}
                  x2={trendW}
                  y1={trendH - p * (trendH - 10) - 5}
                  y2={trendH - p * (trendH - 10) - 5}
                  stroke="#fde4d0"
                  strokeWidth={0.5}
                />
              ))}
              <path d={trendPath} stroke="#f97316" strokeWidth={2} fill="none" />
              <path d={latePath} stroke="#ef4444" strokeWidth={1.5} fill="none" strokeDasharray="3,2" />
              {trendItems.map((p, i) => {
                const x = trendItems.length > 1 ? (i / (trendItems.length - 1)) * trendW : trendW / 2;
                const y = trendH - (p.total / maxTrend) * (trendH - 10) - 5;
                return <circle key={i} cx={x} cy={y} r={2} fill="#f97316" />;
              })}
            </svg>
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>{trendItems[0]?.day}</span>
              <span>max: {maxTrend}</span>
              <span>{trendItems[trendItems.length - 1]?.day}</span>
            </div>
          </>
        )}
      </section>

      {/* Departman karşılaştırma */}
      <section className="card">
        <h2 className="font-display text-xl mb-3 flex items-center gap-2">
          <BarChart3 className="size-5 text-orange-500" />
          Departman Karşılaştırma
        </h2>
        {dpLoad ? (
          <Loader2 className="size-5 animate-spin text-orange-500 mx-auto my-8" />
        ) : (dept?.items ?? []).length === 0 ? (
          <div className="text-center py-6 text-sm text-muted">Departman verisi yok.</div>
        ) : (
          <div className="space-y-3">
            {dept!.items
              .sort((a, b) => b.total_checkins - a.total_checkins)
              .map((d) => (
                <div key={d.department} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{d.department}</span>
                      <span className="text-xs text-muted ml-2">
                        {d.unique_users} kişi · trust ort. {d.avg_trust}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted">{d.total_checkins} damga</span>
                      <span
                        className={`px-2 py-0.5 rounded-md ${
                          d.late_pct >= 20
                            ? 'bg-danger/10 text-danger'
                            : d.late_pct >= 10
                              ? 'bg-warning/10 text-warning'
                              : 'bg-success/10 text-success'
                        }`}
                      >
                        %{d.late_pct} geç
                      </span>
                      {d.approved_overtime_minutes > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-700">
                          +{Math.round(d.approved_overtime_minutes / 60)}sa mesai
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-orange-100 overflow-hidden flex">
                    <div
                      className="h-full bg-orange-500"
                      style={{
                        width: `${(d.total_checkins / maxDept) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Top late */}
      <section className="card">
        <h2 className="font-display text-xl mb-3 flex items-center gap-2">
          <AlertTriangle className="size-5 text-orange-500" />
          En Çok Geç Kalanlar
        </h2>
        {(topLate?.items ?? []).length === 0 ? (
          <div className="text-center py-6 text-sm text-muted">
            Bu aralıkta geç gelme yok 👍
          </div>
        ) : (
          <ul className="divide-y divide-orange-50">
            {topLate!.items.map((u, i) => (
              <li key={u.user_id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg text-muted w-5 text-center">
                    {i + 1}
                  </span>
                  <div className="flex size-8 items-center justify-center rounded-md bg-orange-100 text-orange-700 font-semibold text-xs overflow-hidden">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={u.full_name}
                        className="size-full object-cover"
                      />
                    ) : (
                      u.full_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{u.full_name}</div>
                    {u.department && (
                      <div className="text-[10px] text-muted">{u.department}</div>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-medium">{u.late_count} kez geç</div>
                  <div className="text-muted">ort. {u.avg_min_late} dk gecikme</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
