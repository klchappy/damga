import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Plane,
  Upload,
  UtensilsCrossed,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

type Tab = 'menus' | 'leaves';

interface MenuRowExcel {
  date: string;
  main_dish: string;
  description?: string;
  calories?: number;
  allergens?: string;
  is_vegetarian?: boolean;
  is_vegan?: boolean;
}

interface MenuRowApi {
  date: string;
  main_dish: string;
  description?: string;
  calories?: number;
  allergens?: string[];
  is_vegetarian?: boolean;
  is_vegan?: boolean;
}

interface LeaveRow {
  user_email: string;
  type: string;
  start_date: string;
  end_date: string;
  reason?: string;
}

const LEAVE_TYPES = ['annual', 'sick', 'unpaid', 'maternity', 'paternity', 'compassionate'];
const ALLERGENS = ['gluten', 'lactose', 'nuts', 'shellfish', 'egg'];
const MAX_IMPORT_FILE_BYTES = 1_000_000;
const MAX_IMPORT_ROWS = 500;
const BLOCKED_IMPORT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv<T extends object>(filename: string, rows: T[]) {
  const headers = Object.keys(rows[0] ?? {});
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => {
      const rec = row as Record<string, unknown>;
      return headers.map((h) => csvEscape(rec[h])).join(',');
    }),
  ].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(current);
      current = '';
    } else if (ch === '\n') {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else if (ch !== '\r') {
      current += ch;
    }
  }
  row.push(current);
  rows.push(row);

  const [headerRow, ...dataRows] = rows.filter((r) => r.some((cell) => cell.trim()));
  if (!headerRow) return [];
  const headers = headerRow
    .map((h) => h.trim())
    .filter((h) => h && !BLOCKED_IMPORT_KEYS.has(h.toLowerCase()));

  return dataRows.map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, cells[i]?.trim() ?? ''])),
  );
}

function downloadMenuTemplate() {
  const today = new Date();
  const sample: MenuRowExcel[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    sample.push({
      date: d.toISOString().slice(0, 10),
      main_dish: i === 0 ? 'Tavuk Sote' : i === 1 ? 'Manti' : 'Kuru Fasulye Pilav',
      description: i === 0 ? 'Pirinc pilavi, salata' : '',
      calories: 600 + i * 20,
      allergens: i === 1 ? 'gluten,lactose,egg' : 'gluten',
      is_vegetarian: false,
      is_vegan: false,
    });
  }
  downloadCsv('damga-menu-template.csv', sample);
}

function downloadLeaveTemplate() {
  const sample: LeaveRow[] = [
    {
      user_email: 'ali@example.com',
      type: 'annual',
      start_date: '2026-06-01',
      end_date: '2026-06-05',
      reason: 'Yaz tatili',
    },
    {
      user_email: 'ayse@example.com',
      type: 'sick',
      start_date: '2026-05-15',
      end_date: '2026-05-15',
      reason: 'Doktor raporu',
    },
  ];
  downloadCsv('damga-leave-template.csv', sample);
}

