/**
 * 社媒自動化營運 · 格式化與時區純函式
 *
 * 全專案的時間規則（PRD 假設 A7）：
 *   - 一律以 UTC ISO 字串傳輸與儲存
 *   - 顯示與 cadence 計算一律換算到「站點時區」（預設 Asia/Hong_Kong）
 *
 * 本檔不得引入任何瀏覽器或 Node API（Edge Function 會直接 import）。
 */

import type {
  ContentBrandVoice,
  ContentCadence,
  ContentSeoDefaults,
} from './contentTypes.ts';

export const HONG_KONG_TIME_ZONE = 'Asia/Hong_Kong';
export const CONTENT_STORAGE_BUCKET = 'content-assets';

export const DEFAULT_CADENCE: ContentCadence = {
  frequency: 'weekly',
  weekdays: [1],
  publish_time: '10:00',
  lead_time_hours: 48,
  review_cutoff_hours: 4,
  max_articles_per_day: 1,
  blackout_dates: [],
};

export const DEFAULT_SEO_DEFAULTS: ContentSeoDefaults = {
  locale: 'zh-HK',
  titleTemplate: '{title}｜{brand}',
  metaTemplate: '{excerpt}',
  slugRule: 'english-kebab-8',
  canonicalBase: '',
  author: '',
  publisher: '',
  ogImage: '',
  jsonLdType: 'BlogPosting',
  categoryMap: {},
  robotsDraft: 'noindex,nofollow',
  robotsLive: 'index,follow',
  wordCountMin: 800,
  wordCountMax: 1500,
  internalLinksMin: 2,
  internalLinksMax: 3,
  bannedWords: [],
};

export const DEFAULT_BRAND_VOICE: ContentBrandVoice = {
  tone: '專業、可信、具體',
  audience: '',
  cta: '',
  bannedWords: [],
  factBoundaries: '',
  allowAiImages: true,
};

export const DEFAULT_CONTENT_MODEL = 'gemini-4-hydrogen';

/** 免費層建議上限（PRD A5）：設定頁以「建議值」呈現，不寫死流程 */
export const RECOMMENDED_DAILY_ARTICLE_LIMIT = 8;
export const RECOMMENDED_DAILY_LLM_CALL_LIMIT = 30;

/** 公開牌價（USD / 1M tokens）；只用於估算看板，結帳以供應商帳單為準 */
export const LLM_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-4-hydrogen': { input: 1.5, output: 7.5 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  // xAI Grok：以 Grok 4 系列公開牌價估算（輸入 $3／輸出 $15 per 1M tokens）。
  // 實際方案（含 batch／促銷）可能不同，這裡只作成本可視化。
  'grok-4.3': { input: 3, output: 15 },
  'grok-4.5': { input: 3, output: 15 },
  'grok-4.20-0309-reasoning': { input: 3, output: 15 },
  'grok-4.20-0309-non-reasoning': { input: 0.2, output: 0.5 },
  'grok-4.20-multi-agent-0309': { input: 3, output: 15 },
};

export function estimateLlmCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const price = LLM_PRICING[model] ?? LLM_PRICING[DEFAULT_CONTENT_MODEL];
  const cost = (tokensIn / 1_000_000) * price.input + (tokensOut / 1_000_000) * price.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ============================================================
// 時區
// ============================================================

export interface ZoneDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zonedFormatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  zonedFormatterCache.set(timeZone, formatter);
  return formatter;
}

/** 取某瞬間在指定時區的牆上時間 */
export function getZonedParts(date: Date, timeZone: string): ZoneDateParts {
  const parts = zonedFormatter(safeTimeZone(timeZone)).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') === 24 ? 0 : read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function safeTimeZone(timeZone: string | null | undefined): string {
  const candidate = (timeZone || '').trim();
  if (!candidate) return HONG_KONG_TIME_ZONE;
  try {
    // 非法時區會在這裡拋錯，退回香港時間，避免整頁崩潰
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return HONG_KONG_TIME_ZONE;
  }
}

export function getZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((wallAsUtc - date.getTime()) / 60_000);
}

/**
 * 把「站點時區的牆上時間」轉成真正的 UTC 瞬間。
 * 使用三次迭代收斂，可正確處理 DST（香港無 DST，但站點可各自設時區）。
 */
