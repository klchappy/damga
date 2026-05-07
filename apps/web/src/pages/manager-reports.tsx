import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { api } from '@/lib/api';

interface AttendanceRow {
  userId: string;
  fullName: string;
  email: string;
  department: string | null;
  checkIns: number;
  checkOuts: number;
  flaggedCount: number;
  avgScore: number | null;
}

export function ManagerReportsPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data } = useQuery<{ items: AttendanceRow[] }>({
    queryKey: ['reports', 'attendance', month],
    queryFn: async () => (await api.get(`/reports/attendance?month=${month}`)).data,
  });

  const downloadCsv = async (kind: 'attendance' | 'payroll') => {
    const res = await api.get(`/reports/${kind}?month=${month}&format=csv`, {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `damga-${kind}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">📊 Raporlar</h1>
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="input w-auto"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button onClick={() => downloadCsv('attendance')} className="btn-outline">
            <Download className="size-4" /> Devam CSV
          </button>
          <button onClick={() => downloadCsv('payroll')} className="btn-outline">
            <FileSpreadsheet className="size-4" /> Bordro CSV
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl mb-3">Aylık devam — {month}</h2>
        {(data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted">Veri yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2">Çalışan</th>
                  <th className="py-2">Departman</th>
                  <th className="py-2 text-right">Giriş</th>
                  <th className="py-2 text-right">Çıkış</th>
                  <th className="py-2 text-right">Bayraklı</th>
                  <th className="py-2 text-right">Ort. Trust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-100">
                {data!.items.map((r) => (
                  <tr key={r.userId}>
                    <td className="py-2">
                      <div className="font-medium">{r.fullName}</div>
                      <div className="text-xs text-muted">{r.email}</div>
                    </td>
                    <td className="py-2 text-muted">{r.department ?? '—'}</td>
                    <td className="py-2 text-right">{r.checkIns}</td>
                    <td className="py-2 text-right">{r.checkOuts}</td>
                    <td className="py-2 text-right">
                      {r.flaggedCount > 0 ? (
                        <span className="text-warning">{r.flaggedCount}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 text-right">{r.avgScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
