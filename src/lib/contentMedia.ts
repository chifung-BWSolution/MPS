/**
 * 社媒自動化營運 · 配圖（PRD 決策 D9、M2-05 / M2-06）
 *
 * v1 不接影像 API：
 *   1. 先由素材庫以標籤匹配
 *   2. 沒有匹配就產 SVG 圖卡（標題 + 漸變底），風險最低
 *
 * 純函式，Deno 與瀏覽器皆可執行。
 */

import type { ContentAsset } from './contentTypes.ts';
import { escapeHtml, hashString } from './contentFormat.ts';

export const SVG_CARD_WIDTH = 1200;
export const SVG_CARD_HEIGHT = 675; // 16:9

const GRADIENT_PALETTES: [string, string][] = [
  ['#0f766e', '#134e4a'],
  ['#0d9488', '#155e75'],
  ['#115e59', '#1e3a8a'],
  ['#0f172a', '#0e7490'],
  ['#1e293b', '#0d9488'],
];

export interface SvgCardOptions {
  title: string;
  subtitle?: string | null;
  brand?: string | null;
  /** 站點品牌色（#RRGGBB）；不合法時用雜湊選色 */
  accentColor?: string | null;
  width?: number;
  height?: number;
  variant?: 'cover' | 'figure';
  index?: number;
  locale?: string;
}

interface TextLine {
  text: string;
  width: number;
}

function isHexColor(value: string | null | undefined): value is string {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test((value || '').trim());
}

function paletteFor(seed: string, accentColor?: string | null): [string, string] {
  if (isHexColor(accentColor)) {
    return [accentColor, '#0d1a2d'];
  }
  return GRADIENT_PALETTES[hashString(seed) % GRADIENT_PALETTES.length];
}

/** 以「每個字元寬度」估算換行，避免 SVG 文字溢出（中英混排可接受） */
function wrapText(text: string, maxUnits: number, maxLines: number): TextLine[] {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const lines: TextLine[] = [];
  let current = '';
  let currentUnits = 0;

  for (const char of normalized) {
    const units = /[\u3400-\u9fff\uff00-\uffef]/.test(char) ? 1 : 0.55;
    if (currentUnits + units > maxUnits && current) {
      lines.push({ text: current.trim(), width: currentUnits });
      current = '';
      currentUnits = 0;
      if (lines.length === maxLines) break;
    }
    current += char;
    currentUnits += units;
  }

  if (lines.length < maxLines && current.trim()) {
    lines.push({ text: current.trim(), width: currentUnits });
  }

  if (lines.length === maxLines) {
    const consumed = lines.reduce((sum, line) => sum + line.text.length, 0);
    if (consumed < normalized.length) {
      const last = lines[maxLines - 1];
      last.text = `${last.text.replace(/[\s，,、；;]+$/, '').slice(0, Math.max(1, last.text.length - 1))}…`;
    }
  }
  return lines;
}

/**
 * 產生 SVG 圖卡。輸出為可預測的純字串，方便：
 *   - 上傳 Storage（content-assets）
 *   - 內容包內以 `cover-16x9.svg` 落地
 */
