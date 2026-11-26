import {
  mapProviderItem,
  type HotspotItemDraft,
  type HotspotKind,
} from '../../../../src/lib/hotspotRadar.ts';

/**
 * 熱點雷達 · 抓取供應商介面
 *
 * 唯一與外部付費 API 對話的邊界：index.ts 只知道這個介面，
 * 換供應商（Apify → 其他）只改 providers/ 內。
 */

export type { HotspotItemDraft };

export interface HotspotProvider {
  readonly name: string;
  /** 是否支援某類目標（免費 RSS 渠道只支援帳號，其餘要由其他來源補） */
  supports?(kind: HotspotKind): boolean;
  fetchAccount(handle: string, limit: number): Promise<HotspotItemDraft[]>;
  fetchHashtag(tag: string, limit: number): Promise<HotspotItemDraft[]>;
  fetchAds(keyword: string, limit: number): Promise<HotspotItemDraft[]>;
  /** 每 1,000 筆的美元單價；IG 與廣告不同價 */
  unitPricePer1000(kind: HotspotKind): number;
}

export type ProviderErrorCode =
  | 'provider_not_configured'
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_unavailable';

export class HotspotProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ProviderErrorCode, message: string, status = 502, retryable = true) {
    super(message);
    this.name = 'HotspotProviderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/** 把供應商 payload 陣列轉成草稿；壞列只跳過，不影響整批 */
export function mapItems(
  payload: readonly unknown[],
  kind: HotspotKind,
  limit: number,
): HotspotItemDraft[] {
  const drafts: HotspotItemDraft[] = [];
  const seen = new Set<string>();
  for (const row of payload) {
    const draft = mapProviderItem(row, { kind });
    if (!draft) continue;
    const key = `${draft.platform}:${draft.external_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(draft);
    if (drafts.length >= limit) break;
  }
  return drafts;
}
