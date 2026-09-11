import type { GscSyncRunMeta, GscSyncRunRow } from '../types/seo';

/** Worker limit is ~150s; treat longer "running" rows as abandoned. */
export const GSC_STALE_RUNNING_MS = 3 * 60 * 1000;

export function isLiveGscRun(run: GscSyncRunRow | null, nowMs = Date.now()): boolean {
  return Boolean(run && run.status === 'running' && !isStaleGscRun(run, nowMs));
}

export type GscSyncRunDb = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: GscSyncRunRow['status'];
  sites_synced: number | string | null;
  rows_upserted: number | string | null;
  keywords_upserted: number | string | null;
  error_message: string | null;
  meta?: GscSyncRunMeta | null;
};

export function mapGscSyncRun(row: GscSyncRunDb): GscSyncRunRow {
  return {
    id: row.id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    status: row.status,
    sites_synced: Number(row.sites_synced) || 0,
    rows_upserted: Number(row.rows_upserted) || 0,
    keywords_upserted: Number(row.keywords_upserted) || 0,
    error_message: row.error_message,
    meta: row.meta ?? null,
  };
}

export function isStaleGscRun(run: GscSyncRunRow | null, nowMs = Date.now()): boolean {
  if (!run || run.status !== 'running' || run.finished_at) return false;
  const started = Date.parse(run.started_at);
  if (Number.isNaN(started)) return false;
  return nowMs - started > GSC_STALE_RUNNING_MS;
}

export const GSC_RESUME_WINDOW_MS = 36 * 60 * 60 * 1000;

export function isGscPermissionError(message: string): boolean {
  return /insufficient permission|does not have sufficient permission|accessNotConfigured|PERMISSION_DENIED/i
    .test(message);
}

export function shortenGscLog(message: string): string {
  const text = String(message || '').trim();
  if (isGscPermissionError(text)) {
    const site = text.match(/https?:\/\/[^\s'"]+|sc-domain:[^\s'"]+/)?.[0]
      ?.replace(/[:.,;]+$/, '');
    return site ? `${site}: 無權限，已略過` : '無權限，已略過';
  }
  if (/duplicate key value violates unique constraint/i.test(text)) {
    const site = text.match(/https?:\/\/[^\s]+|sc-domain:[^\s]+/)?.[0];
    return site ? `${site}: 關鍵字已存在，已更新` : '關鍵字已存在，已更新';
  }
  return text.length > 280 ? `${text.slice(0, 277)}…` : text;
}

export function resumeSkipSiteUrls(
  last: {
    started_at?: string;
    meta?: Pick<GscSyncRunMeta, 'incomplete' | 'timed_out' | 'processed_site_urls' | 'skipped_site_urls'> | null;
  } | null,
  nowMs = Date.now(),
): string[] {
  if (!last?.meta || !(last.meta.incomplete || last.meta.timed_out)) return [];
  const started = Date.parse(String(last.started_at || ''));
  if (Number.isNaN(started) || nowMs - started > GSC_RESUME_WINDOW_MS) return [];
  return [...new Set([
    ...(last.meta.processed_site_urls ?? []),
    ...(last.meta.skipped_site_urls ?? []),
  ])];
}

export function gscRunStatusLabel(run: GscSyncRunRow | null, nowMs = Date.now()) {
  if (!run) {
    return { text: '尚未開始', className: 'bg-slate-50 text-slate-600 border-slate-200' };
  }
  if (run.status === 'running' && isStaleGscRun(run, nowMs)) {
    return { text: '可能已逾時', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (run.meta?.incomplete) {
    return { text: '部分完成', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  switch (run.status) {
    case 'running':
      return { text: '執行中', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'success':
      return { text: '已完成', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'error':
      return { text: '失敗', className: 'bg-red-50 text-red-700 border-red-200' };
    default:
      return { text: '尚未開始', className: 'bg-slate-50 text-slate-600 border-slate-200' };
  }
}

export function gscRunProgressPct(run: GscSyncRunRow | null, nowMs = Date.now()): number {
  if (!run) return 0;
  const listed = Number(run.meta?.sites_listed) || 0;
  const done = run.meta?.processed_site_urls?.length
    ?? ((Number(run.sites_synced) || 0) + (run.meta?.skipped_site_urls?.length ?? 0));
  if (listed > 0) return Math.min(100, Math.round((done / listed) * 100));
  if (run.status === 'success' && !run.meta?.incomplete) return 100;
  if (run.status === 'running' && !isStaleGscRun(run, nowMs)) return 55;
  return 0;
}

export function gscRunRecentErrors(run: GscSyncRunRow | null): string[] {
  const fromMeta = (run?.meta?.errors ?? []).filter(Boolean).map(shortenGscLog);
  const skipped = (run?.meta?.skipped ?? run?.meta?.skipped_site_urls ?? []).filter(Boolean)
    .map((site) => `${site}: 無權限，已略過`);
  const lines = [...fromMeta];
  for (const line of skipped) {
    if (!lines.includes(line)) lines.push(line);
  }
  if (run?.error_message) {
    const head = shortenGscLog(run.error_message);
    if (!lines.includes(head)) return [head, ...lines];
  }
  return lines;
}
