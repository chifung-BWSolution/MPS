import { formatChannelCodes, formatLinkedLoginMethods, type VchannelAccount } from '../types/vchannel';
import { accountPlatformLabel } from './vchannelPlatformStatus';

export type AccountSortKey =
  | 'vchannel'
  | 'name'
  | 'platform'
  | 'accountId'
  | 'loginMethod'
  | 'feedhive'
  | 'isActive';

export type AccountSortDir = 'asc' | 'desc';

export const ACCOUNT_SORT_COLUMNS: { key: AccountSortKey; label: string }[] = [
  { key: 'vchannel', label: 'Vchannel' },
  { key: 'name', label: '名稱' },
  { key: 'platform', label: '平台' },
  { key: 'accountId', label: '賬號ID' },
  { key: 'loginMethod', label: '登入方式' },
  { key: 'feedhive', label: 'FeedHive' },
  { key: 'isActive', label: '狀態' },
];

export function accountSortValue(account: VchannelAccount, key: AccountSortKey): string | number {
  switch (key) {
    case 'vchannel':
      return formatChannelCodes(account.vchannelCodes);
    case 'name':
      return account.accountLabel;
    case 'platform':
      return accountPlatformLabel(account.platform);
    case 'accountId':
      return account.accountId ?? '';
    case 'loginMethod':
      return formatLinkedLoginMethods(account);
    case 'feedhive':
      return account.feedhiveManaged ? 1 : 0;
    case 'isActive':
      return account.isActive ? 1 : 0;
  }
}

export function compareAccountSortValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'zh-Hant', { numeric: true, sensitivity: 'base' });
}

export function sortVchannelAccounts(
  accounts: VchannelAccount[],
  key: AccountSortKey,
  dir: AccountSortDir,
): VchannelAccount[] {
  return [...accounts].sort((left, right) => {
    const cmp = compareAccountSortValues(accountSortValue(left, key), accountSortValue(right, key));
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    if (key === 'vchannel') return 0;
    return compareAccountSortValues(accountSortValue(left, 'vchannel'), accountSortValue(right, 'vchannel'));
  });
}
