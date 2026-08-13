import type { AdsDailySeriesPoint, AdsKpiItem } from '@/components/marketing/campaign-detail/types';

export type AdsComparePlatform = 'google' | 'facebook';

export type AdsCompareMetric =
  | 'impressions'
  | 'clicks'
  | 'cost'
  | 'conversions'
  | 'ctr'
  | 'cpc';

export type AdsCompareCampaignOption = {
  /** `{platform}:{accountId}:{campaignId}` */
  key: string;
  platform: AdsComparePlatform;
  accountId: string;
  campaignId: string;
  campaignName: string;
  accountName: string;
  status: string;
  extra?: string;
};

export type AdsCompareCatalog = {
  google: AdsCompareCampaignOption[];
  facebook: AdsCompareCampaignOption[];
  googleMinDate: string | null;
  googleMaxDate: string | null;
  facebookMinDate: string | null;
  facebookMaxDate: string | null;
};

export type AdsCompareSeriesPoint = AdsDailySeriesPoint;

export type AdsCompareTotals = {
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  averageCpcMicros: number;
  cpaMicros: number | null;
};

export type AdsCompareKpiItem = AdsKpiItem;
