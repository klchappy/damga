/**
 * Aylık Puantaj — Kılıç Enerji formatında renkli grid.
 *
 * Damga'nın event-bazlı verisinden türetilmiş X/H/RX/R/IZ/G/DI/YI kodlu
 * geleneksel puantaj tablosu. Excel export aynı endpoint'ten (?format=xlsx).
 *
 * Şu an READ-ONLY. Manuel düzenleme manager onayıyla event override veya
 * leave entry üzerinden yapılmalı (gelecek faz: doğrudan kod düzenleme).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Loader2, ClipboardCheck, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '@/lib/api';

type PuantajCode = 'X' | 'H' | 'RX' | 'R' | 'IZ' | 'G' | 'DI' | 'YI';

interface CodeMeta {
  tr: string;
  color: string;
  excelText: string;
}

interface PuantajSummary {
  worked: number;
  rx_count: number;
  h_count: number;
  r_count: number;
  iz_count: number;
  yi_count: number;
  di_count: number;
  g_count: number;
}

interface PuantajRowJSON {
  idx: number;
  full_name: string;
  position: string;
  codes: Record<string, PuantajCode>;
  summary: PuantajSummary;
}

interface PuantajResp {
  month: string;
  month_name: string;
  year: number;
  org_name: string;
  days_in_month: number;
  days: string[]; // YYYY-MM-DD
  codes: Record<PuantajCode, CodeMeta>;
  rows: PuantajRowJSON[];
}

const TR_DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay();
  return wd === 0 || wd === 6;
}

function weekdayShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return TR_DAYS_SHORT[dt.getUTCDay()] ?? '?';
}

export function ManagerPuantajPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, error } = useQuery<PuantajResp>({
    queryKey: ['puantaj', month],
    queryFn: async () => (await api.get(`/reports/puantaj?month=${month}`)).data,
  });

  const downloadXlsx = async () => {
    setDownloading(true);
    try {
      const r = await api.get(`/reports/puantaj?month=${month}&format=xlsx`, {
        responseType: 'blob',
      });
      const blob = new Blob([r.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `puantaj-${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('📥 Puantaj Excel indirildi');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  const codes = data?.codes ?? ({} as Record<PuantajCode, CodeMeta>);
  const allCodes: PuantajCode[] = ['X', 'H', 'RX', 'R', 'IZ', 'G', 'DI', 'YI'];

  return (
    <div className="container mx-auto max-w-[1400px] px-3 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/manager/reports"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-zinc-200 hover:bg-zinc-50"
            title="Raporlara dön"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[#1d6f8a] text-white">
            <ClipboardCheck className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl">📋 Aylık Puantaj</h1>
            <p className="text-sm text-muted">
              {data?.org_name ?? ''} — {data?.month_name ?? ''} {data?.year ?? ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button
            type="button"
            onClick={downloadXlsx}
            disabled={downloading || !data || data.rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#27ae60] hover:bg-[#229954] text-white px-4 py-2 font-semibold text-sm disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Excel İndir
          </button>
        </div>
      </div>

      {/* Loading / error / empty */}
      {isLoading && (
        <div className="card flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#1d6f8a]" />
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50 text-red-700 text-sm">
          {getErrorMessage(error)}
        </div>
      )}

      {data && data.rows.length === 0 && (
        <div className="card text-center py-12 text-muted text-sm">
          Bu ayda aktif personel bulunmuyor.
        </div>
      )}

      {/* Puantaj table */}
      {data && data.rows.length > 0 && (
        <div className="card !p-3 overflow-x-auto">
          <table className="border-collapse text-[11px] min-w-full">
            <thead>
              <tr>
                <th
                  className="bg-[#1d6f8a] text-white px-1 py-1 sticky top-0 z-10"
                  style={{ width: 28 }}
                >
                  #
                </th>
                <th
                  className="bg-[#1d6f8a] text-white px-2 py-1 text-left sticky top-0 z-10"
                  style={{ minWidth: 140 }}
                >
                  Adı Soyadı
                </th>
                <th
                  className="bg-[#1d6f8a] text-white px-2 py-1 text-left sticky top-0 z-10"
                  style={{ minWidth: 130 }}
                >
                  Pozisyon
                </th>
                {data.days.map((dateStr) => {
                  const day = dateStr.slice(-2);
                  const wkd = weekdayShort(dateStr);
                  const wknd = isWeekend(dateStr);
                  return (
                    <th
                      key={dateStr}
                      className={`text-white text-center px-0 py-1 sticky top-0 z-10 ${
                        wknd ? 'bg-[#8a7d1d]' : 'bg-[#1d6f8a]'
                      }`}
                      style={{ width: 32, minWidth: 32 }}
                      title={`${wkd} ${parseInt(day, 10)}`}
                    >
                      <div className="text-[9px] opacity-80">{wkd}</div>
                      <div className="text-[11px] font-bold">{parseInt(day, 10)}</div>
                    </th>
                  );
                })}
                <th
                  className="bg-[#145a6e] text-white px-1 py-1 sticky top-0 z-10"
                  style={{ minWidth: 50 }}
                  title="Çalıştığı Gün (X+RX)"
                >
                  <div className="text-[9px] opacity-80">Toplam</div>
                  <div className="text-[10px] font-bold">Çalış</div>
                </th>
                <th
                  className="bg-[#145a6e] text-white px-1 py-1 sticky top-0 z-10"
                  style={{ minWidth: 40 }}
                  title="Resmi Tatil Çalışması"
                >
                  RX
                </th>
                <th
                  className="bg-[#145a6e] text-white px-1 py-1 sticky top-0 z-10"
                  style={{ minWidth: 40 }}
                  title="Hafta Tatili"
                >
                  H
                </th>
                <th
                  className="bg-[#145a6e] text-white px-1 py-1 sticky top-0 z-10"
                  style={{ minWidth: 40 }}
                  title="Rapor"
                >
                  R
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr
                  key={`${row.idx}-${row.full_name}`}
                  className={i % 2 === 1 ? 'bg-[#f0f5f8]' : 'bg-white'}
                >
                  <td className="text-center text-[11px] text-zinc-500 font-bold border border-zinc-200 px-1 py-1">
                    {row.idx}
                  </td>
                  <td className="text-left font-semibold whitespace-nowrap border border-zinc-200 px-2 py-1">
                    {row.full_name}
                  </td>
                  <td className="text-left text-zinc-600 whitespace-nowrap border border-zinc-200 px-2 py-1 text-[10px]">
                    {row.position || '—'}
                  </td>
                  {data.days.map((dateStr) => {
                    const code = row.codes[dateStr];
                    const wknd = isWeekend(dateStr);
                    let bg = wknd ? '#fffde0' : '#f0f0f0';
                    let fg = wknd ? '#ccc' : '#bbb';
                    let txt = '';
                    if (code) {
                      const meta = codes[code];
                      bg = '#' + (meta?.color ?? 'ffffff');
                      fg = code === 'RX' || code === 'YI' ? 'white' : '#1f2933';
                      txt = meta?.excelText ?? code;
                    }
                    return (
                      <td
                        key={dateStr}
                        className="border border-zinc-200 p-0"
                        style={{ width: 32, height: 26 }}
                      >
                        <div
                          className="w-full h-full flex items-center justify-center font-black text-[10px]"
                          style={{ background: bg, color: fg }}
                          title={code ? `${code} - ${codes[code]?.tr ?? ''}` : 'Kayıt yok'}
                        >
                          {txt}
                        </div>
                      </td>
                    );
                  })}
                  <td
                    className="text-center font-bold text-[11px] border border-zinc-200 px-1 py-1"
                    style={{ color: '#1a5e00' }}
                  >
                    {row.summary.worked}
                  </td>
                  <td
                    className="text-center font-bold text-[11px] border border-zinc-200 px-1 py-1"
                    style={{ color: '#1a2e6e' }}
                  >
                    {row.summary.rx_count}
                  </td>
                  <td
                    className="text-center font-bold text-[11px] border border-zinc-200 px-1 py-1"
                    style={{ color: '#5c5c00' }}
                  >
                    {row.summary.h_count}
                  </td>
                  <td
                    className="text-center font-bold text-[11px] border border-zinc-200 px-1 py-1"
                    style={{ color: '#7a0000' }}
                  >
                    {row.summary.r_count}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={3}
                  className="text-right pr-2 py-1.5 bg-[#e0eaf0] border-t-2 border-[#1d6f8a] font-bold text-[11px]"
                >
                  Toplam ({data.rows.length} kişi):
                </td>
                {data.days.map((dateStr) => (
                  <td key={dateStr} className="bg-[#e0eaf0] border border-zinc-200" />
                ))}
                <td
                  className="text-center bg-[#e0eaf0] border border-zinc-200 font-bold text-[11px]"
                  style={{ color: '#1a5e00' }}
                >
                  {data.rows.reduce((s, r) => s + r.summary.worked, 0)}
                </td>
                <td
                  className="text-center bg-[#e0eaf0] border border-zinc-200 font-bold text-[11px]"
                  style={{ color: '#1a2e6e' }}
                >
                  {data.rows.reduce((s, r) => s + r.summary.rx_count, 0)}
                </td>
                <td
                  className="text-center bg-[#e0eaf0] border border-zinc-200 font-bold text-[11px]"
                  style={{ color: '#5c5c00' }}
                >
                  {data.rows.reduce((s, r) => s + r.summary.h_count, 0)}
                </td>
                <td
                  className="text-center bg-[#e0eaf0] border border-zinc-200 font-bold text-[11px]"
                  style={{ color: '#7a0000' }}
                >
                  {data.rows.reduce((s, r) => s + r.summary.r_count, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend */}
      {data && (
        <div className="card">
          <h3 className="font-semibold text-sm mb-3">Kod Açıklamaları</h3>
          <div className="flex flex-wrap gap-2">
            {allCodes.map((code) => {
              const meta = codes[code];
              if (!meta) return null;
              const isLight = ['X', 'H', 'IZ', 'G', 'DI'].includes(code);
              return (
                <div
                  key={code}
                  className="inline-flex items-center gap-2 px-2 py-1 rounded text-[11px] border border-zinc-200"
                >
                  <span
                    className="inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-black"
                    style={{
                      background: '#' + meta.color,
                      color: isLight ? '#1f2933' : 'white',
                    }}
                  >
                    {meta.excelText}
                  </span>
                  <span className="text-zinc-700">{meta.tr}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted mt-3 leading-relaxed">
            💡 Kodlar Damga'nın check-in event'lerinden ve onaylı izinlerden{' '}
            <strong>otomatik türetiliyor</strong>. Manuel düzeltme için: ilgili çalışana izin
            onayla veya check-in'e admin notu düş.
          </p>
        </div>
      )}
    </div>
  );
}
