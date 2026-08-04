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
  metricsStartDate?: string;
  metricsEndDate?: string;
  lastSyncedAt?: string;
  /** Joined from accounts when available */
  accountName?: string;
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
