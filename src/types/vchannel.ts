export type VchannelImportance = 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
export type VchannelDeviceType = 'M' | 'D' | 'DM' | 'D_M';
export type VchannelStatus = 'active' | 'paused' | 'archived';

export interface VchannelPlatformStatus {
  kind: 'url' | 'opened' | 'pending' | 'n/a' | 'unknown';
  raw_text?: string;
  url?: string;
  operator_hint?: string;
}

export interface Vchannel {
  id: string;
  channelCode: string;
  internalName: string;
  publicName: string;
  importance: VchannelImportance;
  deviceType: VchannelDeviceType;
  /** UUID FK → brand_list.id */
  brandListId: string | null;
  /** Resolved from brand_list for display/filter (not a DB column) */
  brandCode: string;
  status: VchannelStatus;
  platformStatus: Record<string, VchannelPlatformStatus>;
  videoCount: number;
  caseCount: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VchannelAccount {
  id: string;
  vchannelCodes: string[];
  accountLabel: string;
  channelIntro?: string;
  platform: string;
  accountId?: string;
  accountPassword?: string;
  loginMethod?: string;
  operatorCode?: string;
  feedhiveManaged: boolean;
  /** Meta Ads account id (act_…) when linked from facebook_ads_accounts */
  facebookAdsAdAccountId?: string;
  notes?: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Map DB device_type ↔ legacy UI deviceType */
export function dbDeviceToUi(device: VchannelDeviceType): 'desktop' | 'mobile' | 'both' {
  if (device === 'D') return 'desktop';
  if (device === 'M') return 'mobile';
  return 'both';
}

export function uiDeviceToDb(device: 'desktop' | 'mobile' | 'both'): VchannelDeviceType {
  if (device === 'desktop') return 'D';
  if (device === 'mobile') return 'M';
  return 'DM';
}

export function parseChannelCodes(raw: string): string[] {
  return raw
    .split(/[\/,、]/)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
}

export function formatChannelCodes(codes: string[]): string {
  return codes.join('/');
}
