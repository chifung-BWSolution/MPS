import type {
  Vchannel,
  VchannelAccount,
  VchannelAccountLinkedLoginMethod,
  VchannelImportance,
  VchannelStatus,
} from '@/types/vchannel';
import { normalizeAccountPlatform, type PlatformStatusValue } from '@/lib/vchannelPlatformStatus';

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
  platform: string;
  account_id: string | null;
  login_method: string | null;
  feedhive_managed: boolean;
  notes: string | null;
  is_active?: boolean | null;
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

export function mapAccountRow(
  row: DbAccountRow,
  linked: VchannelAccountLinkedLoginMethod[] = [],
): VchannelAccount {
  return {
    id: row.id,
    vchannelCodes: Array.isArray(row.vchannel_codes) ? row.vchannel_codes : [],
    accountLabel: row.account_label,
    platform: normalizeAccountPlatform(row.platform) ?? row.platform,
    accountId: row.account_id ?? undefined,
    loginMethod: row.login_method ?? undefined,
    loginMethodIds: linked.map(method => method.id),
    linkedLoginMethods: linked,
    feedhiveManaged: row.feedhive_managed,
    notes: row.notes ?? undefined,
    isActive: row.is_active !== false,
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
    platform: normalizeAccountPlatform(input.platform) ?? input.platform.trim(),
    account_id: input.accountId ?? null,
    login_method: input.loginMethod ?? null,
    feedhive_managed: input.feedhiveManaged ?? false,
    notes: input.notes ?? null,
    is_active: input.isActive ?? true,
    updated_at: new Date().toISOString(),
  };
}
