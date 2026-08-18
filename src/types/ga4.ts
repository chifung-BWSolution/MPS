export type Ga4Property = {
  propertyId: string;
  accountId: string;
  accountName: string;
  displayName: string;
  streamUri: string | null;
  measurementId: string | null;
  websiteProfileId: string | null;
  matchedDomain: string | null;
  websiteName?: string | null;
  lastSyncedAt?: string | null;
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  engagedSessions: number;
  conversions: number;
  bounceRate: number;
  engagementRate: number;
  avgSessionDuration: number;
};

export type Ga4DailyMetricPoint = {
  date: string;
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  engagedSessions: number;
  conversions: number;
  bounceRate: number;
  engagementRate: number;
  avgSessionDuration: number;
  pagesPerSession: number;
};

export type Ga4ChannelPoint = {
  channel: string;
  sessions: number;
  users: number;
  pageviews: number;
};

export type Ga4PageRow = {
  pagePath: string;
  pageTitle: string;
  sessions: number;
  users: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
};

export type Ga4DeviceRow = {
  device: string;
  sessions: number;
  users: number;
  pageviews: number;
};

export type Ga4CountryRow = {
  country: string;
  sessions: number;
  users: number;
  pageviews: number;
};

export type Ga4SourceRow = {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  pageviews: number;
};

export type Ga4SyncRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'error';
  propertiesSynced: number;
  rowsUpserted: number;
  errorMessage: string | null;
};

export type Ga4PropertyDetail = {
  property: Ga4Property;
  series: Ga4DailyMetricPoint[];
  previousSeries: Ga4DailyMetricPoint[];
  channels: Ga4ChannelPoint[];
  totals: import('@/lib/ga4Traffic').Ga4MetricTotals;
  previousTotals: import('@/lib/ga4Traffic').Ga4MetricTotals;
};
