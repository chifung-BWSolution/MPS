/**
 * ALT Pilot · 配額顯示與判斷
 *
 * `daily_call_limit = 0` 代表不限次數；大於 0 才是硬上限。
 * 關閉功能請用 `alt_settings.enabled = false`，不要用 limit=0 當關閉。
 */

export function isAltQuotaExceeded(calls: number, limit: number): boolean {
  return limit > 0 && calls >= limit;
}

export function formatAltQuota(today: number, limit: number): string {
  // 沒有設上限時只顯示今日次數，不顯示「/不限」。
  return limit > 0 ? `${today}/${limit}` : `${today}`;
}
