import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { captureRenderedPage, publishCapturedImages, resolveRenderUrl, type RenderedPage } from "../_shared/readdy-render.ts";
import { CAPTURE_DEVICES, comparePageLayouts, LAYOUT_MEASUREMENT_VERSION } from "../_shared/readdy-layout-score.ts";
import {
  corsHeaders,
  jsonResponse,
  requireUser,
  supabaseAdmin,
} from "../_shared/framer-mcp.ts";

type GridConfig = {
  desktop_width: number;
  container_max_width: number;
  columns: number;
  gutter: number;
};

type IrButton = {
  label: string;
  variant: "primary" | "secondary" | "ghost";
  href?: string;
};

type IrNavLink = string | { label: string; href?: string };

type IrCard = {
  title: string;
  description: string;
  tag?: string;
  icon?: string;
  imageUrl?: string;
  tagline?: string;
  href?: string;
};

type IrStat = {
  label: string;
  value: string;
};

type IrElements = {
  badge?: string;
  heading?: string;
  brandSubtitle?: string;
  subheading?: string;
  paragraphs?: string[];
  buttons?: IrButton[];
  navLinks?: IrNavLink[];
  logos?: string[];
  cards?: IrCard[];
  stats?: IrStat[];
  imageUrl?: string;
  backgroundImage?: string;
  overlay?: string;
  footerColumns?: Array<{ title: string; links: Array<{ label: string; href?: string }> }>;
  footerLead?: {
    tagline?: string;
    contactTitle?: string;
    contactLines?: Array<{ label: string; href?: string }>;
    quickTitle?: string;
    quickLinks?: Array<{ label: string; href?: string }>;
    company?: string;
  };
};

type IrSection = {
  id: string;
  step: number;
  name: string;
  sectionKind: "navbar" | "hero" | "logos" | "features" | "content" | "cta" | "footer";
  framerType: "Stack" | "Grid" | "Frame";
  direction: "horizontal" | "vertical";
  gridSpan: string;
  columns: number;
  gap: number;
  padding: string;
  background: string;
  textColor: string;
  accentColor: string;
  elements: IrElements;
  interactivePlaceholders: string[];
  framerNodeSpec: {
    component: string;
    width: string;
    maxWidth: number;
    layout: string;
    distribution: string;
    alignment: string;
    gap: number;
    borderRadius: number;
    fills: string[];
  };
  syncStatus: "pending" | "syncing" | "synced" | "failed";
};

type FramerIrPageMeta = {
  path: string;
  title: string;
  locale?: string;
  pageKind?: string;
  sourceFile?: string;
  includedFiles?: string[];
  framerPageNodeId?: string | null;
};

type CssTokensInput = {
  colors?: Record<string, string>;
  fontHeading?: string;
  fontBody?: string;
  backgroundHex?: string;
  surfaceHex?: string;
  primaryHex?: string;
  accentHex?: string;
  textHex?: string;
};

type FramerIrPayload = {
  version: "1.2";
  renderedPage?: Omit<RenderedPage, "scenes" | "geometry"> & { scenePath: string };
  pageMeta?: FramerIrPageMeta;
  sourceSummary: {
    framework: string;
    styling: string;
    sectionCount: number;
  };
  gridConfig: GridConfig;
  designTokens: {
    colors: Record<string, string>;
    typography: {
      fontFamily: string;
      bodyFont?: string;
      h1Size: number;
      h2Size: number;
      bodySize: number;
    };
    radius: {
      sm: number;
      md: number;
      lg: number;
    };
  };
  sections: IrSection[];
};

function findRenderedHeading(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return;
  const node = value as { htmlTag?: string; text?: string; children?: unknown[] };
  if (/^h[1-6]$/.test(node.htmlTag || "")) {
    const extract = (value: unknown): string => {
      if (!value || typeof value !== "object") return "";
      const item = value as { text?: string; children?: unknown[] };
      return item.text || (item.children || []).map(extract).filter(Boolean).join(" ");
    };
    const heading = extract(node);
    if (heading) return heading;
  }
  for (const child of node.children || []) {
    const found = findRenderedHeading(child);
    if (found) return found;
  }
}

function firstFontFamily(value: string | undefined): string | undefined {
  const first = String(value || "").split(",")[0]?.replace(/['"]/g, "").trim() || "";
  if (!first || /^(sans-serif|serif|monospace|system-ui)$/i.test(first)) return undefined;
  return first;
}

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function openingTagClasses(code: string): string {
  const start = code.search(/<(section|header|footer|nav|main|article)\b/i);
  if (start < 0) return "";
  const slice = code.slice(start, start + 800);
  let end = 0;
  let quote = "";
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === ">") {
      end = i;
      break;
    }
  }
  const tag = end > 0 ? slice.slice(0, end) : slice;
  const classMatch = tag.match(/\bclassName=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/);
  return classMatch?.[1] || classMatch?.[2] || classMatch?.[3] || "";
}

function extractColorFromClasses(
  text: string,
  prefix: "bg" | "text",
  fallback: string,
  cssColors: Record<string, string> = {},
): string {
  if (prefix === "bg" && /\bbg-transparent\b/.test(text)) return "transparent";
  const bracketRe = new RegExp(`${prefix}-\\[(#[0-9a-fA-F]{3,8})\\]`);
  const bracketMatch = text.match(bracketRe);
  if (bracketMatch) return bracketMatch[1];

  const tokenRe = new RegExp(`\\b${prefix}-(background|foreground|primary|accent|secondary)-(\\d{2,3})\\b`, "g");
  const hits: Array<{ group: string; key: string }> = [];
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenRe.exec(text)) !== null) {
    hits.push({ group: tokenMatch[1], key: `${tokenMatch[1]}-${tokenMatch[2]}` });
  }
  const preferredGroup = prefix === "bg" ? "background" : "foreground";
  const preferred = hits.find((hit) => hit.group === preferredGroup) || hits[0];
  if (preferred && cssColors[preferred.key]) return cssColors[preferred.key];

  if (prefix === "bg") {
    if (/\bbg-slate-950\b|\bbg-gray-950\b|\bbg-black\b/.test(text)) return "#080F1E";
    if (/\bbg-slate-900\b|\bbg-gray-900\b/.test(text)) return "#101B2D";
    if (/\bbg-slate-50\b|\bbg-gray-50\b/.test(text)) return "#F8FAFC";
    if (/\bbg-white\b/.test(text)) return "#FFFFFF";
    if (/\bbg-teal-500\b|\bbg-emerald-500\b/.test(text)) return "#0BB59B";
  } else {
    if (/\btext-white\b/.test(text)) return "#FFFFFF";
    if (/\btext-slate-900\b|\btext-gray-900\b/.test(text)) return "#101B2D";
    if (/\btext-slate-300\b|\btext-slate-400\b/.test(text)) return "#CBD5E1";
  }
  return fallback;
}

function extractAllMatches(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const cloned = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  while ((m = cloned.exec(text)) !== null) {
    const cleaned = cleanText(m[1] || "");
    if (cleaned) out.push(cleaned);
  }
  return out;
}

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function mapImageUrl(rawUrl: string | undefined, assetUrlMap: Record<string, string>): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = decodeHtmlAttr(rawUrl.trim());
  if (!trimmed || /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(trimmed)) return undefined;
  if (assetUrlMap[trimmed]) return assetUrlMap[trimmed];
  const fileName = trimmed.split("?")[0]?.split("/").pop() || "";
  if (fileName && assetUrlMap[fileName]) return assetUrlMap[fileName];
  return trimmed;
}

function preferCompleteImageUrl(
  current: string | undefined,
  fallbackUrl: string | undefined,
  assetUrlMap: Record<string, string>,
): string | undefined {
  const next = mapImageUrl(current, assetUrlMap);
  const full = mapImageUrl(fallbackUrl, assetUrlMap);
  if (!full) return next;
  if (!next) return full;
  if (full.startsWith(next) && next.length < full.length) return full;
  return next;
}

function isFaqHint(text: string): boolean {
  return /(?:^|[^a-zA-Z])(?:faq|Faq|FAQ)(?=[A-Z0-9_\s-]|section|Section|$)|[a-z]Faq(?=[A-Z0-9_\s-]|$)|accordion|Accordion|常見問題|常见问题/.test(
    text,
  );
}

function extractAnchorLinks(code: string, limit = 24): Array<{ label: string; href: string }> {
  const out: Array<{ label: string; href: string }> = [];
  const seen = new Set<string>();
  const re = /<(a|Link)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null && out.length < limit) {
    const hrefMatch = match[2].match(/\b(?:href|to)=["']([^"']+)["']/);
    const href = decodeHtmlAttr(hrefMatch?.[1]?.trim() || "");
    const label = cleanText(match[3]);
    if (!href || href === "#" || !label || seen.has(`${label}|${href}`)) continue;
    seen.add(`${label}|${href}`);
    out.push({ label, href });
  }
  return out;
}

function withAnchorHref<T extends { label: string; href?: string }>(item: T, anchors: Array<{ label: string; href: string }>): T {
  if (item.href && item.href !== "#") return item;
  const hit = anchors.find((anchor) => anchor.label === item.label);
  return hit ? { ...item, href: hit.href } : item;
}

function footerRegion(code: string, name: string): string {
  const marker = `<!-- footer-${name} -->`;
  const start = code.indexOf(marker);
  if (start < 0) return "";
  const from = start + marker.length;
  const next = code.slice(from).search(/<!-- footer-/);
  return (next < 0 ? code.slice(from) : code.slice(from, from + next)).trim();
}

