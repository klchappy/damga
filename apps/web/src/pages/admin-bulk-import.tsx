import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Download,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plane,
  UtensilsCrossed,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';

type Tab = 'menus' | 'leaves';

interface MenuRowExcel {
  date: string;
  main_dish: string;
  description?: string;
  calories?: number;
  allergens?: string; // virgülle ayrılmış
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

function downloadMenuTemplate() {
  const today = new Date();
  const sample: MenuRowExcel[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    sample.push({
      date: d.toISOString().slice(0, 10),
      main_dish: i === 0 ? 'Tavuk Sote' : i === 1 ? 'Mantı' : 'Kuru Fasulye Pilav',
      description: i === 0 ? 'Pirinç pilavı, salata' : '',
      calories: 600 + i * 20,
      allergens: i === 1 ? 'gluten,lactose,egg' : 'gluten',
      is_vegetarian: false,
      is_vegan: false,
    });
  }
  const ws = XLSX.utils.json_to_sheet(sample);
  ws['!cols'] = [
    { wch: 12 }, // date
    { wch: 30 }, // main_dish
    { wch: 40 }, // description
    { wch: 10 }, // calories
    { wch: 30 }, // allergens
    { wch: 14 }, // is_vegetarian
    { wch: 10 }, // is_vegan
  ];
  // Açıklama sayfası
  const info = XLSX.utils.aoa_to_sheet([
    ['Damga — Toplu Menü İçe Aktarma Şablonu'],
    [''],
    ['Sütun', 'Açıklama', 'Örnek'],
    ['date', 'YYYY-MM-DD formatında tarih (zorunlu)', '2026-05-20'],
    ['main_dish', 'Ana yemek adı (zorunlu, max 200 karakter)', 'Tavuk Sote'],
    ['description', 'Açıklama (opsiyonel, max 1000 karakter)', 'Pirinç pilavı, salata'],
    ['calories', 'Kalori (opsiyonel, sayı)', '650'],
    [
      'allergens',
      'Virgülle ayrılmış allerjenler: ' + ALLERGENS.join(', '),
      'gluten,lactose',
    ],
    ['is_vegetarian', 'TRUE/FALSE — etsiz mi?', 'FALSE'],
    ['is_vegan', 'TRUE/FALSE — vegan mı?', 'FALSE'],
    [''],
    ['NOT: Aynı tarihte zaten menü varsa o satır atlanır (skipped).'],
  ]);
  info['!cols'] = [{ wch: 16 }, { wch: 60 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Menüler');
  XLSX.utils.book_append_sheet(wb, info, 'Talimatlar');
  XLSX.writeFile(wb, 'damga-menu-template.xlsx');
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
  const ws = XLSX.utils.json_to_sheet(sample);
  ws['!cols'] = [
    { wch: 28 }, // email
    { wch: 14 }, // type
    { wch: 12 }, // start
    { wch: 12 }, // end
    { wch: 30 }, // reason
  ];
  const info = XLSX.utils.aoa_to_sheet([
    ['Damga — Toplu İzin İçe Aktarma Şablonu'],
    [''],
    ['Sütun', 'Açıklama', 'Örnek'],
    ['user_email', 'Çalışanın email adresi (zorunlu, sistemde kayıtlı olmalı)', 'ali@example.com'],
    [
      'type',
      'İzin tipi: ' + LEAVE_TYPES.join(', '),
      'annual',
    ],
    ['start_date', 'YYYY-MM-DD', '2026-06-01'],
    ['end_date', 'YYYY-MM-DD (start_date >= end_date olmalı)', '2026-06-05'],
    ['reason', 'Açıklama (opsiyonel)', 'Yaz tatili'],
    [''],
    ['NOT 1: Email sistemde yoksa o satır atlanır.'],
    ['NOT 2: Default olarak status="approved" kaydedilir.'],
    ['NOT 3: business_days hafta sonu hariç otomatik hesaplanır.'],
  ]);
  info['!cols'] = [{ wch: 16 }, { wch: 60 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'İzinler');
  XLSX.utils.book_append_sheet(wb, info, 'Talimatlar');
  XLSX.writeFile(wb, 'damga-leave-template.xlsx');
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
        `✅ ${r.inserted} menü eklendi${r.skipped.length ? ` · ${r.skipped.length} atlandı (zaten var)` : ''}`,
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
        `✅ ${r.inserted} izin eklendi${r.skipped.length ? ` · ${r.skipped.length} atlandı` : ''}`,
      );
      setParsedRows([]);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const handleFile = async (file: File) => {
    setParsingError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName =
        wb.SheetNames.find(
          (n) => n.toLowerCase().includes('menü') || n.toLowerCase().includes('izin'),
        ) ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName!];
      if (!ws) throw new Error('Sheet bulunamadı');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (rows.length === 0) throw new Error('Boş tablo');

      // Tarih hücreleri Excel'de sayı olabilir → düzelt
      for (const r of rows) {
        for (const k of Object.keys(r)) {
          if (
            (k === 'date' || k === 'start_date' || k === 'end_date') &&
            typeof r[k] === 'number'
          ) {
            // Excel serial date → JS Date
            const d = XLSX.SSF.parse_date_code(r[k] as number);
            if (d) {
              r[k] = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
            }
          }
          // boolean string normalize
          if (k === 'is_vegetarian' || k === 'is_vegan') {
            r[k] = String(r[k]).toUpperCase() === 'TRUE' || r[k] === true || r[k] === 1;
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
          <h1 className="font-display text-3xl">Toplu İçe Aktarma</h1>
          <p className="text-sm text-muted">
            Excel/CSV ile menü ve izin günlerini toplu yükle. Önce şablonu indir.
          </p>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-2">
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
          Menüler
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
          İzin Günleri
        </button>
      </div>

      {/* Adım 1: şablon */}
      <div className="card space-y-3">
        <div className="flex items-start gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-orange-100 text-orange-700 text-xs font-bold shrink-0">
            1
          </span>
          <div>
            <h3 className="font-display font-semibold">Excel şablonunu indir</h3>
            <p className="text-xs text-muted mt-0.5">
              Şablonda örnek satırlar ve "Talimatlar" sayfası vardır. Kendi satırlarını
              ekle ve kaydet.
            </p>
          </div>
        </div>
        <button
          onClick={tab === 'menus' ? downloadMenuTemplate : downloadLeaveTemplate}
          className="btn-outline text-sm"
        >
          <Download className="size-4" />
          {tab === 'menus' ? 'Menü Şablonu (.xlsx)' : 'İzin Şablonu (.xlsx)'}
        </button>
      </div>

      {/* Adım 2: yükle */}
      <div className="card space-y-3">
        <div className="flex items-start gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-orange-100 text-orange-700 text-xs font-bold shrink-0">
            2
          </span>
          <div>
            <h3 className="font-display font-semibold">Doldurulmuş dosyayı yükle</h3>
            <p className="text-xs text-muted mt-0.5">
              .xlsx, .xls veya .csv. Yükleyince satırlar önizlenir.
            </p>
          </div>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = ''; // tekrar seçim için
          }}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-white file:font-medium hover:file:bg-orange-600 cursor-pointer"
        />
        {parsingError && (
          <div className="rounded-md bg-danger/10 text-danger px-3 py-2 text-sm flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            {parsingError}
          </div>
        )}
      </div>

      {/* Adım 3: önizleme + import */}
      {parsedRows.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-start gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-orange-100 text-orange-700 text-xs font-bold shrink-0">
                3
              </span>
              <div>
                <h3 className="font-display font-semibold">
                  Önizleme ({parsedRows.length} satır)
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {tab === 'menus'
                    ? 'Aynı tarihte zaten menü varsa o satır atlanır.'
                    : 'Email sistemde bulunamayan satırlar atlanır.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {tab === 'leaves' && (
                <select
                  value={defaultStatus}
                  onChange={(e) =>
                    setDefaultStatus(e.target.value as 'approved' | 'pending')
                  }
                  className="input text-xs w-auto"
                >
                  <option value="approved">Onaylı kaydet</option>
                  <option value="pending">Beklemede kaydet</option>
                </select>
              )}
              <button
                onClick={handleImport}
                disabled={isPending}
                className="btn-primary text-sm"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                İçe Aktar
              </button>
            </div>
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
          {parsedRows.length > 50 && (
            <p className="text-[10px] text-muted text-center">
              {parsedRows.length - 50} satır daha — hepsi içe aktarılacak.
            </p>
          )}

          <div className="rounded-md bg-success/5 border border-success/20 px-3 py-2 text-xs flex items-start gap-2">
            <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
            <span>
              "İçe Aktar" butonuna basınca sunucuya gönderilir. Hatalı satırlar
              atlanır, sonuç toast olarak görünür.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
