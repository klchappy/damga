/**
 * Puantaj Excel exporter — Kılıç Enerji'nin "PUANTAJ TABLOSU" formatına birebir uyumlu.
 *
 * Yapı:
 *   Row 1: Şirket başlığı (merged A1:AL1)
 *   Row 2: Ay başlığı (merged A2:AL2)
 *   Row 3: Sütun grup başlıkları
 *   Row 4: Hafta günü adları (90° döndürülmüş)
 *   Row 5: Gün numaraları
 *   Row 6+: Her personel için 2 satır (main + sub)
 *   Legend (alt)
 *   Footer (basılan her sayfada)
 *
 * Sütun haritası:
 *   A=1      → Sıra no (5.5 width)
 *   B=2      → ADI SOYADI (14 width)
 *   C=3      → POZİSYON (18 width)
 *   D..AH    → 31 gün hücresi (3.5 width)
 *   AI=35    → ÇALIŞILAN GÜN (X+RX count)
 *   AJ=36    → RESMİ TATİL ÇALIŞMASI (RX count)
 *   AK=37    → HAFTA TATİLİ (H count)
 *   AL=38    → RAPORLU OLDUĞU GÜN (R count)
 */
import ExcelJS from 'exceljs';
import {
  PUANTAJ_CODES,
  TR_MONTHS,
  trWeekdayShort,
  isWeekendDay,
  type PuantajCode,
  type PuantajSummary,
} from './puantaj-codes';

export interface PuantajRow {
  full_name: string;
  position: string;
  /** { 'YYYY-MM-DD': PuantajCode } */
  codes: Record<string, PuantajCode>;
  summary: PuantajSummary;
}

export interface BuildPuantajXlsxParams {
  org_name: string;
  year: number;
  month: number; // 1-12
  rows: PuantajRow[];
}

const ARIAL_BLACK = 'Arial Black';

function font(size = 8, opts: { bold?: boolean; color?: string } = {}) {
  return {
    name: ARIAL_BLACK,
    size,
    bold: opts.bold ?? false,
    color: { argb: opts.color ?? 'FF000000' },
  };
}

function fill(rgb: string): ExcelJS.FillPattern {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF' + rgb.replace(/^FF/, '') },
  };
}

function border(
  left: 'thin' | 'medium' | undefined = 'thin',
  right: 'thin' | 'medium' | undefined = 'thin',
  top: 'thin' | 'medium' | undefined = 'thin',
  bottom: 'thin' | 'medium' | undefined = 'thin',
): Partial<ExcelJS.Borders> {
  return {
    left: left ? { style: left } : undefined,
    right: right ? { style: right } : undefined,
    top: top ? { style: top } : undefined,
    bottom: bottom ? { style: bottom } : undefined,
  };
}

function align(
  horizontal: ExcelJS.Alignment['horizontal'] = 'center',
  vertical: ExcelJS.Alignment['vertical'] = 'middle',
  opts: { wrap?: boolean; rot?: number } = {},
): Partial<ExcelJS.Alignment> {
  return {
    horizontal,
    vertical,
    wrapText: opts.wrap ?? false,
    textRotation: opts.rot ?? 0,
  };
}