function extractFooterColumnsFromHtml(
  code: string,
): Array<{ title: string; links: Array<{ label: string; href?: string }> }> {
  const parts = code.split(/<h3\b[^>]*>/i);
  if (parts.length < 2) return [];
  const columns: Array<{ title: string; links: Array<{ label: string; href?: string }> }> = [];
  for (const part of parts.slice(1, 8)) {
    const titleMatch = part.match(/^([\s\S]*?)<\/h3>/i);
    const title = cleanText(titleMatch?.[1] || "");
    const links = extractAnchorLinks(part, 16);
    if (title && links.length > 0) columns.push({ title, links });
  }
  return columns;
}

function extractJsxElementTexts(code: string, tagNames: string[]): string[] {
  const out: string[] = [];
  const openRe = new RegExp(`<(${tagNames.join("|")})(?=[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(code)) !== null) {
    const tag = m[1];
    let i = m.index + m[0].length;
    let braceDepth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let escaped = false;
    let openEnd = -1;
    let selfClosing = false;

    for (; i < code.length; i++) {
      const ch = code[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (!inDouble && !inBacktick && ch === "'") {
        inSingle = !inSingle;
        continue;
      }
      if (!inSingle && !inBacktick && ch === '"') {
        inDouble = !inDouble;
        continue;
      }
      if (!inSingle && !inDouble && ch === "`") {
        inBacktick = !inBacktick;
        continue;
      }
      if (inSingle || inDouble || inBacktick) continue;
      if (ch === "{") {
        braceDepth++;
      } else if (ch === "}") {
        if (braceDepth > 0) braceDepth--;
      } else if (ch === ">" && braceDepth === 0) {
        selfClosing = code[i - 1] === "/";
        openEnd = i;
        break;
      }
    }

    if (openEnd < 0) break;
    if (selfClosing) {
      openRe.lastIndex = openEnd + 1;
      continue;
    }

    const rest = code.slice(openEnd + 1);
    const closeRe = new RegExp(`</${tag}\\s*>`, tag === "Link" ? "" : "i");
    const closeMatch = closeRe.exec(rest);
    if (!closeMatch) {
      openRe.lastIndex = openEnd + 1;
      continue;
    }

    const inner = rest.slice(0, closeMatch.index);
    const cleaned = cleanText(inner);
    if (
      cleaned &&
      !/\b(?:className|onClick|onChange|onSubmit)=|\bset[A-Z]\w*\(/.test(cleaned)
    ) {
      out.push(cleaned);
    }
    openRe.lastIndex = openEnd + 1 + closeMatch.index + closeMatch[0].length;
  }
  return out;
}

function detectSectionKind(
  hint: string,
  tag: string,
  isFaq: boolean,
  hasFullBleedImage: boolean,
  hasCards: boolean,
): IrSection["sectionKind"] {
  const lower = `${hint} ${tag}`.toLowerCase();
  if (tag === "header" || tag === "nav" || /\b(nav|header|topbar)\b/.test(lower)) return "navbar";
  if (tag === "footer" || /\bfooter\b/.test(lower)) return "footer";
  if (isFaq) return "content";
  if (hasFullBleedImage) return "hero";
  if (hasCards) return "features";
  return "content";
}

function isSeoKeywordLine(text: string): boolean {
  const t = text.trim();
  if (!t || /^keywords?$/i.test(t)) return true;
  return t.length <= 80 && /^[A-Z0-9][A-Z0-9\s/|&,.-]*$/.test(t) && /[/|]/.test(t);
}

function visibleCopy(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const text = line.trim();
    if (text.length < 2 || isSeoKeywordLine(text) || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function extractVisibleParagraphs(code: string): string[] {
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  const lines: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const attrs = match[1] || "";
    if (/\bsr-only\b|\bhidden\b/.test(attrs) && !/\b(?:sm|md|lg|xl):(?!hidden)/.test(attrs)) continue;
    lines.push(match[2] || "");
  }
  return visibleCopy(lines.map((line) => cleanText(line)));
}

function regionAfterHeading(code: string): string {
  const start = code.search(/<h1\b/i);
  if (start < 0) return code;
  const end = code.indexOf("</section>", start);
  return code.slice(start, end > start ? end : undefined);
}

function chunkHasDarkOverlay(code: string): boolean {
  return /bg-gradient-to-|from-black|via-black|to-black|bg-black\/|rgba\(\s*0\s*,\s*0\s*,\s*0/.test(code);
}

function chunkIsFullBleed(code: string, imageCount: number, cardImages: number): boolean {
  if (imageCount < 1 || cardImages >= 2) return false;
  return /inset-0|object-cover|bg-\[url\(|min-h-\[\d{3,}px\]/.test(code);
}

function defaultSectionTitle(kind: IrSection["sectionKind"], hint: string, idx: number): string {
  if (hint && hint.length >= 2 && hint.length <= 42) return hint;
  switch (kind) {
    case "navbar": return "Top Navigation";
    case "hero": return "Hero Banner";
    case "logos": return "Trusted Logos Strip";
    case "features": return "Core Features Grid";
    case "cta": return "Conversion CTA Banner";
    case "footer": return "Global Footer";
    default: return `Content Section ${idx + 1}`;
  }
}

function detectInteractivePlaceholders(chunk: string, hint = ""): string[] {
  const placeholders: string[] = [];
  if (/<form\b|\bonSubmit\b|<textarea\b/i.test(chunk)) {
    placeholders.push("表單互動（已保留版面結構，送出邏輯需於 Framer 綁定）");
  }
  if (/recharts|ResponsiveContainer|<svg\b[^>]*chart/i.test(chunk)) {
    placeholders.push("圖表元件（建議於 Framer 使用 Embed 或 Code Override）");
  }
  if (/AnimatePresence|motion\./i.test(chunk)) {
    placeholders.push("動態過場（可於 Framer 補設 Appear / Scroll 效果）");
  }
  void hint;
  return placeholders;
}

function filterInteractivePlaceholders(
  list: string[],
  sectionName: string,
  chunkHasForm: boolean,
): string[] {
  const isFaq = isFaqHint(sectionName);
  return Array.from(
    new Set(
      list
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item) => {
          if (!chunkHasForm && /Form \/ Stateful Interaction/i.test(item)) return false;
          if (isFaq && /accordion|open\/close|手風琴|展開/i.test(item)) return false;
          return true;
        }),
    ),
  );
}

function extractBalancedBlock(text: string, openIdx: number): string {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === "`") inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(openIdx, i + 1);
      }
    }
  }
  return text.slice(openIdx, Math.min(text.length, openIdx + 8000));
}

function readObjStringField(block: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`\\b${key}\\s*:\\s*(?:'((?:\\\\'|[^'])*)'|"((?:\\\\"|[^"])*)")`);
    const m = block.match(re);
    if (m) {
      const v = (m[1] ?? m[2] ?? "").replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
      if (v) return v;
    }
  }
  return undefined;
}

function extractCardsFromDataObjects(
  code: string,
  assetUrlMap: Record<string, string> = {},
  warnings: string[] = [],
): IrCard[] {
  const cards: IrCard[] = [];
  const seen = new Set<string>();
  const keyRe = /\b(?:title|name|heading|question)\s*:\s*['"]([^'"]{2,100})['"]/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(code)) !== null) {
    if (cards.length >= 12) {
      const message = "單一區塊卡片超過 12 張，其餘已截斷";
      warnings.push(message);
      console.warn(`[readdy-parse-ir] ${message}`);
      break;
    }
    let openIdx = -1;
    let depth = 0;
    for (let i = m.index; i >= 0; i--) {
      const ch = code[i];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) {
          openIdx = i;
          break;
        }
        depth--;
      }
    }
    if (openIdx < 0) continue;
    const block = extractBalancedBlock(code, openIdx);
    const title = readObjStringField(block, ["title", "name", "heading", "question"]);
    const description =
      readObjStringField(block, [
        "description",
        "desc",
        "text",
        "summary",
        "answer",
        "detail",
        "quote",
        "occasions",
        "content",
        "body",
        "excerpt",
        "intro",
      ]) || "";
    const href = readObjStringField(block, ["href", "url", "path", "to", "link"]);
    const rawImg = readObjStringField(block, [
      "image",
      "imageUrl",
      "img",
      "src",
      "cardImage",
      "cover",
      "photo",
      "heroImage",
    ]);
    if (!title || seen.has(title) || (!description && !href && !rawImg)) continue;
    seen.add(title);
    const tagline = readObjStringField(block, ["problem", "tagline", "subtitle", "role", "config"]);
    const tag = readObjStringField(block, ["number", "step", "tag", "category", "event"]);
    cards.push({
      title,
      description,
      ...(tag ? { tag } : {}),
      ...(tagline && tagline !== description ? { tagline } : {}),
      ...(rawImg ? { imageUrl: mapImageUrl(rawImg, assetUrlMap) } : {}),
      ...(href && href !== "#" ? { href } : {}),
    });
  }
  return cards;
}

function extractStatsFromDataObjects(code: string): IrStat[] {
  const stats: IrStat[] = [];
  const seen = new Set<string>();
  const re =
    /\{\s*value\s*:\s*['"]([^'"]{1,30})['"]\s*,\s*label\s*:\s*['"]([^'"]{1,50})['"]\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null && stats.length < 6) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    stats.push({ value: m[1].trim(), label: m[2].trim() });
  }
  return stats;
}