export function buildSvgCard(options: SvgCardOptions): string {
  const width = options.width ?? SVG_CARD_WIDTH;
  const height = options.height ?? SVG_CARD_HEIGHT;
  const variant = options.variant ?? 'cover';
  const seed = `${options.brand || ''}|${options.title}`;
  const [from, to] = paletteFor(seed, options.accentColor);
  const scale = width / SVG_CARD_WIDTH;

  const titleSize = (variant === 'cover' ? 68 : 52) * scale;
  const titleLines = wrapText(options.title, variant === 'cover' ? 17 : 21, variant === 'cover' ? 3 : 2);
  const subtitleLines = wrapText(options.subtitle || '', 30, 2);
  const brandText = (options.brand || '').trim();
  const safeId = `grad${(hashString(seed) % 10_000).toString(36)}`;

  const titleStartY =
    (height * (titleLines.length >= 3 ? 0.3 : 0.36)) +
    (variant === 'figure' ? height * 0.03 : 0);

  const titleLinesMarkup = titleLines
    .map(
      (line, index) =>
        `<text x="${Math.round(80 * scale)}" y="${Math.round(titleStartY + index * titleSize * 1.22)}" font-family="'PingFang TC','Microsoft JhengHei','Noto Sans CJK TC',sans-serif" font-size="${Math.round(titleSize)}" font-weight="700" fill="#ffffff" letter-spacing="-0.5">${escapeHtml(line.text)}</text>`,
    )
    .join('\n  ');

  const subtitleMarkup = subtitleLines
    .map(
      (line, index) =>
        `<text x="${Math.round(80 * scale)}" y="${Math.round(titleStartY + titleLines.length * titleSize * 1.22 + 26 * scale + index * (variant === 'cover' ? 38 : 32) * scale)}" font-family="'PingFang TC','Microsoft JhengHei','Noto Sans CJK TC',sans-serif" font-size="${Math.round((variant === 'cover' ? 26 : 22) * scale)}" fill="rgba(255,255,255,0.78)">${escapeHtml(line.text)}</text>`,
    )
    .join('\n  ');

  const brandMarkup = brandText
    ? `<text x="${Math.round(width - 80 * scale)}" y="${Math.round(height - 64 * scale)}" text-anchor="end" font-family="'Space Grotesk','Helvetica Neue',Arial,sans-serif" font-size="${Math.round(22 * scale)}" font-weight="600" fill="rgba(255,255,255,0.7)" letter-spacing="3">${escapeHtml(brandText.toUpperCase())}</text>`
    : '';

  const accentMarkup = `<rect x="${Math.round(80 * scale)}" y="${Math.round(titleStartY - titleSize * 1.3)}" width="${Math.round(72 * scale)}" height="${Math.round(6 * scale)}" rx="${Math.round(3 * scale)}" fill="rgba(255,255,255,0.85)" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.title)}">
  <defs>
    <linearGradient id="${safeId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}" />
      <stop offset="100%" stop-color="${to}" />
    </linearGradient>
    <pattern id="${safeId}-grid" width="${Math.round(48 * scale)}" height="${Math.round(48 * scale)}" patternUnits="userSpaceOnUse">
      <path d="M ${Math.round(48 * scale)} 0 L 0 0 0 ${Math.round(48 * scale)}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#${safeId})" />
  <rect width="${width}" height="${height}" fill="url(#${safeId}-grid)" />
  <circle cx="${Math.round(width * 0.88)}" cy="${Math.round(height * 0.16)}" r="${Math.round(width * 0.17)}" fill="rgba(255,255,255,0.06)" />
  <circle cx="${Math.round(width * 0.78)}" cy="${Math.round(height * 0.9)}" r="${Math.round(width * 0.1)}" fill="rgba(255,255,255,0.05)" />
  ${accentMarkup}
  ${titleLinesMarkup}
  ${subtitleMarkup}
  ${brandMarkup}
</svg>`;
}

/** `data:` URI；用 encodeURIComponent 以避免依賴 btoa（Deno / Node / 瀏覽器通吃） */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 內文圖（章節插圖）：標題 + 序號 */
export function buildFigureSvgCard(params: {
  title: string;
  index: number;
  brand?: string | null;
  accentColor?: string | null;
}): string {
  return buildSvgCard({
    title: params.title,
    subtitle: `FIGURE ${String(params.index).padStart(2, '0')}`,
    brand: params.brand,
    accentColor: params.accentColor,
    variant: 'figure',
    width: 1200,
    height: 675,
  });
}

// ============================================================
// 素材挑選
// ============================================================

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * 依標籤匹配素材：重疊越多越前面，其次新到舊。
 * 沒有標籤需求時回傳最近上傳的素材。
 */
export function pickAssetsByTags(
  assets: readonly ContentAsset[],
  tags: readonly string[],
  limit = 3,
): ContentAsset[] {
  const wanted = new Set(tags.map(normalizeTag).filter(Boolean));
  const scored = assets
    .filter((asset) => asset.mime_type?.startsWith('image/'))
    .map((asset) => {
      const overlap = (asset.tags || []).filter((tag) => wanted.has(normalizeTag(tag))).length;
      const recency = new Date(asset.created_at).getTime() || 0;
      return { asset, overlap, recency };
    })
    .sort((a, b) => b.overlap - a.overlap || b.recency - a.recency);

  const best = scored.filter((item) => item.overlap > 0);
  return (best.length > 0 ? best : scored).slice(0, Math.max(0, limit)).map((item) => item.asset);
}

/** 新生成文章該用哪些標籤找素材：關鍵字 + 欄目 + cluster */
export function buildAssetTags(params: {
  keyword?: string | null;
  cluster?: string | null;
  sectionName?: string | null;
}): string[] {
  return [params.keyword, params.cluster, params.sectionName]
    .map((value) => (value || '').trim())
    .filter(Boolean);
}

/** 內容包內圖檔的命名規則（PRD §9.3.5） */
export function packageImagePath(
  variant: 'cover' | 'figure',
  index?: number,
  extension: 'svg' | 'png' | 'jpg' | 'webp' = 'svg',
): string {
  if (variant === 'cover') return `images/cover-16x9.${extension}`;
  return `images/figure-${String(index ?? 1).padStart(2, '0')}.${extension}`;
}
