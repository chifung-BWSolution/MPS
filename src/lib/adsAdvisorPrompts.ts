import { normalizeGoogleAdsBreakdownChannel } from '@/types/googleAds';
import type { AdsAdvisorSnapshot } from '@/types/adsAdvisor';

export type AdsAdvisorPromptScenario =
  | 'google_search'
  | 'google_pmax'
  | 'google_demand_gen'
  | 'google_shopping'
  | 'google_other'
  | 'facebook_sales'
  | 'facebook_leads'
  | 'facebook_traffic'
  | 'facebook_awareness'
  | 'facebook_app'
  | 'facebook_messaging'
  | 'facebook_engagement'
  | 'facebook_other';

function norm(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function haystack(snapshot: AdsAdvisorSnapshot): string {
  return [
    snapshot.channelOrObjective,
    ...(snapshot.objectives ?? []),
    snapshot.campaignName,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

function googleEfficiencyPrompt(objectives?: string[]): string {
  const o = (objectives ?? []).join(' ').toUpperCase();
  if (/PURCHASE|SHOPPING/.test(o)) {
    return '預算是否該加？CPA／ROAS 是否合理？自動投放有沒有燒在低價值轉換？';
  }
  if (/LEAD|SUBMIT_LEAD/.test(o)) {
    return '預算是否該加？每次名單成本（CPL）是否合理？';
  }
  if (/PAGE_VIEW|TRAFFIC/.test(o)) {
    return '預算是否該加？CPC 與到站品質是否合理？';
  }
  return '預算是否該加？CPA 是否合理？';
}

export function resolveAdsAdvisorPromptScenario(
  snapshot: AdsAdvisorSnapshot | null,
): AdsAdvisorPromptScenario {
  if (!snapshot) return 'google_other';

  if (snapshot.platform === 'google') {
    const channel = normalizeGoogleAdsBreakdownChannel(snapshot.channelOrObjective);
    if (channel === 'SEARCH') return 'google_search';
    if (channel === 'PERFORMANCE_MAX') return 'google_pmax';
    if (channel === 'DEMAND_GEN') return 'google_demand_gen';
    if (channel === 'SHOPPING') return 'google_shopping';
    const raw = norm(snapshot.channelOrObjective);
    if (raw.includes('SEARCH')) return 'google_search';
    if (raw.includes('PERFORMANCE_MAX') || raw === 'PMAX') return 'google_pmax';
    if (raw.includes('DEMAND_GEN')) return 'google_demand_gen';
    if (raw.includes('SHOPPING')) return 'google_shopping';
    return 'google_other';
  }

  const text = haystack(snapshot);
  if (/MESSAGE|MESSAGING|MESSENGER|CONVERSATION|訊息|對話/.test(text)) {
    return 'facebook_messaging';
  }
  if (
    /OUTCOME_SALES|PRODUCT_CATALOG_SALES|\bCONVERSIONS\b|\bPURCHASE\b/.test(text)
  ) {
    return 'facebook_sales';
  }
  if (/OUTCOME_LEADS|LEAD_GENERATION|\bLEAD\b/.test(text)) {
    return 'facebook_leads';
  }
  if (
    /OUTCOME_TRAFFIC|LINK_CLICKS|LANDING_PAGE_VIEWS|\bTRAFFIC\b/.test(text)
  ) {
    return 'facebook_traffic';
  }
  if (
    /OUTCOME_AWARENESS|BRAND_AWARENESS|\bREACH\b|VIDEO_VIEWS/.test(text)
  ) {
    return 'facebook_awareness';
  }
  if (/OUTCOME_APP_PROMOTION|APP_INSTALLS|APP_PROMOTION/.test(text)) {
    return 'facebook_app';
  }
  if (/OUTCOME_ENGAGEMENT|POST_ENGAGEMENT|PAGE_LIKES/.test(text)) {
    return 'facebook_engagement';
  }
  return 'facebook_other';
}

const PROMPTS: Record<AdsAdvisorPromptScenario, (snapshot: AdsAdvisorSnapshot | null) => string[]> = {
  google_search: (snapshot) => [
    '這檔 Search campaign 的 CTR 為何偏低？搜尋意圖與廣告文案是否對得上？',
    googleEfficiencyPrompt(snapshot?.objectives),
    '和同品牌／同標籤的其他 Search campaign 比較一下',
    '哪些關鍵字或搜尋字詞最耗預算？值得保留還是加負面？',
  ],
  google_pmax: (snapshot) => [
    '這檔 Performance Max 的 asset group／素材表現是否不均？訊號與受眾有沒有太寬？',
    googleEfficiencyPrompt(snapshot?.objectives),
    '和同品牌／同標籤的其他 PMax 或 Search campaign 比較一下',
    '哪些素材或 asset group 最耗預算？搜尋主題／資產需要收窄嗎？',
  ],
  google_demand_gen: (snapshot) => [
    '這檔 Demand Gen 的 CTR 或完看是否偏低？受眾與素材是否匹配？',
    googleEfficiencyPrompt(snapshot?.objectives),
    '和同品牌／同標籤的其他 Demand Gen campaign 比較一下',
    '哪些廣告或素材最耗預算？值得保留還是換創意？',
  ],
  google_shopping: (snapshot) => [
    '這檔 Shopping 的 CTR／產品曝光是否健康？Feed 與出價有沒有問題？',
    googleEfficiencyPrompt(snapshot?.objectives),
    '和同品牌／同標籤的其他 Shopping 或 PMax campaign 比較一下',
    '哪些產品或產品組最耗預算？值得保留還是排除？',
  ],
  google_other: (snapshot) => [
    '這檔 campaign 的 CTR 為何偏低？投放組合可以怎麼優化？',
    googleEfficiencyPrompt(snapshot?.objectives),
    '和同品牌／同標籤的其他 campaign 比較一下',
    '哪些廣告或投放組合最耗預算？值得保留嗎？',
  ],
  facebook_sales: () => [
    '這檔轉換／購買為何偏低？漏斗哪一層在掉（點擊、加購、結帳）？',
    '預算是否該加？CPA／每次購買成本是否合理？',
    '和同品牌／同銷售目標的其他 Facebook campaign 比較一下',
    '哪些廣告或版位最耗預算？素材與受眾是否該換？',
  ],
  facebook_leads: () => [
    '這檔潛在客戶量或表單完成率為何偏低？受眾與表單是否匹配？',
    '預算是否該加？每次名單成本（CPL）是否合理？',
    '和同品牌／同 Lead 目標的其他 Facebook campaign 比較一下',
    '哪些廣告或版位最耗預算？表單與素材需要調整嗎？',
  ],
  facebook_traffic: () => [
    '這檔 CTR 或到站率為何偏低？素材與著陸頁是否匹配？',
    '預算是否該加？CPC 是否合理？有沒有空點？',
    '和同品牌／同流量目標的其他 Facebook campaign 比較一下',
    '哪些廣告或版位最耗預算？值得保留嗎？',
  ],
  facebook_awareness: () => [
    '這檔觸及與頻率是否健康？會不會重複打到同一批人？',
    '預算是否該加？CPM／千次觸及成本是否合理？',
    '和同品牌／同曝光目標的其他 Facebook campaign 比較一下',
    '哪些版位或素材最耗預算？觸及有沒有重疊？',
  ],
  facebook_app: () => [
    '這檔安裝量或應用事件為何偏低？素材與商店頁是否匹配？',
    '預算是否該加？每次安裝成本（CPI）是否合理？',
    '和同品牌／同 App 目標的其他 Facebook campaign 比較一下',
    '哪些廣告或版位最耗預算？值得保留嗎？',
  ],
  facebook_messaging: () => [
    '這檔對話開啟量為何偏低？訊息 hook 與受眾是否匹配？',
    '預算是否該加？每次對話成本是否合理？',
    '和同品牌／同「訊息」目標的其他 Facebook campaign 比較一下',
    '哪些廣告或版位最耗預算？哪則訊息素材最該留？',
  ],
  facebook_engagement: () => [
    '這檔互動率為何偏低？素材與受眾是否對得上？',
    '預算是否該加？每次互動成本是否合理？',
    '和同品牌／同互動目標的其他 Facebook campaign 比較一下',
    '哪些廣告或版位最耗預算？值得保留嗎？',
  ],
  facebook_other: () => [
    '這檔 Facebook campaign 的核心成效為何偏低？可以怎麼優化？',
    '預算是否該加？目前的單次成果成本是否合理？',
    '和同品牌／同標籤的其他 Facebook campaign 比較一下',
    '哪些廣告或版位最耗預算？值得保留嗎？',
  ],
};

export function getAdsAdvisorSuggestedPrompts(
  snapshot: AdsAdvisorSnapshot | null,
): string[] {
  const scenario = resolveAdsAdvisorPromptScenario(snapshot);
  return PROMPTS[scenario](snapshot);
}
