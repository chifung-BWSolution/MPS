import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  extractBearerToken,
  getOptionalUserId,
  jsonResponse,
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

type IrCard = {
  title: string;
  description: string;
  tag?: string;
  icon?: string;
  imageUrl?: string;
  tagline?: string;
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
  navLinks?: string[];
  logos?: string[];
  cards?: IrCard[];
  stats?: IrStat[];
  imageUrl?: string;
  backgroundImage?: string;
  overlay?: string;
  footerColumns?: Array<{ title: string; links: string[] }>;
};

type IrSection = {
  id: string;
  step: number;
  name: string;
  sectionKind: "navbar" | "hero" | "logos" | "features" | "content" | "cta" | "footer";
  framerType: "Stack" | "Grid";
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

function firstFontFamily(value: string | undefined): string | undefined {
  const first = String(value || "").split(",")[0]?.replace(/['"]/g, "").trim() || "";
  if (!first || /^(sans-serif|serif|monospace|system-ui)$/i.test(first)) return undefined;
  return first;
}

function stripCodeComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  const semanticTokenRe = new RegExp(`\\b${prefix}-(background|foreground|primary|accent|secondary)-(\\d{2,3})\\b`);
  const tokenMatch = text.match(semanticTokenRe);
  if (tokenMatch) {
    const tokenKey = `${tokenMatch[1]}-${tokenMatch[2]}`;
    if (cssColors[tokenKey]) return cssColors[tokenKey];
  }

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

function mapImageUrl(rawUrl: string | undefined, assetUrlMap: Record<string, string>): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = rawUrl.trim();
  if (assetUrlMap[trimmed]) return assetUrlMap[trimmed];
  const fileName = trimmed.split("/").pop() || "";
  if (fileName && assetUrlMap[fileName]) return assetUrlMap[fileName];
  return trimmed;
}

function detectSectionKind(
  hint: string,
  tag: string,
  idx: number,
  total: number,
): IrSection["sectionKind"] {
  const lower = `${hint} ${tag}`.toLowerCase();
  if (tag === "header" || tag === "nav" || /nav|header|topbar/.test(lower)) return "navbar";
  if (tag === "footer" || /footer/.test(lower)) return "footer";
  if (/hero|banner|intro/.test(lower) || (idx === 1 && !/logo|feature/.test(lower))) return "hero";
  if (/logo|brand|trust|partner/.test(lower)) return "logos";
  if (/feature|grid|card|service|capabilit|benefit/.test(lower)) return "features";
  if (/cta|ready|start|contact|trial/.test(lower) || (idx === total - 2 && total > 3)) return "cta";
  return "content";
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

function detectInteractivePlaceholders(chunk: string): string[] {
  const placeholders: string[] = [];
  if (/\buseState\b|\bonSubmit\b|<form\b/i.test(chunk)) {
    placeholders.push("Form / Stateful Interaction → Framer Component Variant");
  }
  if (/recharts|ResponsiveContainer|<svg\b[^>]*chart/i.test(chunk)) {
    placeholders.push("Chart Visualization → Framer Embed / Code Override");
  }
  if (/AnimatePresence|motion\./i.test(chunk)) {
    placeholders.push("Motion Transition → Framer Appear / Scroll Effect");
  }
  return placeholders;
}

function extractBalancedBlock(text: string, openIdx: number): string {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
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
    if (!inDouble && ch === "'") inSingle = !inSingle;
    else if (!inSingle && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(openIdx, i + 1);
      }
    }
  }
  return text.slice(openIdx, Math.min(text.length, openIdx + 1600));
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
): IrCard[] {
  const cards: IrCard[] = [];
  const seen = new Set<string>();
  const keyRe = /\b(?:title|name|heading|question)\s*:\s*['"]([^'"]{2,100})['"]/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(code)) !== null && cards.length < 12) {
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
    const description = readObjStringField(block, [
      "description",
      "desc",
      "text",
      "summary",
      "answer",
      "detail",
      "quote",
    ]);
    if (!title || !description || seen.has(title)) continue;
    seen.add(title);
    const rawImg = readObjStringField(block, ["image", "imageUrl", "img", "src"]);
    const tagline = readObjStringField(block, ["problem", "tagline", "subtitle", "role"]);
    const tag = readObjStringField(block, ["number", "step", "tag", "category", "event"]);
    cards.push({
      title,
      description,
      ...(tag ? { tag } : {}),
      ...(tagline ? { tagline } : {}),
      ...(rawImg ? { imageUrl: mapImageUrl(rawImg, assetUrlMap) } : {}),
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
): FramerIrPayload {
  const cssColors = cssTokens?.colors || {};
  const defaultBg =
    cssTokens?.backgroundHex ||
    extractColorFromClasses(rawCode.slice(0, 900), "bg", "#080F1E", cssColors);
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

  const sections: IrSection[] = chunks.slice(0, 16).map((chunk, idx) => {
    const kind = detectSectionKind(chunk.hint, chunk.tag, idx, chunks.length);
    const name = defaultSectionTitle(kind, chunk.hint, idx);

    const gridColsMatch =
      chunk.code.match(/lg:grid-cols-(\d+)/) ||
      chunk.code.match(/md:grid-cols-(\d+)/) ||
      chunk.code.match(/sm:grid-cols-(\d+)/) ||
      chunk.code.match(/grid-cols-(\d+)/);
    const dataCards = extractCardsFromDataObjects(chunk.code, assetUrlMap);
    const dataStats = extractStatsFromDataObjects(chunk.code);
    const h1s = extractAllMatches(chunk.code, /<h1[^>]*>([\s\S]*?)<\/h1>/);
    const h2s = extractAllMatches(chunk.code, /<h2[^>]*>([\s\S]*?)<\/h2>/);
    const h3s = extractAllMatches(chunk.code, /<h3[^>]*>([\s\S]*?)<\/h3>/);
    const ps = extractAllMatches(chunk.code, /<p[^>]*>([\s\S]*?)<\/p>/);
    const btns = extractAllMatches(chunk.code, /<(?:button|a|Link)[^>]*>([\s\S]*?)<\/(?:button|a|Link)>/);
    const spans = extractAllMatches(chunk.code, /<span[^>]*>([\s\S]*?)<\/span>/);
    const propHeadingMatch = chunk.code.match(/\bheading=["']([^"']+)["']/);
    const propSubheadingMatch = chunk.code.match(/\bsubheading=["']([^"']+)["']/);
    const parsedCols = gridColsMatch
      ? Number(gridColsMatch[1])
      : kind === "features" || dataCards.length >= 3 || h3s.length >= 3
        ? 3
        : 1;
    const isGrid = kind === "features" || parsedCols > 1 || dataCards.length >= 2 || h3s.length >= 2;
    const isHorizontal = kind === "navbar" || kind === "logos";

    const imgMatch =
      chunk.code.match(/<img[^>]+src=["']([^"']+)["']/i) ||
      chunk.code.match(/heroImage=["']([^"']+)["']/i) ||
      chunk.code.match(/\bimage\s*:\s*["'](https?:\/\/[^"']+)["']/i);
    const imageUrl = mapImageUrl(imgMatch?.[1], assetUrlMap);

    const hasFullBleedBgImg =
      Boolean(imageUrl) &&
      dataCards.length === 0 &&
      (/inset-0/.test(chunk.code) || /bg-gradient-to-/.test(chunk.code) || /PageLayout Hero/i.test(chunk.hint));
    const isFullBleedHero = kind === "hero" && hasFullBleedBgImg;

    const fallbackBg =
      kind === "footer"
        ? cssColors["background-100"] || "#F3EEE4"
        : hasFullBleedBgImg
          ? "#17120E"
          : kind === "cta"
            ? cssColors["primary-500"] || "#B37900"
            : defaultBg;
    const bg = hasFullBleedBgImg
      ? "#17120E"
      : extractColorFromClasses(chunk.code, "bg", fallbackBg, cssColors);
    const isSectionDark =
      hasFullBleedBgImg || bg === "transparent" || /^#0|^#1|^#2|^#3/i.test(bg);
    const textColor =
      hasFullBleedBgImg || bg === "transparent"
        ? "#F9F4EE"
        : extractColorFromClasses(
            chunk.code,
            "text",
            isSectionDark ? "#FFFFFF" : defaultText,
            cssColors,
          );

    const elements: IrElements = {};
    if (kind === "navbar") {
      const navInnerMatch = chunk.code.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i);
      const navLinks = navInnerMatch
        ? extractAllMatches(navInnerMatch[1], /<a[^>]*>([\s\S]*?)<\/a>/).slice(0, 16)
        : btns.filter((b) => b.length <= 24).slice(0, 14);
      const ctaBtns = extractAllMatches(chunk.code, /<button[^>]*>([\s\S]*?)<\/button>/);
      const brandSubMatch = chunk.code.match(/<small[^>]*>([\s\S]*?)<\/small>/i);

      elements.heading = spans[0] || pageMeta?.title || "Brand";
      if (brandSubMatch?.[1]) elements.brandSubtitle = cleanText(brandSubMatch[1]);
      elements.navLinks = navLinks.length > 0 ? navLinks : ["Home", "Services", "About", "Contact"];
      elements.buttons =
        ctaBtns.length > 0
          ? ctaBtns.slice(0, 2).map((label, bIdx) => ({
              label,
              variant: bIdx === 0 ? "primary" : "secondary",
            }))
          : [{ label: btns[btns.length - 1] || "Get Started", variant: "primary" }];
    } else if (kind === "hero") {
      elements.badge = spans[0] && spans[0].length < 48 ? spans[0] : undefined;
      elements.heading = h1s[0] || h2s[0] || pageMeta?.title || chunk.hint || "Hero Section";
      const heroParagraphs = ps.slice(0, 3);
      if (heroParagraphs.length > 0) {
        elements.paragraphs = heroParagraphs;
        elements.subheading = heroParagraphs.join("\n");
      }
      const actionBtns = btns.slice(0, 2);
      elements.buttons =
        actionBtns.length > 0
          ? actionBtns.map((label, bIdx) => ({
              label,
              variant: bIdx === 0 ? "primary" : "secondary",
            }))
          : [{ label: "Learn More", variant: "primary" }];
      if (imageUrl) {
        if (hasFullBleedBgImg) {
          elements.backgroundImage = imageUrl;
          elements.overlay = "linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.40) 50%, rgba(0,0,0,0.62) 100%)";
        } else {
          elements.imageUrl = imageUrl;
        }
      }
    } else if (kind === "logos") {
      elements.subheading = ps[0] || spans[0] || "Trusted Partners";
      const logoItems = [...spans, ...btns].filter((s) => s.length >= 2 && s.length <= 24).slice(0, 6);
      elements.logos = logoItems.length >= 2 ? logoItems : ["Partner 1", "Partner 2", "Partner 3"];
    } else if (kind === "features" || dataCards.length >= 2) {
      elements.heading = h2s[0] || h1s[0] || propHeadingMatch?.[1] || chunk.hint || "Features";
      elements.subheading = ps[0] || propSubheadingMatch?.[1] || undefined;
      if (dataStats.length > 0) {
        elements.stats = dataStats;
      }
      if (dataCards.length > 0) {
        elements.cards = dataCards;
      } else {
        const cardCount = Math.max(parsedCols, h3s.length, 3);
        const cards: IrCard[] = [];
        for (let c = 0; c < Math.min(cardCount, 6); c++) {
          cards.push({
            title: h3s[c] || `Module ${c + 1}`,
            description:
              ps[c + (elements.subheading ? 1 : 0)] ||
              ps[c] ||
              "Structured 12-column block ready for Framer canvas.",
            tag: `Col ${Math.max(1, Math.floor(grid.columns / Math.max(1, parsedCols)))}`,
          });
        }
        elements.cards = cards;
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
      elements.heading = h2s[0] || h1s[0] || chunk.hint || "Get in Touch";
      elements.subheading = ps[0] || undefined;
      elements.buttons = [{ label: btns[0] || "Contact Us", variant: "primary" }];
    } else if (kind === "footer") {
      elements.heading = spans[0] || "Brand";
      elements.subheading = ps[0] || "© 2026 All rights reserved.";
      elements.navLinks = btns.slice(0, 8);
    } else {
      elements.heading = h2s[0] || h1s[0] || h3s[0] || propHeadingMatch?.[1] || name;
      elements.subheading = ps[0] || propSubheadingMatch?.[1] || undefined;
      if (ps.length > 1) elements.paragraphs = ps.slice(0, 3);
      if (dataStats.length > 0) elements.stats = dataStats;
      if (btns[0]) elements.buttons = btns.slice(0, 2).map((label, bi) => ({ label, variant: bi === 0 ? "primary" : "secondary" }));
      if (imageUrl) {
        if (hasFullBleedBgImg) {
          elements.backgroundImage = imageUrl;
          elements.overlay = "rgba(31, 0, 0, 0.80)";
        } else {
          elements.imageUrl = imageUrl;
        }
      }
      if (h3s.length >= 2 && ps.length >= 2) {
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
      interactivePlaceholders: detectInteractivePlaceholders(chunk.code),
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

  return {
    version: "1.2",
    pageMeta,
    sourceSummary: {
      framework: /className=/.test(rawCode) ? "React TSX" : "HTML",
      styling: "Tailwind CSS",
      sectionCount: sections.length,
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
    sections,
  };
}

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
1. 依頁面視覺順序（嚴格對應每個 /* === COMPONENT: ... === */ 標記，不可漏掉後方區塊）拆成 3 到 15 個明確區塊。
2. Navbar 必須保留全部頂層導覽連結（navLinks）與所有 CTA 按鈕；若首頁 <header> 含 bg-transparent，background 必須為 "transparent"、textColor 為 "#F9F4EE"。
3. Hero 若為全幅背景圖疊加文字（如 absolute inset-0 + <img>），圖片 URL 必須放在 elements.backgroundImage（不可放在 imageUrl），且保留多段引言於 elements.paragraphs。
4. Services / Features / ScenarioGallery 等卡片若源碼含 image URL 與 tagline/problem，必須完整提取到 cards[].imageUrl 與 cards[].tagline，columns 設為對應欄數（如 3）。
5. 嚴格使用上方提供的 Design Tokens 主色（accentColor: "${cssTokens?.primaryHex || "#B37900"}"）與背景色（"${cssTokens?.backgroundHex || "#FFFFFF"}"），絕不可套用無關的藍綠色，也不可簡化或改寫原始文案。
6. 所有複雜狀態機（表單、輪播、手風琴等）填入 interactivePlaceholders 陣列說明。

源碼如下：
${rawCode.slice(0, 42000)}`;
}

async function tryGeminiIr(prompt: string): Promise<Partial<FramerIrPayload> | null> {
  const apiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!apiKey) return null;
  const model = (Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const text = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  if (!text) return null;
  return JSON.parse(text) as Partial<FramerIrPayload>;
}

async function tryGrokIr(prompt: string): Promise<Partial<FramerIrPayload> | null> {
  const apiKey = (Deno.env.get("XAI_API_KEY") || "").trim();
  if (!apiKey) return null;
  const model = (Deno.env.get("XAI_MODEL") || "grok-3-mini").trim();

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
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

  // For multi-component assembled pages (/* === COMPONENT: ... === */), keep the AST-parsed spine
  // as the authoritative source so NO section, verbatim 350-char imageUrl, transparent Navbar,
  // 14 navLinks, or OKLCH token color is ever dropped or hallucinated by the LLM.
  if (isAssembledMultiComponent && fallback.sections.length >= 3) {
    const llmSections = candidate.sections as Array<Partial<IrSection>>;
    const mergedSections: IrSection[] = fallback.sections.map((fbSec, idx) => {
      const matchedLlm =
        llmSections[idx]?.sectionKind === fbSec.sectionKind
          ? llmSections[idx]
          : llmSections.find((ls, lIdx) => lIdx === idx || ls.sectionKind === fbSec.sectionKind);

      if (!matchedLlm) return fbSec;

      const enrichedName =
        typeof matchedLlm.name === "string" && matchedLlm.name.trim().length >= 2
          ? matchedLlm.name.trim()
          : fbSec.name;
      const placeholders = Array.from(
        new Set([
          ...fbSec.interactivePlaceholders,
          ...(Array.isArray(matchedLlm.interactivePlaceholders)
            ? matchedLlm.interactivePlaceholders.map(String)
            : []),
        ]),
      );

      return {
        ...fbSec,
        name: enrichedName,
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
    }

    // Ensure full-bleed Hero backgroundImage & paragraphs are preserved
    if (kind === "hero" && fallbackHero) {
      if (!elements.backgroundImage && fallbackHero.elements.backgroundImage) {
        elements.backgroundImage = fallbackHero.elements.backgroundImage;
        if (elements.imageUrl === fallbackHero.elements.backgroundImage) {
          delete elements.imageUrl;
        }
      } else if (!elements.backgroundImage && elements.imageUrl && fallbackHero.elements.overlay) {
        elements.backgroundImage = elements.imageUrl;
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
          imageUrl: card.imageUrl ? mapImageUrl(card.imageUrl, assetUrlMap) : matched.imageUrl,
          tagline: card.tagline || matched.tagline,
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
      background: bg,
      textColor: String(sec.textColor || fallback.designTokens.colors.textPrimary || "#FFFFFF"),
      accentColor: accent,
      elements,
      interactivePlaceholders: Array.isArray(sec.interactivePlaceholders)
        ? sec.interactivePlaceholders.map(String)
        : [],
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
  if (!extractBearerToken(req)) {
    return jsonResponse({ error: "未登入或缺少授權標頭" }, 401);
  }

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
    };

    const rawCode = String(body.raw_readdy_code || "").trim();
    if (!rawCode) {
      return jsonResponse({ error: "請先輸入、上傳或從 GitHub 拉取 Readdy 原始碼。" }, 400);
    }

    const framerProjectUrl = String(body.framer_project_url || "").trim();
    if (!framerProjectUrl) {
      return jsonResponse({ error: "請輸入目標 Framer Project URL。" }, 400);
    }

    const gridConfig: GridConfig = {
      desktop_width: Number(body.grid_config?.desktop_width) || 1440,
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

    pushLog(
      "info",
      "ast",
      `開始 AST 結構清洗${pageMeta ? ` [${pageMeta.path} · ${pageMeta.title}]` : ""}（源碼長度 ${rawCode.length} 字元）`,
    );
    const fallbackIr = deterministicParseCode(
      stripCodeComments(rawCode).length > 40 ? rawCode : rawCode,
      gridConfig,
      assetUrlMap,
      cssTokens,
      pageMeta,
    );

    let parserEngine: "gemini" | "grok" | "ast-fallback" = "ast-fallback";
    let llmCandidate: Partial<FramerIrPayload> | null = null;
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

    const isAssembledMultiComponent =
      fallbackIr.sections.length >= 3 && /\/\*\s*===\s*COMPONENT:/.test(rawCode);
    const irPayload = normalizeIrPayload(
      llmCandidate,
      fallbackIr,
      gridConfig,
      assetUrlMap,
      cssTokens,
      isAssembledMultiComponent,
    );
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

    const userId = await getOptionalUserId(req);
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
