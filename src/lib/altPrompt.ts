/**
 * ALT Pilot · Prompt 組裝與模型輸出解析
 *
 * 重點不是「看圖說故事」，而是把圖片放回頁面脈絡：
 *   頁面主題 + 區塊標題 + 圖片附近文字 + 站點關鍵字 + 品牌語氣
 * 模型只回 JSON，解析失敗時由呼叫端決定是否重試。
 */

import {
  countChars,
  normalizeWhitespace,
  truncateText,
} from './altText.ts';
import type {
  AltImageCandidate,
  AltPageContext,
  AltRisk,
  AltSuggestionDraft,
} from './altTypes.ts';

export class AltModelParseError extends Error {
  readonly code = 'model_parse_error';

  constructor(message: string) {
    super(message);
    this.name = 'AltModelParseError';
  }
}

export interface BuildAltPromptInput {
  page: AltPageContext;
  image: AltImageCandidate;
  keyword?: string;
  brandTone?: string;
  existingAlts?: string[];
}

function languageRule(lang: string): string {
  if (/^zh/i.test(lang)) return '繁體中文，20–60 個中文字（硬上限 125 個字元）';
  if (/^en/i.test(lang)) return 'English, 40–125 characters';
  return '與頁面相同的語言，20–60 個字（硬上限 125 字元）';
}

export function buildAltPrompt(input: BuildAltPromptInput): { system: string; user: string } {
  const { page, image } = input;
  const keyword = normalizeWhitespace(input.keyword || '');
  const lang = page.lang || 'zh-HK';
  const existing = (input.existingAlts || [])
    .map((alt) => normalizeWhitespace(alt))
    .filter(Boolean)
    .slice(0, 20);

  const system = [
    '你是一位資深 SEO 與無障礙（WCAG）編輯。你的任務是為網站圖片寫 alt 文字，不是寫廣告文案。',
    '',
    '## 必須遵守',
    `1. 描述這張圖在這頁的角色與畫面，讓看不到圖的人也能理解內容。`,
    `2. 至少包含一個具體視覺細節：物件、材質、顏色、動作、地點、人數、圖表類型。`,
    `3. 自然融入頁面主關鍵字最多一次；不可堆砌、不可照抄 H1、不可只寫關鍵字。`,
    `4. 語言：${languageRule(lang)}。`,
    `5. 不要用「圖片／照片／圖像／image／photo／picture of」開頭；不要 emoji、引號、句末句號。`,
    `6. 若圖片是純裝飾（漸變背景、分隔線、裝飾圖示），回 decorative=true 且 alt=""；不要硬寫。`,
    `7. 不確定的人物身分、品牌、地點不要編造；用「設計師」「客戶」「辦公室」等角色或場景描述。`,
    `8. 圖片含可讀文字（海報、圖表、招牌）時，只取關鍵 1–2 個詞，不要全文 OCR。`,
    `9. 不要與同頁其他圖片的 alt 重複，也不要逐字重複圖片下方的 caption。`,
    `10. 只輸出 JSON，不要 Markdown 圍欄、前言或解釋。`,
    '',
    '## 輸出 JSON（欄位必須齊全）',
    JSON.stringify(
      {
        alt: '最終建議（字串）',
        short_alt: '短版，≤60 字元（字串）',
        alternatives: ['備選 1', '備選 2'],
        rationale: '一到兩句：為何這樣寫、用到哪個畫面細節與頁面主題',
        confidence: 0.0,
        risk: 'low | medium | high',
        decorative: false,
        issues: ['模型自覺的問題，可空陣列'],
      },
      null,
      0,
    ),
  ].join('\n');

  const userLines = [
    '## 頁面上下文',
    `- URL：${page.url}`,
    `- 頁面標題：${page.title || '（未提供）'}`,
    `- H1：${page.h1 || '（未提供）'}`,
    `- H2：${page.h2s.length > 0 ? page.h2s.join(' / ') : '（未提供）'}`,
    `- 頁面語言：${lang}`,
    `- 主關鍵字：${keyword || '（未指定；不要硬塞關鍵字）'}`,
    `- 品牌語氣：${normalizeWhitespace(input.brandTone || '專業、可信、具體')}`,
    '',
    '## 正文摘要',
    truncateText(page.summary || '（此頁沒有可讀正文）', 2400),
    '',
    '## 這張圖片',
    `- 圖片 URL：${image.url}`,
    `- 檔名：${image.filename || '（無）'}`,
    `- 所在區塊：${image.location}`,
    `- 現有 alt：${image.currentAlt || '（空白）'}`,
    `- 最近的標題：${image.nearbyHeading || '（無）'}`,
    `- 圖片下方 caption：${image.nearbyCaption || '（無）'}`,
    `- 圖片前一段文字：${image.nearbyParagraph || '（無）'}`,
    image.decorative
      ? '- 系統判斷：這張圖在 DOM 被標記為裝飾圖；若畫面確實沒有資訊價值，回 decorative=true、alt=""。'
      : '',
  ].filter(Boolean);

  if (existing.length > 0) {
    userLines.push('', '## 同頁其他圖片的 alt（避免重複）', ...existing.map((alt) => `- ${alt}`));
  }

  userLines.push(
    '',
    '## 請回答',
    '只輸出一個 JSON 物件。alt 必須是可直接貼進 <img alt="..."> 的純文字。',
  );

  return { system, user: userLines.join('\n') };
}