function deterministicParseCode(
  rawCode: string,
  grid: GridConfig,
  assetUrlMap: Record<string, string>,
  cssTokens?: CssTokensInput,
  pageMeta?: FramerIrPageMeta,
  warnings: string[] = [],
): FramerIrPayload {
  const cssColors = cssTokens?.colors || {};
  const looksLight = /bg-white|bg-background-50|bg-\[#(?:f|F)/.test(rawCode.slice(0, 5000));
  const defaultBg =
    cssTokens?.backgroundHex ||
    extractColorFromClasses(rawCode.slice(0, 900), "bg", looksLight ? "#F7F4EF" : "#080F1E", cssColors);
  const rootIsDark =
    /^#0|^#1|^#2/i.test(defaultBg) ||
    /\bbg-\[#0|\bbg-slate-9|\bbg-gray-9/.test(rawCode.slice(0, 600));
  const defaultText = cssTokens?.textHex || (rootIsDark ? "#FFFFFF" : "#101B2D");
  const accentColor = cssTokens?.primaryHex || cssTokens?.accentHex || "#0BB59B";

  // 1. Prefer splitting by /* === COMPONENT: Name (path) === */ markers when assembled from multi-page repo
  const chunks: Array<{ hint: string; tag: string; code: string }> = [];
  const componentMarkerRe = /\/\*\s*===\s*COMPONENT:\s*([^*]+?)\s*===\s*\*\//g;
  const markers = Array.from(rawCode.matchAll(componentMarkerRe));

  if (markers.length >= 2) {
    for (let i = 0; i < markers.length; i++) {
      const start = (markers[i].index ?? 0) + markers[i][0].length;
      const end = i + 1 < markers.length ? (markers[i + 1].index ?? rawCode.length) : rawCode.length;
      const slice = rawCode.slice(start, end).trim();
      const label = markers[i][1].replace(/\s*\([^)]+\)\s*$/, "").trim();
      const tag = /navbar|header/i.test(label)
        ? "header"
        : /footer/i.test(label)
          ? "footer"
          : "section";
      if (slice.length > 15) {
        chunks.push({ hint: label, tag, code: slice });
      }
    }
  } else {
    const semanticRe =
      /(?:\/\*\s*([^*]+?)\s*\*\/|<!--\s*([^-]+?)\s*-->)?\s*<(header|nav|section|footer|main|article)\b[^>]*>[\s\S]*?<\/\3>/gi;
    let match: RegExpExecArray | null;
    while ((match = semanticRe.exec(rawCode)) !== null) {
      const hint = (match[1] || match[2] || "").trim();
      const tag = (match[3] || "section").toLowerCase();
      chunks.push({ hint, tag, code: match[0] });
    }
  }

  // Fallback if code has <div> sections only
  if (chunks.length === 0) {
    const commentSplit = rawCode
      .split(/(?=\{\s*\/\*[^*]+\*\/\s*\})/g)
      .filter((c) => c.trim().length > 20);
    if (commentSplit.length > 1) {
      for (const c of commentSplit.slice(0, 10)) {
        const hintMatch = c.match(/\/\*\s*([^*]+?)\s*\*\//);
        chunks.push({ hint: hintMatch?.[1]?.trim() || "", tag: "section", code: c });
      }
    } else {
      chunks.push({ hint: pageMeta?.title || "Main Page Canvas", tag: "section", code: rawCode });
    }
  }

  if (chunks.length > 16) {
    const message = `區塊超過 16 個（${chunks.length}），其餘已截斷`;
    warnings.push(message);
    console.warn(`[readdy-parse-ir] ${message}`);
  }
  const sections: IrSection[] = chunks.slice(0, 16).map((chunk, idx) => {
    const name = defaultSectionTitle("content", chunk.hint, idx);
    const isFaq = isFaqHint(chunk.hint) || isFaqHint(chunk.code.slice(0, 500));

    const gridColsMatch =
      chunk.code.match(/lg:grid-cols-(\d+)/) ||
      chunk.code.match(/md:grid-cols-(\d+)/) ||
      chunk.code.match(/sm:grid-cols-(\d+)/) ||
      chunk.code.match(/grid-cols-(\d+)/);
    const dataCards = extractCardsFromDataObjects(chunk.code, assetUrlMap, warnings);
    const dataStats = extractStatsFromDataObjects(chunk.code);
    const h1s = visibleCopy(extractAllMatches(chunk.code, /<h1[^>]*>([\s\S]*?)<\/h1>/));
    const h2s = visibleCopy(extractAllMatches(chunk.code, /<h2[^>]*>([\s\S]*?)<\/h2>/));
    const h3s = visibleCopy(extractAllMatches(chunk.code, /<h3[^>]*>([\s\S]*?)<\/h3>/));
    const ps = visibleCopy(extractAllMatches(chunk.code, /<p[^>]*>([\s\S]*?)<\/p>/));
    const btns = extractJsxElementTexts(chunk.code, ["button", "a", "Link"]);
    const spans = extractAllMatches(chunk.code, /<span[^>]*>([\s\S]*?)<\/span>/);
    const propHeadingMatch = chunk.code.match(/\bheading=["']([^"']+)["']/);
    const propSubheadingMatch = chunk.code.match(/\bsubheading=["']([^"']+)["']/);
    const imgMatch =
      chunk.code.match(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|\{`(https?:\/\/[^`]+)`\}|\{"([^"]+)"\}|\{'([^']+)'\})/i) ||
      chunk.code.match(/\bheroImage\s*=\s*(?:"([^"]+)"|'([^']+)'|\{`(https?:\/\/[^`]+)`\}|\{"([^"]+)"\}|\{'([^']+)'\})/i) ||
      chunk.code.match(/\b(?:image|imageUrl|heroImage|cardImage|src)\s*:\s*(?:"(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)'|`(https?:\/\/[^`]+)`)/i);
    const imageUrl = mapImageUrl(imgMatch?.slice(1).find((part) => part), assetUrlMap);
    const imageCount = (chunk.code.match(/<img\b/gi) || []).length + (imageUrl ? 1 : 0);
    const cardsWithImages = dataCards.filter((card) => Boolean(card.imageUrl)).length;
    const kind = detectSectionKind(
      chunk.hint,
      chunk.tag,
      isFaq,
      chunkIsFullBleed(chunk.code, imageCount, cardsWithImages),
      cardsWithImages >= 2 || (Boolean(gridColsMatch) && imageCount >= 2) || dataCards.length >= 2,
    );

    const galleryRow =
      !gridColsMatch &&
      dataCards.length >= 2 &&
      dataCards.length <= 4 &&
      dataCards.every((card) => Boolean(card.imageUrl));
    const parsedCols = galleryRow
      ? dataCards.length
      : gridColsMatch
        ? Number(gridColsMatch[1])
        : !isFaq && (kind === "features" || dataCards.length >= 3 || h3s.length >= 3)
          ? 3
          : 1;
    const isGrid =
      !isFaq &&
      (kind === "features" || parsedCols > 1 || dataCards.length >= 2 || h3s.length >= 2);
    const isHorizontal = kind === "navbar" || kind === "logos";

    const hasFullBleedBgImg = kind === "hero" && Boolean(imageUrl);
    const isFullBleedHero = hasFullBleedBgImg;

    const darkOverlay = hasFullBleedBgImg && chunkHasDarkOverlay(chunk.code);
    const fallbackBg =
      kind === "footer"
        ? cssColors["background-100"] || "#F3EEE4"
        : defaultBg;
    const rootClasses = openingTagClasses(chunk.code);
    const bg = darkOverlay
      ? "#17120E"
      : (/\bbg-/.test(rootClasses)
          ? extractColorFromClasses(rootClasses, "bg", fallbackBg, cssColors)
          : "") || extractColorFromClasses(chunk.code, "bg", fallbackBg, cssColors);
    const isSectionDark =
      darkOverlay || bg === "transparent" || /^#0|^#1|^#2|^#3/i.test(bg);
    const textColor =
      darkOverlay || bg === "transparent"
        ? "#F9F4EE"
        : (/\btext-/.test(rootClasses)
            ? extractColorFromClasses(rootClasses, "text", "", cssColors)
            : "") ||
          extractColorFromClasses(
            chunk.code,
            "text",
            isSectionDark ? "#FFFFFF" : defaultText,
            cssColors,
          );

    const anchors = extractAnchorLinks(chunk.code);
    const elements: IrElements = {};
    if (kind === "navbar") {
      const navInnerMatch = chunk.code.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i);
      const navLinks = navInnerMatch
        ? extractJsxElementTexts(navInnerMatch[1], ["a"]).slice(0, 16)
        : btns.filter((b) => b.length <= 24).slice(0, 14);
      const ctaBtns = extractJsxElementTexts(chunk.code, ["button"]);
      const brandSubMatch = chunk.code.match(/<small[^>]*>([\s\S]*?)<\/small>/i);

      elements.heading = spans[0] || pageMeta?.title || "Brand";
      if (brandSubMatch?.[1]) elements.brandSubtitle = cleanText(brandSubMatch[1]);
      elements.navLinks = anchors.length > 0
        ? anchors.slice(0, 16)
        : navLinks.slice(0, 14);
      const navButtons = ctaBtns.length > 0 ? ctaBtns.slice(0, 2) : [];
      if (navButtons.length > 0) {
        elements.buttons = navButtons.map((label, bIdx) =>
          withAnchorHref(
            { label, variant: bIdx === 0 ? "primary" as const : "secondary" as const },
            anchors,
          ),
        );
      }
    } else if (kind === "hero") {
      const heroRegion = regionAfterHeading(chunk.code);
      elements.badge = spans[0] && spans[0].length < 48 ? spans[0] : undefined;
      elements.heading = h1s[0] || h2s[0] || pageMeta?.title || chunk.hint;
      const heroParagraphs = extractVisibleParagraphs(heroRegion).slice(0, 3);
      if (heroParagraphs.length === 1) {
        elements.subheading = heroParagraphs[0];
      } else if (heroParagraphs.length > 1) {
        elements.paragraphs = heroParagraphs;
      }
      const actionBtns = extractJsxElementTexts(heroRegion, ["button", "a", "Link"]).slice(0, 2);
      if (actionBtns.length > 0) {
        elements.buttons = actionBtns.map((label, bIdx) =>
          withAnchorHref(
            { label, variant: bIdx === 0 ? "primary" as const : "secondary" as const },
            anchors,
          ),
        );
      }
      if (imageUrl) {
        elements.backgroundImage = imageUrl;
        if (darkOverlay) {
          elements.overlay = "linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.40) 50%, rgba(0,0,0,0.62) 100%)";
        }
      }
    } else if (kind === "logos") {
      if (ps[0] || spans[0]) elements.subheading = ps[0] || spans[0];
      const logoItems = [...spans, ...btns].filter((s) => s.length >= 2 && s.length <= 24).slice(0, 6);
      if (logoItems.length >= 2) elements.logos = logoItems;
    } else if (kind === "features" || (!isFaq && dataCards.length >= 2)) {
      elements.heading = h2s[0] || h1s[0] || propHeadingMatch?.[1] || chunk.hint || "Features";
      elements.subheading = ps[0] || propSubheadingMatch?.[1] || undefined;
      if (dataStats.length > 0) {
        elements.stats = dataStats;
      }
      if (dataCards.length > 0) {
        elements.cards = dataCards;
      } else {
        const gallery: IrCard[] = [];
        const seenImg = new Set<string>();
        const imgRe = /<img\b([^>]*)>/gi;
        let imgTag: RegExpExecArray | null;
        while ((imgTag = imgRe.exec(chunk.code)) !== null && gallery.length < 8) {
          const src = imgTag[1].match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
          const url = mapImageUrl(src?.[1] || src?.[2], assetUrlMap);
          if (!url || seenImg.has(url)) continue;
          seenImg.add(url);
          const alt = imgTag[1].match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
          gallery.push({
            title: h3s[gallery.length] || cleanText(alt?.[1] || alt?.[2] || ""),
            description: "",
            imageUrl: url,
          });
        }
        if (gallery.length >= 2) {
          elements.cards = gallery;
        } else if (h3s.length >= 2) {
          const inlineStart = elements.subheading ? 1 : 0;
          elements.cards = h3s.slice(0, 6).map((title, c) => ({
            title,
            description: ps[c + inlineStart] || ps[c] || "",
          }));
        }
      }
      if (imageUrl && dataCards.length === 0) {
        if (hasFullBleedBgImg) {
          elements.backgroundImage = imageUrl;
          elements.overlay = "rgba(31, 0, 0, 0.80)";
        } else {
          elements.imageUrl = imageUrl;
        }
      }
    } else if (kind === "cta") {
      elements.heading = h2s[0] || h1s[0] || chunk.hint;
      elements.subheading = ps[0] || undefined;
      if (btns[0]) {
        elements.buttons = [
          withAnchorHref({ label: btns[0], variant: "primary" as const }, anchors),
        ];
      }
    } else if (kind === "footer") {
      const brand = footerRegion(chunk.code, "brand");
      const contact = footerRegion(chunk.code, "contact");
      const quick = footerRegion(chunk.code, "quick");
      const groups = footerRegion(chunk.code, "groups");
      const bar = footerRegion(chunk.code, "bar");
      const structured = Boolean(brand || groups);
      elements.heading = cleanText((brand.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] || spans[0] || chunk.hint));
      const brandParagraphs = extractAllMatches(brand, /<p[^>]*>([\s\S]*?)<\/p>/);
      const barParagraphs = extractAllMatches(bar, /<p[^>]*>([\s\S]*?)<\/p>/);
      const footerSub = structured ? barParagraphs[0] : ps[0];
      if (footerSub) elements.subheading = footerSub;
      const footerColumns = extractFooterColumnsFromHtml(structured ? groups : chunk.code);
      if (footerColumns.length > 0) elements.footerColumns = footerColumns;
      const brandLinks = extractAnchorLinks(brand || "");
      const contactLinks = extractAnchorLinks(contact || "");
      const quickLinks = extractAnchorLinks(quick || "");
      const contactTitle = cleanText(contact.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
      const quickTitle = cleanText(quick.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
      const contactAddress = extractAllMatches(contact, /<p[^>]*>([\s\S]*?)<\/p>/)[0];
      if (structured) {
        elements.footerLead = {
          tagline: brandParagraphs[0],
          contactTitle: contactTitle || undefined,
          contactLines: [
            ...contactLinks,
            ...(contactAddress ? [{ label: contactAddress }] : []),
          ],
          quickTitle: quickTitle || undefined,
          quickLinks,
          company: barParagraphs[1],
        };
        if (brandLinks.length > 0) {
          elements.buttons = brandLinks.slice(0, 2).map((link, index) => ({
            label: link.label,
            href: link.href,
            variant: index === 0 ? "primary" as const : "secondary" as const,
          }));
        }
      }
      elements.navLinks = structured
        ? []
        : anchors.length > 0
          ? anchors.slice(0, 24)
          : btns.slice(0, 8);
    } else {
      elements.heading = h2s[0] || h1s[0] || h3s[0] || propHeadingMatch?.[1] || name;
      elements.subheading = ps[0] || propSubheadingMatch?.[1] || undefined;
      if (ps.length > 1) elements.paragraphs = ps.slice(0, 3);
      if (dataStats.length > 0) elements.stats = dataStats;
      if (dataCards.length > 0) elements.cards = dataCards;
      if (btns[0]) {
        elements.buttons = btns.slice(0, 2).map((label, bi) =>
          withAnchorHref(
            { label, variant: bi === 0 ? "primary" as const : "secondary" as const },
            anchors,
          ),
        );
      }
      if (imageUrl) {
        if (hasFullBleedBgImg) {
          elements.backgroundImage = imageUrl;
          elements.overlay = "rgba(31, 0, 0, 0.80)";
        } else {
          elements.imageUrl = imageUrl;
        }
      }
      if (h3s.length >= 2 && ps.length >= 2 && !(elements.cards && elements.cards.length > 0)) {
        const inlineStart = hasFullBleedBgImg ? Math.max(0, ps.length - h3s.length) : elements.subheading ? 1 : 0;
        elements.cards = h3s.slice(0, 6).map((title, c) => ({
          title,
          description: ps[c + inlineStart] || ps[c] || "",
        }));
      }
    }

    const colSpan =
      isGrid && parsedCols > 1
        ? `${grid.columns} Cols · ${parsedCols}×${Math.floor(grid.columns / parsedCols)} Col Cards`
        : `${grid.columns} Cols · ${grid.container_max_width}px Container`;

    return {
      id: `sec-${idx + 1}`,
      step: idx + 1,
      name,
      sectionKind: kind,
      framerType: isGrid ? "Grid" : "Stack",
      direction: isHorizontal ? "horizontal" : "vertical",
      gridSpan: colSpan,
      columns: isGrid ? Math.max(2, parsedCols) : 1,
      gap: grid.gutter,
      padding: kind === "navbar" ? "20px 32px" : kind === "footer" ? "40px 32px" : "64px 32px",
      background: bg,
      textColor,
      accentColor,
      elements,
      interactivePlaceholders: detectInteractivePlaceholders(chunk.code, chunk.hint),
      framerNodeSpec: {
        component: isGrid ? "Framer.Grid" : "Framer.Stack",
        width: `${grid.desktop_width}px`,
        maxWidth: grid.container_max_width,
        layout: isGrid ? "grid" : isHorizontal ? "horizontal-stack" : "vertical-stack",
        distribution: isHorizontal ? "space-between" : "start",
        alignment: "center",
        gap: grid.gutter,
        borderRadius: kind === "cta" || kind === "features" ? 12 : 0,
        fills: [bg, accentColor],
      },
      syncStatus: "pending",
    };
  });

  const seenCopy = new Set<string>();
  const uniqueSections = sections.filter((section) => {
    const lines = [
      section.elements.heading,
      section.elements.subheading,
      ...(section.elements.paragraphs || []),
      ...(section.elements.buttons || []).map((button) => button.label),
      ...(section.elements.cards || []).map((card) => `${card.title}|${card.imageUrl || ""}|${card.description}`),
    ]
      .map((line) => String(line || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const key = `${section.sectionKind}|${lines.join("|")}`;
    if (lines.length === 0) return true;
    if (seenCopy.has(key)) return false;
    seenCopy.add(key);
    return true;
  }).map((section, index) => ({
    ...section,
    id: `sec-${index + 1}`,
    step: index + 1,
  }));

  return {
    version: "1.2",
    pageMeta,
    sourceSummary: {
      framework: /className=/.test(rawCode) ? "React TSX" : "HTML",
      styling: "Tailwind CSS",
      sectionCount: uniqueSections.length,
    },
    gridConfig: grid,
    designTokens: {
      colors: {
        background: defaultBg,
        surface: cssTokens?.surfaceHex || (rootIsDark ? "#111C33" : "#FFFFFF"),
        primary: accentColor,
        textPrimary: defaultText,
        textMuted: rootIsDark ? "#94A3B8" : "#64748B",
      },
      typography: {
        fontFamily: firstFontFamily(cssTokens?.fontHeading) || "Noto Serif HK",
        bodyFont: firstFontFamily(cssTokens?.fontBody) || "Noto Sans HK",
        h1Size: 48,
        h2Size: 32,
        bodySize: 16,
      },
      radius: {
        sm: 6,
        md: 12,
        lg: 16,
      },
    },
    sections: uniqueSections,
  };
}

const LLM_SOURCE_CHAR_LIMIT = 42000;

function buildLlmPrompt(
  rawCode: string,
  grid: GridConfig,
  tailwindConfig: string | null,
  assetUrlMap: Record<string, string>,
  cssTokens?: CssTokensInput,
  pageMeta?: FramerIrPageMeta,
): string {
  const assetList = Object.entries(assetUrlMap);
  const tokenSummary = cssTokens?.colors && Object.keys(cssTokens.colors).length > 0
    ? `專案 CSS Design Tokens（已從 OKLCH 轉換為 Hex）：\n${JSON.stringify({
        background: cssTokens.backgroundHex,
        surface: cssTokens.surfaceHex,
        primary: cssTokens.primaryHex,
        accent: cssTokens.accentHex,
        text: cssTokens.textHex,
        fontHeading: cssTokens.fontHeading,
        fontBody: cssTokens.fontBody,
        paletteSample: Object.fromEntries(Object.entries(cssTokens.colors).slice(0, 16)),
      })}\n`
    : "";
  const pageHeader = pageMeta
    ? `當前遷移頁面：${pageMeta.path}（標題：${pageMeta.title}，語系：${pageMeta.locale || "default"}，類型：${pageMeta.pageKind || "page"}）\n`
    : "";

  return `你是 Readdy → Framer 高還原編譯器。請把以下 React/Tailwind/HTML 源碼清洗並結構化為 Framer IR JSON。

${pageHeader}網格基準（必須嚴格對齊）：
- desktop_width: ${grid.desktop_width}px
- container_max_width: ${grid.container_max_width}px
- columns: ${grid.columns}
- gutter: ${grid.gutter}px

${tokenSummary}${tailwindConfig ? `Tailwind Config 參考：\n${tailwindConfig.slice(0, 1800)}\n` : ""}
${assetList.length > 0 ? `已上傳至 Supabase Storage 的圖片路徑映射：\n${JSON.stringify(assetUrlMap)}\n請優先將對應圖片替換為公開 URL。\n` : ""}

請只回傳一個合法 JSON 物件，結構如下（不要加 markdown 或多餘解釋）：
{
  "version": "1.2",
  "sourceSummary": { "framework": "React TSX", "styling": "Tailwind CSS", "sectionCount": number },
  "designTokens": {
    "colors": { "background": "#...", "surface": "#...", "primary": "#...", "textPrimary": "#...", "textMuted": "#..." },
    "typography": { "fontFamily": "Inter, sans-serif", "h1Size": 48, "h2Size": 32, "bodySize": 16 },
    "radius": { "sm": 6, "md": 12, "lg": 16 }
  },
  "sections": [
    {
      "id": "sec-1",
      "step": 1,
      "name": "Top Navigation",
      "sectionKind": "navbar" | "hero" | "logos" | "features" | "content" | "cta" | "footer",
      "framerType": "Stack" | "Grid",
      "direction": "horizontal" | "vertical",
      "gridSpan": "12 Cols · 1200px Container",
      "columns": 1,
      "gap": ${grid.gutter},
      "padding": "20px 32px",
      "background": "transparent",
      "textColor": "#F9F4EE",
      "accentColor": "${cssTokens?.primaryHex || "#B37900"}",
      "elements": {
        "badge": "optional string",
        "heading": "string",
        "brandSubtitle": "optional string for navbar",
        "subheading": "optional string",
        "paragraphs": ["optional array of full hero or body paragraphs"],
        "navLinks": ["preserve ALL top-level nav links, do not truncate"],
        "logos": ["optional"],
        "buttons": [{ "label": "string", "variant": "primary" | "secondary" }],
        "cards": [{ "title": "string", "description": "string", "tag": "optional", "tagline": "optional quote", "imageUrl": "optional exact image URL from card object" }],
        "imageUrl": "optional inline image URL",
        "backgroundImage": "for hero with full-bleed background photo (absolute inset-0 + <img>), put the exact image URL here instead of imageUrl"
      },
      "interactivePlaceholders": []
    }
  ]
}

要求：
1. 依每個 /* === COMPONENT: ... === */ 的順序給區塊角色。文案、連結、圖片網址必須原樣來自該段源碼，不可改寫、不可補上源碼沒有的按鈕或句子。沒有全幅圖片的區塊不可標成 hero。
2. Navbar 必須保留全部頂層導覽連結（navLinks）與所有 CTA 按鈕；若首頁 <header> 含 bg-transparent，background 必須為 "transparent"、textColor 為 "#F9F4EE"。
3. Hero 若為全幅背景圖疊加文字（如 absolute inset-0 + <img>），圖片 URL 必須放在 elements.backgroundImage（不可放在 imageUrl），且保留多段引言於 elements.paragraphs。
4. Services / Features / ScenarioGallery 等卡片若源碼含 image URL 與 tagline/problem，必須完整提取到 cards[].imageUrl 與 cards[].tagline，columns 設為對應欄數（如 3）。
5. 嚴格使用上方提供的 Design Tokens 主色（accentColor: "${cssTokens?.primaryHex || "#B37900"}"）與背景色（"${cssTokens?.backgroundHex || "#FFFFFF"}"），絕不可套用無關的藍綠色，也不可簡化或改寫原始文案。
6. FAQ / 手風琴問答區塊直接將所有問答提取到 elements.cards（title 為問題、description 為回答），不需要放入 interactivePlaceholders；僅在真正包含 <form>、圖表或複雜第三方嵌入元件時才於 interactivePlaceholders 以簡短繁體中文備註。

源碼如下：
${rawCode.slice(0, LLM_SOURCE_CHAR_LIMIT)}`;
}

function buildSectionRolePrompt(fallback: FramerIrPayload): string {
  const lines = fallback.sections.map((section, index) => {
    const cards = section.elements.cards?.length || 0;
    const images = (section.elements.backgroundImage ? 1 : 0) + (section.elements.imageUrl ? 1 : 0);
    const heading = String(section.elements.heading || "").replace(/\s+/g, " ").slice(0, 60);
    return `${index + 1}. ${section.name} kind=${section.sectionKind} cards=${cards} images=${images} heading=${heading}`;
  });
  return `只判斷每個區塊的版面角色。只回傳 JSON {"sections":[{"sectionKind":"navbar|hero|logos|features|content|cta|footer"}]}，長度必須是 ${fallback.sections.length}。不要改寫文案、連結或圖片。
${lines.join("\n")}`.slice(0, 2000);
}

async function tryGeminiRoles(prompt: string): Promise<Partial<FramerIrPayload> | null> {
  const apiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!apiKey) return null;
  const model = (Deno.env.get("GEMINI_MODEL") || "gemini-4-hydrogen").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            sections: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  sectionKind: {
                    type: "STRING",
                    enum: ["navbar", "hero", "logos", "features", "content", "cta", "footer"],
                  },
                },
                required: ["sectionKind"],
              },
            },
          },
          required: ["sections"],
        },
      },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts;
  const texts = Array.isArray(parts)
    ? parts.map((part: { text?: string }) => String(part?.text || "").trim()).filter(Boolean)
    : [];
  const text = texts.find((item) => item.startsWith("{")) || texts[texts.length - 1] || "";
  if (!text) return null;
  return JSON.parse(text) as Partial<FramerIrPayload>;
}

