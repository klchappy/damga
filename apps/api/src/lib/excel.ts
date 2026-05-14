/**
 * Excel (XLSX) helper — bordro/raporlama export'ları için.
 *
 * ExcelJS kullanır (CSV'den 25× daha büyük dependency ama Türkçe karakter
 * desteği + auto-width + font/renk biçimlendirme + Excel TR uyumu kayıpsız).
 *
 * Kullanım:
 *   const buf = await buildXlsxBuffer({
 *     sheetName: 'Bordro',
 *     title: 'Damga — Bordro 2026-05',
 *     columns: [
 *       { header: 'Ad Soyad', key: 'full_name', width: 28 },
 *       { header: 'Departman', key: 'department', width: 20 },
 *       { header: 'Çalışılan Gün', key: 'worked_days', width: 14, type: 'number' },
 *     ],
 *     rows: items,
 *   });
 *   sendXlsx(res, buf, 'bordro-2026-05.xlsx');
 *
 * Tasarım:
 *   - Header satırı mor (#7e22ce) arka plan, beyaz bold font, freeze edilmiş
 *   - Çift sıralı zebra (very light purple)
 *   - AutoFilter header'a eklenir
 *   - Title + subtitle opsiyonel — büyük başlık ve italic altyazı
 */
import ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  type?: 'string' | 'number' | 'date';
  format?: string; // örn. '0.00', 'dd/mm/yyyy'
}

export interface BuildXlsxParams {
  sheetName: string;
  title?: string;
  subtitle?: string;
  columns: ExcelColumn[];
  rows: Array<Record<string, unknown>>;
  brandColor?: string;
}

export async function buildXlsxBuffer(p: BuildXlsxParams): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Damga';
  wb.created = new Date();

  const ws = wb.addWorksheet(p.sheetName.slice(0, 31));
  const brand = (p.brandColor ?? '7e22ce').replace('#', '');

  // 1. Title (opsiyonel)
  let row = 1;
  if (p.title) {
    ws.mergeCells(row, 1, row, p.columns.length);
    const c = ws.getCell(row, 1);
    c.value = p.title;
    c.font = { bold: true, size: 14, color: { argb: 'FF' + brand } };
    c.alignment = { vertical: 'middle' };
    ws.getRow(row).height = 24;
    row += 1;
  }
  if (p.subtitle) {
    ws.mergeCells(row, 1, row, p.columns.length);
    const c = ws.getCell(row, 1);
    c.value = p.subtitle;
    c.font = { italic: true, size: 11, color: { argb: 'FF6b7280' } };
    row += 1;
  }
  if (p.title || p.subtitle) {
    row += 1; // boş ayraç satır
  }

  // 2. Header
  const headerRowNum = row;
  p.columns.forEach((col, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + brand },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF7e22ce' } },
    };
  });
  ws.getRow(row).height = 22;
  // Freeze header row
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: row }];
  row += 1;

  // 3. Data rows + zebra stripe
  for (const r of p.rows) {
    p.columns.forEach((col, i) => {
      const cell = ws.getCell(row, i + 1);
      const value = r[col.key];
      cell.value = (value ?? '') as ExcelJS.CellValue;
      if (col.format) cell.numFmt = col.format;
      cell.alignment = { vertical: 'middle' };
    });
    if ((row - headerRowNum) % 2 === 0) {
      p.columns.forEach((_, i) => {
        ws.getCell(row, i + 1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFf5f3ff' }, // çok açık mor zebra
        };
      });
    }
    row += 1;
  }

  // 4. Kolon genişlikleri
  p.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width ?? 18;
  });

  // 5. AutoFilter on header (kullanıcı Excel'de filtre açabilsin)
  if (p.rows.length > 0) {
    ws.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: row - 1, column: p.columns.length },
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/**
 * Express response helper — XLSX dosyasını download header'larıyla yollar.
 */
export function sendXlsx(
  res: import('express').Response,
  buffer: Buffer,
  filename: string,
): void {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
  );
  res.send(buffer);
}
