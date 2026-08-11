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
};

export type AdsKpiItem = {
  id: string;
  label: string;
  value: string;
  deltaPct: number | null;
  sparkline: number[];
  hint?: string;
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
  adGroups: import('@/types/googleAds').GoogleAdsAdGroupRow[];
  keywords: import('@/types/googleAds').GoogleAdsKeywordRow[];
  searchTerms: import('@/types/googleAds').GoogleAdsSearchTermRow[];
  loading: boolean;
  error?: string | null;
};

export type AdsCampaignDetailViewModel = {
  platform: AdsCampaignPlatform;
  platformLabel: string;
  campaignName: string;
  status: string;
  accountLabel: string;
  accountId: string;
  channelOrObjective?: string;
  websites: AdsLinkedWebsite[];
  series: AdsDailySeriesPoint[];
  kpis: AdsKpiItem[];
  /** @deprecated Prefer breakdowns for Google; kept for optional empty-state fallback */
  placeholders?: AdsPlaceholderSection[];
  breakdowns?: AdsBreakdownTablesProps;
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
