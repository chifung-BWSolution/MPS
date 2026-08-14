import type { AdsPlatform, AdsTag } from '@/types/adsTags';

export const ADS_COST_TREND_BUCKET_IDS = [
  'd0_30',
  'd31_60',
  'd61_90',
  'd91_120',
  'd121_150',
  'd151_180',
] as const;

export type AdsCostTrendRollingBucketId = (typeof ADS_COST_TREND_BUCKET_IDS)[number];
export type AdsCostTrendBucketId = string;

export type AdsCostTrendPeriodMode = 'rolling30' | 'monthly';

export type AdsCostTrendPlatformFilter = 'all' | AdsPlatform;

export type AdsCostTrendBucketDef = {
  id: AdsCostTrendBucketId;
  label: string;
  /** Inclusive days-ago from as-of date (0 = as-of day). Rolling 30-day view only. */
  fromOffset?: number;
  toOffset?: number;
};

export type AdsCostTrendBucketRange = AdsCostTrendBucketDef & {
  from: string;
  to: string;
};

export type AdsCostTrendBuckets = Record<string, number>;

export type AdsCostTrendCampaign = {
  key: string;
  platform: AdsPlatform;
  accountId: string;
  campaignId: string;
  campaignName: string;
  accountName: string;
  status: string;
  objectives: string[];
  brandListIds: string[];
  tags: AdsTag[];
  buckets: AdsCostTrendBuckets;
  totalMicros: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

export type AdsCostTrendBrandRow = {
  brandId: string;
  brandCode: string;
  displayName: string;
  campaigns: AdsCostTrendCampaign[];
  buckets: AdsCostTrendBuckets;
  totalMicros: number;
};

export type AdsCostTrendFilters = {
  platform: AdsCostTrendPlatformFilter;
  objective: string;
  tag: string;
  search: string;
};

export type AdsCostTrendSortKey = 'brand' | 'total' | AdsCostTrendBucketId;
export type AdsCostTrendSortDir = 'asc' | 'desc';
