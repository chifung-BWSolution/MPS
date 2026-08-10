import type { DateRangePreset } from '@/types/googleAds';

export type AdsCampaignHashQuery = {
  campaign: string | null;
  preset: DateRangePreset | null;
  from: string | null;
  to: string | null;
};

const DATE_PRESETS: DateRangePreset[] = ['7d', '14d', '30d', '90d', 'ytd', 'all', 'custom'];

function isDatePreset(value: string | null): value is DateRangePreset {
  return !!value && (DATE_PRESETS as string[]).includes(value);
}

/** Split `#module/sub?query` into path + URLSearchParams. */
export function splitHashPathAndQuery(hash = window.location.hash): {
  path: string;
  params: URLSearchParams;
} {
  const raw = hash.replace(/^#/, '');
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) {
    return { path: raw, params: new URLSearchParams() };
  }
  return {
    path: raw.slice(0, qIndex),
    params: new URLSearchParams(raw.slice(qIndex + 1)),
  };
}

export function parseAdsCampaignHashQuery(
  hash = window.location.hash,
): AdsCampaignHashQuery {
  const { params } = splitHashPathAndQuery(hash);
  const presetRaw = params.get('preset');
  return {
    campaign: params.get('campaign'),
    preset: isDatePreset(presetRaw) ? presetRaw : null,
    from: params.get('from'),
    to: params.get('to'),
  };
}

export function parseCampaignKey(
  campaignKey: string | null | undefined,
): { customerId: string; campaignId: string } | null {
  if (!campaignKey) return null;
  const idx = campaignKey.indexOf(':');
  if (idx <= 0 || idx === campaignKey.length - 1) return null;
  return {
    customerId: campaignKey.slice(0, idx),
    campaignId: campaignKey.slice(idx + 1),
  };
}

export function buildGoogleAdsCampaignHash(opts: {
  campaignKey?: string | null;
  preset?: DateRangePreset | null;
  from?: string | null;
  to?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.campaignKey) params.set('campaign', opts.campaignKey);
  if (opts.preset) params.set('preset', opts.preset);
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  const qs = params.toString();
  return qs ? `marketing/google-ads?${qs}` : 'marketing/google-ads';
}

export function setGoogleAdsCampaignHash(opts: {
  campaignKey?: string | null;
  preset?: DateRangePreset | null;
  from?: string | null;
  to?: string | null;
}): void {
  const next = buildGoogleAdsCampaignHash(opts);
  const current = window.location.hash.replace(/^#/, '');
  if (current !== next) {
    window.location.hash = next;
  }
}
