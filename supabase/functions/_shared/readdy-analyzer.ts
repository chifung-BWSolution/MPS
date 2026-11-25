// Shared Readdy project analyzer & page bundle assembler for Deno Edge Functions

export type EdgeCssTokens = {
  colors: Record<string, string>;
  fontHeading?: string;
  fontBody?: string;
  backgroundHex?: string;
  surfaceHex?: string;
  primaryHex?: string;
  accentHex?: string;
  textHex?: string;
};

export type EdgeDiscoveredPage = {
  id: string;
  path: string;
  title: string;
  description?: string;
  locale: string;
  pageKind:
    | "home"
    | "page"
    | "layout-page"
    | "article"
    | "locale-mirror"
    | "not-found"
    | "single-file";
  componentName: string;
  sourceFile: string;
  wrapperComponent?: string;
  articleSlug?: string;
  articleLang?: string;
  sectionHints?: string[];
  category?: string;
  migrationStatus: "pending" | "parsed" | "syncing" | "migrated" | "failed" | "skipped";
};

export type EdgeProjectAnalysis = {
  projectKey: string;
  projectName: string;
  sourceType: "github" | "upload" | "paste";
  framework: string;
  routerFile: string | null;
  totalFiles: number;
  pages: EdgeDiscoveredPage[];
  localeCounts: Record<string, number>;
  kindCounts: Record<string, number>;
  sharedFiles: {
    navbar?: string;
    footer?: string;
    pageLayout?: string;
    indexCss?: string;
    tailwindConfig?: string;
    seoData?: string;
  };
  cssTokens: EdgeCssTokens;
  tailwindConfig: string | null;
  githubMeta?: {
    owner: string;
    repo: string;
    full_name: string;
    branch: string;
    default_branch: string;
    branches: string[];
    is_private: boolean;
  };
};

