import { formatChannelCodes, parseChannelCodes, type VchannelAccount } from '../types/vchannel';
import { normalizeAccountPlatform } from './vchannelPlatformStatus';

export const emptyAccountForm = {
  vchannelCodes: [] as string[],
  vchannelCodesRaw: '',
  accountLabel: '',
  platform: '',
  accountId: '',
  loginMethod: '',
  feedhiveManaged: false,
  notes: '',
};

export type AccountFormState = typeof emptyAccountForm;

export function accountToForm(account: VchannelAccount): AccountFormState {
  return {
    vchannelCodes: account.vchannelCodes,
    vchannelCodesRaw: formatChannelCodes(account.vchannelCodes),
    accountLabel: account.accountLabel,
    platform: normalizeAccountPlatform(account.platform) ?? account.platform,
    accountId: account.accountId ?? '',
    loginMethod: account.loginMethod ?? '',
    feedhiveManaged: account.feedhiveManaged,
    notes: account.notes ?? '',
  };
}

export function formToAccountPayload(form: AccountFormState) {
  const codes = parseChannelCodes(form.vchannelCodesRaw || form.vchannelCodes.join('/'));
  const platform = normalizeAccountPlatform(form.platform);
  if (!codes.length || !platform) return null;
  return {
    vchannelCodes: codes,
    accountLabel: form.accountLabel,
    platform,
    accountId: form.accountId || undefined,
    loginMethod: form.loginMethod || undefined,
    feedhiveManaged: form.feedhiveManaged,
    notes: form.notes || undefined,
  };
}