export function extractJsonObject(raw: string): unknown {
  const text = String(raw ?? '').trim();
  if (!text) throw new AltModelParseError('模型回傳空白');

  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new AltModelParseError('模型沒有回傳 JSON 物件');
  }

  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch (error) {
    throw new AltModelParseError(
      `模型 JSON 解析失敗：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? normalizeWhitespace(value) : '';
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    const text = asString(item);
    if (!text || result.includes(text)) continue;
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function asRisk(value: unknown): AltRisk {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function asConfidence(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.min(1, Math.max(0, numeric));
}

/** 把模型輸出正規化成固定欄位；缺 alt 時保留空字串，交由品質規則判斷。 */
export function normalizeAltDraft(value: unknown): AltSuggestionDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AltModelParseError('模型 JSON 不是物件');
  }

  const record = value as Record<string, unknown>;
  const alt = truncateText(asString(record.alt) || asString(record.suggested_alt), 300);
  const shortAltRaw = asString(record.short_alt);
  const decorative = record.decorative === true || record.decorative === 'true';
  // 裝飾圖一律輸出空 alt；非裝飾圖即使模型回空字串也保留空值，
  // 由品質規則標成 hard issue，避免「空字串」被誤當成裝飾圖而放行。
  const normalizedAlt = decorative ? '' : alt;
  const shortAlt = decorative ? '' : truncateText(shortAltRaw || alt, 60);
  const alternatives = asStringArray(record.alternatives, 3).filter(
    (item) => item !== normalizedAlt,
  );

  return {
    alt: normalizedAlt,
    short_alt: shortAlt,
    alternatives,
    rationale: truncateText(asString(record.rationale), 600),
    confidence: asConfidence(record.confidence),
    risk: asRisk(record.risk),
    decorative,
    issues: asStringArray(record.issues, 6),
  };
}

export function parseAltModelJson(raw: string): AltSuggestionDraft {
  return normalizeAltDraft(extractJsonObject(raw));
}

/** 給 UI 顯示字數用；與品質規則的 hard limit 一致。 */
export const ALT_ALT_MAX_CHARS = 125;
export const ALT_ALT_TARGET_MAX_CHARS = 60;
export const ALT_SHORT_ALT_MAX_CHARS = 60;
export const ALT_ALT_MIN_CHARS_ZH = 12;
export const ALT_ALT_MIN_CHARS_EN = 25;

export function altCharCount(value: string): number {
  return countChars(value);
}
