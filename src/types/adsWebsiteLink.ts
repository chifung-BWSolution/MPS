export type AdsPlatformSource = 'google' | 'facebook';

export type AdsDiscoveredDomainStatus = 'unmatched' | 'linked' | 'dismissed';

export type AdsSourceRef = {
  platform: AdsPlatformSource;
  accountId: string;
  accountName: string;
  campaignId: string | null;
  campaignName: string | null;
  /** Legacy Facebook page refs may still exist in ads_discovered_domains */
  pageId: string | null;
  pageName: string | null;
};

export type AdsDiscoveredDomain = {
  normalizedDomain: string;
  sampleUrl: string | null;
  sources: AdsPlatformSource[];
  status: AdsDiscoveredDomainStatus;
  websiteProfileId: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
  sourceRefs?: AdsSourceRef[];
};

/** Website ads status is Google-only after Facebook pivoted to vchannel_accounts */
export type AdsAppliedStatus = 'none' | 'google';

export type AdsWebsiteLinkSummary = {
  websitesLinked: number;
  domainsDiscovered: number;
  domainsUnmatched: number;
  campaignsWithLinks?: number;
  linkErrors: string[];
};

export type AdsWebsiteSyncResult = {
  success?: boolean;
  google?: AdsWebsiteLinkSummary;
  unmatched: AdsDiscoveredDomain[];
  linkErrors?: string[];
  error?: string;
};
