import {
  buildAdCsvRows,
  buildCsvFilename,
  toCsv,
  type AdCreativeResult,
} from '@/lib/adCreative';

/**
 * 用 Blob 下載 CSV；UTF-8 BOM 由 toCsv 加上，Excel 直接開不會亂碼。
 * 不引入 xlsx，避免為了一個匯出多拉一個依賴。
 */
export function downloadAdCsv(result: AdCreativeResult): void {
  const csv = toCsv(buildAdCsvRows(result));
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildCsvFilename(result.brief.productName);
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
