import type { ReactNode } from 'react';
import type { DateRangePreset } from '@/types/googleAds';

export type AdsCampaignPlatform = 'google' | 'facebook';

export type AdsDailySeriesPoint = {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cpc: number;
  /** Facebook only — pixel event map for the Conv. hover card. */
  conversionBreakdown?: Record<string, number>;
};

export type AdsKpiItem = {
  id: string;
  label: string;
  value: string;
  deltaPct: number | null;
  sparkline: number[];
  hint?: string;
  /** Optional rich hover (Facebook Conv. breakdown). */
  hover?: ReactNode;
};

export type AdsLinkedWebsite = {
  domain: string;
  websiteProfileId: string;
};

export type AdsPlaceholderSection = {
  id: string;
  title: string;
  description: string;
};

export type AdsBreakdownTablesProps = {
  channelType?: string | null;
  supported: boolean;
  adGroups: import('@/types/googleAds').GoogleAdsAdGroupRow[];
  keywords: import('@/types/googleAds').GoogleAdsKeywordRow[];
  searchTerms: import('@/types/googleAds').GoogleAdsSearchTermRow[];
  assetGroups: import('@/types/googleAds').GoogleAdsAssetGroupRow[];
  ads: import('@/types/googleAds').GoogleAdsAdRow[];
  assets: import('@/types/googleAds').GoogleAdsAssetRow[];
  productGroups: import('@/types/googleAds').GoogleAdsProductGroupRow[];
  products: import('@/types/googleAds').GoogleAdsProductRow[];
  loading: boolean;
  error?: string | null;
};

export type FacebookAdsBreakdownTablesProps = {
  supported: boolean;
  adSets: import('@/types/facebookAds').FacebookAdsAdSetRow[];
  ads: import('@/types/facebookAds').FacebookAdsAdRow[];
  placements: import('@/types/facebookAds').FacebookAdsPlacementRow[];
  loading: boolean;
  error?: string | null;
};

export type AdsCampaignDetailViewModel = {
  platform: AdsCampaignPlatform;
  platformLabel: string;
  campaignName: string;
  campaignId: string;
  status: string;
  accountLabel: string;
  accountId: string;
  channelOrObjective?: string;
  /** Google Ads conversion / optimization goals, shown after the type badge. */
  objectives?: string[];
  websites: AdsLinkedWebsite[];
  businessLabel?: string;
  brandLabel?: string;
  series: AdsDailySeriesPoint[];
  kpis: AdsKpiItem[];
  /** @deprecated Prefer breakdowns for Google; kept for optional empty-state fallback */
  placeholders?: AdsPlaceholderSection[];
  breakdowns?: AdsBreakdownTablesProps;
  facebookBreakdowns?: FacebookAdsBreakdownTablesProps;
};

export type AdsDateRangeControls = {
  preset: DateRangePreset;
  customFrom: string;
  customTo: string;
  rangeFrom: string;
  rangeTo: string;
  dataMinDate?: string | null;
  dataMaxDate?: string | null;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
};

export type AdsCampaignDetailShellProps = {
  model: AdsCampaignDetailViewModel;
  dateRange: AdsDateRangeControls;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onOpenWebsite?: (websiteProfileId: string) => void;
  headerExtra?: ReactNode;
};