const IGNORE_COMPONENT_PATTERNS = [
  /FloatingWhatsApp/i,
  /ScrollToTopButton/i,
  /SeoHead/i,
  /SeoJsonLd/i,
  /PageLoading/i,
  /SimplifiedChineseProvider/i,
  /ShareButtons/i,
  /TableOfContents/i,
  /ArticleNav/i,
  /RelatedArticles/i,
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function linearToSrgbByte(c: number): number {
  const clamped = clamp01(c);
  const srgb =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(clamp01(srgb) * 255);
}

function oklchToLinearRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const hRad = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  return [
    +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

function inSrgbGamut(r: number, g: number, b: number): boolean {
  return r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1;
}

export function oklchToHex(lRaw: number, c: number, hDeg: number): string {
  const L = clamp01(lRaw > 1 ? lRaw / 100 : lRaw);
  let [r, g, b] = oklchToLinearRgb(L, c, hDeg);

  if (!inSrgbGamut(r, g, b) && c > 0) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const [mr, mg, mb] = oklchToLinearRgb(L, mid, hDeg);
      if (inSrgbGamut(mr, mg, mb)) {
        lo = mid;
        r = mr;
        g = mg;
        b = mb;
      } else {
        hi = mid;
      }
    }
    [r, g, b] = oklchToLinearRgb(L, lo, hDeg);
  }

  const toHex = (n: number) => linearToSrgbByte(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function parseCssTokensFromStylesheet(cssText: string): EdgeCssTokens {
  const colors: Record<string, string> = {};
  if (!cssText) return { colors };

  const oklchVarRe =
    /--([a-zA-Z0-9_-]+)\s*:\s*(?:oklch\(\s*)?([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?\s*\)?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = oklchVarRe.exec(cssText)) !== null) {
    const lVal = m[2].endsWith("%") ? parseFloat(m[2]) / 100 : parseFloat(m[2]);
    const cVal = parseFloat(m[3]);
    const hVal = parseFloat(m[4]);
    if (Number.isFinite(lVal) && Number.isFinite(cVal) && Number.isFinite(hVal)) {
      colors[m[1]] = oklchToHex(lVal, cVal, hVal);
    }
  }

  const hexVarRe = /--([a-zA-Z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  while ((m = hexVarRe.exec(cssText)) !== null) {
    colors[m[1]] = m[2].toUpperCase();
  }

  const fontHeadingMatch = cssText.match(/--font-heading\s*:\s*([^;]+);/);
  const fontBodyMatch = cssText.match(/--font-body\s*:\s*([^;]+);/);

  return {
    colors,
    fontHeading: fontHeadingMatch?.[1]?.replace(/['"]/g, "").trim(),
    fontBody: fontBodyMatch?.[1]?.replace(/['"]/g, "").trim(),
    backgroundHex: colors["background-50"] || colors["background"] || colors["bg"],
    surfaceHex: colors["background-100"] || colors["surface"] || "#FFFFFF",
    primaryHex: colors["primary-500"] || colors["primary"],
    accentHex: colors["accent-500"] || colors["accent"] || colors["primary-600"],
    textHex: colors["foreground-950"] || colors["foreground-900"] || colors["foreground"],
  };
}

export function normalizeRoutePath(p: string): string {
  const trimmed = (p || "").trim();
  if (!trimmed || trimmed === "*") return trimmed || "/";
  let normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized !== "/" && !normalized.endsWith("/")) {
    normalized = `${normalized}/`;
  }
  return normalized;
}

export function resolveProjectModulePath(
  specifier: string,
  importerPath: string,
  allPaths: Set<string>,
): string | null {
  if (!specifier) return null;
  let base = specifier.trim();
  if (base.startsWith("@/")) {
    base = `src/${base.slice(2)}`;
  } else if (base.startsWith("./") || base.startsWith("../")) {
    const dirParts = importerPath.split("/").slice(0, -1);
    for (const part of base.split("/")) {
      if (part === "." || !part) continue;
      if (part === "..") dirParts.pop();
      else dirParts.push(part);
    }
    base = dirParts.join("/");
  } else {
    return null;
  }

  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
    `${base}/page.tsx`,
  ];
  for (const c of candidates) {
    if (allPaths.has(c)) return c;
  }
  return null;
}

type ParsedImportTarget = {
  localName: string;
  specifier: string;
  exportName?: string;
  resolvedPath: string | null;
};

export function parseRouterImports(
  routerCode: string,
  routerPath: string,
  allPaths: Set<string>,
): Map<string, ParsedImportTarget> {
  const map = new Map<string, ParsedImportTarget>();

  const lazyRe =
    /(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)(?:\s*\.then\(\s*\(?[A-Za-z0-9_$]+\)?\s*=>\s*\(\s*\{\s*default:\s*[A-Za-z0-9_$]+\.([A-Za-z0-9_$]+)\s*\}\s*\)\))?\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = lazyRe.exec(routerCode)) !== null) {
    map.set(m[1], {
      localName: m[1],
      specifier: m[2],
      exportName: m[3],
      resolvedPath: resolveProjectModulePath(m[2], routerPath, allPaths),
    });
  }

  const defaultImportRe = /^\s*import\s+([A-Za-z0-9_$]+)\s+from\s+["']([^"']+)["']/gm;
  while ((m = defaultImportRe.exec(routerCode)) !== null) {
    if (!map.has(m[1])) {
      map.set(m[1], {
        localName: m[1],
        specifier: m[2],
        resolvedPath: resolveProjectModulePath(m[2], routerPath, allPaths),
      });
    }
  }

  const namedImportRe = /^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm;
  while ((m = namedImportRe.exec(routerCode)) !== null) {
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const resolvedPath = resolveProjectModulePath(m[2], routerPath, allPaths);
    for (const part of names) {
      const aliasMatch = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      const exportName = aliasMatch ? aliasMatch[1] : part;
      const localName = aliasMatch ? aliasMatch[2] : part;
      if (!map.has(localName)) {
        map.set(localName, { localName, specifier: m[2], exportName, resolvedPath });
      }
    }
  }

  return map;
}

function parseRoutesFromRouter(routerCode: string) {
  const entries: Array<{ path: string; componentName: string; wrapperComponent?: string }> = [];
  const seen = new Set<string>();

  const objectRouteRe =
    /\{\s*path\s*:\s*["']([^"']+)["']\s*,\s*element\s*:\s*([\s\S]*?)\s*(?:,\s*(?:children|caseSensitive|index)[\s\S]*?)?\}/g;
  let m: RegExpExecArray | null;
  while ((m = objectRouteRe.exec(routerCode)) !== null) {
    const routePath = m[1].trim();
    const elementExpr = m[2].trim();
    const tags = Array.from(elementExpr.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)).map((t) => t[1]);
    if (tags.length === 0) continue;
    const wrapperComponent = tags.length > 1 ? tags[0] : undefined;
    const componentName = tags[tags.length - 1];
    const key = `${routePath}::${componentName}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ path: routePath, componentName, wrapperComponent });
    }
  }

  if (entries.length === 0) {
    const jsxRouteRe = /<Route\b[^>]*\bpath=["']([^"']+)["'][^>]*\belement=\{([\s\S]*?)\}/g;
    while ((m = jsxRouteRe.exec(routerCode)) !== null) {
      const routePath = m[1].trim();
      const elementExpr = m[2].trim();
      const tags = Array.from(elementExpr.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)).map((t) => t[1]);
      if (tags.length === 0) continue;
      const wrapperComponent = tags.length > 1 ? tags[0] : undefined;
      const componentName = tags[tags.length - 1];
      const key = `${routePath}::${componentName}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ path: routePath, componentName, wrapperComponent });
      }
    }
  }

  return entries;
}

