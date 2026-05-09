import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Download,
  FileSpreadsheet,
  ShieldCheck,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

interface MonthlySummaryItem {
  user_id: string;
  full_name: string;
  email: string;
  department: string;
  worked_days: number;
  check_in_count: number;
  check_out_count: number;
  late_count: number;
  flagged_count: number;
  avg_trust: number;
  leave_days: number;
  overtime_minutes: number;
  overtime_hours: string;
  base_hours: number;
  total_hours: string;
}

interface MonthlySummaryResp {
  month: string;
  total_users: number;
  total_worked_days: number;
  total_overtime_minutes: number;
  items: MonthlySummaryItem[];
}

export function ManagerReportsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user && ['admin', 'owner'].includes(user.role);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading } = useQuery<MonthlySummaryResp>({
    queryKey: ['reports', 'monthly-summary', month],
    queryFn: async () => (await api.get(`/reports/monthly-summary?month=${month}`)).data,
  });

  const downloadCsv = async (
    endpoint: string,
    filename: string,
    extraQuery = '',
  ) => {
    setDownloading(endpoint);
    try {
      const r = await api.get(
        `/reports/${endpoint}?month=${month}&format=csv${extraQuery}`,
        { responseType: 'blob' },
      );
      const blob = new Blob([r.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}-${month}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`📥 ${filename} CSV indirildi`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setDownloading(null);
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <ClipboardList className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Raporlar</h1>
            <p className="text-sm text-muted">
              Aylık özet · bordro 3-1 · KVKK audit · fazla mesai detay
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="input w-auto"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      {/* CSV indirme butonları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ExportCard
          icon={<FileSpreadsheet className="size-5" />}
          title="Bordro 3-1"
          desc="Devam + izin + fazla mesai tek dosyada (her kişi için 1 satır)"
          onClick={() => downloadCsv('monthly-summary', 'bordro')}
          loading={downloading === 'monthly-summary'}
        />
        <ExportCard
          icon={<Download className="size-5" />}
          title="Devam Detay"
          desc="Her kullanıcı için aylık check_in/out sayıları + trust ortalaması"
          onClick={() => downloadCsv('attendance', 'devam')}
          loading={downloading === 'attendance'}
        />
        <ExportCard
          icon={<Download className="size-5" />}
          title="Fazla Mesai"
          desc="Onaylı fazla mesai kayıtları — sebep/onaylayan dahil"
          onClick={() => downloadCsv('overtime', 'overtime', '&status=approved')}
          loading={downloading === 'overtime'}
        />
        {isAdmin && (
          <ExportCard
            icon={<ShieldCheck className="size-5" />}
            title="KVKK Audit"
            desc="Hash chain doğrulamalı tüm event log — denetçiye verilebilir"
            onClick={() => downloadCsv('audit-export', 'audit')}
            loading={downloading === 'audit-export'}
            highlight="purple"
          />
        )}
      </div>

      {/* Bordro 3-1 önizleme tablo */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-display text-xl">Bordro 3-1 Önizleme — {month}</h2>
          {data && (
            <div className="text-xs text-muted">
              {data.total_users} kişi · {data.total_worked_days} çalışılan gün ·{' '}
              {Math.round(data.total_overtime_minutes / 60)} sa fazla mesai
            </div>
          )}
        </div>
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-orange-500 mx-auto my-8" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">Veri yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted border-b border-orange-100">
                <tr>
                  <th className="py-2 pr-2">Çalışan</th>
                  <th className="py-2 pr-2">Departman</th>
                  <th className="py-2 pr-2 text-right">Çalış.</th>
                  <th className="py-2 pr-2 text-right">Geç</th>
                  <th className="py-2 pr-2 text-right">İzin</th>
                  <th className="py-2 pr-2 text-right">F.Mesai</th>
                  <th className="py-2 pr-2 text-right">Toplam (sa)</th>
                  <th className="py-2 text-right">Trust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-50">
                {items.map((r) => (
                  <tr key={r.user_id}>
                    <td className="py-2 pr-2">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-muted">{r.email}</div>
                    </td>
                    <td className="py-2 pr-2 text-muted text-xs">
                      {r.department || '—'}
                    </td>
                    <td className="py-2 pr-2 text-right font-medium">
                      {r.worked_days}
                      <span className="text-[10px] text-muted ml-0.5">gün</span>
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {r.late_count > 0 ? (
                        <span className="text-warning font-medium">
                          {r.late_count}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {r.leave_days > 0 ? (
                        <span className="text-sky-600">{r.leave_days}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {r.overtime_minutes > 0 ? (
                        <span className="text-orange-600 font-medium">
                          {r.overtime_hours} sa
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right font-display font-semibold">
                      {r.total_hours}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={
                          r.avg_trust >= 80
                            ? 'text-success'
                            : r.avg_trust >= 60
                              ? 'text-warning'
                              : 'text-muted'
                        }
                      >
                        {r.avg_trust || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted text-center">
        💡 Excel'de açarken "UTF-8" kodlamasını seç — Türkçe karakterler doğru görünür.
      </p>
    </div>
  );
}

function ExportCard({
  icon,
  title,
  desc,
  onClick,
  loading,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  loading?: boolean;
  highlight?: 'purple';
}) {
  const ringClass =
    highlight === 'purple'
      ? 'border-purple-200 hover:border-purple-400 bg-purple-50/40'
      : 'hover:border-orange-400';
  const iconBg =
    highlight === 'purple'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-orange-100 text-orange-700';

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`card flex items-start gap-3 text-left transition disabled:opacity-60 ${ringClass}`}
    >
      <div
        className={`flex size-10 items-center justify-center rounded-lg shrink-0 ${iconBg}`}
      >
        {loading ? <Loader2 className="size-5 animate-spin" /> : icon}
      </div>
      <div className="flex-1">
        <div className="font-display font-semibold">{title}</div>
        <div className="text-xs text-muted leading-snug mt-0.5">{desc}</div>
      </div>
    </button>
  );
}
