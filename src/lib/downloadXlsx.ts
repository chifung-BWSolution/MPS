import * as XLSX from 'xlsx';

export type XlsxCell = string | number;
export type XlsxRow = Record<string, XlsxCell>;

/** Trigger a browser download of `rows` as an .xlsx workbook. */
export function downloadXlsx(
  filename: string,
  sheetName: string,
  rows: XlsxRow[],
  options?: { moneyColumns?: string[] },
) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  if (keys.length > 0) {
    sheet['!cols'] = keys.map((key) => {
      const maxLen = Math.max(
        key.length,
        ...rows.slice(0, 200).map((row) => String(row[key] ?? '').length),
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 48) };
    });
  }

  const money = new Set(options?.moneyColumns ?? []);
  if (money.size > 0) {
    keys.forEach((key, column) => {
      if (!money.has(key)) return;
      for (let row = 0; row < rows.length; row++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row + 1, c: column })];
        if (cell && typeof cell.v === 'number') cell.z = '#,##0.00';
      }
    });
  }

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  const name = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(book, name);
}

export function microsToAmount(micros: number): number {
  return Math.round(micros) / 1_000_000;
}