function parsePageSeoData(seoFileContent: string) {
  const map = new Map<string, { name?: string; seoTitle?: string; description?: string }>();
  if (!seoFileContent) return map;

  const pathRe = /\bpath\s*:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(seoFileContent)) !== null) {
    const before = seoFileContent.slice(Math.max(0, m.index - 40), m.index);
    if (/parent\s*:\s*\{\s*$/i.test(before)) continue;

    let openIdx = -1;
    let depth = 0;
    for (let i = m.index; i >= 0; i--) {
      const ch = seoFileContent[i];
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

    const block = extractBalancedObjectFromIndex(seoFileContent, openIdx);
    const normPath = normalizeRoutePath(m[1]);
    if (map.has(normPath)) continue;

    map.set(normPath, {
      name: extractStringProp(block, "name"),
      seoTitle: extractStringProp(block, "seoTitle"),
      description: extractStringProp(block, "description"),
    });
  }
  return map;
}

function parseArticleRouteExportMap(routesCode: string) {
  const map = new Map<string, { lang: string; slug: string }>();
  if (!routesCode) return map;
  const fnRe =
    /export\s+function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\s*return\s*<MusicArticlePage\b[^>]*lang=["']([^"']+)["'][^>]*slug=["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(routesCode)) !== null) {
    map.set(m[1], { lang: m[2], slug: m[3] });
  }
  const fnRe2 =
    /export\s+function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\s*return\s*<MusicArticlePage\b[^>]*slug=["']([^"']+)["'][^>]*lang=["']([^"']+)["']/g;
  while ((m = fnRe2.exec(routesCode)) !== null) {
    if (!map.has(m[1])) map.set(m[1], { lang: m[3], slug: m[2] });
  }
  return map;
}

function extractStringProp(block: string, prop: string): string | undefined {
  const re = new RegExp(`\\b${prop}\\s*:\\s*(?:'((?:\\\\'|[^'])*)'|"((?:\\\\"|[^"])*)")`, "m");
  const m = block.match(re);
  if (!m) return undefined;
  return (m[1] ?? m[2] ?? "").replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
}

function extractStringArrayProp(block: string, prop: string): string[] {
  const re = new RegExp(`\\b${prop}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "m");
  const m = block.match(re);
  if (!m) return [];
  const items: string[] = [];
  const itemRe = /'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"/g;
  let sm: RegExpExecArray | null;
  while ((sm = itemRe.exec(m[1])) !== null) {
    const val = (sm[1] ?? sm[2] ?? "").replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
    if (val) items.push(val);
  }
  return items;
}

function extractBalancedObjectFromIndex(text: string, openBraceIdx: number): string {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;
  for (let i = openBraceIdx; i < text.length; i++) {
    const ch = text[i];
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
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(openBraceIdx, i + 1);
    }
  }
  return text.slice(openBraceIdx, Math.min(text.length, openBraceIdx + 8000));
}

export function extractArticleObjectBySlug(fileContent: string, slug: string) {
  const slugRe = new RegExp(`\\bslug\\s*:\\s*['"]${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`);
  const match = slugRe.exec(fileContent);
  if (!match) return null;

  let openIdx = -1;
  let depth = 0;
  for (let i = match.index; i >= 0; i--) {
    const ch = fileContent[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) {
        openIdx = i;
        break;
      }
      depth--;
    }
  }
  if (openIdx < 0) return null;

  const block = extractBalancedObjectFromIndex(fileContent, openIdx);
  const title = extractStringProp(block, "title");
  const subtitle = extractStringProp(block, "subtitle");
  const category = extractStringProp(block, "category");
  const heroImage = extractStringProp(block, "heroImage");
  const heroAlt = extractStringProp(block, "heroAlt");
  const closing = extractStringProp(block, "closing");
  const intro = extractStringArrayProp(block, "intro");

  const sections: Array<{
    id: string;
    h: string;
    p: string[];
    subs: Array<{ h: string }>;
    listItems: string[];
    imageSrc?: string;
  }> = [];
  const secStart = block.search(/\bsections\s*:\s*\[/);
  if (secStart >= 0) {
    const secRegion = block.slice(block.indexOf("[", secStart));
    const idRe = /\bid\s*:\s*['"]([^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = idRe.exec(secRegion)) !== null) {
      let sOpen = -1;
      for (let j = im.index; j >= 0; j--) {
        if (secRegion[j] === "{") {
          sOpen = j;
          break;
        }
      }
      if (sOpen < 0) continue;
      const secBlock = extractBalancedObjectFromIndex(secRegion, sOpen);
      const h = extractStringProp(secBlock, "h") || im[1];
      const p = extractStringArrayProp(secBlock, "p");
      const listItems = extractStringArrayProp(secBlock, "items");
      const imageSrc = extractStringProp(secBlock, "src");
      const subs: Array<{ h: string }> = [];
      const subHRe = /\bh\s*:\s*['"]([^'"]+)['"]/g;
      let shm: RegExpExecArray | null;
      while ((shm = subHRe.exec(secBlock)) !== null) {
        if (shm[1] !== h) subs.push({ h: shm[1] });
      }
      sections.push({ id: im[1], h, p, subs, listItems, imageSrc });
    }
  }

  const faq: Array<{ q: string; a: string }> = [];
  const faqStart = block.search(/\bfaq\s*:\s*\[/);
  if (faqStart >= 0) {
    const faqRegion = block.slice(faqStart);
    const qaRe =
      /\bq\s*:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")\s*,\s*\ba\s*:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/g;
    let qm: RegExpExecArray | null;
    while ((qm = qaRe.exec(faqRegion)) !== null) {
      faq.push({
        q: (qm[1] ?? qm[2] ?? "").replace(/\\'/g, "'").trim(),
        a: (qm[3] ?? qm[4] ?? "").replace(/\\'/g, "'").trim(),
      });
    }
  }

  return { slug, title, subtitle, category, heroImage, heroAlt, intro, sections, faq, closing };
}

function extractPageLayoutProps(code: string) {
  const start = code.indexOf("<PageLayout");
  if (start < 0) return null;
  let end = -1;
  let braceDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === "`") inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
      else if (ch === ">" && braceDepth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const tag = code.slice(start, end + 1);
  const readAttr = (attr: string) => {
    const re = new RegExp(
      `\\b${attr}=(?:"([^"]*)"|'([^']*)'|\\{\`([^\`]*)\`\\}|\\{'([^']*)'\\}|\\{"([^"]*)"\\})`,
    );
    const m = tag.match(re);
    return (m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? m?.[5] ?? "").trim() || undefined;
  };
  return {
    title: readAttr("title"),
    subtitle: readAttr("subtitle"),
    description: readAttr("description"),
    heroImage: readAttr("heroImage"),
    heroAlt: readAttr("heroAlt"),
    ctaText: readAttr("ctaText"),
    ctaSecondaryText: readAttr("ctaSecondaryText"),
  };
}

export function extractLocalSectionImports(
  code: string,
  pagePath: string,
  allPaths: Set<string>,
): Array<{ localName: string; resolvedPath: string }> {
  const results: Array<{ localName: string; resolvedPath: string }> = [];
  const defaultRe = /^\s*import\s+([A-Za-z0-9_$]+)\s+from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = defaultRe.exec(code)) !== null) {
    const localName = m[1];
    const spec = m[2];
    if (IGNORE_COMPONENT_PATTERNS.some((re) => re.test(localName) || re.test(spec))) continue;
    const resolved = resolveProjectModulePath(spec, pagePath, allPaths);
    if (resolved && /\.(tsx|jsx)$/i.test(resolved)) {
      results.push({ localName, resolvedPath: resolved });
    }
  }
  return results;
}

export function extractLocalNamedDataImports(
  code: string,
  importerPath: string,
  allPaths: Set<string>,
): Array<{ localName: string; exportName: string; resolvedPath: string }> {
  const results: Array<{ localName: string; exportName: string; resolvedPath: string }> = [];
  const namedImportRe = /^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = namedImportRe.exec(code)) !== null) {
    const spec = m[2];
    const resolved = resolveProjectModulePath(spec, importerPath, allPaths);
    if (
      !resolved ||
      !/\.(tsx?|jsx?)$/i.test(resolved) ||
      /articles\/(zh|en)-\d+\.ts$/i.test(resolved) ||
      /pageSeoData\.(ts|tsx)$/i.test(resolved)
    ) {
      continue;
    }
    const codeOutsideImport = `${code.slice(0, m.index)}\n${code.slice(m.index + m[0].length)}`;
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const part of names) {
      if (/^type\s+/.test(part)) continue;
      const aliasMatch = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      const exportName = aliasMatch ? aliasMatch[1] : part;
      const localName = aliasMatch ? aliasMatch[2] : part;
      const looksLikeDataConstant =
        /^[A-Z][A-Z0-9_]{2,}$/.test(exportName) ||
        /items|faq|list|data|cards|testimonials|services/i.test(exportName);
      if (!looksLikeDataConstant) continue;
      const refRe = new RegExp(`\\b${localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (refRe.test(codeOutsideImport)) {
        results.push({ localName, exportName, resolvedPath: resolved });
      }
    }
  }
  return results;
}

function extractExportedConstArray(
  moduleCode: string,
  exportName: string,
  localName: string,
): string | null {
  const escapedExport = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\bexport\\s+const\\s+${escapedExport}(?:\\s*:\\s*[^=;]+)?\\s*=\\s*\\[`);
  const match = re.exec(moduleCode);
  if (!match) return null;
  const openBracket = match.index + match[0].length - 1;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;
  for (let i = openBracket; i < moduleCode.length; i++) {
    const ch = moduleCode[i];
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
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        const arraySlice = moduleCode.slice(openBracket, i + 1);
        if (arraySlice.length <= 25000) {
          return `const ${localName} = ${arraySlice};`;
        }
        return null;
      }
    }
  }
  return null;
}

function prepareComponentCode(
  compCode: string,
  compPath: string,
  fileMap: Record<string, string>,
  allPaths: Set<string>,
): string {
  const dataImports = extractLocalNamedDataImports(compCode, compPath, allPaths);
  const inlined: string[] = [];
  const seenLocals = new Set<string>();
  for (const imp of dataImports) {
    if (seenLocals.has(imp.localName)) continue;
    const modCode = fileMap[imp.resolvedPath];
    if (!modCode) continue;
    const extracted = extractExportedConstArray(modCode, imp.exportName, imp.localName);
    if (extracted) {
      seenLocals.add(imp.localName);
      inlined.push(extracted);
    }
  }
  const stripped = stripTsImportsAndTypes(compCode);
  return inlined.length > 0 ? `${inlined.join("\n")}\n\n${stripped}` : stripped;
}

function humanizeRouteTitle(routePath: string): string {
  if (routePath === "/" || !routePath) return "Home";
  const clean = routePath.replace(/^\/(en|cn)\//, "/").replace(/^\/|\/$/g, "");
  if (!clean) {
    return routePath.startsWith("/en") ? "Home (EN)" : routePath.startsWith("/cn") ? "主頁 (簡中)" : "Home";
  }
  const last = clean.split("/").pop() || clean;
  return last
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function detectLocaleFromPath(routePath: string, hasChineseProject: boolean): string {
  if (routePath === "/en" || routePath.startsWith("/en/")) return "en";
  if (routePath === "/cn" || routePath.startsWith("/cn/")) return "cn";
  return hasChineseProject ? "zh" : "default";
}

function extractTopCategory(routePath: string): string {
  const stripped = routePath.replace(/^\/(en|cn)(?=\/|$)/, "").replace(/^\/+|\/+$/g, "");
  if (!stripped) return "home";
  return stripped.split("/")[0] || "home";
}

export function analyzeReaddyFileMap(
  fileMap: Record<string, string>,
  options: {
    sourceType: "github" | "upload" | "paste";
    projectName?: string;
    allTreePaths?: string[];
    githubMeta?: EdgeProjectAnalysis["githubMeta"];
  },
): EdgeProjectAnalysis {
  const allPaths = new Set<string>([
    ...Object.keys(fileMap),
    ...(options.allTreePaths || []).map((p) => p.replace(/^\.?\/+/, "").replace(/\\/g, "/")),
  ]);

  const indexHtml = fileMap["index.html"] || "";
  let pkgName = "";
  try {
    const pkgJson = JSON.parse(fileMap["package.json"] || "{}") as { name?: string };
    pkgName = pkgJson?.name || "";
  } catch {
    // ignore
  }
  const htmlTitleMatch = indexHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const projectName =
    htmlTitleMatch?.[1]?.split(/[｜|]/)[0]?.trim() ||
    options.githubMeta?.repo ||
    options.projectName ||
    (pkgName && pkgName !== "starter" ? pkgName : "") ||
    "Readdy Project";

  const hasChineseProject = /[\u4e00-\u9fff]/.test(
    indexHtml + (fileMap["src/lib/pageSeoData.ts"] || ""),
  );

  const indexCssPath =
    ["src/index.css", "src/App.css", "src/styles/globals.css"].find((p) => p in fileMap) ||
    Array.from(allPaths).find((p) => /(^|\/)index\.css$/i.test(p));
  const cssTokens = parseCssTokensFromStylesheet(indexCssPath ? fileMap[indexCssPath] || "" : "");

  const tailwindPath = Array.from(allPaths).find((p) =>
    /^tailwind\.config\.(ts|js|mjs|cjs)$/i.test(p),
  );
  const tailwindConfig = tailwindPath ? fileMap[tailwindPath] ?? null : null;

  const routerFile =
    ["src/router/config.tsx", "src/router/config.ts", "src/router/index.tsx", "src/App.tsx"].find(
      (p) => p in fileMap,
    ) || null;

  const seoDataPath = Array.from(allPaths).find((p) => /(^|\/)pageSeoData\.(ts|tsx)$/i.test(p));
  const seoMap = parsePageSeoData(seoDataPath ? fileMap[seoDataPath] || "" : "");

  const articleRouteMaps = new Map<string, Map<string, { lang: string; slug: string }>>();
  for (const [p, content] of Object.entries(fileMap)) {
    if (/articles\/routes-(zh|en)\.(tsx|ts)$/i.test(p)) {
      articleRouteMaps.set(p, parseArticleRouteExportMap(content));
    }
  }

  const sharedFiles: EdgeProjectAnalysis["sharedFiles"] = {
    navbar: Array.from(allPaths).find((p) => /components\/.*Navbar\.(tsx|jsx)$/i.test(p)),
    footer: Array.from(allPaths).find((p) => /components\/.*Footer\.(tsx|jsx)$/i.test(p)),
    pageLayout: Array.from(allPaths).find((p) => /components\/.*PageLayout\.(tsx|jsx)$/i.test(p)),
    indexCss: indexCssPath,
    tailwindConfig: tailwindPath,
    seoData: seoDataPath,
  };

  const pages: EdgeDiscoveredPage[] = [];

  if (routerFile && fileMap[routerFile]) {
    const routerCode = fileMap[routerFile];
    const importMap = parseRouterImports(routerCode, routerFile, allPaths);
    const routeEntries = parseRoutesFromRouter(routerCode);

    for (const entry of routeEntries) {
      if (entry.path === "*") continue;
      const normPath = normalizeRoutePath(entry.path);
      const target = importMap.get(entry.componentName);
      const sourceFile = target?.resolvedPath || "";
      const locale = detectLocaleFromPath(normPath, hasChineseProject);
      const isCnMirror =
        normPath.startsWith("/cn/") || entry.wrapperComponent === "SimplifiedChineseProvider";

      let articleSlug: string | undefined;
      let articleLang: string | undefined;
      if (sourceFile && articleRouteMaps.has(sourceFile) && target?.exportName) {
        const artRef = articleRouteMaps.get(sourceFile)?.get(target.exportName);
        if (artRef) {
          articleSlug = artRef.slug;
          articleLang = artRef.lang;
        }
      }

      const baseZhPath =
        isCnMirror && normPath.startsWith("/cn/") ? normalizeRoutePath(normPath.slice(3)) : normPath;
      const seoEntry = seoMap.get(normPath) || (isCnMirror ? seoMap.get(baseZhPath) : undefined);

      const pageKind: EdgeDiscoveredPage["pageKind"] = isCnMirror
        ? "locale-mirror"
        : articleSlug
          ? "article"
          : normPath === "/" || normPath === "/en/"
            ? "home"
            : "page";

      const title =
        seoEntry?.name ||
        seoEntry?.seoTitle?.split(/[｜|]/)[0]?.trim() ||
        humanizeRouteTitle(normPath);

      pages.push({
        id: normPath,
        path: normPath,
        title,
        description: seoEntry?.description,
        locale,
        pageKind,
        componentName: entry.componentName,
        sourceFile: sourceFile || entry.componentName,
        wrapperComponent: entry.wrapperComponent,
        articleSlug,
        articleLang,
        category: extractTopCategory(normPath),
        migrationStatus: "pending",
      });
    }
  }

  if (pages.length === 0) {
    const candidateFiles = Array.from(allPaths)
      .filter((p) => {
        const lower = p.toLowerCase();
        if (lower.includes("node_modules/") || lower.startsWith("dist/")) return false;
        if (/\/sections\//i.test(lower) || /components\//i.test(lower)) return false;
        return /(page|landingpage|index)\.(tsx|jsx|html)$/i.test(lower) || lower.startsWith("src/pages/");
      })
      .sort();
    for (const filePath of candidateFiles) {
      const isHome = /home\/page|landingpage|app\.tsx|index\.html/i.test(filePath);
      const derivedPath = isHome
        ? "/"
        : normalizeRoutePath(
            filePath
              .replace(/^src\/pages\//i, "/")
              .replace(/\/page\.(tsx|jsx)$/i, "/")
              .replace(/\.(tsx|jsx|html)$/i, "/"),
          );
      pages.push({
        id: derivedPath,
        path: derivedPath,
        title: humanizeRouteTitle(derivedPath),
        locale: detectLocaleFromPath(derivedPath, hasChineseProject),
        pageKind: candidateFiles.length === 1 ? "single-file" : isHome ? "home" : "page",
        componentName: filePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Page",
        sourceFile: filePath,
        category: extractTopCategory(derivedPath),
        migrationStatus: "pending",
      });
    }
  }

  const localeCounts: Record<string, number> = {};
  const kindCounts: Record<string, number> = {};
  for (const p of pages) {
    localeCounts[p.locale] = (localeCounts[p.locale] || 0) + 1;
    kindCounts[p.pageKind] = (kindCounts[p.pageKind] || 0) + 1;
  }

  const projectKey = options.githubMeta?.full_name
    ? `gh:${options.githubMeta.full_name}:${options.githubMeta.branch}`
    : `proj:${projectName}:${pages.length}`;

  return {
    projectKey,
    projectName,
    sourceType: options.sourceType,
    framework: routerFile ? "React + Vite + React Router" : "React / HTML",
    routerFile,
    totalFiles: allPaths.size,
    pages,
    localeCounts,
    kindCounts,
    sharedFiles,
    cssTokens,
    tailwindConfig,
    githubMeta: options.githubMeta,
  };
}

function stripTsImportsAndTypes(code: string): string {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "")
    .trim();
}

function stripBracketProperty(source: string, propName: string): string {
  let out = "";
  let i = 0;
  const keyRe = new RegExp(`\\b${propName}\\s*:\\s*\\[`, "g");
  while (i < source.length) {
    keyRe.lastIndex = i;
    const match = keyRe.exec(source);
    if (!match) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, match.index);
    const openBracket = match.index + match[0].length - 1;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let j = openBracket;
    for (; j < source.length; j++) {
      const ch = source[j];
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
        if (ch === "[") depth++;
        else if (ch === "]") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
    }
    i = j;
  }
  return out;
}

function synthesizeCondensedNavbar(
  navbarCode: string | undefined,
  locale: string,
  isHome = false,
): string {
  const isEn = locale === "en";
  const labels: string[] = [];
  const ctaLabels: string[] = [];
  let brand = "BW Event Music";
  let brandSubtitle = isEn ? "Hong Kong Event Music" : "香港音樂娛樂活動統籌中心";

  if (navbarCode) {
    const mainNavStart = navbarCode.search(/\bmainNavItems\b/);
    const mainNavEnd = navbarCode.search(/\bctaItems\b/);
    const navSlice =
      mainNavStart >= 0
        ? navbarCode.slice(mainNavStart, mainNavEnd > mainNavStart ? mainNavEnd : mainNavStart + 9000)
        : navbarCode;
    const topLevelOnly = stripBracketProperty(navSlice, "children");
    const re = isEn
      ? /en:\s*\{\s*label:\s*['"]([^'"]+)['"]/g
      : /zh:\s*\{\s*label:\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(topLevelOnly)) !== null) {
      if (!labels.includes(m[1]) && labels.length < 16) labels.push(m[1]);
    }

    if (mainNavEnd >= 0) {
      const ctaSlice = navbarCode.slice(mainNavEnd, mainNavEnd + 1500);
      const ctaRe = isEn
        ? /en:\s*\{\s*label:\s*['"]([^'"]+)['"]/g
        : /zh:\s*\{\s*label:\s*['"]([^'"]+)['"]/g;
      while ((m = ctaRe.exec(ctaSlice)) !== null) {
        if (!ctaLabels.includes(m[1]) && ctaLabels.length < 2) ctaLabels.push(m[1]);
      }
    }

    const brandMatch = navbarCode.match(/>\s*(BW Event Music)\s*</);
    if (brandMatch) brand = brandMatch[1];
    if (!isEn) {
      const subMatch = navbarCode.match(/>\s*(香港音樂娛樂活動統籌中心)\s*</);
      if (subMatch) brandSubtitle = subMatch[1];
    }
  }

  const finalLinks =
    labels.length > 0
      ? labels
      : isEn
        ? ["Home", "Services", "Weddings", "Dinner", "Contact"]
        : ["主頁", "服務一覽", "婚禮演出", "周年晚宴", "聯絡我們"];
  const finalCtas =
    ctaLabels.length > 0
      ? ctaLabels
      : isEn
        ? ["Get a Quote", "Contact"]
        : ["網上報價", "聯絡我們"];

  const headerClasses = isHome
    ? "bg-transparent text-background-50 px-6 py-4 flex items-center justify-between"
    : "bg-background-50 text-foreground-950 px-6 py-4 flex items-center justify-between";

  return `<header className="${headerClasses}">
  <div data-brand-wrap="true">
    <span data-brand="true">${brand}</span>
    <small data-brand-subtitle="true">${brandSubtitle}</small>
  </div>
  <nav>${finalLinks.map((l) => `<a href="#">${l}</a>`).join("\n      ")}</nav>
  <div data-cta="true">
    ${finalCtas.map((c) => `<button>${c}</button>`).join("\n    ")}
  </div>
</header>`;
}

function synthesizeCondensedFooter(locale: string): string {
  const isEn = locale === "en";
  const links = isEn
    ? ["Services", "Weddings", "Annual Dinner", "Music Insights", "Contact"]
    : ["服務一覽", "婚禮演出", "周年晚宴", "音樂資訊", "聯絡我們"];
  return `<footer className="bg-background-100 text-foreground-950 px-8 py-10">
  <span>BW Event Music</span>
  <p>${isEn ? "© 2026 BW Event Music. All rights reserved." : "© 2026 BW Event Music. 版權所有。"}</p>
  ${links.map((l) => `<a href="#">${l}</a>`).join("\n  ")}
</footer>`;
}

export function assembleReaddyPageCode(
  page: EdgeDiscoveredPage,
  fileMap: Record<string, string>,
  sharedFiles: EdgeProjectAnalysis["sharedFiles"],
): { code: string; includedFiles: string[]; summary: string } {
  const allPaths = new Set(Object.keys(fileMap));
  const includedFiles: string[] = [];
  const navbarCode = sharedFiles.navbar ? fileMap[sharedFiles.navbar] : undefined;

  if (page.articleSlug) {
    let foundArticle: ReturnType<typeof extractArticleObjectBySlug> = null;
    const preferredPrefix = page.articleLang === "en" ? "en-" : "zh-";
    const articleEntries = Object.entries(fileMap)
      .filter(([p]) => /articles\/(zh|en)-\d+\.ts$/i.test(p))
      .sort(([a], [b]) => {
        const aMatch = a.includes(`/${preferredPrefix}`) ? 0 : 1;
        const bMatch = b.includes(`/${preferredPrefix}`) ? 0 : 1;
        return aMatch - bMatch || a.localeCompare(b);
      });
    for (const [p, content] of articleEntries) {
      if (content.includes(page.articleSlug)) {
        foundArticle = extractArticleObjectBySlug(content, page.articleSlug);
        if (foundArticle) {
          includedFiles.push(p);
          break;
        }
      }
    }
    const title = foundArticle?.title || page.title;
    const subtitle = foundArticle?.subtitle || page.description || "";
    const blocks: string[] = [
      `/* === PAGE META: path="${page.path}" title="${title}" locale="${page.locale}" === */`,
    ];
    const nav = synthesizeCondensedNavbar(navbarCode, page.locale);
    if (nav) blocks.push(`/* === COMPONENT: Navbar === */\n${nav}`);
    blocks.push(`/* === COMPONENT: Article Hero === */
<section className="bg-background-50 text-foreground-950 py-16 px-8">
  <span>${foundArticle?.category || (page.locale === "en" ? "Music Insights" : "音樂資訊")}</span>
  <h1>${title}</h1>
  ${subtitle ? `<p>${subtitle}</p>` : ""}
  ${foundArticle?.heroImage ? `<img src="${foundArticle.heroImage}" alt="${foundArticle.heroAlt || title}" />` : ""}
</section>`);
    if (foundArticle) {
      if (foundArticle.intro.length > 0) {
        blocks.push(`/* === COMPONENT: Article Intro === */
<section className="bg-background-50 text-foreground-950 py-10 px-8">
  <h2>${page.locale === "en" ? "Overview" : "導讀"}</h2>
  ${foundArticle.intro.map((para) => `<p>${para}</p>`).join("\n  ")}
</section>`);
      }
      for (const sec of foundArticle.sections.slice(0, 6)) {
        const inner = [
          `<h2>${sec.h}</h2>`,
          ...sec.p.slice(0, 3).map((para) => `<p>${para}</p>`),
          ...sec.subs.slice(0, 4).map((sub) => `<h3>${sub.h}</h3>`),
          ...sec.listItems.slice(0, 6).map((li) => `<p>${li.replace(/\*\*/g, "")}</p>`),
          sec.imageSrc ? `<img src="${sec.imageSrc}" alt="${sec.h}" />` : "",
        ]
          .filter(Boolean)
          .join("\n  ");
        blocks.push(`/* === COMPONENT: ${sec.h} === */\n<section className="bg-background-50 text-foreground-950 py-10 px-8">\n  ${inner}\n</section>`);
      }
      if (foundArticle.faq.length > 0) {
        blocks.push(`/* === COMPONENT: FAQ === */
<section className="bg-background-100 text-foreground-950 py-12 px-8">
  <h2>${page.locale === "en" ? "Frequently Asked Questions" : "常見問題"}</h2>
  <div className="grid grid-cols-1 gap-4">
    ${foundArticle.faq.slice(0, 5).map((item) => `<div><h3>${item.q}</h3><p>${item.a}</p></div>`).join("\n    ")}
  </div>
</section>`);
      }
    }
    blocks.push(`/* === COMPONENT: Footer === */\n${synthesizeCondensedFooter(page.locale)}`);
    return {
      code: blocks.join("\n\n"),
      includedFiles,
      summary: foundArticle
        ? `文章數據組裝（${foundArticle.sections.length} 個章節 · ${foundArticle.faq.length} 條 FAQ）`
        : `文章路由組裝 (${page.articleSlug})`,
    };
  }

  const pageCode = fileMap[page.sourceFile];
  if (!pageCode) {
    return {
      code: `/* === PAGE META: path="${page.path}" title="${page.title}" locale="${page.locale}" === */\n<section><h1>${page.title}</h1><p>${page.description || page.sourceFile}</p></section>`,
      includedFiles: [],
      summary: `找不到源檔 ${page.sourceFile}，已建立基礎骨架`,
    };
  }
  includedFiles.push(page.sourceFile);

  const imports = extractLocalSectionImports(pageCode, page.sourceFile, allPaths);
  const usesPageLayout = /<PageLayout\b/.test(pageCode);
  if (!usesPageLayout && imports.length === 0) {
    return {
      code: `/* === PAGE META: path="${page.path}" title="${page.title}" locale="${page.locale}" === */\n${pageCode}`,
      includedFiles,
      summary: `單檔頁面（${page.sourceFile}）`,
    };
  }

  const isHomeRoute = page.path === "/" || page.path === "/en/" || page.path === "/cn/";

  const blocks: string[] = [
    `/* === PAGE META: path="${page.path}" title="${page.title}" locale="${page.locale}" === */`,
  ];
  if (usesPageLayout || /\bNavbar\b/.test(pageCode)) {
    const nav = synthesizeCondensedNavbar(navbarCode, page.locale, isHomeRoute);
    if (nav) blocks.push(`/* === COMPONENT: Navbar === */\n${nav}`);
    if (sharedFiles.navbar) includedFiles.push(sharedFiles.navbar);
  }

  const layoutProps = usesPageLayout ? extractPageLayoutProps(pageCode) : null;
  if (layoutProps) {
    if (sharedFiles.pageLayout) includedFiles.push(sharedFiles.pageLayout);
    blocks.push(`/* === COMPONENT: PageLayout Hero === */
<section className="bg-background-50 text-foreground-950 py-20 px-8">
  <h1>${layoutProps.title || page.title}</h1>
  ${layoutProps.subtitle ? `<p>${layoutProps.subtitle}</p>` : ""}
  ${layoutProps.description ? `<p>${layoutProps.description}</p>` : ""}
  ${layoutProps.heroImage ? `<img src="${layoutProps.heroImage}" alt="${layoutProps.heroAlt || layoutProps.title || page.title}" />` : ""}
  <button>${layoutProps.ctaText || (page.locale === "en" ? "Get Online Quote" : "立即網上報價")}</button>
</section>`);
  }

  const orderedImports = imports
    .map((imp) => {
      const idx = pageCode.search(new RegExp(`<${imp.localName}\\b`));
      return { ...imp, order: idx >= 0 ? idx : 999999 };
    })
    .filter((imp) => !/^(Navbar|Footer|PageLayout)$/i.test(imp.localName))
    .sort((a, b) => a.order - b.order);

  const cleanedPageBody = stripTsImportsAndTypes(pageCode);
  const inlineSectionCount = (cleanedPageBody.match(/<section\b/gi) || []).length;
  const importedSectionsCount = orderedImports.filter(
    (imp) => !/ScenarioGallery/i.test(imp.localName),
  ).length;
  const isSectionComposerPage =
    !usesPageLayout && importedSectionsCount >= 2 && inlineSectionCount <= 2;

  if (isSectionComposerPage) {
    let galleryInserted = false;
    const galleryMatch = pageCode.match(/<section\b[^>]*>[\s\S]*?<ScenarioGallery[\s\S]*?<\/section>/);
    const galleryIdx = galleryMatch?.index ?? 999999;

    for (const imp of orderedImports) {
      if (!galleryInserted && galleryMatch && imp.order > galleryIdx) {
        blocks.push(`/* === COMPONENT: ScenarioGallery === */\n${galleryMatch[0]}`);
        galleryInserted = true;
      }
      if (/ScenarioGallery/i.test(imp.localName)) {
        if (!galleryInserted && galleryMatch) {
          blocks.push(`/* === COMPONENT: ScenarioGallery === */\n${galleryMatch[0]}`);
          galleryInserted = true;
        }
        continue;
      }
      const compCode = fileMap[imp.resolvedPath];
      if (!compCode) continue;
      includedFiles.push(imp.resolvedPath);
      blocks.push(
        `/* === COMPONENT: ${imp.localName} (${imp.resolvedPath}) === */\n${prepareComponentCode(compCode, imp.resolvedPath, fileMap, allPaths)}`,
      );
    }
    if (!galleryInserted && galleryMatch) {
      blocks.push(`/* === COMPONENT: ScenarioGallery === */\n${galleryMatch[0]}`);
    }
  } else {
    blocks.push(`/* === COMPONENT: ${page.componentName} Body (${page.sourceFile}) === */\n${cleanedPageBody}`);
    for (const imp of orderedImports) {
      const compCode = fileMap[imp.resolvedPath];
      if (!compCode || /ScenarioGallery/i.test(imp.localName)) continue;
      includedFiles.push(imp.resolvedPath);
      blocks.push(
        `/* === COMPONENT: ${imp.localName} (${imp.resolvedPath}) === */\n${prepareComponentCode(compCode, imp.resolvedPath, fileMap, allPaths)}`,
      );
    }
  }

  if (usesPageLayout || /\bFooter\b/.test(pageCode)) {
    blocks.push(`/* === COMPONENT: Footer === */\n${synthesizeCondensedFooter(page.locale)}`);
    if (sharedFiles.footer) includedFiles.push(sharedFiles.footer);
  }

  const deduped = Array.from(new Set(includedFiles));
  return {
    code: blocks.join("\n\n"),
    includedFiles: deduped,
    summary: `已自動組裝 ${deduped.length} 個關聯檔案（${blocks.length - 1} 個結構片段）`,
  };
}
