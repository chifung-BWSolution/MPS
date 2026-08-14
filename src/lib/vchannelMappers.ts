import type { Vchannel, VchannelAccount, VchannelImportance, VchannelStatus } from '@/types/vchannel';
import type { PlatformStatusValue } from '@/lib/vchannelPlatformStatus';

type DbVchannelRow = {
  id: string;
  channel_code: string;
  internal_name: string;
  public_name: string;
  importance: VchannelImportance;
  brand_list_id: string | null;
  brand_list?: { brand_code: string } | null;
  status: VchannelStatus;
  platform_status: Record<string, PlatformStatusValue>;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type DbAccountRow = {
  id: string;
  vchannel_codes: string[];
  account_label: string;
  channel_intro: string | null;
  platform: string;
  account_id: string | null;
  account_password: string | null;
  login_method: string | null;
  operator_code: string | null;
  feedhive_managed: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function mapVchannelRow(row: DbVchannelRow): Vchannel {
  return {
    id: row.id,
    channelCode: row.channel_code,
    internalName: row.internal_name,
    publicName: row.public_name,
    importance: row.importance,
    brandListId: row.brand_list_id,
    brandCode: row.brand_list?.brand_code ?? '',
    status: row.status,
    platformStatus: row.platform_status ?? {},
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAccountRow(row: DbAccountRow): VchannelAccount {
  return {
    id: row.id,
    vchannelCodes: row.vchannel_codes,
    accountLabel: row.account_label,
    channelIntro: row.channel_intro ?? undefined,
    platform: row.platform,
    accountId: row.account_id ?? undefined,
    accountPassword: row.account_password ?? undefined,
    loginMethod: row.login_method ?? undefined,
    operatorCode: row.operator_code ?? undefined,
    feedhiveManaged: row.feedhive_managed,
    notes: row.notes ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function vchannelToDbRow(input: Partial<Vchannel> & Pick<Vchannel, 'channelCode' | 'internalName' | 'publicName' | 'importance' | 'brandListId' | 'status' | 'platformStatus'>) {
  return {
    channel_code: input.channelCode,
    internal_name: input.internalName,
    public_name: input.publicName,
    importance: input.importance,
    brand_list_id: input.brandListId,
    status: input.status,
    platform_status: input.platformStatus,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function accountToDbRow(input: Partial<VchannelAccount> & Pick<VchannelAccount, 'vchannelCodes' | 'platform'>) {
  return {
    vchannel_codes: input.vchannelCodes,
    account_label: input.accountLabel ?? '',
    channel_intro: input.channelIntro ?? null,
    platform: input.platform,
    account_id: input.accountId ?? null,
    account_password: input.accountPassword ?? null,
    login_method: input.loginMethod ?? null,
    operator_code: input.operatorCode ?? null,
    feedhive_managed: input.feedhiveManaged ?? false,
    notes: input.notes ?? null,
    sort_order: input.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  };
}
