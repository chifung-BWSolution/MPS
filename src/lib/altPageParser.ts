/**
 * ALT Pilot · HTML 解析（純函式）
 *
 * 目標不是完整 HTML parser，而是從公開頁面穩定抽出：
 *   - title / meta / canonical / lang
 *   - H1–H3、正文段落、圖片附近的 caption
 *   - 所有可處理的 <img>（含 lazy-load、srcset、裝飾圖判斷）
 *
 * 不使用 DOM，讓 Edge Function（Deno）與瀏覽器都能執行。
 */

import {
  countWords,
  decodeHtmlEntities,
  normalizeWhitespace,
  truncateText,
} from './altText.ts';
import type {
  AltImageCandidate,
  AltImageLocation,
  AltPageAnalysis,
  AltPageContext,
} from './altTypes.ts';

const MAX_IMAGES = 40;
const MAX_CONTEXT_CHARS = 6000;
const MAX_PARAGRAPHS = 12;
const TEXT_BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'li', 'figcaption']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3']);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

interface RawBlock {
  tag: string;
  text: string;
  start: number;
  end: number;
}

interface RawImage {
  attrs: Record<string, string>;
  pos: number;
  location: AltImageLocation;
}

interface Capture {
  tag: string;
  text: string;
  start: number;
}

interface ScanResult {
  title: string;
  lang: string;
  canonical: string;
  meta: Record<string, string>;
  baseHref: string;
  blocks: RawBlock[];
  images: RawImage[];
  backgroundImageCount: number;
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(raw))) {
    const name = (match[1] || '').toLowerCase();
    if (!name || name === '/') continue;
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = decodeHtmlEntities(value);
  }
  return attrs;
}

function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template\s*>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, ' ');
}

