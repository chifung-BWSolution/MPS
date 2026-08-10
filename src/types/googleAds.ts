export type GoogleAdsAccount = {
  customerId: string;
  descriptiveName: string;
  currencyCode?: string;
  timeZone?: string;
  status: string;
  isManager: boolean;
  level: number;
  managerCustomerId?: string;
  lastSyncedAt?: string;
};

export type GoogleAdsMatchedWebsite = {
  domain: string;
  websiteProfileId: string;
};

export type GoogleAdsCampaign = {
  id: string;
  customerId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  advertisingChannelType?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr?: number;
  averageCpcMicros?: number;
  lastSyncedAt?: string;
  accountName?: string;
  /** Links from google_ads_campaign_websites (matched_domain + website_profile_id) */
  matchedWebsites: GoogleAdsMatchedWebsite[];
};

export type GoogleAdsSyncRun = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'error';
  accountsSynced: number;
  campaignsSynced: number;
  errorMessage?: string;
};

export type GoogleAdsBackfillJob = {
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
    enabled_customer_ids?: string[];
    websites_linked?: number;
    domains_discovered?: number;
    domains_unmatched?: number;
    campaigns_with_links?: number;
    link_errors?: string[];
  };
};

export type DateRangePreset = '7d' | '14d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';

export type GoogleAdsDailyMetricPoint = {
  date: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  averageCpcMicros: number;
};

export type GoogleAdsMetricTotals = {
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  averageCpcMicros: number;
  cpaMicros: number | null;
};

export type GoogleAdsCampaignDetail = {
  customerId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  advertisingChannelType?: string;
  accountName?: string;
  currencyCode?: string;
  matchedWebsites: GoogleAdsMatchedWebsite[];
  series: GoogleAdsDailyMetricPoint[];
  totals: GoogleAdsMetricTotals;
  previousTotals: GoogleAdsMetricTotals;
};
