import type { AdsCampaignPlatform } from '@/components/marketing/campaign-detail/types';

/**
 * Frozen v1 contract for the campaign AI advisor.
 * Edge Function copies tool names/args into
 * `supabase/functions/ads-campaign-advisor/tools.ts` — keep them identical.
 *
 * Frozen tool names:
 * - search_campaigns
 * - get_campaign_metrics
 * - compare_campaigns
 * - get_campaigns_by_tag
 * - get_campaign_breakdowns
 */

export type AdsAdvisorPlatform = AdsCampaignPlatform;

export type AdsAdvisorKpi = {
  id: string;
  label: string;
  value: string;
  deltaPct: number | null;
};

export type AdsAdvisorSnapshot = {
  platform: AdsAdvisorPlatform;
  accountId: string;
  campaignId: string;
  campaignName: string;
  status: string;
  accountLabel: string;
  channelOrObjective?: string;
  objectives?: string[];
  brandLabel?: string;
  websites: { domain: string }[];
  tags: string[];
  dateFrom: string;
  dateTo: string;
  kpis: AdsAdvisorKpi[];
};

export type AdsAdvisorMessageRole = 'user' | 'assistant';

export type AdsAdvisorMessage = {
  role: AdsAdvisorMessageRole;
  content: string;
};

export type AdsAdvisorRequest = {
  snapshot: AdsAdvisorSnapshot;
  messages: AdsAdvisorMessage[];
};

export type AdsAdvisorToolName =
  | 'search_campaigns'
  | 'get_campaign_metrics'
  | 'compare_campaigns'
  | 'get_campaigns_by_tag'
  | 'get_campaign_breakdowns';

export type AdsAdvisorToolCall = {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
};

export type AdsAdvisorProvider = 'grok' | 'gemini';

export type AdsAdvisorResponse = {
  reply: string;
  toolsUsed: AdsAdvisorToolCall[];
  provider: AdsAdvisorProvider;
  error?: string;
};

/** Tool args — keep in sync with supabase/functions/ads-campaign-advisor/tools.ts */

export type SearchCampaignsArgs = {
  query: string;
  platform?: AdsAdvisorPlatform | 'both';
  status?: string;
  tag?: string;
  limit?: number;
};

export type GetCampaignMetricsArgs = {
  platform: AdsAdvisorPlatform;
  accountId: string;
  campaignId: string;
  dateFrom?: string;
  dateTo?: string;
};

export type CompareCampaignsArgs = {
  campaigns: Array<{
    platform: AdsAdvisorPlatform;
    accountId: string;
    campaignId: string;
  }>;
  dateFrom?: string;
  dateTo?: string;
};

export type GetCampaignsByTagArgs = {
  tag: string;
  platform?: AdsAdvisorPlatform | 'both';
  limit?: number;
};

export type GetCampaignBreakdownsArgs = {
  platform: AdsAdvisorPlatform;
  accountId: string;
  campaignId: string;
  dateFrom?: string;
  dateTo?: string;
  channelType?: string;
};