function resolveBaseUrl(html: string, finalUrl: string): string {
  const baseMatch = html.match(/<base\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const baseHref = (baseMatch?.[1] || baseMatch?.[2] || '').trim();
  try {
    return baseHref ? new URL(baseHref, finalUrl).href : finalUrl;
  } catch {
    return finalUrl;
  }
}

function countBackgroundImages(cleaned: string): number {
  const matches = cleaned.match(/background(?:-image)?\s*:\s*url\(\s*(['"]?)([^'")]+)\1\s*\)/gi);
  return matches ? matches.length : 0;
}

function scanDocument(html: string, baseUrl: string): ScanResult {
  const cleaned = stripNonContent(html);
  const blocks: RawBlock[] = [];
  const images: RawImage[] = [];
  const captures: Capture[] = [];

  let title = '';
  let lang = '';
  let canonical = '';
  let baseHref = '';
  const meta: Record<string, string> = {};

  let headerDepth = 0;
  let footerDepth = 0;
  let mainDepth = 0;
  let lastIndex = 0;

  const finishCapture = (tag: string, end: number): void => {
    let index = -1;
    for (let i = captures.length - 1; i >= 0; i -= 1) {
      if (captures[i].tag === tag) {
        index = i;
        break;
      }
    }
    if (index === -1) return;
    const capture = captures[index];
    captures.splice(index, 1);
    const text = normalizeWhitespace(capture.text);
    if (!text) return;
    if (tag === 'title') {
      title = text;
      return;
    }
    if (TEXT_BLOCK_TAGS.has(tag)) {
      blocks.push({ tag, text, start: capture.start, end });
    }
  };

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(cleaned))) {
    const raw = match[0];
    const name = (match[1] || '').toLowerCase();
    const attrRaw = match[2] || '';
    const isClosing = raw.startsWith('</');
    const selfClosing = raw.endsWith('/>');
    const start = match.index;
    const end = TAG_RE.lastIndex;

    const textChunk = cleaned.slice(lastIndex, start);
    if (textChunk && captures.length > 0) {
      captures[captures.length - 1].text += textChunk;
    }
    lastIndex = end;

    const attrs = parseAttributes(attrRaw);

    if (name === 'html' && attrs.lang) lang = normalizeWhitespace(attrs.lang);
    if (name === 'base' && attrs.href) baseHref = attrs.href;
    if (name === 'meta') {
      const key = (attrs.name || attrs.property || '').toLowerCase();
      if (key && attrs.content) meta[key] = attrs.content;
    }
    if (name === 'link' && /canonical/i.test(attrs.rel || '') && attrs.href) {
      canonical = attrs.href;
    }

    if (name === 'header') {
      if (isClosing) headerDepth = Math.max(0, headerDepth - 1);
      else if (!selfClosing) headerDepth += 1;
    } else if (name === 'footer') {
      if (isClosing) footerDepth = Math.max(0, footerDepth - 1);
      else if (!selfClosing) footerDepth += 1;
    } else if (name === 'main') {
      if (isClosing) mainDepth = Math.max(0, mainDepth - 1);
      else if (!selfClosing) mainDepth += 1;
    }

    if (name === 'img' && !isClosing) {
      const location: AltImageLocation =
        headerDepth > 0 ? 'header' : footerDepth > 0 ? 'footer' : mainDepth > 0 ? 'main' : 'unknown';
      images.push({ attrs, pos: start, location });
    }

    if (name === 'title') {
      if (!isClosing && !selfClosing) {
        captures.push({ tag: 'title', text: '', start });
      } else if (isClosing) {
        finishCapture('title', end);
      }
      continue;
    }

    if (TEXT_BLOCK_TAGS.has(name)) {
      if (!isClosing && !selfClosing) {
        captures.push({ tag: name, text: '', start });
      } else if (isClosing) {
        finishCapture(name, end);
      }
    }
  }

  for (const capture of captures) {
    const text = normalizeWhitespace(capture.text);
    if (text && capture.tag !== 'title') {
      blocks.push({ tag: capture.tag, text, start: capture.start, end: cleaned.length });
    }
  }

  blocks.sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    title,
    lang,
    canonical,
    meta,
    baseHref,
    blocks,
    images,
    backgroundImageCount: countBackgroundImages(cleaned),
  };
}

function getFirst(attrs: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = (attrs[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function pickSrcset(attrs: Record<string, string>): string {
  const raw = getFirst(attrs, ['srcset', 'data-srcset', 'imagesrcset']);
  if (!raw) return '';

  let best = '';
  let bestScore = -1;
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [url, descriptor = ''] = trimmed.split(/\s+/);
    if (!url || url.startsWith('data:')) continue;
    let score = 0;
    if (/w$/i.test(descriptor)) score = Number.parseInt(descriptor, 10) || 0;
    else if (/x$/i.test(descriptor)) score = (Number.parseFloat(descriptor) || 1) * 1000;
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return best;
}

function pickImageUrl(attrs: Record<string, string>): string {
  const direct = getFirst(attrs, [
    'src',
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-url',
    'data-image',
    'data-bg',
  ]);
  const srcset = pickSrcset(attrs);
  if (srcset) return srcset;

  const lazy = getFirst(attrs, ['data-src', 'data-lazy-src', 'data-original', 'data-url']);
  const looksLikePlaceholder =
    /(?:placeholder|blank|spacer|transparent|lazy|1x1|pixel)/i.test(direct) ||
    direct.startsWith('data:') ||
    direct.startsWith('blob:');
  if (lazy && looksLikePlaceholder) return lazy;

  return direct;
}

function resolveImageUrl(raw: string, baseUrl: string): string | null {
  const value = (raw || '').trim().replace(/^url\(\s*(['"]?)(.*?)\1\s*\)$/i, '$2');
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function guessFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
    const withoutExt = last.replace(/\.[a-z0-9]{2,5}$/i, '');
    return normalizeWhitespace(withoutExt.replace(/[-_]+/g, ' ')) || 'image';
  } catch {
    return 'image';
  }
}

function numberAttr(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function skipReasonFor(url: string, width: number | null, height: number | null): string | null {
  const lower = url.toLowerCase();
  if (lower.startsWith('blob:')) return 'blob';
  if (/\.svg(?:$|[?#])/.test(lower)) return 'svg';
  if (/\.gif(?:$|[?#])/.test(lower)) return 'gif';
  if (width !== null && height !== null && width <= 2 && height <= 2) return 'tracking_pixel';
  return null;
}

function isDecorative(
  attrs: Record<string, string>,
  width: number | null,
  height: number | null,
): boolean {
  if ((attrs['aria-hidden'] || '').toLowerCase() === 'true') return true;
  if (Object.prototype.hasOwnProperty.call(attrs, 'hidden')) return true;
  const role = (attrs.role || '').toLowerCase();
  if (role === 'presentation' || role === 'none') return true;
  return width !== null && height !== null && width <= 24 && height <= 24;
}

function nearestBlock(
  blocks: RawBlock[],
  pos: number,
  tags: Set<string>,
  direction: 'before' | 'after',
): RawBlock | null {
  let found: RawBlock | null = null;
  for (const block of blocks) {
    if (!tags.has(block.tag)) continue;
    if (direction === 'before') {
      if (block.end <= pos) found = block;
      else break;
    } else if (block.start >= pos) {
      found = block;
      break;
    }
  }
  return found;
}

function buildImages(scan: ScanResult, baseUrl: string): {
  images: AltImageCandidate[];
  imageCount: number;
  skippedImageCount: number;
  truncated: boolean;
} {
  const seen = new Set<string>();
  const processable: AltImageCandidate[] = [];
  let imageCount = 0;
  let skippedImageCount = 0;

  for (const rawImage of scan.images) {
    const resolved = resolveImageUrl(pickImageUrl(rawImage.attrs), baseUrl);
    if (!resolved) {
      skippedImageCount += 1;
      continue;
    }

    const width = numberAttr(rawImage.attrs.width);
    const height = numberAttr(rawImage.attrs.height);
    const skipReason = skipReasonFor(resolved, width, height);

    if (skipReason) {
      skippedImageCount += 1;
      continue;
    }

    if (seen.has(resolved)) {
      skippedImageCount += 1;
      continue;
    }
    seen.add(resolved);

    imageCount += 1;
    if (processable.length >= MAX_IMAGES) continue;

    const heading = nearestBlock(scan.blocks, rawImage.pos, HEADING_TAGS, 'before');
    const paragraph = nearestBlock(scan.blocks, rawImage.pos, new Set(['p', 'li']), 'before');
    const caption = nearestBlock(scan.blocks, rawImage.pos, new Set(['figcaption']), 'after');
    const captionText =
      caption && caption.start - rawImage.pos <= 1200 ? truncateText(caption.text, 220) : '';

    processable.push({
      url: resolved,
      filename: guessFilename(resolved),
      location: rawImage.location,
      currentAlt: normalizeWhitespace(rawImage.attrs.alt || ''),
      hasAltAttr: Object.prototype.hasOwnProperty.call(rawImage.attrs, 'alt'),
      width,
      height,
      ariaHidden: (rawImage.attrs['aria-hidden'] || '').toLowerCase() === 'true',
      role: (rawImage.attrs.role || '').toLowerCase(),
      decorative: isDecorative(rawImage.attrs, width, height),
      skipReason: null,
      nearbyHeading: heading ? truncateText(heading.text, 220) : '',
      nearbyCaption: captionText,
      nearbyParagraph: paragraph ? truncateText(paragraph.text, 220) : '',
    });
  }

  return {
    images: processable,
    imageCount,
    skippedImageCount,
    truncated: imageCount > MAX_IMAGES,
  };
}

function buildPage(
  scan: ScanResult,
  finalUrl: string,
  imageCount: number,
  skippedImageCount: number,
  truncated: boolean,
): AltPageContext {
  const h1 = scan.blocks.find((block) => block.tag === 'h1')?.text || '';
  const h2s = scan.blocks
    .filter((block) => block.tag === 'h2')
    .map((block) => block.text)
    .filter((text, index, list) => text && list.indexOf(text) === index)
    .slice(0, 8);
  const h3s = scan.blocks
    .filter((block) => block.tag === 'h3')
    .map((block) => block.text)
    .filter((text, index, list) => text && list.indexOf(text) === index)
    .slice(0, 8);

  const paragraphs: string[] = [];
  const paragraphSeen = new Set<string>();
  for (const block of scan.blocks) {
    if (block.tag !== 'p' && block.tag !== 'li' && block.tag !== 'figcaption') continue;
    if (block.text.length < 20) continue;
    if (paragraphSeen.has(block.text)) continue;
    paragraphSeen.add(block.text);
    paragraphs.push(block.text);
    if (paragraphs.length >= MAX_PARAGRAPHS) break;
  }

  const title = normalizeWhitespace(
    scan.title || scan.meta['og:title'] || scan.meta['twitter:title'] || h1 || '',
  );
  const description = normalizeWhitespace(
    scan.meta.description || scan.meta['og:description'] || scan.meta['twitter:description'] || '',
  );
  const lang = normalizeWhitespace(scan.lang || '');
  const canonical = resolveImageUrl(scan.canonical, finalUrl) || '';

  let host = '';
  try {
    host = new URL(finalUrl).host;
  } catch {
    host = '';
  }

  const summaryLines = [
    title ? `頁面：${title}` : '',
    h1 ? `H1：${h1}` : '',
    h2s.length > 0 ? `H2：${h2s.join(' / ')}` : '',
    description ? `描述：${description}` : '',
    paragraphs.length > 0
      ? `正文：\n${paragraphs
          .slice(0, 6)
          .map((paragraph, index) => `${index + 1}. ${paragraph}`)
          .join('\n')}`
      : '',
  ].filter(Boolean);

  const summary = truncateText(summaryLines.join('\n'), MAX_CONTEXT_CHARS);
  const wordCount = countWords([title, h1, ...h2s, ...paragraphs].join(' '));

  return {
    url: finalUrl,
    host,
    title,
    description,
    lang,
    canonical,
    ogTitle: normalizeWhitespace(scan.meta['og:title'] || ''),
    ogDescription: normalizeWhitespace(scan.meta['og:description'] || ''),
    h1,
    h2s,
    h3s,
    paragraphs,
    wordCount,
    summary,
    imageCount,
    skippedImageCount,
    backgroundImageCount: scan.backgroundImageCount,
    truncated,
  };
}

/**
 * 分析一頁 HTML。`finalUrl` 應為 redirect 後的最終 URL，用於解析相對路徑。
 */
export function analyzePage(html: string, finalUrl: string): AltPageAnalysis {
  const safeFinalUrl = (() => {
    try {
      const url = new URL(finalUrl);
      url.hash = '';
      return url.href;
    } catch {
      return 'https://example.invalid/';
    }
  })();

  const baseUrl = resolveBaseUrl(html, safeFinalUrl);
  const scan = scanDocument(html, baseUrl);
  const { images, imageCount, skippedImageCount, truncated } = buildImages(scan, baseUrl);
  const page = buildPage(scan, safeFinalUrl, imageCount, skippedImageCount, truncated);

  return { page, images };
}

export const ALT_PAGE_PARSER_LIMITS = {
  maxImages: MAX_IMAGES,
  maxContextChars: MAX_CONTEXT_CHARS,
  maxParagraphs: MAX_PARAGRAPHS,
} as const;
