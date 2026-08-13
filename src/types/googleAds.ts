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
  /** FK → brand_list.id from the matched website profile */
  brandListId?: string | null;
};

export type GoogleAdsCampaign = {
  id: string;
  customerId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  advertisingChannelType?: string;
  /** Biddable conversion-goal categories and campaign optimization goals. */
  objectives?: string[];
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
  /** Distinct brand_list ids from matched website profiles */
  brandListIds: string[];
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
  /** Biddable conversion-goal categories and campaign optimization goals. */
  objectives?: string[];
  accountName?: string;
  currencyCode?: string;
  matchedWebsites: GoogleAdsMatchedWebsite[];
  series: GoogleAdsDailyMetricPoint[];
  totals: GoogleAdsMetricTotals;
  previousTotals: GoogleAdsMetricTotals;
};

/** Channel types that show live breakdown panels on campaign detail. */
export type GoogleAdsBreakdownChannel =
  | 'SEARCH'
  | 'DEMAND_GEN'
  | 'PERFORMANCE_MAX'
  | 'SHOPPING';

export type GoogleAdsAdGroupRow = {
  adGroupId: string;
  adGroupName: string;
  status?: string;
  adGroupType?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type GoogleAdsKeywordRow = {
  adGroupId: string;
  criterionId: string;
  keywordText: string;
  matchType?: string;
  status?: string;
  qualityScore?: number | null;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type GoogleAdsSearchTermRow = {
  /** Empty / omitted for Performance Max campaign_search_term_view rows. */
  adGroupId?: string;
  searchTerm: string;
  keywordText?: string;
  matchType?: string;
  searchTermStatus?: string;
  searchTermMatchType?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type GoogleAdsAssetGroupRow = {
  assetGroupId: string;
  assetGroupName: string;
  status?: string;
  primaryStatus?: string;
  adStrength?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type GoogleAdsAdRow = {
  adGroupId: string;
  adGroupName?: string;
  adId: string;
  adName?: string;
  adType?: string;
  status?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type GoogleAdsAssetRow = {
  assetId: string;
  assetName?: string;
  assetType?: string;
  fieldType?: string;
  performanceLabel?: string;
  status?: string;
  assetGroupId?: string;
  assetGroupName?: string;
  adGroupId?: string;
  adId?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type GoogleAdsProductGroupRow = {
  adGroupId: string;
  adGroupName?: string;
  criterionId: string;
  productGroupLabel: string;
  listingGroupType?: string;
  status?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type GoogleAdsProductRow = {
  productItemId: string;
  productTitle?: string;
  productBrand?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

const SKIP_OBJECTIVE_TOKENS = new Set(['', 'UNSPECIFIED', 'UNKNOWN', 'DEFAULT']);

/** Deduplicate and sort Google Ads objective / conversion-goal enum names. */
export function normalizeGoogleAdsObjectives(raw?: string[] | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw ?? []) {
    const v = String(item || '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (!v || SKIP_OBJECTIVE_TOKENS.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function normalizeGoogleAdsBreakdownChannel(
  raw?: string | null,
): GoogleAdsBreakdownChannel | null {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (t === 'SEARCH') return 'SEARCH';
  if (t === 'DEMAND_GEN') return 'DEMAND_GEN';
  if (t === 'PERFORMANCE_MAX') return 'PERFORMANCE_MAX';
  if (t === 'SHOPPING') return 'SHOPPING';
  return null;
}