export function zonedWallTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part));
  const [hour, minute] = timeStr.split(':').map((part) => Number(part));
  const targetWallAsUtc = Date.UTC(
    year,
    (month || 1) - 1,
    day || 1,
    Number.isFinite(hour) ? hour : 0,
    Number.isFinite(minute) ? minute : 0,
    0,
  );

  let guess = targetWallAsUtc;
  for (let index = 0; index < 3; index += 1) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const wallAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const drift = wallAsUtc - targetWallAsUtc;
    if (drift === 0) break;
    guess -= drift;
  }
  return new Date(guess);
}

/** 某瞬間在站點時區的 YYYY-MM-DD */
export function zoneDateString(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  return formatDateString(parts.year, parts.month, parts.day);
}

/** 某瞬間在站點時區的 HH:mm */
export function zoneTimeString(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** 今天（站點時區）的 YYYY-MM-DD */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return zoneDateString(now, timeZone);
}

export function formatDateString(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function pad2(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

/** ISO 日期字串加減天數（以 UTC 中午運算，避開 DST 邊界） */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days, 12, 0, 0));
  return shifted.toISOString().slice(0, 10);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function isWeekend(dateStr: string, timeZone: string): boolean {
  const utcNoon = zonedWallTimeToUtc(dateStr, '12:00', timeZone);
  const weekday = isoWeekday(utcNoon, timeZone);
  return weekday >= 6;
}

