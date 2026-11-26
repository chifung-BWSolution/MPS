/**
 * ALT Pilot · 匯出（CSV / JSON / TSV / Framer 對照清單）
 *
 * 純函式負責組字串；真正下載與剪貼簿只在瀏覽器函式內做，
 * 讓 Node 測試可以直接 import 而不會碰到 document。
 */

import type { AltRunRow, AltSuggestionRow } from './altTypes.ts';

export interface AltBatchReportRow {
  page_url: string;
  title: string;
  image_count: number;
  missing: number;
  duplicates: number;
  too_long: number;
  decorative: number;
}

export function toBatchReportCsv(rows: AltBatchReportRow[]): string {
  const headers: Array<keyof AltBatchReportRow> = [
    'page_url',
    'title',
    'image_count',
    'missing',
    'duplicates',
    'too_long',
    'decorative',
  ];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export interface AltExportRow {
  page_url: string;
  image_url: string;
  filename: string;
  location: string;
  current_alt: string;
  suggested_alt: string;
  short_alt: string;
  keyword: string;
  confidence: number;
  risk: string;
  status: string;
  note: string;
}

function chosenAlt(suggestion: AltSuggestionRow): string {
  return (suggestion.final_alt || suggestion.suggested_alt || '').trim();
}

export function buildAltExportRows(
  run: Pick<AltRunRow, 'page_url'>,
  suggestions: AltSuggestionRow[],
): AltExportRow[] {
  return suggestions
    .filter(
      (suggestion) =>
        (suggestion.status === 'pending' ||
          suggestion.status === 'approved' ||
          suggestion.status === 'exported') &&
        (suggestion.decorative || chosenAlt(suggestion).length > 0),
    )
    .map((suggestion) => ({
      page_url: run.page_url,
      image_url: suggestion.image_url,
      filename: suggestion.filename,
      location: suggestion.location,
      current_alt: suggestion.current_alt,
      suggested_alt: chosenAlt(suggestion),
      short_alt: suggestion.short_alt,
      keyword: suggestion.keyword,
      confidence: suggestion.confidence,
      risk: suggestion.risk,
      status: suggestion.status,
      note: (suggestion.issues || []).map((issue) => issue.message).join('; '),
    }));
}

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const CSV_HEADERS: Array<keyof AltExportRow> = [
  'page_url',
  'image_url',
  'filename',
  'location',
  'current_alt',
  'suggested_alt',
  'short_alt',
  'keyword',
  'confidence',
  'risk',
  'status',
  'note',
];

/** 含 UTF-8 BOM，Excel 直接開啟中文不亂碼。 */
export function toCsv(rows: AltExportRow[]): string {
  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvCell(row[header])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function toTsv(rows: AltExportRow[]): string {
  return rows
    .map((row) => `${row.filename.replace(/\t/g, ' ')}\t${row.suggested_alt.replace(/\t/g, ' ')}`)
    .join('\n');
}

export function toJson(
  run: Pick<AltRunRow, 'page_url'>,
  rows: AltExportRow[],
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify(
    {
      page_url: run.page_url,
      exported_at: exportedAt,
      count: rows.length,
      items: rows.map((row) => ({
        image_url: row.image_url,
        filename: row.filename,
        location: row.location,
        current_alt: row.current_alt,
        alt: row.suggested_alt,
        short_alt: row.short_alt,
        keyword: row.keyword,
        confidence: row.confidence,
        risk: row.risk,
        status: row.status,
        note: row.note,
      })),
    },
    null,
    2,
  );
}

/** 給 Framer／試算表貼上的順序清單。 */
export function toChecklist(rows: AltExportRow[]): string {
  return rows
    .map((row, index) => `${index + 1}. ${row.filename} (${row.location})\n   ${row.suggested_alt}`)
    .join('\n\n');
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export function exportFilename(run: Pick<AltRunRow, 'page_url'>, extension: string): string {
  let host = 'alt-pilot';
  try {
    host = new URL(run.page_url).host.replace(/[^a-z0-9.-]+/gi, '-');
  } catch {
    // keep fallback
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return `alt-pilot-${host}-${stamp}.${extension}`;
}
