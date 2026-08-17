import { formatChannelCodes, parseChannelCodes, type VchannelAccount } from '../types/vchannel';
import { normalizeAccountPlatform } from './vchannelPlatformStatus';

export const emptyAccountForm = {
  vchannelCodes: [] as string[],
  vchannelCodesRaw: '',
  accountLabel: '',
  platform: '',
  accountId: '',
  loginMethod: '',
  loginMethodIds: [] as string[],
  feedhiveManaged: false,
  notes: '',
  isActive: true,
};

export type AccountFormState = typeof emptyAccountForm;

export type AccountFormPayload = {
  vchannelCodes: string[];
  accountLabel: string;
  platform: string;
  accountId?: string;
  loginMethod?: string;
  loginMethodIds: string[];
  feedhiveManaged: boolean;
  notes?: string;
  isActive: boolean;
};

export function accountToForm(account: VchannelAccount): AccountFormState {
  return {
    vchannelCodes: account.vchannelCodes,
    vchannelCodesRaw: formatChannelCodes(account.vchannelCodes),
    accountLabel: account.accountLabel,
    platform: normalizeAccountPlatform(account.platform) ?? account.platform,
    accountId: account.accountId ?? '',
    loginMethod: account.loginMethod ?? '',
    loginMethodIds: [...(account.loginMethodIds ?? [])],
    feedhiveManaged: account.feedhiveManaged,
    notes: account.notes ?? '',
    isActive: account.isActive !== false,
  };
}

export function formToAccountPayload(form: AccountFormState): AccountFormPayload | null {
  const codes = parseChannelCodes(form.vchannelCodesRaw || form.vchannelCodes.join('/'));
  const platform = normalizeAccountPlatform(form.platform);
  if (!codes.length || !platform) return null;
  return {
    vchannelCodes: codes,
    accountLabel: form.accountLabel,
    platform,
    accountId: form.accountId || undefined,
    loginMethod: form.loginMethod || undefined,
    loginMethodIds: [...new Set(form.loginMethodIds.filter(Boolean))],
    feedhiveManaged: form.feedhiveManaged,
    notes: form.notes || undefined,
    isActive: form.isActive,
  };
}