/** ISO 週日：1 = 週一 … 7 = 週日 */
export function isoWeekday(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weeksBetween(dateA: Date, dateB: Date): number {
  return Math.floor((dateB.getTime() - dateA.getTime()) / (7 * 86_400_000));
}

// ============================================================
// 顯示格式化
// ============================================================

export function formatZoneDateTime(
  iso: string | null | undefined,
  timeZone: string = HONG_KONG_TIME_ZONE,
): string {
  const date = parseIsoSafe(iso);
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatZoneDate(
  iso: string | null | undefined,
  timeZone: string = HONG_KONG_TIME_ZONE,
): string {
  const date = parseIsoSafe(iso);
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatZoneMonthDay(
  iso: string | null | undefined,
  timeZone: string = HONG_KONG_TIME_ZONE,
): string {
  const date = parseIsoSafe(iso);
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: safeTimeZone(timeZone),
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatZoneWeekday(
  iso: string | null | undefined,
  timeZone: string = HONG_KONG_TIME_ZONE,
): string {
  const date = parseIsoSafe(iso);
  if (!date) return '—';
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: safeTimeZone(timeZone),
    weekday: 'short',
  }).format(date);
}

/** 只取 HH:mm（站點時區），用於 cadence 摘要 */
export function formatCadenceTime(publishTime: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec((publishTime || '').trim());
  if (!match) return publishTime || '—';
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

export function formatRelativeHours(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return '—';
  const rounded = Math.max(0, Math.round(hours));
  if (rounded < 1) return '少於 1 小時';
  if (rounded < 24) return `${rounded} 小時`;
  const days = Math.floor(rounded / 24);
  const rest = rounded % 24;
  return rest === 0 ? `${days} 天` : `${days} 天 ${rest} 小時`;
}

export function hoursBetween(fromIso: string | null | undefined, to: Date = new Date()): number | null {
  const from = parseIsoSafe(fromIso);
  if (!from) return null;
  return (to.getTime() - from.getTime()) / 3_600_000;
}

export function parseIsoSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoOrNull(value: string | null | undefined): string | null {
  const date = parseIsoSafe(value);
  return date ? date.toISOString() : null;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('zh-HK').format(value);
}

export function formatUsd(value: number | null | undefined): string {
  const amount = value == null || !Number.isFinite(value) ? 0 : value;
  return `US$${amount.toFixed(amount < 0.01 ? 4 : 2)}`;
}

// ============================================================
// 文字
// ============================================================

const CJK_PATTERN =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;
const LATIN_WORD_PATTERN = /[A-Za-z0-9][A-Za-z0-9'’_-]*/g;

export function stripMarkdown(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>~|]/g, ' ');
}

/**
 * 字數：CJK 逐字計 1，拉丁以詞計 1。
 * 這是中文 SEO 驗收最常用的算法，跨站一致。
 */
export function countWords(text: string | null | undefined): number {
  const plain = stripMarkdown(text);
  if (!plain.trim()) return 0;
  const cjkCount = plain.match(CJK_PATTERN)?.length ?? 0;
  const latinCount = plain.replace(CJK_PATTERN, ' ').match(LATIN_WORD_PATTERN)?.length ?? 0;
  return cjkCount + latinCount;
}

export function countCharacters(text: string | null | undefined): number {
  return stripMarkdown(text).replace(/\s+/g, ' ').trim().length;
}

export function truncateText(text: string | null | undefined, max = 80): string {
  const value = (text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function normalizeKeywordPhrase(phrase: string | null | undefined): string {
  return (phrase || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeSlug(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 雜湊只用於 fallback slug，不作為安全用途 */
export function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * 英文 kebab-case、≤ maxWords 詞、全站唯一。
 * 中文標題若無可轉寫的英文字母，退回可預測的 `post-<hash36>`，避免空 slug。
 */
export function slugifyTitle(title: string, maxWords = 8): string {
  const ascii = normalizeSlug(title);
  if (ascii) {
    const words = ascii.split('-').filter(Boolean);
    return words.slice(0, Math.max(1, maxWords)).join('-');
  }
  return `post-${hashString((title || '').trim() || 'untitled').toString(36)}`;
}

/** 補後綴避免撞 slug；既有文章永不覆蓋（PRD §12） */
export function ensureUniqueSlug(candidate: string, existing: readonly string[]): string {
  const base = normalizeSlug(candidate) || 'post';
  const taken = new Set(existing.map((slug) => normalizeSlug(slug)));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1_000; suffix += 1) {
    const next = `${base}-${suffix}`;
    if (!taken.has(next)) return next;
  }
  return `${base}-${hashString(`${base}:${taken.size}`).toString(36)}`;
}

/**
 * 欄目網址代稱自動建議（給非技術營運人員）：
 *   - 名稱含英文 → 直接轉 kebab-case（例：Food & Beverage → food-beverage）
 *   - 純中文名稱 → 用可預測的 `category-N` 暫代，避免留下空白或亂碼
 *   - 撞名時自動加 `-2`、`-3`
 * 使用者仍可自行改成更有意義的英文；這裡只保證「永遠有合法值」。
 */
export function suggestSectionSlug(
  name: string,
  index = 0,
  taken: readonly string[] = [],
): string {
  const base = normalizeSlug(name) || `category-${index + 1}`;
  const used = new Set(
    taken
      .map((slug) => normalizeSlug(slug))
      .filter(Boolean),
  );
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const next = `${base}-${suffix}`;
    if (!used.has(next)) return next;
  }
  return `${base}-${index + 1}`;
}

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** 依 seo_defaults 的模板組合 title／meta（保留未知 token） */
export function applyTemplate(
  template: string,
  values: Record<string, string | null | undefined>,
): string {
  return (template || '').replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

export function domainFromUrl(url: string | null | undefined): string | null {
  const value = (url || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value.startsWith('http') ? value : `https://${value}`);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

export function canonicalUrl(base: string | null | undefined, slug: string): string {
  const domain = domainFromUrl(base);
  const path = normalizeSlug(slug);
  if (!domain) return path ? `/${path}` : '/';
  return `https://${domain}/${path}`;
}

/** 從 Markdown／HTML 抓出指向本站的內部連結 */
export function extractInternalLinks(
  body: string | null | undefined,
  siteDomain: string | null | undefined,
): string[] {
  const text = body || '';
  const domain = domainFromUrl(siteDomain);
  const urls = new Set<string>();
  // 先移除圖片語法，否則 ![alt](url) 會被誤認為內鏈
  const linkSource = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  const markdownLinks = linkSource.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g);
  const htmlLinks = linkSource.matchAll(/href=["']([^"']+)["']/g);

  for (const match of [...markdownLinks, ...htmlLinks]) {
    const raw = (match[1] || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) {
      continue;
    }
    if (raw.startsWith('/')) {
      urls.add(raw);
      continue;
    }
    if (!/^https?:/i.test(raw)) continue;
    try {
      const host = new URL(raw).hostname.replace(/^www\./i, '');
      if (!domain || host === domain) urls.add(raw);
    } catch {
      // 忽略無法解析的連結
    }
  }
  return [...urls];
}

/** 給併發寫入用的短冪等鍵 */
export function contentIdempotencyKey(scope: string, id: string, version?: number | string): string {
  return version == null ? `content:${scope}:${id}` : `content:${scope}:${id}:v${version}`;
}

export function digestIdempotencyKey(date: string): string {
  return `digest:${date}`;
}

export function workerId(prefix = 'worker'): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
