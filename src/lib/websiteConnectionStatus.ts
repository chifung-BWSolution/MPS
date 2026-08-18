export type GoogleAdsConnectionStatus = 'active' | 'paused' | 'unlinked';
export type Ga4ConnectionStatus = 'linked' | 'unlinked';

export type GoogleAdsCampaignLink = {
  websiteProfileId: string;
  campaignRowId?: string | null;
  customerId?: string | null;
  campaignId?: string | null;
};

export type GoogleAdsCampaignStatusRow = {
  id?: string | null;
  customerId?: string | null;
  campaignId?: string | null;
  status?: string | null;
};

function campaignKey(customerId?: string | null, campaignId?: string | null): string {
  const customer = String(customerId || '').trim();
  const campaign = String(campaignId || '').trim();
  if (!customer || !campaign) return '';
  return `${customer}:${campaign}`;
}

/** Normalize Google Ads status tokens (handles fullwidth letters such as ENABLEＤ). */
export function normalizeGoogleAdsCampaignStatus(status: string | null | undefined): string {
  return String(status || '')
    .normalize('NFKC')
    .trim()
    .toUpperCase();
}

export function isGoogleAdsCampaignEnabled(status: string | null | undefined): boolean {
  return normalizeGoogleAdsCampaignStatus(status) === 'ENABLED';
}

export function resolveGoogleAdsConnectionStatus(
  campaignStatuses: Array<string | null | undefined>,
): GoogleAdsConnectionStatus {
  if (campaignStatuses.length === 0) return 'unlinked';
  if (campaignStatuses.some(isGoogleAdsCampaignEnabled)) return 'active';
  return 'paused';
}

export function googleAdsConnectionLabel(status: GoogleAdsConnectionStatus): string {
  switch (status) {
    case 'active':
      return '投放中';
    case 'paused':
      return '已停用';
    default:
      return '未連接';
  }
}

export function resolveGa4ConnectionStatus(hasProperty: boolean): Ga4ConnectionStatus {
  return hasProperty ? 'linked' : 'unlinked';
}

export function ga4ConnectionLabel(status: Ga4ConnectionStatus): string {
  return status === 'linked' ? '已連接' : '未連接';
}

export function googleAdsStatusByWebsiteId(
  links: GoogleAdsCampaignLink[],
  campaigns: GoogleAdsCampaignStatusRow[],
): Record<string, GoogleAdsConnectionStatus> {
  const statusByCampaignId = new Map<string, string>();
  const statusByKey = new Map<string, string>();
  for (const campaign of campaigns) {
    const status = campaign.status ?? '';
    const id = String(campaign.id || '').trim();
    if (id) statusByCampaignId.set(id, status);
    const key = campaignKey(campaign.customerId, campaign.campaignId);
    if (key) statusByKey.set(key, status);
  }

  const statusesByWebsite = new Map<string, string[]>();
  for (const link of links) {
    const websiteId = String(link.websiteProfileId || '').trim();
    if (!websiteId) continue;
    const rowId = String(link.campaignRowId || '').trim();
    const key = campaignKey(link.customerId, link.campaignId);
    const status =
      (rowId ? statusByCampaignId.get(rowId) : undefined) ??
      (key ? statusByKey.get(key) : undefined) ??
      '';
    const list = statusesByWebsite.get(websiteId) ?? [];
    list.push(status);
    statusesByWebsite.set(websiteId, list);
  }

  const out: Record<string, GoogleAdsConnectionStatus> = {};
  for (const [websiteId, statuses] of statusesByWebsite) {
    out[websiteId] = resolveGoogleAdsConnectionStatus(statuses);
  }
  return out;
}

export function ga4LinkedWebsiteIds(
  properties: Array<{ websiteProfileId?: string | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const property of properties) {
    const id = String(property.websiteProfileId || '').trim();
    if (id) ids.add(id);
  }
  return ids;
}
