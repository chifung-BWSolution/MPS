import { formatChannelCodes, formatLinkedLoginMethods, type VchannelAccount } from '../types/vchannel';
import { accountPlatformLabel, normalizeAccountPlatform } from './vchannelPlatformStatus';

export type AccountListStatusFilter = 'all' | 'active' | 'inactive';

export function accountListMetrics(accounts: VchannelAccount[]) {
  const channelCodes = new Set<string>();
  for (const acc of accounts) {
    for (const code of acc.vchannelCodes) {
      if (code) channelCodes.add(code);
    }
  }
  return {
    total: accounts.length,
    active: accounts.filter(acc => acc.isActive).length,
    channels: channelCodes.size,
  };
}

export function accountPlatformFilterKey(platform: string | null | undefined): string {
  return normalizeAccountPlatform(platform) ?? (platform || '').trim();
}

export function accountPlatformOptions(accounts: VchannelAccount[]): [string, string][] {
  const map = new Map<string, string>();
  for (const acc of accounts) {
    const key = accountPlatformFilterKey(acc.platform);
    const label = accountPlatformLabel(acc.platform);
    if (key && label !== '—') map.set(key, label);
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'zh-Hant'));
}

export function filterVchannelAccounts(
  accounts: VchannelAccount[],
  {
    searchQuery = '',
    platformFilter = 'all',
    statusFilter = 'all',
  }: {
    searchQuery?: string;
    platformFilter?: string;
    statusFilter?: AccountListStatusFilter | string;
  } = {},
): VchannelAccount[] {
  const q = searchQuery.trim().toLowerCase();
  return accounts.filter(acc => {
    if (statusFilter === 'active' && !acc.isActive) return false;
    if (statusFilter === 'inactive' && acc.isActive) return false;
    if (platformFilter !== 'all' && accountPlatformFilterKey(acc.platform) !== platformFilter) return false;
    if (!q) return true;
    return [
      formatChannelCodes(acc.vchannelCodes),
      acc.accountLabel,
      accountPlatformLabel(acc.platform),
      acc.accountId,
      formatLinkedLoginMethods(acc),
      acc.loginMethod,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}
