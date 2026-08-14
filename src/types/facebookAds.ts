export type FacebookAdsAccount = {
  adAccountId: string;
  accountName: string;
  currencyCode?: string;
  timeZone?: string;
  status: string;
  accountStatus?: number;
  businessKey: string;
  businessName: string;
  brandListId?: string | null;
  lastSyncedAt?: string;
};

export type FacebookAdsCampaign = {
  id: string;
  adAccountId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  objective?: string;
  /** Manual FK → brand_list.id */
  brandListId?: string | null;
  brandCode?: string;
  brandDisplayName?: string;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  ctr?: number;
  averageCpcMicros?: number;
  lastSyncedAt?: string;
  accountName?: string;
  businessName?: string;
};

export type FacebookAdsSyncRun = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'error';
  accountsSynced: number;
  campaignsSynced: number;
  errorMessage?: string;
  businesses?: string[];
  credentialsCount?: number;
};

export type FacebookAdsBackfillJob = {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  historyStartDate: string;
  historyEndDate: string;
  cursorMonth: string;
  totalMonths: number;
  completedMonths: number;
  rowsUpserted: number;
  accountsTargeted: number;
  errorCount: number;
  lastError?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  meta?: {
    last_month?: string;
    last_month_rows?: number;
    recent_errors?: string[];
    enabled_ad_account_ids?: string[];
    account_business?: Record<string, string>;
    businesses?: string[];
    credentials_count?: number;
  };
};

export type DateRangePreset = '7d' | '14d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';

export type FacebookAdsDailyMetricPoint = {
  date: string;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  ctr: number;
  averageCpcMicros: number;
};

export type FacebookAdsMetricTotals = {
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  ctr: number;
  averageCpcMicros: number;
  cpaMicros: number | null;
};

export type FacebookAdsCampaignDetail = {
  adAccountId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  objective?: string;
  accountName?: string;
  businessName?: string;
  businessKey?: string;
  currencyCode?: string;
  brandListId?: string | null;
  brandCode?: string;
  brandDisplayName?: string;
  series: FacebookAdsDailyMetricPoint[];
  totals: FacebookAdsMetricTotals;
  previousTotals: FacebookAdsMetricTotals;
};

export type FacebookAdsAdSetRow = {
  adSetId: string;
  adSetName: string;
  status?: string;
  optimizationGoal?: string;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  ctr: number;
};

export type FacebookAdsAdRow = {
  adId: string;
  adName: string;
  adSetId?: string;
  adSetName?: string;
  status?: string;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  ctr: number;
};

export type FacebookAdsPlacementRow = {
  publisherPlatform: string;
  publisherPlatformLabel: string;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
  ctr: number;
};
