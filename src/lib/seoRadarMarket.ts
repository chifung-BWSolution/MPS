/**
 * SEO 雷達 · 市場判定（PRD §7）
 *
 * 由站點域名推斷 Google 搜尋建議的 `gl`／`hl`；前端與 Edge Function 共用。
 * 判定失敗一律回香港繁中（公司主場），使用者可在介面手動覆寫。
 */

import { canonicalizeDomainUrl } from './canonicalDomainUrl.ts';
// 相對路徑 + 顯式 .ts：這個檔案會被 Deno Edge Function import，不能用 `@/` alias。
import type { RadarMarketCode } from '../types/seoRadar.ts';

export interface RadarMarket {
  code: RadarMarketCode;
  /** Google suggest 的國家參數 */
  gl: string;
  /** Google suggest 的語言參數 */
  hl: string;
  /** 介面顯示用 */
  label: string;
}

export const MARKET_OPTIONS: readonly RadarMarket[] = [
  { code: 'hk', gl: 'hk', hl: 'zh-HK', label: '香港（繁中）' },
  { code: 'tw', gl: 'tw', hl: 'zh-TW', label: '台灣（繁中）' },
  { code: 'sg', gl: 'sg', hl: 'en-SG', label: '新加坡（英文）' },
  { code: 'my', gl: 'my', hl: 'en-MY', label: '馬來西亞（英文）' },
  { code: 'us', gl: 'us', hl: 'en-US', label: '美國（英文）' },
];

export const DEFAULT_MARKET: RadarMarket = MARKET_OPTIONS[0];

export const MARKET_LABEL: Record<RadarMarketCode, string> = {
  hk: '香港（繁中）',
  tw: '台灣（繁中）',
  sg: '新加坡（英文）',
  my: '馬來西亞（英文）',
  us: '美國（英文）',
};

/** 長後綴先比對：`.com.hk` 必須早於 `.hk` */
const TLD_MARKET: readonly { suffix: string; code: RadarMarketCode }[] = [
  { suffix: '.com.hk', code: 'hk' },
  { suffix: '.org.hk', code: 'hk' },
  { suffix: '.net.hk', code: 'hk' },
  { suffix: '.edu.hk', code: 'hk' },
  { suffix: '.hk', code: 'hk' },
  { suffix: '.com.tw', code: 'tw' },
  { suffix: '.org.tw', code: 'tw' },
  { suffix: '.net.tw', code: 'tw' },
  { suffix: '.tw', code: 'tw' },
  { suffix: '.com.sg', code: 'sg' },
  { suffix: '.sg', code: 'sg' },
  { suffix: '.com.my', code: 'my' },
  { suffix: '.my', code: 'my' },
  { suffix: '.us', code: 'us' },
];

export function isRadarMarketCode(value: unknown): value is RadarMarketCode {
  return typeof value === 'string' && MARKET_OPTIONS.some((market) => market.code === value);
}

export function marketForCode(code: RadarMarketCode | null | undefined): RadarMarket {
  return MARKET_OPTIONS.find((market) => market.code === code) ?? DEFAULT_MARKET;
}

/**
 * 域名 → 市場。`.com`／`.net`／`.io` 等泛用域名一律回香港繁中，
 * 因為公司客戶以香港為主場；要改市場請走介面覆寫。
 */
export function detectMarket(domainUrl: string | null | undefined): RadarMarket {
  const host = canonicalizeDomainUrl(domainUrl);
  if (host) {
    for (const rule of TLD_MARKET) {
      if (host.endsWith(rule.suffix)) return marketForCode(rule.code);
    }
  }
  return DEFAULT_MARKET;
}
