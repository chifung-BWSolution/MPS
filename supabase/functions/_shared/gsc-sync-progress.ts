export const GSC_RESUME_WINDOW_MS = 36 * 60 * 60 * 1000;

export function isGscPermissionError(message: string): boolean {
  return /insufficient permission|does not have sufficient permission|accessNotConfigured|PERMISSION_DENIED/i
    .test(message);
}

export function resumeSkipSiteUrls(
  last: {
    started_at?: string;
    meta?: {
      incomplete?: boolean;
      timed_out?: boolean;
      processed_site_urls?: string[];
      skipped_site_urls?: string[];
    } | null;
  } | null,
  nowMs = Date.now(),
): string[] {
  if (!last?.meta || !(last.meta.incomplete || last.meta.timed_out)) return [];
  const started = Date.parse(String(last.started_at || ""));
  if (Number.isNaN(started) || nowMs - started > GSC_RESUME_WINDOW_MS) return [];
  return [...new Set([
    ...(last.meta.processed_site_urls ?? []),
    ...(last.meta.skipped_site_urls ?? []),
  ])];
}
