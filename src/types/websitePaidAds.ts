export type WebsiteGoogleAdCampaign = {
  platform: 'google';
  key: string;
  customerId: string;
  campaignId: string;
  campaignRowId: string;
  campaignName: string;
  status: string;
  channelType?: string;
  accountName?: string;
  matchedDomain: string;
  sampleFinalUrl: string | null;
  matchSource: string;
  lastSeenAt: string;
  impressions: number;
  clicks: number;
  spendMicros: number;
  conversions: number;
};

export type WebsitePaidAdsData = {
  googleCampaigns: WebsiteGoogleAdCampaign[];
};
