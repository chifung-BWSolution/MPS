import { formatChannelCodes } from '../types/vchannel';
import { accountPlatformLabel } from './vchannelPlatformStatus';

export type LinkableAccount = {
  id: string;
  vchannelCodes: string[];
  accountLabel?: string;
  platform?: string;
  accountId?: string;
  loginMethod?: string;
  linkedLoginMethods?: { displayName: string }[];
  isActive?: boolean;
};

export type AccountLinkPatch = {
  id: string;
  vchannelCodes: string[];
};

export function normalizeChannelCode(code: string | undefined | null): string {
  return (code ?? '').trim().toUpperCase();
}

export function hasChannelCode(codes: string[] | undefined | null, channelCode: string): boolean {
  const target = normalizeChannelCode(channelCode);
  if (!target) return false;
  return (codes ?? []).some(code => normalizeChannelCode(code) === target);
}

export function addChannelCode(codes: string[] | undefined | null, channelCode: string): string[] {
  const current = [...(codes ?? [])];
  const target = normalizeChannelCode(channelCode);
  if (!target || hasChannelCode(current, target)) return current;
  return [...current, target];
}

export function removeChannelCode(codes: string[] | undefined | null, channelCode: string): string[] {
  const target = normalizeChannelCode(channelCode);
  if (!target) return [...(codes ?? [])];
  return (codes ?? []).filter(code => normalizeChannelCode(code) !== target);
}

export function codesEqual(left: string[] | undefined | null, right: string[] | undefined | null): boolean {
  const a = [...(left ?? [])].map(normalizeChannelCode).filter(Boolean).sort();
  const b = [...(right ?? [])].map(normalizeChannelCode).filter(Boolean).sort();
  return a.length === b.length && a.every((code, index) => code === b[index]);
}

export function accountLinkFingerprint(account: {
  accountLabel?: string;
  platform?: string;
  accountId?: string;
  vchannelCodes: string[];
}): string {
  return [
    (account.platform ?? '').trim().toLowerCase(),
    (account.accountLabel ?? '').trim(),
    (account.accountId ?? '').trim(),
    [...account.vchannelCodes].map(normalizeChannelCode).filter(Boolean).sort().join('/'),
  ].join('\u0001');
}

export function accountPickerLabel(account: {
  accountLabel?: string;
  platform?: string;
  accountId?: string;
}): string {
  const platform = accountPlatformLabel(account.platform);
  const name = (account.accountLabel ?? '').trim() || (account.accountId ?? '').trim() || '未命名帳戶';
  return `${platform} · ${name}`;
}

export function accountMatchesPickerQuery(account: LinkableAccount, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    account.accountLabel ?? '',
    account.platform ?? '',
    accountPlatformLabel(account.platform),
    account.accountId ?? '',
    account.loginMethod ?? '',
    ...(account.linkedLoginMethods ?? []).map(method => method.displayName),
    account.isActive === false ? '停用' : '啟用',
    formatChannelCodes(account.vchannelCodes ?? []),
    (account.vchannelCodes ?? []).join(' '),
  ].join('\n').toLowerCase();
  return haystack.includes(q);
}

export function planAccountChannelLinkPatches(args: {
  accounts: LinkableAccount[];
  selectedIds: string[];
  initialLinkedIds: string[];
  channelCode: string;
  previousChannelCode?: string;
}): AccountLinkPatch[] {
  const finalCode = normalizeChannelCode(args.channelCode);
  if (!finalCode) return [];

  const previousCode = normalizeChannelCode(args.previousChannelCode);
  const selected = new Set(args.selectedIds);
  const initiallyLinked = new Set(args.initialLinkedIds);
  const patches: AccountLinkPatch[] = [];

  for (const account of args.accounts) {
    const shouldLink = selected.has(account.id);
    const wasLinked = initiallyLinked.has(account.id);
    if (!shouldLink && !wasLinked) continue;

    let next = [...(account.vchannelCodes ?? [])];
    if (shouldLink) {
      if (previousCode && previousCode !== finalCode) {
        next = removeChannelCode(next, previousCode);
      }
      next = addChannelCode(next, finalCode);
    } else {
      if (previousCode) next = removeChannelCode(next, previousCode);
      next = removeChannelCode(next, finalCode);
    }

    if (!codesEqual(next, account.vchannelCodes)) {
      patches.push({ id: account.id, vchannelCodes: next });
    }
  }

  return patches;
}
