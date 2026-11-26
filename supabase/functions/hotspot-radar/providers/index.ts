import type { HotspotItemDraft, HotspotKind } from '../../../../src/lib/hotspotRadar.ts';
import { createApifyProvider } from './apify.ts';
import { createIgRssProvider } from './ig-rss.ts';
import { createMockProvider } from './mock.ts';
import { HotspotProviderError, type HotspotProvider } from './types.ts';

export { HotspotProviderError };
export type { HotspotProvider };

/**
 * 解析要用的供應商：HOTSPOT_PROVIDER = ig_rss（免費帳號 RSS）| apify（預設，需 token）| mock（本機）
 */
export function resolveProvider(): HotspotProvider {
  const raw = (Deno.env.get("HOTSPOT_PROVIDER") ?? '').trim().toLowerCase();
  const name = raw || 'apify';

  if (name === 'ig_rss' || name === 'ig-rss') return createIgRssProvider();
  if (name === 'mock') return createMockProvider();
  if (name === 'apify') return createApifyProvider();

  throw new HotspotProviderError(
    'provider_not_configured',
    `不支援的 HOTSPOT_PROVIDER：${name}（可用：ig_rss / apify / mock）`,
    503,
    false,
  );
}

/** 依目標類型分派；index.ts 不需要知道 provider 內部細節 */
export async function fetchTargetItems(
  provider: HotspotProvider,
  target: { kind: HotspotKind; value: string },
  limit: number,
): Promise<HotspotItemDraft[]> {
  if (target.kind === 'account') return provider.fetchAccount(target.value, limit);
  if (target.kind === 'hashtag') return provider.fetchHashtag(target.value, limit);
  return provider.fetchAds(target.value, limit);
}
