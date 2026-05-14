/**
 * Puantaj kod sistemi — Kılıç Enerji formatına uyumlu, Damga event/leave data'sından türetilir.
 *
 * Kod listesi (Türkçe geleneksel puantaj):
 *   X  → Çalıştığı Gün (check-in mevcut, hafta içi)
 *   H  → Hafta Tatili (Cmt/Paz, kayıt yok)
 *   RX → Resmi Tatil Çalışması (check-in mevcut, hafta sonu)
 *   R  → Rapor (sick leave onaylı)
 *   IZ → Ücretsiz İzin (unpaid leave onaylı)
 *   G  → İzinsiz Gelmedi (hafta içi, kayıt yok, izin yok)
 *   DI → Babalık İzni (paternity / maternity)
 *   YI → Yıllık İzin (annual leave onaylı)
 *
 * Çıktı: { 'YYYY-MM-DD': PuantajCode }
 *
 * Derivation öncelik sırası (yüksek → düşük):
 *   1. İzin (leave) — onaylanmış izin günü
 *   2. Check-in event (worked)
 *   3. Weekend (gün durumu)
 *   4. G — varsayılan (mesai günü gelmedi)
 */

export type PuantajCode = 'X' | 'H' | 'RX' | 'R' | 'IZ' | 'G' | 'DI' | 'YI';

export const PUANTAJ_CODES: Record<PuantajCode, { tr: string; color: string; excelText: string }> = {
  X: { tr: 'Çalıştığı Gün', color: '92D050', excelText: 'X' },
  H: { tr: 'Hafta Tatili', color: 'FFFF00', excelText: 'H' },
  RX: { tr: 'Resmi Tatil Çalışması', color: '4472C4', excelText: 'RX' },
  R: { tr: 'Rapor', color: 'FF9999', excelText: 'R' },
  IZ: { tr: 'Ücretsiz İzin', color: 'C6A96B', excelText: 'İZ' },
  G: { tr: 'İzinsiz Gelmedi', color: 'FFC000', excelText: 'G' },
  DI: { tr: 'Babalık/Annelik İzni', color: 'E2EFDA', excelText: 'Dİ' },
  YI: { tr: 'Yıllık İzin', color: 'B4C6E7', excelText: 'Yİ' },
};

/**
 * Damga leave type → puantaj code mapping
 */
const LEAVE_TYPE_TO_CODE: Record<string, PuantajCode> = {
  annual: 'YI',
  sick: 'R',
  unpaid: 'IZ',
  paternity: 'DI',
  maternity: 'DI',
  compassionate: 'IZ', // ölümlü/aile durumu → ücretsiz izin gibi davran
};

export interface DerivePuantajInput {
  /** Personel id */
  user_id: string;
  /** Bu ay için bu kullanıcının check_in günleri (YYYY-MM-DD, sadece check_in türü) */
  checked_in_days: Set<string>;
  /** Bu ay için bu kullanıcının onaylı izin aralıkları */
  leaves: Array<{
    start_date: string; // YYYY-MM-DD
    end_date: string;   // YYYY-MM-DD
    type: string;
  }>;
  /** Bu ayın tüm günleri YYYY-MM-DD formatında */
  month_days: string[];
  /**
   * Manuel override'lar: { 'YYYY-MM-DD': code }
   * Override varsa auto-derive bypass — gün için bu code kullanılır.
   */
  overrides?: Record<string, PuantajCode>;
}

export type CodeSource = 'auto' | 'override';

export interface DeriveResult {
  /** Final code per day */
  codes: Record<string, PuantajCode>;
  /** Hangi gün override mi, auto mu? */
  sources: Record<string, CodeSource>;
}

/**
 * Bir kullanıcı için aylık puantaj kodlarını türet.
 *
 * Dönüş: { codes, sources } — her gün için kod + kaynak (auto/override).
 */
export function derivePuantajForUser(input: DerivePuantajInput): DeriveResult {
  const codes: Record<string, PuantajCode> = {};
  const sources: Record<string, CodeSource> = {};

  // İzin günlerini map'le (date → code)
  const leaveDayMap = new Map<string, PuantajCode>();
  for (const lv of input.leaves) {
    const code = LEAVE_TYPE_TO_CODE[lv.type] ?? 'IZ';
    let day = lv.start_date;
    while (day <= lv.end_date) {
      leaveDayMap.set(day, code);
      day = addDays(day, 1);
    }
  }

  const overrides = input.overrides ?? {};

  for (const dayStr of input.month_days) {
    // 0. Manuel override varsa direkt o
    const ov = overrides[dayStr];
    if (ov) {
      codes[dayStr] = ov;
      sources[dayStr] = 'override';
      continue;
    }

    // 1. Onaylı izin varsa o
    const leaveCode = leaveDayMap.get(dayStr);
    if (leaveCode) {
      codes[dayStr] = leaveCode;
      sources[dayStr] = 'auto';
      continue;
    }

    // 2. Check-in var mı?
    const hasCheckIn = input.checked_in_days.has(dayStr);
    const isWeekend = isWeekendDay(dayStr);

    if (hasCheckIn) {
      codes[dayStr] = isWeekend ? 'RX' : 'X';
    } else {
      codes[dayStr] = isWeekend ? 'H' : 'G';
    }
    sources[dayStr] = 'auto';
  }

  return { codes, sources };
}

/**
 * 'YYYY-MM-DD' formatında bir gün ileri al.
 */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DD' string için Cmt/Paz mı? (UTC bazlı — TR timezone offset'i +03:00 sabit, hafta günü farkı yok)
 */
export function isWeekendDay(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay(); // 0=Sun, 6=Sat
  return wd === 0 || wd === 6;
}

/**
 * Türkçe kısa hafta günü ('Pzt' / 'Sal' / ...)
 */
export function trWeekdayShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay(); // 0=Sun ... 6=Sat
  // 0=Sun(Paz) 1=Mon(Pzt) 2=Tue(Sal) 3=Wed(Çar) 4=Thu(Per) 5=Fri(Cum) 6=Sat(Cmt)
  return ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][wd] ?? '?';
}

export const TR_MONTHS = [
  '',
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/**
 * Ay özet sayıları
 */
export interface PuantajSummary {
  worked: number;       // X + RX
  rx_count: number;     // RX
  h_count: number;      // H
  r_count: number;      // R
  iz_count: number;     // IZ
  yi_count: number;     // YI
  di_count: number;     // DI
  g_count: number;      // G
}

export function summarizePuantaj(codes: Record<string, PuantajCode>): PuantajSummary {
  const s: PuantajSummary = {
    worked: 0,
    rx_count: 0,
    h_count: 0,
    r_count: 0,
    iz_count: 0,
    yi_count: 0,
    di_count: 0,
    g_count: 0,
  };
  for (const code of Object.values(codes)) {
    if (code === 'X' || code === 'RX') s.worked += 1;
    if (code === 'RX') s.rx_count += 1;
    if (code === 'H') s.h_count += 1;
    if (code === 'R') s.r_count += 1;
    if (code === 'IZ') s.iz_count += 1;
    if (code === 'YI') s.yi_count += 1;
    if (code === 'DI') s.di_count += 1;
    if (code === 'G') s.g_count += 1;
  }
  return s;
}