export async function buildPuantajXlsx(p: BuildPuantajXlsxParams): Promise<Buffer> {
  const { org_name, year, month, rows } = p;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = TR_MONTHS[month] ?? '?';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Damga';
  wb.created = new Date();

  const sheetTitle = `${monthName.slice(0, 3).toUpperCase()} ${year}`.slice(0, 31);
  const ws = wb.addWorksheet(sheetTitle, {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.4,
      },
    },
    headerFooter: {
      oddFooter:
        '&L&8&B AÇIKLAMA: &B ' +
        'X=Çalıştığı Gün  |  H=Hafta Tatili  |  RX=Resmi Tatil Çalışması  |  ' +
        'R=Rapor  |  İZ=Ücretsiz İzin  |  G=İzinsiz İşe Gelmedi  |  ' +
        'Dİ=Babalık İzni  |  Yİ=Yıllık İzin' +
        '&R&8Sayfa &P / &N',
    },
  });

  // Sütun genişlikleri
  ws.getColumn(1).width = 5.5; // A: sıra
  ws.getColumn(2).width = 14; // B: isim
  ws.getColumn(3).width = 18; // C: pozisyon
  for (let col = 4; col <= 34; col += 1) {
    ws.getColumn(col).width = 3.5; // D..AH: 31 gün
  }
  ws.getColumn(35).width = 9; // AI
  ws.getColumn(36).width = 10; // AJ
  ws.getColumn(37).width = 8.5; // AK
  ws.getColumn(38).width = 7; // AL

  // Satır yükseklikleri
  ws.getRow(1).height = 18.75;
  ws.getRow(2).height = 15.75;
  ws.getRow(3).height = 15;
  ws.getRow(4).height = 75; // rotated weekday names
  ws.getRow(5).height = 16.5;

  // ── Row 1: Şirket başlığı ───────────────────────────────────────────────
  ws.mergeCells('A1:AL1');
  const c1 = ws.getCell('A1');
  c1.value = `${org_name.toUpperCase()} — DAMGA PUANTAJ TABLOSU`;
  c1.font = font(11);
  c1.alignment = align();
  c1.border = border('medium', 'medium', 'medium', 'thin');

  // ── Row 2: Ay başlığı ───────────────────────────────────────────────────
  ws.mergeCells('A2:AL2');
  const c2 = ws.getCell('A2');
  c2.value = `${monthName} ${year}`;
  c2.font = font(9);
  c2.alignment = align();
  c2.border = border('medium', 'medium', 'thin', 'medium');

  // ── Row 3: Sütun grup başlıkları ────────────────────────────────────────
  const hdrFill = fill('FFFFCC');

  ws.mergeCells('A3:A4');
  const a3 = ws.getCell('A3');
  a3.value = '';
  a3.fill = hdrFill;
  a3.border = border('medium', 'thin', 'medium', 'thin');
  a3.alignment = align();
  a3.font = font(8);

  ws.mergeCells('B3:B4');
  const b3 = ws.getCell('B3');
  b3.value = 'ADI SOYADI';
  b3.fill = hdrFill;
  b3.border = border();
  b3.alignment = align('center', 'middle', { wrap: true });
  b3.font = font(8);

  ws.mergeCells('C3:C4');
  const c3 = ws.getCell('C3');
  c3.value = 'POZİSYON';
  c3.fill = hdrFill;
  c3.border = border();
  c3.alignment = align('center', 'middle', { wrap: true });
  c3.font = font(8);

  ws.mergeCells('D3:AH3');
  const d3 = ws.getCell('D3');
  d3.value = 'G  Ü  N  L  E  R';
  d3.fill = hdrFill;
  d3.border = border();
  d3.alignment = align();
  d3.font = font(8);

  ws.mergeCells('AI3:AL3');
  const ai3 = ws.getCell('AI3');
  ai3.value = 'ÇALIŞMA DURUMU';
  ai3.fill = hdrFill;
  ai3.border = border();
  ai3.alignment = align('center', 'middle', { wrap: true });
  ai3.font = font(8);

  // ── Row 4: Hafta günü adları (90° döndürülmüş) ──────────────────────────
  for (let d = 1; d <= 31; d += 1) {
    const col = d + 3; // D=4
    const cell = ws.getCell(4, col);
    if (d <= daysInMonth) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cell.value = trWeekdayShort(dateStr);
      cell.fill = isWeekendDay(dateStr) ? fill('FFFF00') : fill('FFFFFF');
    } else {
      cell.value = '';
      cell.fill = fill('D9D9D9');
    }
    cell.font = font(8);
    cell.alignment = align('center', 'middle', { rot: 90 });
    cell.border = border();
  }

  // Özet sütun başlıkları (AI..AL row 4)
  const summaryHeaders: Array<[number, string, string]> = [
    [35, 'ÇALIŞTIĞI GÜN', '92D050'],
    [36, 'RESMİ TATİL ÇALIŞMASI', '4472C4'],
    [37, 'HAFTA TATİLİ', 'FFFF00'],
    [38, 'RAPORLU OLDUĞU GÜN', '9966FF'],
  ];
  for (const [col, text, clr] of summaryHeaders) {
    const cell = ws.getCell(4, col);
    cell.value = text;
    cell.fill = fill(clr);
    cell.font = font(8);
    cell.alignment = align('center', 'middle', { rot: 90, wrap: true });
    cell.border = border();
  }

  // ── Row 5: Gün numaraları ───────────────────────────────────────────────
  ws.mergeCells('AI5:AL5');
  for (let d = 1; d <= 31; d += 1) {
    const col = d + 3;
    const cell = ws.getCell(5, col);
    if (d <= daysInMonth) {
      cell.value = d;
    } else {
      cell.value = '';
      cell.fill = fill('D9D9D9');
    }
    cell.font = font(8);
    cell.alignment = align('center', 'middle', { rot: 90 });
    cell.border = border();
  }
  ws.getCell(5, 1).border = border('medium', 'thin', 'thin', 'medium');
  ws.getCell(5, 2).border = border();
  ws.getCell(5, 3).border = border();

  // ── Personel satırları ──────────────────────────────────────────────────
  const startRow = 6;
  const GREEN = fill('92D050');
  const BLUE = fill('4472C4');
  const YELLOW = fill('FFFF00');
  const PURPLE = fill('9966FF');

  rows.forEach((row, idx) => {
    const mainRow = startRow + idx * 2;
    const subRow = mainRow + 1;

    ws.getRow(mainRow).height = 15;
    ws.getRow(subRow).height = 12;

    // A: sıra no (merged main:sub)
    ws.mergeCells(`A${mainRow}:A${subRow}`);
    const aCell = ws.getCell(mainRow, 1);
    aCell.value = idx + 1;
    aCell.font = font(8, { bold: true });
    aCell.alignment = align();
    aCell.border = border('medium', 'thin', 'thin', 'medium');

    // B: isim
    ws.mergeCells(`B${mainRow}:B${subRow}`);
    const bCell = ws.getCell(mainRow, 2);
    bCell.value = row.full_name.toUpperCase();
    bCell.font = font(8);
    bCell.alignment = align('center', 'middle', { wrap: true });
    bCell.border = border();

    // C: pozisyon
    ws.mergeCells(`C${mainRow}:C${subRow}`);
    const cCell = ws.getCell(mainRow, 3);
    cCell.value = (row.position || '').toUpperCase();
    cCell.font = font(8);
    cCell.alignment = align('center', 'middle', { wrap: true });
    cCell.border = border();

    // Gün hücreleri (D..AH)
    for (let d = 1; d <= 31; d += 1) {
      const col = d + 3;
      const main = ws.getCell(mainRow, col);
      const sub = ws.getCell(subRow, col);

      if (d <= daysInMonth) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const code = row.codes[dateStr];
        if (code) {
          main.value = PUANTAJ_CODES[code].excelText;
          main.fill = fill(PUANTAJ_CODES[code].color);
        } else if (isWeekendDay(dateStr)) {
          main.fill = fill('FFFFDD');
        } else {
          main.fill = fill('FFFFFF');
        }
        sub.fill = main.fill; // sub row aynı renk
      } else {
        main.value = '';
        main.fill = fill('D9D9D9');
        sub.value = '';
        sub.fill = fill('D9D9D9');
      }

      main.font = font(8);
      main.alignment = align();
      main.border = border();
      sub.value = '';
      sub.font = { name: ARIAL_BLACK, size: 8, color: { argb: 'FFFF0000' } };
      sub.alignment = align();
      sub.border = border();
    }

    // AI: çalışılan gün (merged main+sub) — formül COUNTIF
    const colLetters = `D${mainRow}:AH${mainRow}`;
    ws.mergeCells(`AI${mainRow}:AI${subRow}`);
    const ai = ws.getCell(mainRow, 35);
    ai.value = { formula: `COUNTIF(${colLetters},"X")+COUNTIF(${colLetters},"RX")` };
    ai.fill = GREEN;
    ai.font = font(8);
    ai.alignment = align();
    ai.border = border();

    // AJ: RX count
    const aj = ws.getCell(mainRow, 36);
    aj.value = { formula: `COUNTIF(${colLetters},"RX")` };
    aj.fill = BLUE;
    aj.font = font(8);
    aj.alignment = align();
    aj.border = border();

    // AK: H count
    const ak = ws.getCell(mainRow, 37);
    ak.value = { formula: `COUNTIF(${colLetters},"H")` };
    ak.fill = YELLOW;
    ak.font = font(8);
    ak.alignment = align();
    ak.border = border();

    // AL: R count
    const al = ws.getCell(mainRow, 38);
    al.value = { formula: `COUNTIF(${colLetters},"R")` };
    al.fill = PURPLE;
    al.font = font(8);
    al.alignment = align();
    al.border = border();

    // Sub row özet: AJ, AK, AL boş ama bordered
    const subLetters = `D${subRow}:AH${subRow}`;
    for (const [col, codeStr, fi] of [
      [36, 'RX', BLUE],
      [37, 'H', YELLOW],
      [38, 'R', PURPLE],
    ] as Array<[number, string, ExcelJS.FillPattern]>) {
      const cell = ws.getCell(subRow, col);
      cell.value = { formula: `COUNTIF(${subLetters},"${codeStr}")` };
      cell.fill = fi;
      cell.font = font(8);
      cell.alignment = align();
      cell.border = border();
    }
  });

  // ── Boş kayıt slotu (görselde alt boşluk için) ──────────────────────────
  const nEmp = rows.length;
  const emptyMain = startRow + nEmp * 2;
  const emptySub = emptyMain + 1;
  ws.getRow(emptyMain).height = 15;
  ws.getRow(emptySub).height = 12;

  ws.mergeCells(`A${emptyMain}:A${emptySub}`);
  ws.getCell(emptyMain, 1).border = border('medium', 'thin', 'thin', 'medium');
  ws.mergeCells(`B${emptyMain}:B${emptySub}`);
  ws.getCell(emptyMain, 2).border = border();
  ws.mergeCells(`C${emptyMain}:C${emptySub}`);
  ws.getCell(emptyMain, 3).border = border();
  ws.mergeCells(`AI${emptyMain}:AI${emptySub}`);
  for (const r of [emptyMain, emptySub]) {
    for (let col = 4; col <= 38; col += 1) {
      const cell = ws.getCell(r, col);
      cell.border = border();
      cell.font = font(8);
    }
  }

  // ── Legend (alt) ────────────────────────────────────────────────────────
  const legendStart = emptySub + 2;
  const legendItems: Array<[string, string, string]> = [
    ['ÇALIŞTIĞI GÜN', 'X', '92D050'],
    ['HAFTA TATİLİ', 'H', 'FFFF00'],
    ['RESMİ TATİL ÇALIŞMASI', 'RX', '4472C4'],
    ['RAPOR (HASTALIK)', 'R', 'FF9999'],
    ['ÜCRETSİZ İZİN', 'İZ', 'C6A96B'],
    ['İZİNSİZ İŞE GELMEDİ', 'G', 'FFC000'],
    ['BABALIK İZNİ', 'Dİ', 'E2EFDA'],
    ['YILLIK İZİN', 'Yİ', 'B4C6E7'],
  ];
  legendItems.forEach(([label, code, clr], i) => {
    const r = legendStart + i;
    ws.getRow(r).height = 15;
    ws.mergeCells(`F${r}:K${r}`);
    const lbl = ws.getCell(r, 6);
    lbl.value = label;
    lbl.font = { name: 'Calibri', size: 10 };
    lbl.alignment = { horizontal: 'center', vertical: 'middle' };
    lbl.border = border();

    const lc = ws.getCell(r, 12);
    lc.value = code;
    lc.fill = fill(clr);
    lc.font = { name: ARIAL_BLACK, size: 9 };
    lc.alignment = { horizontal: 'center', vertical: 'middle' };
    lc.border = border();
  });

  // ── Buffer ──────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
