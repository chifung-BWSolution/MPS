/**
 * Adapter registry（M5-03）。
 * 未指定或未知 adapter 一律回到 manual：寧可產內容包給人，也不要靜默失敗。
 */

import type { ContentAdapterName } from '../../../../src/lib/contentTypes.ts';
import { beauty100Adapter } from './beauty100.ts';
import { manualAdapter } from './manual.ts';
import { nextCustomAdapter } from './nextCustom.ts';
import { shopifyAdapter } from './shopify.ts';
import { webflowAdapter } from './webflow.ts';
import { wordpressAdapter } from './wordpress.ts';
import type { ContentAdapter } from './types.ts';

const REGISTRY: Record<string, ContentAdapter> = {
  manual: manualAdapter,
  next_custom: nextCustomAdapter,
  wordpress: wordpressAdapter,
  shopify: shopifyAdapter,
  webflow: webflowAdapter,
  // beauty100 沒有 /api/content/*；用自己的 Supabase REST（專用 staff JWT）。
  beauty100: beauty100Adapter,
};

export function getContentAdapter(name: ContentAdapterName | null | undefined): ContentAdapter {
  return REGISTRY[String(name ?? 'manual')] ?? manualAdapter;
}

export function listAdapters(): ContentAdapter[] {
  return [...new Set(Object.values(REGISTRY))];
}

export {
  beauty100Adapter,
  manualAdapter,
  nextCustomAdapter,
  shopifyAdapter,
  webflowAdapter,
  wordpressAdapter,
};
export * from './types.ts';
