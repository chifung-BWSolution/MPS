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
  lastSyncedAt?: string;
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
  };
};

export type DateRangePreset = '7d' | '14d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';
