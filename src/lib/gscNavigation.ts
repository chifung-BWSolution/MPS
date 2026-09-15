import type { DateRangePreset } from '@/types/googleAds';
import { applyLocationHash, buildSameOriginHref } from '@/lib/appNavigation';
import { splitHashPathAndQuery } from '@/lib/adsCampaignNavigation';

export type GscReportHashQuery = {
  site: string | null;
  preset: DateRangePreset | null;
  from: string | null;
  to: string | null;
};

const DATE_PRESETS: DateRangePreset[] = ['7d', '14d', '30d', '90d', 'ytd', 'all', 'custom'];

function isDatePreset(value: string | null): value is DateRangePreset {
  return !!value && (DATE_PRESETS as string[]).includes(value);
}

export function parseGscReportHashQuery(
  hash = globalThis.window?.location?.hash ?? '',
): GscReportHashQuery {
  const { params } = splitHashPathAndQuery(hash);
  const presetRaw = params.get('preset');
  return {
    site: params.get('site'),
    preset: isDatePreset(presetRaw) ? presetRaw : null,
    from: params.get('from'),
    to: params.get('to'),
  };
}

export function buildGscReportHash(opts: {
  siteUrl?: string | null;
  preset?: DateRangePreset | null;
  from?: string | null;
  to?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.siteUrl) params.set('site', opts.siteUrl);
  if (opts.preset) params.set('preset', opts.preset);
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  const qs = params.toString();
  return qs ? `website/gsc?${qs}` : 'website/gsc';
}

export function buildGscReportHref(opts: {
  siteUrl?: string | null;
  preset?: DateRangePreset | null;
  from?: string | null;
  to?: string | null;
}): string {
  return buildSameOriginHref(buildGscReportHash(opts));
}

export function setGscReportHash(opts: {
  siteUrl?: string | null;
  preset?: DateRangePreset | null;
  from?: string | null;
  to?: string | null;
}): boolean {
  return applyLocationHash(buildGscReportHash(opts));
}
