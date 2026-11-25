/**
 * ALT Pilot · 文字工具（瀏覽器、Node、Deno 共用）
 *
 * 這個檔案刻意不依賴任何 DOM / React / 平台 API，讓 Edge Function
 * 可以直接以相對路徑 import，單元測試也能用 `node` 跑。
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  bull: '•',
  cent: '¢',
  copy: '©',
  deg: '°',
  divide: '÷',
  euro: '€',
  gt: '>',
  hellip: '…',
  laquo: '«',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  para: '¶',
  permil: '‰',
  plusmn: '±',
  pound: '£',
  quot: '"',
  raquo: '»',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  sect: '§',
  times: '×',
  trade: '™',
  yen: '¥',
};

/** 解碼 HTML entity；不完整或無法解析時保留原文。 */
export function decodeHtmlEntities(input: string): string {
  const source = String(input ?? '');
  if (!source || source.indexOf('&') === -1) return source;

  return source.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1]?.toLowerCase() === 'x';
      const numeric = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 0x10ffff) return match;
      try {
        return String.fromCodePoint(numeric);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function normalizeWhitespace(input: string): string {
  return decodeHtmlEntities(String(input ?? '')).replace(/\s+/g, ' ').trim();
}

export function countChars(input: string): number {
  return Array.from(String(input ?? '')).length;
}

export function truncateText(input: string, maxChars: number, suffix = '…'): string {
  const text = String(input ?? '');
  const limit = Math.max(0, maxChars);
  if (limit <= 0) return '';
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  if (limit <= suffix.length) return chars.slice(0, limit).join('');
  return `${chars.slice(0, limit - Array.from(suffix).length).join('')}${suffix}`;
}

/** 中文字逐字計、英文以詞計；用來顯示頁面字數，不用於精確語言統計。 */
export function countWords(input: string): number {
  const text = String(input ?? '');
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
  return cjk + latin;
}

/** 比較用：去掉大小寫、空白、標點與符號，避免「，」造成誤判重複。 */
export function normalizeForCompare(input: string): string {
  return String(input ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function cjkRatio(input: string): number {
  const chars = Array.from(String(input ?? '')).filter((char) => /[A-Za-z0-9\u3400-\u9fff]/.test(char));
  if (chars.length === 0) return 0;
  const cjk = chars.filter((char) => /[\u3400-\u9fff]/.test(char)).length;
  return cjk / chars.length;
}

export function containsCjk(input: string): boolean {
  return /[\u3400-\u9fff]/.test(String(input ?? ''));
}

export function escapeRegExp(input: string): string {
  return String(input ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 去掉 HTML 標籤並解碼 entity，用於模型回傳或匯出前的清理。 */
export function stripHtmlTags(input: string): string {
  return normalizeWhitespace(String(input ?? '').replace(/<[^>]*>/g, ' '));
}