async function tryGeminiIr(prompt: string): Promise<Partial<FramerIrPayload> | null> {
  const apiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!apiKey) return null;
  const model = (Deno.env.get("GEMINI_MODEL") || "gemini-4-hydrogen").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "low" },
      },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts;
  const texts = Array.isArray(parts)
    ? parts.map((part: { text?: string }) => String(part?.text || "").trim()).filter(Boolean)
    : [];
  const text = texts.find((item) => item.startsWith("{") || item.startsWith("[")) || texts[texts.length - 1] || "";
  if (!text) return null;
  return JSON.parse(text) as Partial<FramerIrPayload>;
}

async function tryGrokIr(prompt: string): Promise<Partial<FramerIrPayload> | null> {
  const apiKey = (Deno.env.get("XAI_API_KEY") || "").trim();
  if (!apiKey) return null;
  const model = (Deno.env.get("XAI_MODEL") || "grok-4.7").trim();

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model,
      temperature: 0.15,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return strictly valid JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const text = String(json?.choices?.[0]?.message?.content || "").trim();
  if (!text) return null;
  return JSON.parse(text) as Partial<FramerIrPayload>;
}

function normalizeIrPayload(
  candidate: Partial<FramerIrPayload> | null,
  fallback: FramerIrPayload,
  grid: GridConfig,
  assetUrlMap: Record<string, string>,
  cssTokens?: CssTokensInput,
  isAssembledMultiComponent = false,
): FramerIrPayload {
  if (!candidate || !Array.isArray(candidate.sections) || candidate.sections.length === 0) {
    return fallback;
  }

  // Assembled pages keep source copy, links, and image URLs. The model may only
  // retarget a section's layout role when that role is possible from the extracted structure.
  if (isAssembledMultiComponent && fallback.sections.length >= 3) {
    const llmSections = candidate.sections as Array<Partial<IrSection>>;
    const validKinds = new Set(["navbar", "hero", "logos", "features", "content", "cta", "footer"]);
    const mergedSections: IrSection[] = fallback.sections.map((fbSec, idx) => {
      const matchedLlm = llmSections[idx];
      const chunkHasForm = fbSec.interactivePlaceholders.some((p) => p.includes("表單互動"));
      const placeholders = filterInteractivePlaceholders(
        [
          ...fbSec.interactivePlaceholders,
          ...(Array.isArray(matchedLlm?.interactivePlaceholders)
            ? matchedLlm.interactivePlaceholders.map(String)
            : []),
        ],
        fbSec.name,
        chunkHasForm,
      );

      const locked =
        fbSec.sectionKind === "navbar" ||
        fbSec.sectionKind === "footer" ||
        isFaqHint(fbSec.name);
      const requested = validKinds.has(String(matchedLlm?.sectionKind))
        ? (matchedLlm?.sectionKind as IrSection["sectionKind"])
        : fbSec.sectionKind;
      const imageCount =
        (fbSec.elements.backgroundImage ? 1 : 0) +
        (fbSec.elements.imageUrl ? 1 : 0) +
        (fbSec.elements.cards || []).filter((card) => card.imageUrl).length;
      const cardCount = fbSec.elements.cards?.length || 0;
      const requestedOk =
        !locked &&
        requested !== "navbar" &&
        requested !== "footer" &&
        (requested !== "hero" || imageCount > 0) &&
        (requested !== "features" || cardCount >= 2 || imageCount >= 2);
      const sectionKind = requestedOk ? requested : fbSec.sectionKind;
      const elements = { ...fbSec.elements };
      if (sectionKind === "hero" && elements.imageUrl && !elements.backgroundImage && cardCount < 2) {
        elements.backgroundImage = elements.imageUrl;
        delete elements.imageUrl;
      }
      if (sectionKind !== "hero" && elements.backgroundImage && !elements.overlay) {
        elements.imageUrl = elements.imageUrl || elements.backgroundImage;
        delete elements.backgroundImage;
      }
      const columns =
        requestedOk && Number(matchedLlm?.columns) > 0 ? Number(matchedLlm?.columns) : fbSec.columns;
      const framerType: IrSection["framerType"] =
        requestedOk && (matchedLlm?.framerType === "Grid" || matchedLlm?.framerType === "Stack")
          ? matchedLlm.framerType
          : sectionKind === "features" && columns > 1
            ? "Grid"
            : fbSec.framerType;

      return {
        ...fbSec,
        sectionKind,
        columns,
        framerType,
        elements,
        interactivePlaceholders: placeholders,
      };
    });

    return {
      ...fallback,
      sections: mergedSections,
    };
  }

  const themePrimary = cssTokens?.primaryHex || cssTokens?.accentHex;
  const fallbackNavbar = fallback.sections.find((s) => s.sectionKind === "navbar");
  const fallbackHero = fallback.sections.find((s) => s.sectionKind === "hero");
  const fallbackCardSections = fallback.sections.filter(
    (s) => Array.isArray(s.elements?.cards) && s.elements.cards.length > 0,
  );

  const hasFormInFallback = fallback.sections.some((fs) =>
    fs.interactivePlaceholders.some((p) => p.includes("表單互動")),
  );
  const validKinds = new Set(["navbar", "hero", "logos", "features", "content", "cta", "footer"]);
  const sections: IrSection[] = candidate.sections.map((rawSec, idx) => {
    const sec = rawSec as Partial<IrSection>;
    const kind = validKinds.has(String(sec.sectionKind))
      ? (sec.sectionKind as IrSection["sectionKind"])
      : "content";
    const framerType: "Stack" | "Grid" = sec.framerType === "Grid" ? "Grid" : "Stack";
    const direction: "horizontal" | "vertical" =
      sec.direction === "horizontal" ? "horizontal" : "vertical";
    const columns = Number(sec.columns) > 0 ? Number(sec.columns) : framerType === "Grid" ? 3 : 1;
    const gap = Number(sec.gap) >= 0 ? Number(sec.gap) : grid.gutter;
    const bg = String(sec.background || fallback.designTokens.colors.background || "#080F1E");
    const rawAccent = String(sec.accentColor || "");
    const accent =
      themePrimary && (!rawAccent || rawAccent.toUpperCase() === "#0BB59B")
        ? themePrimary
        : rawAccent || themePrimary || "#0BB59B";

    const elements: IrElements = sec.elements && typeof sec.elements === "object"
      ? { ...sec.elements }
      : {};
    if (elements.imageUrl) {
      elements.imageUrl = mapImageUrl(elements.imageUrl, assetUrlMap);
    }
    if (elements.backgroundImage) {
      elements.backgroundImage = mapImageUrl(elements.backgroundImage, assetUrlMap);
    }
    if (Array.isArray(elements.cards)) {
      elements.cards = elements.cards.map((card) => ({
        ...card,
        imageUrl: mapImageUrl(card.imageUrl, assetUrlMap),
      }));
    }

    // Backfill Navbar top-level links & dual CTAs if LLM truncated them
    if (kind === "navbar" && fallbackNavbar) {
      const llmCount = Array.isArray(elements.navLinks) ? elements.navLinks.length : 0;
      const fbCount = fallbackNavbar.elements.navLinks?.length || 0;
      if (fbCount > llmCount) {
        elements.navLinks = fallbackNavbar.elements.navLinks;
      }
      if (!elements.brandSubtitle && fallbackNavbar.elements.brandSubtitle) {
        elements.brandSubtitle = fallbackNavbar.elements.brandSubtitle;
      }
      if (
        (!elements.buttons || elements.buttons.length < (fallbackNavbar.elements.buttons?.length || 0)) &&
        fallbackNavbar.elements.buttons
      ) {
        elements.buttons = fallbackNavbar.elements.buttons;
      }
      const fbNav = fallbackNavbar.elements.navLinks || [];
      if (Array.isArray(elements.navLinks)) {
        elements.navLinks = elements.navLinks.map((link) => {
          const label = typeof link === "string" ? link : String(link?.label || "");
          const ownHref = typeof link === "string" ? undefined : link?.href;
          const matched = fbNav.find((item) => (typeof item === "string" ? item : item.label) === label);
          const href = ownHref || (matched && typeof matched !== "string" ? matched.href : undefined);
          return href && href !== "#" ? { label, href } : label;
        });
      }
      if (Array.isArray(elements.buttons) && fallbackNavbar.elements.buttons) {
        elements.buttons = elements.buttons.map((button) => {
          const matched = fallbackNavbar.elements.buttons?.find((item) => item.label === button.label);
          return matched?.href && !button.href ? { ...button, href: matched.href } : button;
        });
      }
    }

    // Ensure full-bleed Hero backgroundImage & paragraphs are preserved
    if (kind === "hero" && fallbackHero) {
      elements.backgroundImage = preferCompleteImageUrl(
        elements.backgroundImage,
        fallbackHero.elements.backgroundImage,
        assetUrlMap,
      );
      elements.imageUrl = preferCompleteImageUrl(
        elements.imageUrl,
        fallbackHero.elements.imageUrl,
        assetUrlMap,
      );
      if (!elements.backgroundImage && elements.imageUrl && fallbackHero.elements.overlay) {
        elements.backgroundImage = elements.imageUrl;
        delete elements.imageUrl;
      } else if (
        elements.backgroundImage &&
        elements.imageUrl &&
        elements.imageUrl === elements.backgroundImage
      ) {
        delete elements.imageUrl;
      }
      if (elements.backgroundImage && !elements.overlay) {
        elements.overlay =
          fallbackHero.elements.overlay ||
          "linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.40) 50%, rgba(0,0,0,0.62) 100%)";
      }
      if ((!elements.paragraphs || elements.paragraphs.length === 0) && fallbackHero.elements.paragraphs) {
        elements.paragraphs = fallbackHero.elements.paragraphs;
      }
    }

    const fallbackSame =
      fallback.sections.find((item) => item.name === String(sec.name || "")) ||
      fallback.sections[idx];
    if (fallbackSame) {
      const fbCards = fallbackSame.elements.cards || [];
      const llmCards = Array.isArray(elements.cards) ? elements.cards : [];
      if (fbCards.length > llmCards.length) {
        elements.cards = fbCards;
      }
      const fbParas = fallbackSame.elements.paragraphs || [];
      const llmParas = Array.isArray(elements.paragraphs) ? elements.paragraphs : [];
      if (fbParas.length > llmParas.length) {
        elements.paragraphs = fbParas;
      }
      if (!elements.footerColumns && fallbackSame.elements.footerColumns) {
        elements.footerColumns = fallbackSame.elements.footerColumns;
      }
      elements.imageUrl = preferCompleteImageUrl(
        elements.imageUrl,
        fallbackSame.elements.imageUrl,
        assetUrlMap,
      );
      elements.backgroundImage = preferCompleteImageUrl(
        elements.backgroundImage,
        fallbackSame.elements.backgroundImage,
        assetUrlMap,
      );
      if (elements.backgroundImage && elements.imageUrl === elements.backgroundImage) {
        delete elements.imageUrl;
      }
      if (!elements.footerLead && fallbackSame.elements.footerLead) {
        elements.footerLead = fallbackSame.elements.footerLead;
      }
      if (
        (!elements.navLinks || elements.navLinks.length === 0) &&
        fallbackSame.elements.navLinks &&
        fallbackSame.elements.navLinks.length > 0
      ) {
        elements.navLinks = fallbackSame.elements.navLinks;
      }
      const sameColor = (a: string, b: string | undefined) =>
        Boolean(b) && a.trim().toUpperCase() === String(b).trim().toUpperCase();
      const brandFill = sameColor(bg, themePrimary) || sameColor(bg, cssTokens?.accentHex);
      const fallbackBg = fallbackSame.background;
      const fallbackIsPageColor =
        Boolean(fallbackBg) &&
        fallbackBg !== "transparent" &&
        !sameColor(fallbackBg, themePrimary) &&
        !sameColor(fallbackBg, cssTokens?.accentHex);
      if ((kind !== "cta" || (fallbackSame.elements.cards?.length || 0) >= 3) && kind !== "hero" && brandFill && fallbackIsPageColor) {
        sec.background = fallbackBg;
        if (fallbackSame.textColor) sec.textColor = fallbackSame.textColor;
      }
    }

    // Backfill card imageUrl / tagline from AST-parsed cards when LLM omits them
    if (Array.isArray(elements.cards) && elements.cards.length > 0 && fallbackCardSections.length > 0) {
      const allFbCards = fallbackCardSections.flatMap((fs) => fs.elements.cards || []);
      elements.cards = elements.cards.map((card, cIdx) => {
        const matched =
          allFbCards.find((fc) => fc.title === card.title) ||
          (fallbackCardSections[0]?.elements.cards?.[cIdx]?.title === card.title
            ? fallbackCardSections[0]?.elements.cards?.[cIdx]
            : undefined);
        if (!matched) return card;
        return {
          ...card,
          imageUrl: preferCompleteImageUrl(card.imageUrl, matched.imageUrl, assetUrlMap),
          tagline: card.tagline || matched.tagline,
          href: card.href || matched.href,
        };
      });
    }

    return {
      id: String(sec.id || `sec-${idx + 1}`),
      step: idx + 1,
      name: String(sec.name || `Section ${idx + 1}`),
      sectionKind: kind,
      framerType,
      direction,
      gridSpan: String(
        sec.gridSpan || `${grid.columns} Cols · ${grid.container_max_width}px Container`,
      ),
      columns,
      gap,
      padding: String(sec.padding || (kind === "navbar" ? "20px 32px" : "64px 32px")),
      background: String(sec.background || bg),
      textColor: String(sec.textColor || fallback.designTokens.colors.textPrimary || "#FFFFFF"),
      accentColor: accent,
      elements,
      interactivePlaceholders: filterInteractivePlaceholders(
        Array.isArray(sec.interactivePlaceholders) ? sec.interactivePlaceholders.map(String) : [],
        String(sec.name || ""),
        hasFormInFallback,
      ),
      framerNodeSpec: sec.framerNodeSpec && typeof sec.framerNodeSpec === "object"
        ? sec.framerNodeSpec
        : {
            component: framerType === "Grid" ? "Framer.Grid" : "Framer.Stack",
            width: `${grid.desktop_width}px`,
            maxWidth: grid.container_max_width,
            layout: framerType === "Grid" ? "grid" : `${direction}-stack`,
            distribution: direction === "horizontal" ? "space-between" : "start",
            alignment: "center",
            gap,
            borderRadius: kind === "cta" || kind === "features" ? 12 : 0,
            fills: [bg, accent],
          },
      syncStatus: "pending",
    };
  });

  // Append any trailing AST-parsed sections (like Testimonials / FAQ / Footer) if LLM stopped early
  const hasFooter = sections.some((s) => s.sectionKind === "footer");
  const fbFooter = fallback.sections.find((s) => s.sectionKind === "footer");
  if (!hasFooter && fbFooter) {
    sections.push({ ...fbFooter, id: `sec-${sections.length + 1}`, step: sections.length + 1 });
  }

  return {
    version: "1.2",
    sourceSummary: {
      framework: candidate.sourceSummary?.framework || fallback.sourceSummary.framework,
      styling: candidate.sourceSummary?.styling || "Tailwind CSS",
      sectionCount: sections.length,
    },
    gridConfig: grid,
    designTokens: candidate.designTokens?.colors
      ? {
          colors: { ...fallback.designTokens.colors, ...candidate.designTokens.colors },
          typography: {
            ...fallback.designTokens.typography,
            ...(candidate.designTokens.typography || {}),
            fontFamily:
              firstFontFamily(cssTokens?.fontHeading) ||
              fallback.designTokens.typography.fontFamily,
            bodyFont:
              firstFontFamily(cssTokens?.fontBody) ||
              fallback.designTokens.typography.bodyFont,
          },
          radius: {
            ...fallback.designTokens.radius,
            ...(candidate.designTokens.radius || {}),
          },
        }
      : fallback.designTokens,
    sections,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json()) as {
      framer_project_url?: string;
      source_type?: "github" | "upload" | "paste";
      github_repo_meta?: Record<string, unknown> | null;
      storage_bundle_path?: string | null;
      grid_config?: Partial<GridConfig>;
      raw_readdy_code?: string;
      tailwind_config?: string | null;
      asset_url_map?: Record<string, string>;
      page_meta?: FramerIrPageMeta;
      css_tokens?: CssTokensInput;
      project_name?: string;
      source_origin?: string;
      action?: string;
      job_id?: string;
      framer_preview_origin?: string;
      user_id?: string | null;
    };

    if (body.action === "capture_framer_preview") {
      const token = Deno.env.get("BROWSERLESS_TOKEN")?.trim();
      if (!token) return jsonResponse({ error: "來源畫面擷取尚未設定 BROWSERLESS_TOKEN。" }, 503);
      const supabase = supabaseAdmin();
      const { data: job } = await supabase.from("framer_sync_jobs")
        .select("page_path, grid_config, status, ir_payload->renderedPage")
        .eq("id", body.job_id || "").maybeSingle();
      if (!job?.renderedPage || job.status !== "completed") {
        return jsonResponse({ error: "請先以來源畫面完成此頁的 Framer 同步。" }, 409);
      }
      let previewUrl: URL;
      try {
        previewUrl = resolveRenderUrl(String(body.framer_preview_origin || "").trim(), job.page_path || "/");
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : "Framer 網址無效" }, 400);
      }
      const sourcePath = (job.renderedPage as { scenePath?: string }).scenePath || "";
      if (!/^assets\/rendered\/[0-9a-f-]+\/scenes\.json$/i.test(sourcePath)) {
        return jsonResponse({ error: "請重新擷取此頁的來源畫面。" }, 409);
      }
      const { data: snapshot, error: snapshotError } = await supabase.storage.from("readdy-framer-assets").download(sourcePath);
      const { geometry: source } = snapshot && !snapshotError ? JSON.parse(await snapshot.text()) as Partial<RenderedPage> : {};
      if (!source || CAPTURE_DEVICES.some((device) => source[device]?.version !== LAYOUT_MEASUREMENT_VERSION)) {
        return jsonResponse({ error: "此頁需用目前的版面量測重新分析並同步。" }, 409);
      }
      const { url, images, geometry } = await captureRenderedPage(previewUrl, source.desktop.width, token, fetch, true);
      return jsonResponse({ url, images, layoutReview: comparePageLayouts(source, geometry) });
    }

    const rawCode = String(body.raw_readdy_code || "").trim();
    const sourceOrigin = String(body.source_origin || "").trim();
    if (!rawCode && !sourceOrigin) {
      return jsonResponse({ error: "請先輸入、上傳或從 GitHub 拉取 Readdy 原始碼。" }, 400);
    }

    const framerProjectUrl = String(body.framer_project_url || "").trim();
    if (!framerProjectUrl) {
      return jsonResponse({ error: "請輸入目標 Framer Project URL。" }, 400);
    }

    const gridConfig: GridConfig = {
      desktop_width: Math.max(1024, Math.min(1920, Math.round(Number(body.grid_config?.desktop_width) || 1440))),
      container_max_width: Number(body.grid_config?.container_max_width) || 1200,
      columns: Number(body.grid_config?.columns) || 12,
      gutter: Number(body.grid_config?.gutter) || 24,
    };

    const assetUrlMap = body.asset_url_map && typeof body.asset_url_map === "object"
      ? body.asset_url_map
      : {};
    const tailwindConfig = body.tailwind_config ? String(body.tailwind_config) : null;
    const pageMeta = body.page_meta;
    const cssTokens = body.css_tokens;
    const logs: Array<{ ts: string; level: string; stage: string; message: string }> = [];
    const pushLog = (level: string, stage: string, message: string) => {
      logs.push({ ts: new Date().toISOString(), level, stage, message });
    };

    let parserEngine: "gemini" | "grok" | "ast-fallback" | "rendered-dom" = "ast-fallback";
    let irPayload: FramerIrPayload;
    if (sourceOrigin) {
      const token = Deno.env.get("BROWSERLESS_TOKEN")?.trim();
      if (!token) return jsonResponse({ error: "來源畫面擷取尚未設定 BROWSERLESS_TOKEN。" }, 503);
      let url: URL;
      try {
        url = resolveRenderUrl(sourceOrigin, pageMeta?.path || "/");
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : "來源網址無效" }, 400);
      }
      pushLog("info", "ast", `擷取來源網站 ${url.href} 的桌面、平板和手機畫面`);
      const { scenes, geometry, ...renderedPage } = await captureRenderedPage(url, gridConfig.desktop_width, token);
      const storage = supabaseAdmin().storage.from("readdy-framer-assets");
      const prefix = `assets/rendered/${crypto.randomUUID()}`;
      const scenePath = `${prefix}/scenes.json`;
      const visualPaths: string[] = [];
      const imageUploads = Object.entries(renderedPage.images).map(async ([device, image]) => {
        const path = `${prefix}/${device}.jpg`;
        const bytes = Uint8Array.from(atob(image), (char) => char.charCodeAt(0));
        const { error } = await storage.upload(path, bytes, { contentType: "image/jpeg" });
        if (error) throw new Error("無法儲存來源畫面");
        renderedPage.images[device as keyof RenderedPage["images"]] = storage.getPublicUrl(path).data.publicUrl;
      });
      const scenesUpload = async () => {
        await publishCapturedImages(scenes, async (name, bytes) => {
          const path = `${prefix}/${name}`;
          const { error } = await storage.upload(path, bytes, { contentType: "image/png" });
          if (error) throw new Error("無法儲存來源圖像");
          visualPaths.push(path);
          return storage.getPublicUrl(path).data.publicUrl;
        });
        const { error } = await storage.upload(scenePath, JSON.stringify({ ...scenes, geometry }), { contentType: "application/json" });
        if (error) throw new Error("無法儲存來源圖層");
      };
      const uploads = await Promise.allSettled([...imageUploads, scenesUpload()]);
      if (uploads.some((result) => result.status === "rejected")) {
        await storage.remove([scenePath, ...visualPaths, ...Object.keys(renderedPage.images).map((device) => `${prefix}/${device}.jpg`)]);
        throw new Error("無法儲存來源畫面");
      }
      const base = deterministicParseCode("", gridConfig, {}, cssTokens, pageMeta);
      type Block = { id: string; name: string; htmlTag: string; style?: { background?: string; color?: string } };
      const grouped = new Map<string, Block>();
      for (const [device, blocks] of Object.entries(scenes)) {
        for (const block of blocks as Block[]) {
          if (device === "desktop" || !grouped.has(block.id)) grouped.set(block.id, block);
        }
      }
      const sections = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
        .map(([id, block], index): IrSection => {
          const heading = findRenderedHeading(block);
          const landmarkName = ({ nav: "導覽", header: "頁首", footer: "頁尾" } as Record<string, string>)[block.htmlTag];
          const ariaName = block.name && block.name !== block.htmlTag ? block.name : undefined;
          const name = landmarkName || heading || ariaName || ({ main: "主要內容" } as Record<string, string>)[block.htmlTag] || `區塊 ${index + 1}`;
          const background = block.style?.background || "transparent";
          const textColor = block.style?.color || base.designTokens.colors.text || "#181818";
          return {
            id, step: index + 1, name,
            sectionKind: block.htmlTag === "nav" || block.htmlTag === "header" ? "navbar" : block.htmlTag === "footer" ? "footer" : "content",
            framerType: "Frame", direction: "vertical", gridSpan: `${gridConfig.desktop_width}px`,
            columns: 1, gap: 0, padding: "0px", background, textColor,
            accentColor: base.designTokens.colors.primary,
            elements: heading ? { heading } : {}, interactivePlaceholders: [],
            framerNodeSpec: {
              component: "Framer.Frame", width: "100%", maxWidth: gridConfig.desktop_width,
              layout: "captured", distribution: "start", alignment: "start", gap: 0,
              borderRadius: 0, fills: [background],
            },
            syncStatus: "pending",
          };
        });
      irPayload = {
        ...base, sections, renderedPage: { ...renderedPage, scenePath },
        sourceSummary: { framework: "Rendered DOM", styling: "Computed CSS", sectionCount: sections.length },
      };
      parserEngine = "rendered-dom";
      for (const limitation of renderedPage.limitations) pushLog("warn", "ast", limitation);
    } else {
      pushLog("warn", "ast", "未設定來源網站網址，本次使用原碼近似解析，需人工覆核。");
      pushLog(
        "info",
        "ast",
        `開始 AST 結構清洗${pageMeta ? ` [${pageMeta.path} · ${pageMeta.title}]` : ""}（源碼長度 ${rawCode.length} 字元）`,
      );
      const parseWarnings: string[] = [];
      const fallbackIr = deterministicParseCode(
        rawCode,
        gridConfig,
        assetUrlMap,
        cssTokens,
        pageMeta,
        parseWarnings,
      );
      for (const message of parseWarnings) pushLog("warn", "ast", message);
      if (rawCode.length > LLM_SOURCE_CHAR_LIMIT) {
        const message = `源碼 ${rawCode.length} 字超過 ${LLM_SOURCE_CHAR_LIMIT}，送交模型的部分已截斷`;
        pushLog("warn", "llm", message);
        console.warn(`[readdy-parse-ir] ${message}`);
      }

      let llmCandidate: Partial<FramerIrPayload> | null = null;
      const isAssembledMultiComponent =
        fallbackIr.sections.length >= 3 && /\/\*\s*===\s*COMPONENT:/.test(rawCode);

      if (isAssembledMultiComponent) {
        const rolePrompt = buildSectionRolePrompt(fallbackIr);
        pushLog("info", "llm", "組裝頁只詢問區塊角色，略過整頁改寫");
        try {
          llmCandidate = await tryGeminiRoles(rolePrompt);
          if (llmCandidate) parserEngine = "gemini";
        } catch {
          llmCandidate = null;
        }
        if (!llmCandidate) {
          try {
            llmCandidate = await tryGrokIr(rolePrompt);
            if (llmCandidate) parserEngine = "grok";
          } catch {
            llmCandidate = null;
          }
        }
      } else {
        const prompt = buildLlmPrompt(rawCode, gridConfig, tailwindConfig, assetUrlMap, cssTokens, pageMeta);
        try {
          llmCandidate = await tryGeminiIr(prompt);
          if (llmCandidate) parserEngine = "gemini";
        } catch {
          llmCandidate = null;
        }
        if (!llmCandidate) {
          try {
            llmCandidate = await tryGrokIr(prompt);
            if (llmCandidate) parserEngine = "grok";
          } catch {
            llmCandidate = null;
          }
        }
      }
      irPayload = normalizeIrPayload(
        llmCandidate,
        fallbackIr,
        gridConfig,
        assetUrlMap,
        cssTokens,
        isAssembledMultiComponent,
      );
    }
    if (pageMeta) {
      irPayload.pageMeta = pageMeta;
    }
    pushLog(
      "success",
      "ast",
      `已完成區塊拆解（引擎: ${parserEngine}），共識別 ${irPayload.sections.length} 個標準區塊`,
    );
    pushLog(
      "success",
      "grid",
      `已鎖定 ${gridConfig.desktop_width}px 桌面畫布 / ${gridConfig.container_max_width}px 容器 / ${gridConfig.columns} 列柵格 (Gap ${gridConfig.gutter}px)`,
    );
    pushLog(
      "success",
      "tokens",
      `已提取 Design Tokens（主色 ${irPayload.designTokens.colors.primary}、背景 ${irPayload.designTokens.colors.background}）`,
    );

    const requestedUser = typeof body.user_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id)
      ? body.user_id
      : null;
    const userId = auth.userId ?? requestedUser;
    const supabase = supabaseAdmin();
    const sourceType =
      body.source_type === "github" || body.source_type === "upload" ? body.source_type : "paste";

    const baseInsert = {
      user_id: userId,
      source_type: sourceType,
      github_repo_meta: body.github_repo_meta ?? null,
      storage_bundle_path: body.storage_bundle_path ?? null,
      framer_project_url: framerProjectUrl,
      grid_config: gridConfig,
      raw_readdy_code: rawCode,
      ir_payload: irPayload,
      current_step: 0,
      status: "parsed",
      step_logs: logs,
    };

    let { data: jobRow, error: insertError } = await supabase
      .from("framer_sync_jobs")
      .insert({
        ...baseInsert,
        page_path: pageMeta?.path ?? null,
        page_title: pageMeta?.title ?? null,
        project_name: body.project_name ?? null,
      })
      .select("id, created_at")
      .single();

    // Resilient fallback if remote DB hasn't applied the new optional columns yet
    if (
      insertError &&
      (insertError.code === "PGRST204" ||
        /column .* does not exist|could not find the .* column|schema cache|PGRST204/i.test(
          insertError.message || "",
        ))
    ) {
      const retry = await supabase
        .from("framer_sync_jobs")
        .insert(baseInsert)
        .select("id, created_at")
        .single();
      jobRow = retry.data;
      insertError = retry.error;
    }

    if (insertError || !jobRow) {
      throw new Error(`寫入 framer_sync_jobs 失敗: ${insertError?.message || "unknown"}`);
    }

    return jsonResponse({
      job_id: jobRow.id,
      created_at: jobRow.created_at,
      parser_engine: parserEngine,
      ir_payload: irPayload,
      logs,
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
