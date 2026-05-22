/**
 * ============================================================
 * Sample Data Registry & Management Utility
 * ============================================================
 * 
 * PURPOSE:
 * This module provides a centralized way to identify, filter, 
 * and clear sample (mock) data across the entire system.
 * 
 * HOW IT WORKS:
 * - All sample data records include `__sampleData: true`
 * - The SAMPLE_DATA_PREFIX 'SAMPLE_' is prepended to IDs
 * - Use `isSampleData(record)` to check any record
 * - Use `filterOutSampleData(array)` to get only real data
 * - Use `getOnlySampleData(array)` to get only sample data
 * - Use `clearAllSampleData()` to remove all sample data from stores
 * 
 * CONVENTIONS:
 * - Sample data IDs start with 'SAMPLE_' prefix
 * - Sample data records have `__sampleData: true` property
 * - When real data from the database arrives, it will NOT have these markers
 * - This makes it trivial to distinguish and clean up
 * 
 * 使用說明：
 * - 所有模擬數據的 ID 都以 'SAMPLE_' 開頭
 * - 所有模擬數據都帶有 __sampleData: true 標記
 * - 當有真實資料庫數據時，可以輕鬆識別並清除模擬數據
 * ============================================================
 */

export const SAMPLE_DATA_PREFIX = 'SAMPLE_';
export const SAMPLE_DATA_FLAG = '__sampleData';

/**
 * Marks a record as sample data by adding the flag
 */
export function markAsSampleData<T extends Record<string, any>>(record: T): T & { __sampleData: true } {
  return { ...record, __sampleData: true as const };
}

/**
 * Marks an array of records as sample data
 */
export function markAllAsSampleData<T extends Record<string, any>>(records: T[]): (T & { __sampleData: true })[] {
  return records.map(r => markAsSampleData(r));
}

/**
 * Checks if a record is sample data
 */
export function isSampleData(record: any): boolean {
  if (!record) return false;
  // Check flag
  if (record.__sampleData === true) return true;
  // Check ID prefix
  if (typeof record.id === 'string' && record.id.startsWith(SAMPLE_DATA_PREFIX)) return true;
  return false;
}

/**
 * Filters out sample data, returning only real data
 */
export function filterOutSampleData<T>(records: T[]): T[] {
  return records.filter(r => !isSampleData(r));
}

/**
 * Returns only sample data records
 */
export function getOnlySampleData<T>(records: T[]): T[] {
  return records.filter(r => isSampleData(r));
}

/**
 * Creates a sample data ID with the standard prefix
 * NOTE: For backward compatibility, you can use plain IDs with __sampleData flag.
 * The prefix approach is recommended for NEW sample data going forward.
 */
export function sampleId(base: string): string {
  return `${SAMPLE_DATA_PREFIX}${base}`;
}

/**
 * For backward-compatible sample IDs (no prefix, flag-based only)
 * Use this when migrating existing data to avoid breaking references.
 */
export function sampleIdCompat(base: string): string {
  return base;
}

/**
 * Summary info for debugging/display
 */
export function getSampleDataSummary(datasets: Record<string, any[]>): {
  totalSample: number;
  totalReal: number;
  breakdown: Record<string, { sample: number; real: number }>;
} {
  let totalSample = 0;
  let totalReal = 0;
  const breakdown: Record<string, { sample: number; real: number }> = {};

  for (const [key, data] of Object.entries(datasets)) {
    const sample = data.filter(r => isSampleData(r)).length;
    const real = data.length - sample;
    breakdown[key] = { sample, real };
    totalSample += sample;
    totalReal += real;
  }

  return { totalSample, totalReal, breakdown };
}

/**
 * Badge text for UI display
 */
export const SAMPLE_BADGE_TEXT = '模擬數據';
export const SAMPLE_BADGE_TEXT_EN = 'Sample Data';