export function AdminBulkImportPage() {
  const [tab, setTab] = useState<Tab>('menus');
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<'approved' | 'pending'>('approved');

  const importMenusMut = useMutation({
    mutationFn: async (items: MenuRowApi[]) =>
      (await api.post('/admin/menus/bulk', { items })).data as {
        inserted: number;
        skipped: string[];
      },
    onSuccess: (r) => {
      toast.success(
        `${r.inserted} menu eklendi${r.skipped.length ? ` · ${r.skipped.length} atlandi` : ''}`,
      );
      setParsedRows([]);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const importLeavesMut = useMutation({
    mutationFn: async (items: LeaveRow[]) =>
      (
        await api.post('/admin/leaves/bulk', {
          items,
          default_status: defaultStatus,
        })
      ).data as {
        inserted: number;
        skipped: Array<{ row: number; reason: string }>;
      },
    onSuccess: (r) => {
      toast.success(
        `${r.inserted} izin eklendi${r.skipped.length ? ` · ${r.skipped.length} atlandi` : ''}`,
      );
      setParsedRows([]);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const handleFile = async (file: File) => {
    setParsingError(null);
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error('Dosya en fazla 1 MB olabilir');
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Sadece CSV dosyasi yuklenebilir');

      const rows = parseCsv(await file.text());
      if (rows.length === 0) throw new Error('Bos tablo');
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new Error(`Tek seferde en fazla ${MAX_IMPORT_ROWS} satir yuklenebilir`);
      }

      for (const r of rows) {
        for (const k of Object.keys(r)) {
          if (k === 'is_vegetarian' || k === 'is_vegan') {
            r[k] = String(r[k]).toUpperCase() === 'TRUE' || r[k] === true || r[k] === '1';
          }
        }
      }
      setParsedRows(rows);
    } catch (e) {
      setParsingError(getErrorMessage(e));
      setParsedRows([]);
    }
  };

  const handleImport = () => {
    if (tab === 'menus') {
      const items: MenuRowApi[] = parsedRows.map((r) => ({
        date: String(r.date),
        main_dish: String(r.main_dish ?? '').trim(),
        description: r.description ? String(r.description) : undefined,
        calories:
          r.calories !== '' && r.calories !== null && r.calories !== undefined
            ? Number(r.calories)
            : undefined,
        allergens: r.allergens
          ? String(r.allergens)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        is_vegetarian: !!r.is_vegetarian,
        is_vegan: !!r.is_vegan,
      }));
      importMenusMut.mutate(items);
    } else {
      const items: LeaveRow[] = parsedRows.map((r) => ({
        user_email: String(r.user_email ?? '').trim(),
        type: String(r.type ?? 'annual').trim(),
        start_date: String(r.start_date),
        end_date: String(r.end_date),
        reason: r.reason ? String(r.reason) : undefined,
      }));
      importLeavesMut.mutate(items);
    }
  };

  const isPending = importMenusMut.isPending || importLeavesMut.isPending;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-500 text-white">
          <FileSpreadsheet className="size-6" />
        </div>
        <div>
          <h1 className="font-display text-3xl">Toplu Ice Aktarma</h1>
          <p className="text-sm text-muted">
            CSV ile menu ve izin gunlerini toplu yukle. Once sablonu indir.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => {
            setTab('menus');
            setParsedRows([]);
          }}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg border transition flex items-center gap-2 ${
            tab === 'menus'
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white text-muted border-orange-100 hover:bg-orange-50'
          }`}
        >
          <UtensilsCrossed className="size-4" />
          Menu
        </button>
        <button
          onClick={() => {
            setTab('leaves');
            setParsedRows([]);
          }}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg border transition flex items-center gap-2 ${
            tab === 'leaves'
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white text-muted border-orange-100 hover:bg-orange-50'
          }`}
        >
          <Plane className="size-4" />
          Izin
        </button>
      </div>

      <div className="card space-y-3">
        <h3 className="font-display font-semibold">1. CSV sablonunu indir</h3>
        <button
          onClick={tab === 'menus' ? downloadMenuTemplate : downloadLeaveTemplate}
          className="btn-secondary"
        >
          <Download className="size-4" />
          {tab === 'menus' ? 'Menu Sablonu (.csv)' : 'Izin Sablonu (.csv)'}
        </button>
      </div>

      <div className="card space-y-3">
        <h3 className="font-display font-semibold">2. Doldurulmus CSV dosyasini yukle</h3>
        <p className="text-xs text-muted">
          Guvenlik icin yalnizca CSV kabul edilir. Maksimum {MAX_IMPORT_ROWS} satir ve 1 MB.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-white file:font-medium hover:file:bg-orange-600 cursor-pointer"
        />
        {parsingError && (
          <div className="rounded-md bg-danger/10 text-danger px-3 py-2 text-sm flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            {parsingError}
          </div>
        )}
      </div>

      {parsedRows.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h3 className="font-display font-semibold">Onizleme ({parsedRows.length} satir)</h3>
              <p className="text-xs text-muted mt-0.5">Ilk 50 satir gosterilir.</p>
            </div>
            {tab === 'leaves' && (
              <label className="text-xs text-muted flex items-center gap-2">
                Varsayilan durum
                <select
                  value={defaultStatus}
                  onChange={(e) => setDefaultStatus(e.target.value as 'approved' | 'pending')}
                  className="input py-1 text-xs w-32"
                >
                  <option value="approved">Onayli</option>
                  <option value="pending">Beklemede</option>
                </select>
              </label>
            )}
          </div>

          <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-md border border-orange-100">
            <table className="w-full text-xs">
              <thead className="bg-orange-50 sticky top-0">
                <tr>
                  {Object.keys(parsedRows[0] ?? {}).map((k) => (
                    <th
                      key={k}
                      className="text-left px-2 py-1.5 font-medium text-muted border-b border-orange-100"
                    >
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-b border-orange-50">
                    {Object.keys(parsedRows[0] ?? {}).map((k) => (
                      <td key={k} className="px-2 py-1.5">
                        {String(r[k] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md bg-success/5 border border-success/20 px-3 py-2 text-xs flex items-start gap-2">
            <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
            <span>Ice Aktar butonuna basinca satirlar sunucuya gonderilir.</span>
          </div>

          <button onClick={handleImport} disabled={isPending} className="btn-primary w-full">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Ice Aktar
          </button>
        </div>
      )}
    </div>
  );
}
