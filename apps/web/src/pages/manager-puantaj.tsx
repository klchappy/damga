/**
 * Aylık Puantaj — Kılıç Enerji formatında renkli grid + manuel override.
 *
 * Damga'nın event-bazlı verisinden türetilmiş X/H/RX/R/IZ/G/DI/YI kodlu
 * geleneksel puantaj tablosu. Excel export aynı endpoint'ten (?format=xlsx).
 *
 * Manager/admin bir hücreye tıklayınca 8 kod + "Auto'ya dön" seçenekli popup
 * açılır. Override yapılınca audit log'a düşer + hücrede küçük nokta belirir.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Loader2, ClipboardCheck, ArrowLeft, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

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
  user_id: string;
  full_name: string;
  position: string;
  codes: Record<string, PuantajCode>;
  sources: Record<string, 'auto' | 'override'>;
  override_meta: Record<
    string,
    { reason: string | null; set_by: string; updated_at: string }
  >;
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
const ALL_CODES: PuantajCode[] = ['X', 'H', 'RX', 'R', 'IZ', 'G', 'DI', 'YI'];

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

interface PickerState {
  user_id: string;
  user_name: string;
  date: string;
  current_code: PuantajCode | null;
  is_override: boolean;
  x: number;
  y: number;
}

export function ManagerPuantajPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = !!user && ['manager', 'admin', 'owner'].includes(user.role);
  const qc = useQueryClient();

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [downloading, setDownloading] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [reasonText, setReasonText] = useState('');

  const { data, isLoading, error } = useQuery<PuantajResp>({
    queryKey: ['puantaj', month],
    queryFn: async () => (await api.get(`/reports/puantaj?month=${month}`)).data,
  });

  // Mutations
  const setOverride = useMutation({
    mutationFn: async (vars: {
      user_id: string;
      date: string;
      code: PuantajCode;
      reason?: string | null;
    }) => {
      const { data } = await api.post('/reports/puantaj/override', vars);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['puantaj', month] });
      toast.success('Puantaj kodu güncellendi');
      setPicker(null);
      setReasonText('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const clearOverride = useMutation({
    mutationFn: async (vars: { user_id: string; date: string }) => {
      const { data } = await api.delete('/reports/puantaj/override', {
        params: vars,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['puantaj', month] });
      toast.success('Manuel düzeltme kaldırıldı — otomatik kodlamaya geri dönüldü');
      setPicker(null);
      setReasonText('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Popup ESC ile kapansın + dışına click
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPicker(null);
        setReasonText('');
      }
    };
    const onClick = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node)
      ) {
        setPicker(null);
        setReasonText('');
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [picker]);

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

  const openPicker = (
    row: PuantajRowJSON,
    dateStr: string,
    event: React.MouseEvent<HTMLTableCellElement>,
  ) => {
    if (!canEdit) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const isOverride = row.sources[dateStr] === 'override';
    setPicker({
      user_id: row.user_id,
      user_name: row.full_name,
      date: dateStr,
      current_code: row.codes[dateStr] ?? null,
      is_override: isOverride,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height,
    });
    setReasonText('');
  };

  const codes = data?.codes ?? ({} as Record<PuantajCode, CodeMeta>);

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
              {canEdit && (
                <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                  düzenleme aktif
                </span>
              )}
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
                  key={row.user_id}
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
                    const isOverride = row.sources[dateStr] === 'override';
                    const meta = row.override_meta[dateStr];
                    const wknd = isWeekend(dateStr);
                    let bg = wknd ? '#fffde0' : '#f0f0f0';
                    let fg = wknd ? '#ccc' : '#bbb';
                    let txt = '';
                    if (code) {
                      const cm = codes[code];
                      bg = '#' + (cm?.color ?? 'ffffff');
                      fg = code === 'RX' || code === 'YI' ? 'white' : '#1f2933';
                      txt = cm?.excelText ?? code;
                    }
                    const tooltipParts: string[] = [];
                    if (code) tooltipParts.push(`${code} - ${codes[code]?.tr ?? ''}`);
                    else tooltipParts.push('Kayıt yok');
                    if (isOverride && meta) {
                      tooltipParts.push(
                        `Manuel düzeltme · ${new Date(meta.updated_at).toLocaleString('tr-TR')}`,
                      );
                      if (meta.reason) tooltipParts.push(`Gerekçe: ${meta.reason}`);
                    }
                    return (
                      <td
                        key={dateStr}
                        className={`border border-zinc-200 p-0 relative ${
                          canEdit ? 'cursor-pointer hover:brightness-90' : ''
                        }`}
                        style={{ width: 32, height: 26 }}
                        onClick={(e) => openPicker(row, dateStr, e)}
                        title={tooltipParts.join('\n')}
                      >
                        <div
                          className="w-full h-full flex items-center justify-center font-black text-[10px]"
                          style={{ background: bg, color: fg }}
                        >
                          {txt}
                        </div>
                        {isOverride && (
                          <span
                            className="absolute top-0.5 right-0.5 inline-block w-1.5 h-1.5 rounded-full bg-purple-600 border border-white"
                            title="Manuel düzeltme"
                          />
                        )}
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

      {/* Code picker popup */}
      {picker && data && (
        <div
          ref={pickerRef}
          className="fixed z-50 bg-white border border-zinc-200 rounded-xl shadow-2xl p-3 min-w-[260px]"
          style={{
            left: Math.min(picker.x - 130, window.innerWidth - 280),
            top: Math.min(picker.y + 4, window.innerHeight - 360),
          }}
        >
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-100">
            <div className="text-xs text-zinc-500">
              <div className="font-semibold text-zinc-700">{picker.user_name}</div>
              <div>{picker.date}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPicker(null);
                setReasonText('');
              }}
              className="p-1 hover:bg-zinc-100 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {ALL_CODES.map((code) => {
              const cm = codes[code];
              const isCurrent = picker.current_code === code;
              const isLight = ['X', 'H', 'IZ', 'G', 'DI'].includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setOverride.mutate({
                      user_id: picker.user_id,
                      date: picker.date,
                      code,
                      reason: reasonText.trim() || null,
                    });
                  }}
                  disabled={setOverride.isPending}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] border transition disabled:opacity-50 ${
                    isCurrent
                      ? 'border-purple-600 ring-1 ring-purple-300'
                      : 'border-zinc-200 hover:border-zinc-400'
                  }`}
                  title={cm?.tr}
                >
                  <span
                    className="inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-black shrink-0"
                    style={{
                      background: '#' + (cm?.color ?? 'ffffff'),
                      color: isLight ? '#1f2933' : 'white',
                    }}
                  >
                    {cm?.excelText ?? code}
                  </span>
                  <span className="truncate text-zinc-700">{cm?.tr ?? code}</span>
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Gerekçe (opsiyonel) — örn: check-in unutuldu"
            className="w-full text-[11px] px-2 py-1.5 border border-zinc-200 rounded mb-2"
            maxLength={500}
          />

          {picker.is_override && (
            <button
              type="button"
              onClick={() => {
                clearOverride.mutate({
                  user_id: picker.user_id,
                  date: picker.date,
                });
              }}
              disabled={clearOverride.isPending}
              className="w-full text-[11px] px-2 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded text-zinc-700 font-medium disabled:opacity-50"
            >
              {clearOverride.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mx-auto" />
              ) : (
                "↺ Manuel düzeltmeyi kaldır (otomatik kodlamaya dön)"
              )}
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      {data && (
        <div className="card">
          <h3 className="font-semibold text-sm mb-3">Kod Açıklamaları</h3>
          <div className="flex flex-wrap gap-2">
            {ALL_CODES.map((code) => {
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
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded text-[11px] border border-purple-200 bg-purple-50">
              <span className="relative inline-flex items-center justify-center w-7 h-5 rounded bg-zinc-100">
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-purple-600 border border-white" />
              </span>
              <span className="text-purple-700">Manuel düzeltilmiş hücre</span>
            </div>
          </div>
          <p className="text-xs text-muted mt-3 leading-relaxed">
            💡 Kodlar Damga'nın check-in event'lerinden ve onaylı izinlerden{' '}
            <strong>otomatik türetiliyor</strong>.{' '}
            {canEdit ? (
              <>
                Manuel düzeltme: bir hücreye tıkla, doğru kodu seç (opsiyonel
                gerekçe yaz). Düzeltmeler audit log'a düşer.
              </>
            ) : (
              <>Manuel düzeltme için manager/admin/owner yetkisi gerekir.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
