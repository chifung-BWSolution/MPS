import type { GscBreakdownRow, GscDailyPoint, GscMetricTotals } from '@/lib/gscReport';

export type GscSiteRow = {
  siteUrl: string;
  permissionLevel: string | null;
  websiteProfileId: string | null;
  matchedDomain: string | null;
  websiteName: string | null;
  lastSyncedAt: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSyncRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  sitesSynced: number;
  rowsUpserted: number;
  errorMessage: string | null;
};

export type GscSiteDetail = {
  site: GscSiteRow;
  totals: GscMetricTotals;
  previousTotals: GscMetricTotals;
  series: GscDailyPoint[];
  queries: GscBreakdownRow[];
  pages: GscBreakdownRow[];
};
