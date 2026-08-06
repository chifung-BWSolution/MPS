export type AdsPlatformSource = 'google' | 'facebook';

export type AdsDiscoveredDomainStatus = 'unmatched' | 'linked' | 'dismissed';

export type AdsDiscoveredDomain = {
  normalizedDomain: string;
  sampleUrl: string | null;
  sources: AdsPlatformSource[];
  status: AdsDiscoveredDomainStatus;
  websiteProfileId: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
};

export type AdsAppliedStatus = 'none' | 'google' | 'facebook' | 'both';

export type AdsWebsiteLinkSummary = {
  websitesLinked: number;
  domainsDiscovered: number;
  domainsUnmatched: number;
  campaignsWithLinks?: number;
  accountsWithLinks?: number;
  linkErrors: string[];
};

export type AdsWebsiteSyncResult = {
  success?: boolean;
  google?: AdsWebsiteLinkSummary;
  facebook?: AdsWebsiteLinkSummary;
  unmatched: AdsDiscoveredDomain[];
  error?: string;
};
