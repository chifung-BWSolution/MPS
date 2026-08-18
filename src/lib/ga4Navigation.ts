import type { DateRangePreset } from '@/types/googleAds';
import { splitHashPathAndQuery } from '@/lib/adsCampaignNavigation';

export type Ga4TrafficHashQuery = {
  property: string | null;
  preset: DateRangePreset | null;
  from: string | null;
  to: string | null;
};

const DATE_PRESETS: DateRangePreset[] = ['7d', '14d', '30d', '90d', 'ytd', 'all', 'custom'];

function isDatePreset(value: string | null): value is DateRangePreset {
  return !!value && (DATE_PRESETS as string[]).includes(value);
}

export function parseGa4TrafficHashQuery(
  hash = window.location.hash,
): Ga4TrafficHashQuery {
  const { params } = splitHashPathAndQuery(hash);
  const presetRaw = params.get('preset');
  return {
    property: params.get('property'),
    preset: isDatePreset(presetRaw) ? presetRaw : null,
    from: params.get('from'),
    to: params.get('to'),
  };
}

export function buildGa4TrafficHash(opts: {
  propertyId?: string | null;
  preset?: DateRangePreset | null;
  from?: string | null;
  to?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.propertyId) params.set('property', opts.propertyId);
  if (opts.preset) params.set('preset', opts.preset);
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  const qs = params.toString();
  return qs ? `website/traffic?${qs}` : 'website/traffic';
}

export function setGa4TrafficHash(opts: {
  propertyId?: string | null;
  preset?: DateRangePreset | null;
  from?: string | null;
  to?: string | null;
}): void {
  const next = buildGa4TrafficHash(opts);
  const current = window.location.hash.replace(/^#/, '');
  if (current !== next) {
    window.location.hash = next;
  }
}
