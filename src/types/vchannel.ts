export type VchannelImportance = 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
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
  /** UUID FK → brand_list.id */
  brandListId: string | null;
  /** Resolved from brand_list for display/filter (not a DB column) */
  brandCode: string;
  status: VchannelStatus;
  platformStatus: Record<string, VchannelPlatformStatus>;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type VchannelAccountLinkedLoginMethod = {
  id: string;
  displayName: string;
  loginMethod: string;
  isActive: boolean;
};

export interface VchannelAccount {
  id: string;
  vchannelCodes: string[];
  accountLabel: string;
  platform: string;
  accountId?: string;
  /** Legacy free-text login hint; kept as reference until dropped. */
  loginMethod?: string;
  loginMethodIds: string[];
  linkedLoginMethods: VchannelAccountLinkedLoginMethod[];
  feedhiveManaged: boolean;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function formatLinkedLoginMethods(account: Pick<VchannelAccount, 'linkedLoginMethods' | 'loginMethod'>): string {
  if (account.linkedLoginMethods?.length) {
    return account.linkedLoginMethods.map(method => method.displayName).join('、');
  }
  return account.loginMethod ?? '';
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
