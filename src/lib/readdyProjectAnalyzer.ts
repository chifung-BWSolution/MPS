import type {
  ReaddyCssTokens,
  ReaddyDiscoveredPage,
  ReaddyPageKind,
  ReaddyProjectAnalysis,
  SourceType,
} from '../types/readdyFramer.ts';

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

/** Convert OKLCH (L in 0..1 or %, C >= 0, H in degrees) to #rrggbb hex using CSS Color 4 gamut chroma reduction. */
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

  const toHex = (n: number) => linearToSrgbByte(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function parseCssTokensFromStylesheet(cssText: string): ReaddyCssTokens {
  const colors: Record<string, string> = {};
  if (!cssText) {
    return { colors };
  }

  // Match CSS custom properties like: --primary-500: 0.62 0.18 75;
  const oklchVarRe =
    /--([a-zA-Z0-9_-]+)\s*:\s*(?:oklch\(\s*)?([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?\s*\)?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = oklchVarRe.exec(cssText)) !== null) {
    const key = m[1];
    const lVal = m[2].endsWith('%') ? parseFloat(m[2]) / 100 : parseFloat(m[2]);
    const cVal = parseFloat(m[3]);
    const hVal = parseFloat(m[4]);
    if (Number.isFinite(lVal) && Number.isFinite(cVal) && Number.isFinite(hVal)) {
      colors[key] = oklchToHex(lVal, cVal, hVal);
    }
  }

  // Also parse hex variables like --primary: #0BB59B;
  const hexVarRe = /--([a-zA-Z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  while ((m = hexVarRe.exec(cssText)) !== null) {
    colors[m[1]] = m[2].toUpperCase();
  }

  const fontHeadingMatch = cssText.match(/--font-heading\s*:\s*([^;]+);/);
  const fontBodyMatch = cssText.match(/--font-body\s*:\s*([^;]+);/);

  return {
    colors,
    fontHeading: fontHeadingMatch?.[1]?.replace(/['"]/g, '').trim(),
    fontBody: fontBodyMatch?.[1]?.replace(/['"]/g, '').trim(),
    backgroundHex: colors['background-50'] || colors['background'] || colors['bg'],
    surfaceHex: colors['background-100'] || colors['surface'] || '#FFFFFF',
    primaryHex: colors['primary-500'] || colors['primary'],
    accentHex: colors['accent-500'] || colors['accent'] || colors['primary-600'],
    textHex: colors['foreground-950'] || colors['foreground-900'] || colors['foreground'],
  };
}

/** Normalize zip/repo file map keys and strip a common single top-level wrapper folder. */
export function normalizeProjectFileMap(
  rawFiles: Record<string, string>,
): Record<string, string> {
  const cleanedEntries = Object.entries(rawFiles)
    .map(([k, v]) => [k.replace(/^\.?\/+/, '').replace(/\\/g, '/'), v] as const)
    .filter(([k]) => Boolean(k));

  if (cleanedEntries.length === 0) return {};

  const firstSegments = new Set(
    cleanedEntries
      .map(([k]) => (k.includes('/') ? k.split('/')[0] : ''))
      .filter(Boolean),
  );

  // If every file sits inside one top-level folder (e.g. project-16106125/src/...)
  // and none sits at root, strip that folder prefix.
  const allHaveSlash = cleanedEntries.every(([k]) => k.includes('/'));
  if (allHaveSlash && firstSegments.size === 1) {
    const prefix = `${Array.from(firstSegments)[0]}/`;
    const unwrapped: Record<string, string> = {};
    for (const [k, v] of cleanedEntries) {
      unwrapped[k.slice(prefix.length)] = v;
    }
    return unwrapped;
  }

  return Object.fromEntries(cleanedEntries);
}

function cleanProjectFileKeys(rawFiles: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(rawFiles)
      .map(([k, v]) => [k.replace(/^\.?\/+/, '').replace(/\\/g, '/'), v] as const)
      .filter(([k]) => Boolean(k)),
  );
}

/** Keep the map that still contains the page file. A partial fetch of only src/ files must not be unwrapped. */
function fileMapForAssembly(
  rawFiles: Record<string, string>,
  sourceFile: string | undefined,
  sharedFiles: { navbar?: string; footer?: string; pageLayout?: string },
): Record<string, string> {
  const cleaned = cleanProjectFileKeys(rawFiles);
  const unwrapped = normalizeProjectFileMap(rawFiles);
  const needed = [sourceFile, sharedFiles.navbar, sharedFiles.footer, sharedFiles.pageLayout].filter(
    (key): key is string => Boolean(key),
  );
  const hits = (map: Record<string, string>) => needed.filter((key) => map[key] !== undefined).length;
  return hits(cleaned) >= hits(unwrapped) ? cleaned : unwrapped;
}

export function normalizeRoutePath(p: string): string {
  const trimmed = (p || '').trim();
  if (!trimmed || trimmed === '*') return trimmed || '/';
  let normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (normalized !== '/' && !normalized.endsWith('/')) {
    normalized = `${normalized}/`;
  }
  return normalized;
}

function resolveProjectModulePath(
  specifier: string,
  importerPath: string,
  allPaths: Set<string>,
): string | null {
  if (!specifier) return null;
  let base = specifier.trim();
  if (base.startsWith('@/')) {
    base = `src/${base.slice(2)}`;
  } else if (base.startsWith('./') || base.startsWith('../')) {
    const dirParts = importerPath.split('/').slice(0, -1);
    for (const part of base.split('/')) {
      if (part === '.' || !part) continue;
      if (part === '..') dirParts.pop();
      else dirParts.push(part);
    }
    base = dirParts.join('/');
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

interface ParsedImportTarget {
  localName: string;
  specifier: string;
  exportName?: string;
  resolvedPath: string | null;
}

function parseRouterImports(
  routerCode: string,
  routerPath: string,
  allPaths: Set<string>,
): Map<string, ParsedImportTarget> {
  const map = new Map<string, ParsedImportTarget>();

  // 1. const Comp = lazy(() => import("...")) or lazy(() => import("...").then((m) => ({ default: m.Export })))
  const lazyRe =
    /(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)(?:\s*\.then\(\s*\(?[A-Za-z0-9_$]+\)?\s*=>\s*\(\s*\{\s*default:\s*[A-Za-z0-9_$]+\.([A-Za-z0-9_$]+)\s*\}\s*\)\))?\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = lazyRe.exec(routerCode)) !== null) {
    const localName = m[1];
    const specifier = m[2];
    const exportName = m[3];
    map.set(localName, {
      localName,
      specifier,
      exportName,
      resolvedPath: resolveProjectModulePath(specifier, routerPath, allPaths),
    });
  }

  // 2. Static default imports: import Comp from "..."
  const defaultImportRe = /^\s*import\s+([A-Za-z0-9_$]+)\s+from\s+["']([^"']+)["']/gm;
  while ((m = defaultImportRe.exec(routerCode)) !== null) {
    const localName = m[1];
    const specifier = m[2];
    if (!map.has(localName)) {
      map.set(localName, {
        localName,
        specifier,
        resolvedPath: resolveProjectModulePath(specifier, routerPath, allPaths),
      });
    }
  }

  // 3. Static named imports: import { A, B as C } from "..."
  const namedImportRe = /^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm;
  while ((m = namedImportRe.exec(routerCode)) !== null) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const specifier = m[2];
    const resolvedPath = resolveProjectModulePath(specifier, routerPath, allPaths);
    for (const part of names) {
      const aliasMatch = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      const exportName = aliasMatch ? aliasMatch[1] : part;
      const localName = aliasMatch ? aliasMatch[2] : part;
      if (!map.has(localName)) {
        map.set(localName, { localName, specifier, exportName, resolvedPath });
      }
    }
  }

  return map;
}

interface RawRouteEntry {
  path: string;
  componentName: string;
  wrapperComponent?: string;
}

function parseRoutesFromRouter(routerCode: string): RawRouteEntry[] {
  const entries: RawRouteEntry[] = [];
  const seen = new Set<string>();

  // Pattern A: Object route entries { path: "...", element: <Wrapper><Comp /></Wrapper> } or <Comp />
  const objectRouteRe =
    /\{\s*path\s*:\s*["']([^"']+)["']\s*,\s*element\s*:\s*([\s\S]*?)\s*(?:,\s*(?:children|caseSensitive|index)[\s\S]*?)?\}/g;
  let m: RegExpExecArray | null;
  while ((m = objectRouteRe.exec(routerCode)) !== null) {
    const routePath = m[1].trim();
    const elementExpr = m[2].trim();
    const tags = Array.from(elementExpr.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)).map(
      (t) => t[1],
    );
    if (tags.length === 0) continue;
    const wrapperComponent = tags.length > 1 ? tags[0] : undefined;
    const componentName = tags[tags.length - 1];
    const key = `${routePath}::${componentName}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ path: routePath, componentName, wrapperComponent });
    }
  }

  // Pattern B: JSX <Route path="..." element={<Comp />} />
  if (entries.length === 0) {
    const jsxRouteRe =
      /<Route\b[^>]*\bpath=["']([^"']+)["'][^>]*\belement=\{([\s\S]*?)\}/g;
    while ((m = jsxRouteRe.exec(routerCode)) !== null) {
      const routePath = m[1].trim();
      const elementExpr = m[2].trim();
      const tags = Array.from(elementExpr.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)).map(
        (t) => t[1],
      );
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

  preferNestedIndexPages(routerCode, entries);
  expandNamedChildRoutes(routerCode, entries);
  return entries;
}

function elementComponentTags(expr: string): string[] {
  return Array.from(expr.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)).map((tag) => tag[1]);
}

/** A parent route whose element is only the layout should use its index child as the page. */
function preferNestedIndexPages(routerCode: string, entries: RawRouteEntry[]) {
  const re = /path\s*:\s*(['"])([^'"]+)\1/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(routerCode)) !== null) {
    const parentPath = match[2];
    const window = routerCode.slice(match.index, match.index + 6000);
    const childrenAt = window.search(/\bchildren\s*:\s*\[/);
    if (childrenAt < 0) continue;
    const bracketAt = match.index + window.indexOf('[', childrenAt);
    const childrenBlock = sliceBalanced(routerCode, bracketAt, '[', ']');
    const indexAt = childrenBlock.search(/\bindex\s*:\s*true\b/);
    if (indexAt < 0) continue;
    const elementMatch = childrenBlock.slice(indexAt).match(/\belement\s*:\s*([\s\S]*?)\s*(?:,|\})/);
    if (!elementMatch) continue;
    const tags = elementComponentTags(elementMatch[1]);
    if (tags.length === 0) continue;
    const componentName = tags[tags.length - 1];
    const parent = entries.find((entry) => entry.path === parentPath);
    if (!parent || parent.componentName === componentName) continue;
    parent.wrapperComponent = parent.wrapperComponent || parent.componentName;
    parent.componentName = componentName;
  }
}

function expandNamedChildRoutes(routerCode: string, entries: RawRouteEntry[]) {
  const arrays = new Map<string, string>();
  const declRe = /(?:const|let)\s+([A-Za-z_$][\w$]*)\b[^=;]{0,80}=\s*\[/g;
  let decl: RegExpExecArray | null;
  while ((decl = declRe.exec(routerCode)) !== null) {
    const bracketAt = routerCode.indexOf('[', decl.index);
    if (bracketAt < 0) continue;
    arrays.set(decl[1], sliceBalanced(routerCode, bracketAt, '[', ']'));
  }

  const childRefRe = /children\s*:\s*([A-Za-z_$][\w$]*)/g;
  let childRef: RegExpExecArray | null;
  while ((childRef = childRefRe.exec(routerCode)) !== null) {
    const block = arrays.get(childRef[1]);
    if (!block) continue;
    const objectStart = routerCode.lastIndexOf('{', childRef.index);
    const before = routerCode.slice(objectStart, childRef.index);
    const pathMatches = [...before.matchAll(/path\s*:\s*(['"])([^'"]+)\1/g)];
    const parentPath = pathMatches[pathMatches.length - 1]?.[2];
    if (!parentPath) continue;
    const layoutExpr = before.match(/element\s*:\s*([\s\S]*)$/)?.[1] || '';
    const indexAt = block.search(/\bindex\s*:\s*true\b/);
    if (indexAt < 0) continue;
    const elementMatch = block.slice(indexAt).match(/\belement\s*:\s*([\s\S]*?)\s*(?:,|\})/);
    if (!elementMatch) continue;
    const tags = elementComponentTags(elementMatch[1]);
    if (tags.length === 0) continue;
    const componentName = tags[tags.length - 1];
    const layoutTags = elementComponentTags(layoutExpr);
    const layoutName = layoutTags[layoutTags.length - 1];
    const entry = entries.find((item) => item.path === parentPath);
    if (!entry || entry.componentName === componentName) continue;
    entry.wrapperComponent = entry.wrapperComponent || layoutName || entry.componentName;
    entry.componentName = componentName;
  }
}

interface SeoLookupEntry {
  name?: string;
  seoTitle?: string;
  description?: string;
  kind?: string;
}

function parsePageSeoData(seoFileContent: string): Map<string, SeoLookupEntry> {
  const map = new Map<string, SeoLookupEntry>();
  if (!seoFileContent) return map;

  const pathRe = /\bpath\s*:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(seoFileContent)) !== null) {
    const before = seoFileContent.slice(Math.max(0, m.index - 40), m.index);
    // Skip nested parent: { path: '...', name: '...' }
    if (/parent\s*:\s*\{\s*$/i.test(before)) continue;

    // Walk backward to the enclosing '{' of this PageSeo entry
    let openIdx = -1;
    let depth = 0;
    for (let i = m.index; i >= 0; i--) {
      const ch = seoFileContent[i];
      if (ch === '}') depth++;
      else if (ch === '{') {
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

    const name = extractStringProp(block, 'name');
    const seoTitle = extractStringProp(block, 'seoTitle');
    const description = extractStringProp(block, 'description');
    const kind = extractStringProp(block, 'kind');
    map.set(normPath, { name, seoTitle, description, kind });
  }
  return map;
}

function parseArticleRouteExportMap(
  routesCode: string,
): Map<string, { lang: string; slug: string }> {
  const map = new Map<string, { lang: string; slug: string }>();
  if (!routesCode) return map;

  const fnRe =
    /export\s+function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\s*return\s*<MusicArticlePage\b[^>]*lang=["']([^"']+)["'][^>]*slug=["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(routesCode)) !== null) {
    map.set(m[1], { lang: m[2], slug: m[3] });
  }
  // Also handle reversed attribute order (slug before lang)
  const fnRe2 =
    /export\s+function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\s*return\s*<MusicArticlePage\b[^>]*slug=["']([^"']+)["'][^>]*lang=["']([^"']+)["']/g;
  while ((m = fnRe2.exec(routesCode)) !== null) {
    if (!map.has(m[1])) {
      map.set(m[1], { lang: m[3], slug: m[2] });
    }
  }
  return map;
}

export interface ParsedArticleObject {
  slug: string;
  lang?: string;
  path?: string;
  title?: string;
  subtitle?: string;
  category?: string;
  excerpt?: string;
  heroImage?: string;
  heroAlt?: string;
  intro: string[];
  sections: Array<{
    id: string;
    h: string;
    p: string[];
    subs: Array<{ h: string; p: string[] }>;
    listItems: string[];
    imageSrc?: string;
  }>;
  faq: Array<{ q: string; a: string }>;
  closing?: string;
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
    if (ch === '\\') {
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
    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      continue;
    }
    if (inSingle || inDouble || inBacktick) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(openBraceIdx, i + 1);
      }
    }
  }
  return text.slice(openBraceIdx, Math.min(text.length, openBraceIdx + 8000));
}

function extractStringProp(block: string, prop: string): string | undefined {
  const re = new RegExp(
    `\\b${prop}\\s*:\\s*(?:'((?:\\\\'|[^'])*)'|"((?:\\\\"|[^"])*)")`,
    'm',
  );
  const m = block.match(re);
  if (!m) return undefined;
  return (m[1] ?? m[2] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
}

function extractStringArrayProp(block: string, prop: string): string[] {
  const re = new RegExp(`\\b${prop}\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'm');
  const m = block.match(re);
  if (!m) return [];
  const items: string[] = [];
  const itemRe = /'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"/g;
  let sm: RegExpExecArray | null;
  while ((sm = itemRe.exec(m[1])) !== null) {
    const val = (sm[1] ?? sm[2] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
    if (val) items.push(val);
  }
  return items;
}

export function extractArticleObjectBySlug(
  fileContent: string,
  slug: string,
): ParsedArticleObject | null {
  const slugRe = new RegExp(`\\bslug\\s*:\\s*['"]${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
  const match = slugRe.exec(fileContent);
  if (!match) return null;

  // Walk backwards to find the opening '{' of this article export object
  let openIdx = -1;
  let depth = 0;
  for (let i = match.index; i >= 0; i--) {
    const ch = fileContent[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) {
        openIdx = i;
        break;
      }
      depth--;
    }
  }
  if (openIdx < 0) return null;

  const block = extractBalancedObjectFromIndex(fileContent, openIdx);
  const title = extractStringProp(block, 'title');
  const subtitle = extractStringProp(block, 'subtitle');
  const category = extractStringProp(block, 'category');
  const excerpt = extractStringProp(block, 'excerpt');
  const path = extractStringProp(block, 'path');
  const lang = extractStringProp(block, 'lang');
  const heroImage = extractStringProp(block, 'heroImage');
  const heroAlt = extractStringProp(block, 'heroAlt');
  const closing = extractStringProp(block, 'closing');
  const intro = extractStringArrayProp(block, 'intro');

  // Parse sections array
  const sections: ParsedArticleObject['sections'] = [];
  const secStart = block.search(/\bsections\s*:\s*\[/);
  if (secStart >= 0) {
    const bracketIdx = block.indexOf('[', secStart);
    const secRegion = block.slice(bracketIdx);
    const idRe = /\bid\s*:\s*['"]([^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = idRe.exec(secRegion)) !== null) {
      let sOpen = -1;
      for (let j = im.index; j >= 0; j--) {
        if (secRegion[j] === '{') {
          sOpen = j;
          break;
        }
      }
      if (sOpen < 0) continue;
      const secBlock = extractBalancedObjectFromIndex(secRegion, sOpen);
      const h = extractStringProp(secBlock, 'h') || im[1];
      const p = extractStringArrayProp(secBlock, 'p');
      const listItems = extractStringArrayProp(secBlock, 'items');
      const imageSrc = extractStringProp(secBlock, 'src');
      const subs: Array<{ h: string; p: string[] }> = [];
      const subHRe = /\bh\s*:\s*['"]([^'"]+)['"]/g;
      let shm: RegExpExecArray | null;
      while ((shm = subHRe.exec(secBlock)) !== null) {
        if (shm[1] !== h) {
          subs.push({ h: shm[1], p: [] });
        }
      }
      sections.push({ id: im[1], h, p, subs, listItems, imageSrc });
    }
  }

  // Parse FAQ items
  const faq: Array<{ q: string; a: string }> = [];
  const faqStart = block.search(/\bfaq\s*:\s*\[/);
  if (faqStart >= 0) {
    const faqRegion = block.slice(faqStart);
    const qaRe =
      /\bq\s*:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")\s*,\s*\ba\s*:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/g;
    let qm: RegExpExecArray | null;
    while ((qm = qaRe.exec(faqRegion)) !== null) {
      faq.push({
        q: (qm[1] ?? qm[2] ?? '').replace(/\\'/g, "'").trim(),
        a: (qm[3] ?? qm[4] ?? '').replace(/\\'/g, "'").trim(),
      });
    }
  }

  return {
    slug,
    lang,
    path,
    title,
    subtitle,
    category,
    excerpt,
    heroImage,
    heroAlt,
    intro,
    sections,
    faq,
    closing,
  };
}

function indexArticlesMeta(
  fileMap: Record<string, string>,
): Map<string, { title?: string; subtitle?: string; category?: string; path?: string }> {
  const index = new Map<
    string,
    { title?: string; subtitle?: string; category?: string; path?: string }
  >();
  for (const [filePath, content] of Object.entries(fileMap)) {
    if (!/articles\/(zh|en)-\d+\.ts$/i.test(filePath)) continue;
    const slugRe = /\bslug\s*:\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = slugRe.exec(content)) !== null) {
      const slug = m[1];
      const windowSlice = content.slice(Math.max(0, m.index - 120), m.index + 900);
      const title = extractStringProp(windowSlice, 'title');
      const subtitle = extractStringProp(windowSlice, 'subtitle');
      const category = extractStringProp(windowSlice, 'category');
      const path = extractStringProp(windowSlice, 'path');
      const key = `${filePath.includes('/en-') ? 'en' : 'zh'}:${slug}`;
      index.set(key, { title, subtitle, category, path });
      if (!index.has(slug)) {
        index.set(slug, { title, subtitle, category, path });
      }
    }
  }
  return index;
}

function extractPageLayoutProps(code: string): {
  title?: string;
  subtitle?: string;
  description?: string;
  heroImage?: string;
  heroAlt?: string;
  ctaText?: string;
  ctaSecondaryText?: string;
  ctaLink?: string;
  ctaSecondaryLink?: string;
} | null {
  const start = code.indexOf('<PageLayout');
  if (start < 0) return null;
  // Find end of <PageLayout ... >
  let end = -1;
  let braceDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '>' && braceDepth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const tag = code.slice(start, end + 1);
  const readAttr = (attr: string) => {
    const re = new RegExp(`\\b${attr}=(?:"([^"]*)"|'([^']*)'|\\{\`([^\`]*)\`\\}|\\{'([^']*)'\\}|\\{"([^"]*)"\\})`);
    const m = tag.match(re);
    return (m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? m?.[5] ?? '').trim() || undefined;
  };
  return {
    title: readAttr('title'),
    subtitle: readAttr('subtitle'),
    description: readAttr('description'),
    heroImage: readAttr('heroImage'),
    heroAlt: readAttr('heroAlt'),
    ctaText: readAttr('ctaText'),
    ctaSecondaryText: readAttr('ctaSecondaryText'),
    ctaLink: readAttr('ctaLink'),
    ctaSecondaryLink: readAttr('ctaSecondaryLink'),
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
    if (IGNORE_COMPONENT_PATTERNS.some((re) => re.test(localName) || re.test(spec))) {
      continue;
    }
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
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of names) {
      if (/^type\s+/.test(part)) continue;
      const aliasMatch = part.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      const exportName = aliasMatch ? aliasMatch[1] : part;
      const localName = aliasMatch ? aliasMatch[2] : part;
      const looksLikeDataConstant =
        /^[A-Z][A-Z0-9_]{2,}$/.test(exportName) ||
        /items|faq|list|data|cards|testimonials|services/i.test(exportName);
      if (!looksLikeDataConstant) continue;
      const refRe = new RegExp(`\\b${localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
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
  const escapedExport = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (ch === '\\') {
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
    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      continue;
    }
    if (inSingle || inDouble || inBacktick) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const arraySlice = moduleCode.slice(openBracket, i + 1);
        if (arraySlice.length <= 100000) {
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
  depth = 0,
  seenPaths: Set<string> = new Set(),
): string {
  if (seenPaths.has(compPath) || depth > 2) return stripTsImportsAndTypes(compCode);
  seenPaths.add(compPath);
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
  const nested: string[] = [];
  if (depth < 2) {
    for (const child of extractLocalSectionImports(compCode, compPath, allPaths)) {
      if (/^(Navbar|Footer|PageLayout)$/i.test(child.localName)) continue;
      if (seenPaths.has(child.resolvedPath)) continue;
      if (!new RegExp(`<${child.localName}\\b`).test(compCode)) continue;
      const childCode = fileMap[child.resolvedPath];
      if (!childCode || childCode.length > 60000) continue;
      nested.push(
        `/* --- nested ${child.localName} (${child.resolvedPath}) --- */\n${prepareComponentCode(childCode, child.resolvedPath, fileMap, allPaths, depth + 1, seenPaths)}`,
      );
    }
  }
  return [...inlined, ...nested, stripped].filter(Boolean).join('\n\n');
}

function humanizeRouteTitle(routePath: string): string {
  if (routePath === '/' || !routePath) return 'Home';
  const clean = routePath
    .replace(/^\/(en|cn)\//, '/')
    .replace(/^\/|\/$/g, '');
  if (!clean) {
    return routePath.startsWith('/en') ? 'Home (EN)' : routePath.startsWith('/cn') ? '主頁 (簡中)' : 'Home';
  }
  const last = clean.split('/').pop() || clean;
  return last
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

const DYNAMIC_ROUTE_LIMIT = 400;

function isDynamicRoutePath(routePath: string): boolean {
  return routePath.split('/').some((segment) => segment.startsWith(':') || segment === '*');
}

function isConcreteSegment(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 120) return false;
  if (text === 'undefined' || text === 'null' || text === '*' || text.startsWith(':')) return false;
  return !/[\s/?#:\\]|\./.test(text);
}

function routeStaticPrefix(routePath: string): string | null {
  const segments = routePath.split('/').filter(Boolean);
  const dynamicAt = segments.findIndex((segment) => segment.startsWith(':'));
  if (dynamicAt <= 0) return null;
  return `/${segments.slice(0, dynamicAt).join('/')}/`;
}

function trailingParamName(routePath: string): string | null {
  const segments = routePath.split('/').filter(Boolean);
  const dynamic = segments.filter((segment) => segment.startsWith(':'));
  if (dynamic.length !== 1 || !segments[segments.length - 1]?.startsWith(':')) return null;
  return segments[segments.length - 1].slice(1).replace(/\?$/, '') || null;
}

function templatePrefixes(routePath: string): string[] {
  const prefix = routeStaticPrefix(routePath);
  if (!prefix) return [];
  const prefixes = [prefix];
  const stripped = prefix.match(/^\/(?:en|cn)(\/.+)$/);
  if (stripped?.[1]) prefixes.push(stripped[1].endsWith('/') ? stripped[1] : `${stripped[1]}/`);
  return [...new Set(prefixes)];
}

function concretePathMatches(pattern: string, candidate: string): boolean {
  const expected = pattern.split('/').filter(Boolean);
  const actual = normalizeRoutePath(candidate).split('/').filter(Boolean);
  if (expected.length === 0 || expected.length !== actual.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].startsWith(':')) {
      if (!isConcreteSegment(actual[index])) return false;
    } else if (expected[index] !== actual[index]) {
      return false;
    }
  }
  return true;
}

function fillTrailingParam(pattern: string, value: string): string {
  const segments = pattern.split('/');
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].startsWith(':')) {
      segments[index] = value;
      break;
    }
  }
  return normalizeRoutePath(segments.join('/'));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLayoutModule(filePath: string): boolean {
  return /(?:^|\/)(Navbar|Footer|PageLayout|SiteLayout|Header)\.(tsx|jsx|ts|js)$/i.test(filePath);
}

function extractConstArray(moduleCode: string, name: string): string | null {
  const re = new RegExp(
    `(?:export\\s+)?(?:const|let)\\s+${escapeRegExp(name)}\\b[^=;]{0,160}=\\s*\\[`,
  );
  const match = re.exec(moduleCode);
  if (!match) return null;
  const open = match.index + match[0].length - 1;
  const slice = sliceBalanced(moduleCode, open, '[', ']');
  if (!slice.endsWith(']') || slice.length > 200000) return null;
  return slice;
}

function extractDefaultArray(moduleCode: string): string | null {
  const direct = /export\s+default\s*\[/.exec(moduleCode);
  if (direct) {
    const open = direct.index + direct[0].length - 1;
    const slice = sliceBalanced(moduleCode, open, '[', ']');
    if (slice.endsWith(']') && slice.length <= 200000) return slice;
  }
  const named = moduleCode.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/);
  return named ? extractConstArray(moduleCode, named[1]) : null;
}

function resolveArrayText(
  arrayName: string,
  filePath: string,
  fileMap: Record<string, string>,
  allPaths: Set<string>,
): string | null {
  const content = fileMap[filePath] || '';
  const local = extractConstArray(content, arrayName);
  if (local) return local;

  const namedImportRe = /^\s*import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm;
  let match: RegExpExecArray | null;
  while ((match = namedImportRe.exec(content)) !== null) {
    const resolved = resolveProjectModulePath(match[2], filePath, allPaths);
    if (!resolved || !fileMap[resolved]) continue;
    for (const part of match[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const alias = trimmed.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!alias) continue;
      const localName = alias[2] || alias[1];
      if (localName !== arrayName) continue;
      const found = extractConstArray(fileMap[resolved], alias[1]);
      if (found) return found;
    }
  }

  const defaultRe = /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/gm;
  while ((match = defaultRe.exec(content)) !== null) {
    if (match[1] !== arrayName) continue;
    const resolved = resolveProjectModulePath(match[2], filePath, allPaths);
    if (!resolved || !fileMap[resolved]) continue;
    const found = extractDefaultArray(fileMap[resolved]);
    if (found) return found;
  }
  return null;
}

function extractFieldRecords(
  content: string,
  field: string,
): Array<{ value: string; title?: string; description?: string }> {
  const re = new RegExp(
    `\\b${escapeRegExp(field)}\\s*:\\s*(?:'([^']*)'|"([^"]*)"|(\\d+))`,
    'g',
  );
  const records: Array<{ value: string; title?: string; description?: string }> = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!isConcreteSegment(value) || seen.has(value)) continue;
    let openIdx = -1;
    let depth = 0;
    for (let index = match.index; index >= 0; index -= 1) {
      const char = content[index];
      if (char === '}') depth += 1;
      else if (char === '{') {
        if (depth === 0) {
          openIdx = index;
          break;
        }
        depth -= 1;
      }
    }
    let title: string | undefined;
    let description: string | undefined;
    if (openIdx >= 0) {
      const block = extractBalancedObjectFromIndex(content, openIdx);
      const occurrences = block.match(new RegExp(`\\b${escapeRegExp(field)}\\s*:`, 'g'))?.length || 0;
      if (occurrences === 1) {
        title = extractStringProp(block, 'title')
          || extractStringProp(block, 'name')
          || extractStringProp(block, 'label');
        description = extractStringProp(block, 'description') || extractStringProp(block, 'subtitle');
      }
    }
    seen.add(value);
    records.push({ value, title, description });
  }
  return records;
}

function arrayNameBeforeMap(before: string): string | null {
  const mapAt = before.lastIndexOf('.map(');
  if (mapAt < 0) return null;
  const head = before.slice(Math.max(0, mapAt - 240), mapAt);
  const direct = head.match(/([A-Za-z_$][\w$]*)\s*$/);
  if (direct) return direct[1];
  return head.match(/([A-Za-z_$][\w$]*)\s*(?:\?\.)?\.filter\(/)?.[1] || null;
}

interface RouteArrayBinding {
  arrayName: string;
  field: string;
  filePath: string;
}

function filesWithRouteTemplates(
  seeds: string[],
  fileMap: Record<string, string>,
  allPaths: Set<string>,
): string[] {
  const files: string[] = [];
  const seen = new Set<string>();
  const queue = seeds.filter(Boolean).map((filePath) => ({ filePath, depth: 0 }));
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.filePath) || isLayoutModule(current.filePath)) continue;
    const content = fileMap[current.filePath];
    if (!content) continue;
    seen.add(current.filePath);
    files.push(current.filePath);
    if (current.depth >= 2) continue;
    for (const child of extractLocalSectionImports(content, current.filePath, allPaths)) {
      queue.push({ filePath: child.resolvedPath, depth: current.depth + 1 });
    }
  }
  return files;
}

function findRouteArrayBindings(
  files: string[],
  fileMap: Record<string, string>,
  pattern: string,
): RouteArrayBinding[] {
  const bindings: RouteArrayBinding[] = [];
  const seen = new Set<string>();
  const prefixes = templatePrefixes(pattern);
  const paramName = trailingParamName(pattern);
  for (const filePath of files) {
    const content = fileMap[filePath];
    if (!content || content.length > 400000) continue;
    for (const prefix of prefixes) {
      const templateRe = new RegExp(`\`${escapeRegExp(prefix)}\\$\\{([^{}\`]+)\\}`, 'g');
      let match: RegExpExecArray | null;
      while ((match = templateRe.exec(content)) !== null) {
        const expr = match[1].trim();
        const field = expr.match(/^(?:[A-Za-z_$][\w$]*)\??\.([A-Za-z_$][\w$]*)$/)?.[1];
        if (!field) continue;
        const arrayName = arrayNameBeforeMap(content.slice(Math.max(0, match.index - 900), match.index));
        if (!arrayName) continue;
        const key = `${filePath}:${arrayName}:${field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bindings.push({ arrayName, field, filePath });
      }
      const concatRe = new RegExp(
        `["']${escapeRegExp(prefix)}["']\\s*\\+\\s*([A-Za-z_$][\\w$]*)\\??\\.([A-Za-z_$][\\w$]*)`,
        'g',
      );
      while ((match = concatRe.exec(content)) !== null) {
        const key = `${filePath}:${match[1]}:${match[2]}`;
        if (seen.has(key)) continue;
        const before = content.slice(Math.max(0, match.index - 900), match.index);
        if (!new RegExp(`${escapeRegExp(match[1])}\\s*\\)?\\s*=>`).test(before) && !before.includes('.map(')) {
          continue;
        }
        const arrayName = arrayNameBeforeMap(before) || match[1];
        if (!/^[A-Za-z_$][\w$]*$/.test(arrayName) || arrayName === match[1]) continue;
        seen.add(key);
        bindings.push({ arrayName, field: match[2], filePath });
      }
    }
    if (!paramName || filePath !== files[0]) continue;
    const findRe =
      /([A-Za-z_$][\w$]*)\.find\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*\2\??\.([A-Za-z_$][\w$]*)\s*===?\s*(?:[A-Za-z_$][\w$]*\.)?([A-Za-z_$][\w$]*)/g;
    let found: RegExpExecArray | null;
    while ((found = findRe.exec(content)) !== null) {
      if (found[4] !== paramName && found[3] !== paramName) continue;
      const key = `${filePath}:${found[1]}:${found[3]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bindings.push({ arrayName: found[1], field: found[3], filePath });
    }
  }
  return bindings;
}

interface ConcreteRouteHit {
  path: string;
  title?: string;
  description?: string;
}

function addConcreteRoute(
  hits: Map<string, ConcreteRouteHit>,
  pattern: string,
  candidate: string,
  title?: string,
  description?: string,
) {
  if (hits.size >= DYNAMIC_ROUTE_LIMIT) return;
  const path = normalizeRoutePath(candidate);
  if (!concretePathMatches(pattern, path)) return;
  const current = hits.get(path);
  if (!current) {
    hits.set(path, { path, title, description });
    return;
  }
  if (!current.title && title) current.title = title;
  if (!current.description && description) current.description = description;
}

function discoverConcreteRoutes(
  page: ReaddyDiscoveredPage,
  pages: ReaddyDiscoveredPage[],
  fileMap: Record<string, string>,
  allPaths: Set<string>,
  seoMap: Map<string, SeoLookupEntry>,
): ConcreteRouteHit[] {
  const hits = new Map<string, ConcreteRouteHit>();
  const prefix = routeStaticPrefix(page.path);
  const listing = prefix
    ? pages.find((item) => item.path === prefix && item.id !== page.id)
    : undefined;
  const seeds = [page.sourceFile, listing?.sourceFile].filter(
    (filePath): filePath is string => Boolean(filePath && fileMap[filePath]),
  );
  const relatedFiles = filesWithRouteTemplates(seeds, fileMap, allPaths);
  for (const binding of findRouteArrayBindings(relatedFiles, fileMap, page.path)) {
    const arrayText = resolveArrayText(binding.arrayName, binding.filePath, fileMap, allPaths);
    if (!arrayText) continue;
    for (const record of extractFieldRecords(arrayText, binding.field)) {
      addConcreteRoute(
        hits,
        page.path,
        fillTrailingParam(page.path, record.value),
        record.title,
        record.description,
      );
    }
  }

  for (const [seoPath, entry] of seoMap) {
    addConcreteRoute(
      hits,
      page.path,
      seoPath,
      entry.name || entry.seoTitle?.split(/[｜|]/)[0]?.trim(),
      entry.description,
    );
  }

  const literalRe = /['"](\/(?:[A-Za-z0-9_\-\u0080-\uFFFF]+\/?)+)['"]/g;
  const absoluteRe = /https?:\/\/[^/\s"'<>]+(\/(?:[A-Za-z0-9_\-\u0080-\uFFFF]+\/?)+)/g;
  const labelRe = /(?:to|href)=\{?["'](\/[^"'\\]+)["']\}?[^>]*>([^<{][^<]{0,80})</g;
  for (const content of Object.values(fileMap)) {
    if (!content || content.length > 400000) continue;
    for (const expression of [literalRe, absoluteRe, labelRe]) {
      expression.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = expression.exec(content)) !== null) {
        const label = match[2]?.replace(/\s+/g, ' ').trim();
        addConcreteRoute(hits, page.path, match[1], label || undefined);
      }
    }
  }
  return [...hits.values()];
}

function expandDynamicRoutePages(
  pages: ReaddyDiscoveredPage[],
  fileMap: Record<string, string>,
  allPaths: Set<string>,
  seoMap: Map<string, SeoLookupEntry>,
): ReaddyDiscoveredPage[] {
  const taken = new Set(pages.filter((page) => !isDynamicRoutePath(page.path)).map((page) => page.path));
  const expanded: ReaddyDiscoveredPage[] = [];
  for (const page of pages) {
    if (!isDynamicRoutePath(page.path)) {
      expanded.push(page);
      continue;
    }
    const concrete = discoverConcreteRoutes(page, pages, fileMap, allPaths, seoMap);
    let added = 0;
    for (const item of concrete) {
      if (taken.has(item.path)) continue;
      taken.add(item.path);
      added += 1;
      const seo = seoMap.get(item.path);
      expanded.push({
        ...page,
        id: item.path,
        path: item.path,
        title: item.title
          || seo?.name
          || seo?.seoTitle?.split(/[｜|]/)[0]?.trim()
          || humanizeRouteTitle(item.path),
        description: item.description || seo?.description || page.description,
        migrationStatus: 'pending',
        lastError: null,
      });
    }
    if (added === 0) {
      expanded.push({
        ...page,
        migrationStatus: 'skipped',
        lastError: '這是帶 id 的模板頁，原始碼裡找不到可代入的實際 id，所以先略過。',
      });
    }
  }
  return expanded;
}

function detectLocaleFromPath(routePath: string, hasChineseProject: boolean): string {
  if (routePath === '/en' || routePath.startsWith('/en/')) return 'en';
  if (routePath === '/cn' || routePath.startsWith('/cn/')) return 'cn';
  return hasChineseProject ? 'zh' : 'default';
}

function extractTopCategory(routePath: string): string {
  const stripped = routePath.replace(/^\/(en|cn)(?=\/|$)/, '').replace(/^\/+|\/+$/g, '');
  if (!stripped) return 'home';
  return stripped.split('/')[0] || 'home';
}

export function analyzeReaddyFileMap(
  rawFiles: Record<string, string>,
  options: {
    sourceType: SourceType;
    projectName?: string;
    allTreePaths?: string[];
    githubMeta?: ReaddyProjectAnalysis['githubMeta'];
    storageBundlePath?: string | null;
    assetUrlMap?: Record<string, string>;
    uploadedAssetCount?: number;
  },
): ReaddyProjectAnalysis {
  const fileMap = normalizeProjectFileMap(rawFiles);
  const allPaths = new Set<string>([
    ...Object.keys(fileMap),
    ...(options.allTreePaths || []).map((p) => p.replace(/^\.?\/+/, '').replace(/\\/g, '/')),
  ]);

  const indexHtml = fileMap['index.html'] || '';
  const pkgRaw = fileMap['package.json'] || '';
  let pkgName = '';
  try {
    const pkgJson = JSON.parse(pkgRaw) as { name?: string };
    pkgName = pkgJson?.name || '';
  } catch {
    // ignore
  }
  const htmlTitleMatch = indexHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const projectName =
    htmlTitleMatch?.[1]?.split(/[｜|]/)[0]?.trim() ||
    options.githubMeta?.repo ||
    options.projectName ||
    (pkgName && pkgName !== 'starter' ? pkgName : '') ||
    'Readdy Project';

  const hasChineseProject = /[\u4e00-\u9fff]/.test(indexHtml + (fileMap['src/lib/pageSeoData.ts'] || ''));
  const canonicalTag = indexHtml.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0];
  const sourceUrl = canonicalTag?.match(/\bhref=["'](https:\/\/[^"']+)/i)?.[1]
    || (fileMap['public/sitemap.xml'] || fileMap['sitemap.xml'])?.match(/<loc>\s*(https:\/\/[^<\s]+)/i)?.[1];
  const sourceOrigin = sourceUrl?.match(/^https:\/\/[^/?#]+/i)?.[0];

  const indexCssPath =
    ['src/index.css', 'src/App.css', 'src/styles/globals.css'].find((p) => p in fileMap) ||
    Array.from(allPaths).find((p) => /(^|\/)index\.css$/i.test(p));
  const cssTokens = parseCssTokensFromStylesheet(
    indexCssPath ? fileMap[indexCssPath] || '' : '',
  );

  const tailwindPath = Array.from(allPaths).find((p) =>
    /^tailwind\.config\.(ts|js|mjs|cjs)$/i.test(p),
  );
  const tailwindConfig = tailwindPath ? fileMap[tailwindPath] ?? null : null;

  const routerFile =
    ['src/router/config.tsx', 'src/router/config.ts', 'src/router/index.tsx', 'src/App.tsx'].find(
      (p) => p in fileMap,
    ) || null;

  const seoDataPath = Array.from(allPaths).find((p) => /(^|\/)pageSeoData\.(ts|tsx)$/i.test(p));
  const seoMap = parsePageSeoData(seoDataPath ? fileMap[seoDataPath] || '' : '');

  const articleRouteMaps = new Map<string, Map<string, { lang: string; slug: string }>>();
  for (const [p, content] of Object.entries(fileMap)) {
    if (/articles\/routes-(zh|en)\.(tsx|ts)$/i.test(p)) {
      articleRouteMaps.set(p, parseArticleRouteExportMap(content));
    }
  }
  const articlesMeta = indexArticlesMeta(fileMap);

  const sharedFiles: ReaddyProjectAnalysis['sharedFiles'] = {
    navbar: Array.from(allPaths).find((p) => /components\/.*Navbar\.(tsx|jsx)$/i.test(p)),
    footer: Array.from(allPaths).find((p) => /components\/.*Footer\.(tsx|jsx)$/i.test(p)),
    pageLayout: Array.from(allPaths).find((p) => /components\/.*PageLayout\.(tsx|jsx)$/i.test(p)),
    indexCss: indexCssPath,
    tailwindConfig: tailwindPath,
    seoData: seoDataPath,
  };

  const pages: ReaddyDiscoveredPage[] = [];

  if (routerFile && fileMap[routerFile]) {
    const routerCode = fileMap[routerFile];
    const importMap = parseRouterImports(routerCode, routerFile, allPaths);
    const routeEntries = parseRoutesFromRouter(routerCode);

    for (const entry of routeEntries) {
      if (entry.path === '*') continue;
      const normPath = normalizeRoutePath(entry.path);
      const target = importMap.get(entry.componentName);
      const sourceFile = target?.resolvedPath || '';
      const locale = detectLocaleFromPath(normPath, hasChineseProject);
      const isCnMirror =
        normPath.startsWith('/cn/') ||
        entry.wrapperComponent === 'SimplifiedChineseProvider';

      // Check if article route wrapper
      let articleSlug: string | undefined;
      let articleLang: string | undefined;
      if (sourceFile && articleRouteMaps.has(sourceFile) && target?.exportName) {
        const artRef = articleRouteMaps.get(sourceFile)?.get(target.exportName);
        if (artRef) {
          articleSlug = artRef.slug;
          articleLang = artRef.lang;
        }
      }

      // Resolve SEO / title metadata
      const baseZhPath = isCnMirror && normPath.startsWith('/cn/')
        ? normalizeRoutePath(normPath.slice(3))
        : normPath;
      const seoEntry = seoMap.get(normPath) || (isCnMirror ? seoMap.get(baseZhPath) : undefined);
      const artMeta = articleSlug
        ? articlesMeta.get(`${articleLang || 'zh'}:${articleSlug}`) || articlesMeta.get(articleSlug)
        : undefined;

      const sourceContent = sourceFile ? fileMap[sourceFile] : undefined;
      const layoutProps = sourceContent ? extractPageLayoutProps(sourceContent) : null;
      const sectionImports =
        sourceContent && sourceFile
          ? extractLocalSectionImports(sourceContent, sourceFile, allPaths)
              .filter((imp) => /sections\//i.test(imp.resolvedPath))
              .map((imp) => imp.localName)
          : [];

      let pageKind: ReaddyPageKind = 'page';
      if (isCnMirror) pageKind = 'locale-mirror';
      else if (articleSlug) pageKind = 'article';
      else if (normPath === '/' || normPath === '/en/') pageKind = 'home';
      else if (layoutProps || (sourceContent && /<PageLayout\b/.test(sourceContent))) {
        pageKind = 'layout-page';
      }

      const title =
        artMeta?.title ||
        seoEntry?.name ||
        layoutProps?.title ||
        seoEntry?.seoTitle?.split(/[｜|]/)[0]?.trim() ||
        humanizeRouteTitle(normPath);

      const description =
        artMeta?.subtitle ||
        seoEntry?.description ||
        layoutProps?.subtitle ||
        layoutProps?.description;

      pages.push({
        id: normPath,
        path: normPath,
        title: isCnMirror && !normPath.startsWith('/en/') ? `${title}` : title,
        description,
        locale,
        pageKind,
        componentName: entry.componentName,
        sourceFile: sourceFile || entry.componentName,
        wrapperComponent: entry.wrapperComponent,
        articleSlug,
        articleLang,
        sectionHints: sectionImports.length > 0 ? sectionImports : undefined,
        category: extractTopCategory(normPath),
        migrationStatus: 'pending',
      });
    }
  }

  // Fallback when no router config or single-file project
  if (pages.length === 0) {
    const candidateFiles = Array.from(allPaths)
      .filter((p) => {
        const lower = p.toLowerCase();
        if (lower.includes('node_modules/') || lower.startsWith('dist/')) return false;
        if (/\/sections\//i.test(lower) || /components\//i.test(lower)) return false;
        return /(page|landingpage|index)\.(tsx|jsx|html)$/i.test(lower) || lower.startsWith('src/pages/');
      })
      .sort();

    const chosen = candidateFiles.length > 0 ? candidateFiles : Object.keys(fileMap);
    for (const filePath of chosen) {
      const content = fileMap[filePath] || '';
      const isHome = /home\/page|landingpage|app\.tsx|index\.html/i.test(filePath);
      const derivedPath = isHome
        ? '/'
        : normalizeRoutePath(
            filePath
              .replace(/^src\/pages\//i, '/')
              .replace(/\/page\.(tsx|jsx)$/i, '/')
              .replace(/\.(tsx|jsx|html)$/i, '/'),
          );
      const layoutProps = extractPageLayoutProps(content);
      const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const h1Clean = h1Match?.[1]?.replace(/<[^>]+>/g, '').trim();
      const title = layoutProps?.title || h1Clean || humanizeRouteTitle(derivedPath);

      pages.push({
        id: derivedPath,
        path: derivedPath,
        title,
        description: layoutProps?.subtitle,
        locale: detectLocaleFromPath(derivedPath, /[\u4e00-\u9fff]/.test(content)),
        pageKind: chosen.length === 1 ? 'single-file' : isHome ? 'home' : 'page',
        componentName: filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Page',
        sourceFile: filePath,
        category: extractTopCategory(derivedPath),
        migrationStatus: 'pending',
      });
    }
  }

  const discoveredPages = expandDynamicRoutePages(pages, fileMap, allPaths, seoMap);

  const localeCounts: Record<string, number> = {};
  const kindCounts: Record<string, number> = {};
  for (const p of discoveredPages) {
    localeCounts[p.locale] = (localeCounts[p.locale] || 0) + 1;
    kindCounts[p.pageKind] = (kindCounts[p.pageKind] || 0) + 1;
  }

  const projectKey =
    options.githubMeta?.full_name
      ? `gh:${options.githubMeta.full_name}:${options.githubMeta.branch}`
      : `proj:${projectName}:${discoveredPages.length}`;

  return {
    projectKey,
    projectName,
    sourceOrigin,
    sourceType: options.sourceType,
    framework: routerFile ? 'React + Vite + React Router' : 'React / HTML',
    routerFile,
    totalFiles: allPaths.size,
    pages: discoveredPages,
    localeCounts,
    kindCounts,
    sharedFiles,
    cssTokens,
    tailwindConfig,
    githubMeta: options.githubMeta,
    storageBundlePath: options.storageBundlePath,
    assetUrlMap: options.assetUrlMap,
    uploadedAssetCount: options.uploadedAssetCount,
  };
}

function stripTsImportsAndTypes(code: string): string {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, '')
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, '')
    .trim();
}

function stripBracketProperty(source: string, propName: string): string {
  let out = '';
  let i = 0;
  const keyRe = new RegExp(`\\b${propName}\\s*:\\s*\\[`, 'g');
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
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (!inDouble && ch === "'") inSingle = !inSingle;
      else if (!inSingle && ch === '"') inDouble = !inDouble;
      else if (!inSingle && !inDouble) {
        if (ch === '[') depth++;
        else if (ch === ']') {
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

type LabeledHref = { label: string; href: string };

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;');
}

function anchorTag(link: LabeledHref): string {
  return `<a href="${escapeHtmlAttr(link.href)}">${escapeHtmlText(link.label)}</a>`;
}

function sliceBalanced(code: string, openIndex: number, openChar: string, closeChar: string): string {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;
  for (let i = openIndex; i < code.length; i++) {
    const ch = code[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
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
    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      continue;
    }
    if (inSingle || inDouble || inBacktick) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return code.slice(openIndex, i + 1);
    }
  }
  return code.slice(openIndex);
}

type MapItem = { text?: string; fields: Record<string, string> };

function findQuoteUrl(fileMap: Record<string, string>): string | undefined {
  for (const content of Object.values(fileMap)) {
    const match = content.match(/const\s+QUOTE_URL\s*=\s*['"]([^'"]+)['"]/);
    if (match) return match[1];
  }
  return undefined;
}

function resolveCtaHref(href: string | undefined, quoteUrl: string | undefined): string | undefined {
  const raw = (href || '').trim();
  if (!raw || raw === '#' || raw === '/online-quotation/') return quoteUrl;
  return raw;
}

function readJsxElementEnd(code: string, start: number): number {
  if (code[start] !== '<') return -1;
  const nameMatch = /^<([A-Za-z][\w.]*)/.exec(code.slice(start));
  if (!nameMatch) return -1;
  const tag = nameMatch[1];
  let i = start + nameMatch[0].length;
  let braceDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;
  let selfClosing = false;
  for (; i < code.length; i++) {
    const ch = code[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '>' && braceDepth === 0) {
        selfClosing = code[i - 1] === '/';
        i++;
        break;
      }
    }
  }
  if (selfClosing || /^(img|br|hr|input)$/i.test(tag)) return i;
  const close = `</${tag}>`;
  let depth = 1;
  while (i < code.length && depth > 0) {
    const nextOpen = code.indexOf(`<${tag}`, i);
    const nextClose = code.indexOf(close, i);
    if (nextClose < 0) return -1;
    const boundary = nextOpen >= 0 && nextOpen < nextClose ? code[nextOpen + tag.length + 1] : '';
    const isTag = boundary === '>' || boundary === '/' || boundary === ' ' || boundary === '\n' || boundary === '\t' || boundary === '\r';
    if (nextOpen >= 0 && nextOpen < nextClose && isTag) {
      depth++;
      i = nextOpen + tag.length + 1;
      continue;
    }
    if (nextOpen >= 0 && nextOpen < nextClose) {
      i = nextOpen + tag.length + 1;
      continue;
    }
    depth--;
    i = nextClose + close.length;
  }
  return i;
}

function splitTopLevelJsx(source: string): string[] {
  const blocks: string[] = [];
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i++;
    if (source.startsWith('{/*', i)) {
      const end = source.indexOf('*/}', i + 3);
      i = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source[i] !== '<') {
      const next = source.indexOf('<', i + 1);
      i = next < 0 ? source.length : next;
      continue;
    }
    const end = readJsxElementEnd(source, i);
    if (end < 0 || end <= i) break;
    const text = source.slice(i, end).trim();
    if (text) blocks.push(text);
    i = end;
  }
  return blocks;
}

function extractPageLayoutChildren(code: string): string {
  const start = code.indexOf('<PageLayout');
  if (start < 0) return '';
  const end = readJsxElementEnd(code, start);
  if (end < 0) return '';
  const element = code.slice(start, end);
  if (element.endsWith('/>')) return '';
  let openEnd = -1;
  let braceDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;
  for (let i = 0; i < element.length; i++) {
    const ch = element[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '>' && braceDepth === 0) {
        openEnd = i;
        break;
      }
    }
  }
  const close = '</PageLayout>';
  if (openEnd < 0 || !element.endsWith(close)) return '';
  return element.slice(openEnd + 1, element.length - close.length);
}

function collectLocalDeclarations(code: string): Array<{ name: string; code: string }> {
  const exportAt = code.search(/\bexport\s+default\b/);
  const head = exportAt >= 0 ? code.slice(0, exportAt) : code;
  const decls: Array<{ name: string; code: string }> = [];
  const re = /(^|\n)([ \t]*)(?:const|function)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(head)) !== null) {
    const start = match.index + match[1].length;
    const name = match[3];
    if (/^\s*function\b/.test(head.slice(start))) {
      const brace = head.indexOf('{', start);
      if (brace < 0) continue;
      const body = sliceBalanced(head, brace, '{', '}');
      decls.push({ name, code: head.slice(start, brace + body.length).trim() });
      re.lastIndex = brace + body.length;
    } else {
      const eq = head.indexOf('=', start);
      if (eq < 0) continue;
      let j = eq + 1;
      while (j < head.length && /\s/.test(head[j])) j++;
      let end = j;
      if (head[j] === '[' || head[j] === '{') {
        const balanced = sliceBalanced(head, j, head[j], head[j] === '[' ? ']' : '}');
        end = j + balanced.length;
        if (head[end] === ';') end++;
      } else {
        while (end < head.length && head[end] !== ';' && head[end] !== '\n') end++;
        if (head[end] === ';') end++;
      }
      decls.push({ name, code: head.slice(start, end).trim() });
      re.lastIndex = end;
    }
  }
  return decls;
}

function attachReferencedDeclarations(block: string, decls: Array<{ name: string; code: string }>): string {
  const included = new Set<string>();
  const pending = [block];
  const chunks: string[] = [];
  while (pending.length > 0) {
    const text = pending.pop() || '';
    for (const decl of decls) {
      if (included.has(decl.name)) continue;
      if (new RegExp(`\\b${decl.name}\\b`).test(text)) {
        included.add(decl.name);
        chunks.push(decl.code);
        pending.push(decl.code);
      }
    }
  }
  return [...chunks, block].join('\n\n');
}

function parseConstArrayItems(declCode: string): MapItem[] | null {
  const bracket = declCode.indexOf('[');
  if (bracket < 0) return null;
  const arrayCode = sliceBalanced(declCode, bracket, '[', ']');
  const inner = arrayCode.slice(1, arrayCode.endsWith(']') ? -1 : arrayCode.length);
  const items: MapItem[] = [];
  let i = 0;
  while (i < inner.length && items.length < 40) {
    while (i < inner.length && /[\s,]/.test(inner[i])) i++;
    if (i >= inner.length) break;
    const quote = inner[i];
    if (quote === "'" || quote === '"') {
      let j = i + 1;
      let text = '';
      while (j < inner.length) {
        if (inner[j] === '\\') {
          text += inner[j + 1] || '';
          j += 2;
          continue;
        }
        if (inner[j] === quote) break;
        text += inner[j];
        j++;
      }
      items.push({ text, fields: {} });
      i = j + 1;
      continue;
    }
    if (inner[i] === '{') {
      const obj = sliceBalanced(inner, i, '{', '}');
      const fields: Record<string, string> = {};
      const fieldRe = /\b([A-Za-z_$][\w$]*)\s*:\s*(['"])([\s\S]*?)\2/g;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = fieldRe.exec(obj)) !== null) {
        fields[fieldMatch[1]] = fieldMatch[3].replace(/\\'/g, "'").replace(/\\"/g, '"');
      }
      if (Object.keys(fields).length > 0) items.push({ fields });
      i += obj.length;
      continue;
    }
    break;
  }
  return items.length > 0 ? items : null;
}

function fillMapTemplate(template: string, param: string, item: MapItem, index: number): string {
  let out = template.replace(/\bkey=\{[^}]+\}/g, `key="${index}"`);
  if (item.text !== undefined) {
    return out.replace(new RegExp(`\\{${param}\\}`, 'g'), escapeHtmlText(item.text));
  }
  for (const [key, value] of Object.entries(item.fields)) {
    out = out.replace(
      new RegExp(`\\b(to|href|src)=\\{${param}\\.${key}\\}`, 'g'),
      (_, attr: string) => `${attr}="${escapeHtmlAttr(value)}"`,
    );
    out = out.replace(new RegExp(`\\{${param}\\.${key}\\}`, 'g'), escapeHtmlText(value));
  }
  return out;
}

function expandMappedArray(code: string, arrayCode: string, callParen: number): { rendered: string; end: number } | null {
  const items = parseConstArrayItems(`const items = ${arrayCode}`);
  if (!items) return null;
  const args = sliceBalanced(code, callParen, '(', ')');
  const arrow = args.match(/\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*[A-Za-z_$][\w$]*)?\s*\)\s*=>\s*\(/);
  if (!arrow) return null;
  const parenAt = args.indexOf('(', args.indexOf('=>'));
  if (parenAt < 0) return null;
  const inner = sliceBalanced(args, parenAt, '(', ')');
  const template = inner.slice(1, -1);
  const rendered = items
    .slice(0, 24)
    .map((item, index) => fillMapTemplate(template, arrow[1], item, index))
    .join('\n');
  let end = callParen + args.length;
  while (end < code.length && /\s/.test(code[end])) end++;
  if (code[end] !== '}') return null;
  return { rendered, end: end + 1 };
}

function expandArrayMaps(code: string): string {
  const arrays = new Map<string, string>();
  for (const decl of collectLocalDeclarations(code)) {
    if (decl.code.startsWith('const') && decl.code.includes('[')) arrays.set(decl.name, decl.code);
  }
  let out = '';
  let cursor = 0;
  const namedRe = /\{(\s*)([A-Za-z_$][\w$]*)\.map\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = namedRe.exec(code)) !== null) {
    const declCode = arrays.get(match[2]);
    if (!declCode) continue;
    const callParen = match.index + match[0].length - 1;
    const expanded = expandMappedArray(code, declCode.slice(declCode.indexOf('[')), callParen);
    if (!expanded) continue;
    out += code.slice(cursor, match.index) + expanded.rendered;
    cursor = expanded.end;
    namedRe.lastIndex = expanded.end;
  }
  out += code.slice(cursor);
  let inlineOut = '';
  let i = 0;
  while (i < out.length) {
    const brace = out.indexOf('{', i);
    if (brace < 0) {
      inlineOut += out.slice(i);
      break;
    }
    let j = brace + 1;
    while (j < out.length && /\s/.test(out[j])) j++;
    if (out[j] !== '[') {
      inlineOut += out.slice(i, brace + 1);
      i = brace + 1;
      continue;
    }
    const arrayCode = sliceBalanced(out, j, '[', ']');
    const after = j + arrayCode.length;
    const mapMatch = /^\s*\.map\s*\(/.exec(out.slice(after));
    if (!mapMatch) {
      inlineOut += out.slice(i, brace + 1);
      i = brace + 1;
      continue;
    }
    const callParen = after + mapMatch[0].length - 1;
    const expanded = expandMappedArray(out, arrayCode, callParen);
    if (!expanded) {
      inlineOut += out.slice(i, brace + 1);
      i = brace + 1;
      continue;
    }
    inlineOut += out.slice(i, brace) + expanded.rendered;
    i = expanded.end;
  }
  return inlineOut;
}

function sectionNameFromJsx(jsx: string, index: number): string {
  const heading = jsx.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i);
  const text = heading ? heading[1].replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (text) return text.slice(0, 48);
  const component = jsx.match(/<([A-Z][A-Za-z0-9]*)\b/);
  if (component) return component[1];
  return `頁面內容 ${index + 1}`;
}

function buildPageLayoutBodyBlocks(pageCode: string): Array<{ name: string; code: string }> {
  const children = extractPageLayoutChildren(pageCode);
  if (!children.trim()) return [];
  const decls = collectLocalDeclarations(pageCode);
  return splitTopLevelJsx(children).map((part, index) => {
    const code = expandArrayMaps(attachReferencedDeclarations(part, decls));
    const name = sectionNameFromJsx(code, index).replace(/\*/g, '').trim() || `頁面內容 ${index + 1}`;
    return { name, code };
  });
}

function localeArraySlice(code: string, locale: string): string {
  const key = locale === 'en' ? 'en' : 'zh';
  const match = new RegExp(`\\b${key}\\s*:\\s*\\[`).exec(code);
  if (!match || match.index === undefined) return '';
  return sliceBalanced(code, match.index + match[0].length - 1, '[', ']');
}

function extractLabeledHrefs(code: string, limit: number): LabeledHref[] {
  const re = /label:\s*['"]([^'"]+)['"]\s*,\s*path:\s*['"]([^'"]+)['"]/g;
  const out: LabeledHref[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null && out.length < limit) {
    const label = match[1].trim();
    const href = match[2].trim();
    const key = `${label}|${href}`;
    if (!label || !href || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, href });
  }
  return out;
}

function extractLocaleLabelPaths(code: string, locale: string, limit: number): LabeledHref[] {
  const key = locale === 'en' ? 'en' : 'zh';
  const re = new RegExp(
    `${key}\\s*:\\s*\\{\\s*label\\s*:\\s*['"]([^'"]+)['"]\\s*,\\s*path\\s*:\\s*['"]([^'"]+)['"]`,
    'g',
  );
  const out: LabeledHref[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null && out.length < limit) {
    const label = match[1].trim();
    const href = match[2].trim();
    if (!label || !href || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, href });
  }
  return out;
}

function extractFooterColumns(
  code: string,
  locale: string,
): Array<{ title: string; links: LabeledHref[] }> {
  const block = localeArraySlice(code, locale) || code;
  const headings = [...block.matchAll(/heading:\s*['"]([^'"]+)['"]/g)];
  if (headings.length === 0) {
    const links = extractLabeledHrefs(block, 24);
    return links.length ? [{ title: locale === 'en' ? 'Links' : '連結', links }] : [];
  }
  const columns: Array<{ title: string; links: LabeledHref[] }> = [];
  for (let i = 0; i < headings.length && columns.length < 6; i++) {
    const start = headings[i].index ?? 0;
    const end = i + 1 < headings.length ? (headings[i + 1].index ?? block.length) : block.length;
    const links = extractLabeledHrefs(block.slice(start, end), 14);
    if (links.length > 0) columns.push({ title: headings[i][1], links });
  }
  return columns;
}

function synthesizeCondensedNavbar(
  navbarCode: string | undefined,
  locale: string,
  isHome = false,
): string {
  const isEn = locale === 'en';
  const labels: string[] = [];
  const ctaLabels: string[] = [];
  let brand = 'BW Event Music';
  let brandSubtitle = isEn ? 'Hong Kong Event Music' : '香港音樂娛樂活動統籌中心';

  if (navbarCode) {
    const mainNavStart = navbarCode.search(/\bmainNavItems\b/);
    const mainNavEnd = navbarCode.search(/\bctaItems\b/);
    const navSlice =
      mainNavStart >= 0
        ? navbarCode.slice(mainNavStart, mainNavEnd > mainNavStart ? mainNavEnd : mainNavStart + 9000)
        : navbarCode;
    const topLevelOnly = stripBracketProperty(navSlice, 'children');
    labels.push(...extractLocaleLabelPaths(topLevelOnly, locale, 16).map((item) => item.label));

    if (mainNavEnd >= 0) {
      const ctaSlice = navbarCode.slice(mainNavEnd, mainNavEnd + 2500);
      ctaLabels.push(...extractLocaleLabelPaths(ctaSlice, locale, 2).map((item) => item.label));
    }

    const brandMatch = navbarCode.match(/>\s*(BW Event Music)\s*</);
    if (brandMatch) brand = brandMatch[1];
    if (!isEn) {
      const subMatch = navbarCode.match(/>\s*(香港音樂娛樂活動統籌中心)\s*</);
      if (subMatch) brandSubtitle = subMatch[1];
    }
  }

  const sourcedLinks = navbarCode
    ? extractLocaleLabelPaths(
        stripBracketProperty(
          navbarCode.slice(
            Math.max(0, navbarCode.search(/\bmainNavItems\b/)),
            navbarCode.search(/\bctaItems\b/) >= 0
              ? navbarCode.search(/\bctaItems\b/)
              : navbarCode.search(/\bmainNavItems\b/) + 9000,
          ),
          'children',
        ),
        locale,
        16,
      )
    : [];
  const sourcedCtas =
    navbarCode && navbarCode.search(/\bctaItems\b/) >= 0
      ? extractLocaleLabelPaths(navbarCode.slice(navbarCode.search(/\bctaItems\b/), navbarCode.search(/\bctaItems\b/) + 2500), locale, 2)
      : [];
  const finalLinks =
    sourcedLinks.length > 0
      ? sourcedLinks
      : (labels.length > 0 ? labels : isEn
          ? ['Home', 'Services', 'Weddings', 'Dinner', 'Contact']
          : ['主頁', '服務一覽', '婚禮演出', '周年晚宴', '聯絡我們']
        ).map((label) => ({ label, href: '#' }));
  const finalCtas =
    sourcedCtas.length > 0
      ? sourcedCtas
      : (ctaLabels.length > 0 ? ctaLabels : isEn ? ['Get a Quote', 'Contact'] : ['網上報價', '聯絡我們']).map(
          (label) => ({ label, href: '#' }),
        );

  const headerClasses = isHome
    ? 'bg-transparent text-background-50 px-6 py-4 flex items-center justify-between'
    : 'bg-background-50 text-foreground-950 px-6 py-4 flex items-center justify-between';

  return `<header className="${headerClasses}">
  <div data-brand-wrap="true">
    <span data-brand="true">${brand}</span>
    <small data-brand-subtitle="true">${brandSubtitle}</small>
  </div>
  <nav>${finalLinks.map((link) => anchorTag(link)).join('\n      ')}</nav>
  <div data-cta="true">
    ${finalCtas.map((link) => anchorTag(link)).join('\n    ')}
  </div>
</header>`;
}

function sliceAssignedValue(code: string, name: string): string {
  const match = new RegExp(`(?:const|let)\\s+${name}\\b[^=]*=\\s*([\\[{])`).exec(code);
  if (!match || match.index === undefined) return '';
  const open = match[1];
  return sliceBalanced(code, match.index + match[0].length - 1, open, open === '[' ? ']' : '}');
}

function readStringField(block: string, field: string): string | undefined {
  const match = block.match(new RegExp(`\\b${field}\\s*:\\s*(['"])([\\s\\S]*?)\\1`));
  return match?.[2]?.replace(/\\n/g, ' ').trim() || undefined;
}

function firstTextAnchor(code: string | undefined, hrefPattern: string): LabeledHref | undefined {
  if (!code) return undefined;
  const re = new RegExp(`<a\\b[^>]*href=["'](${hrefPattern})["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    const label = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (label) return { label, href: match[1] };
  }
  return undefined;
}

function localeRecordSlice(block: string, locale: string): string {
  const key = locale === 'en' ? 'en' : 'zh';
  const match = new RegExp(`\\b${key}\\s*:\\s*\\{`).exec(block);
  if (!match || match.index === undefined) return '';
  return sliceBalanced(block, match.index + match[0].length - 1, '{', '}');
}

function synthesizeCondensedFooter(footerCode: string | undefined, locale: string): string {
  const isEn = locale === 'en';
  const columns = footerCode ? extractFooterColumns(footerCode, locale) : [];
  const quoteUrl = footerCode?.match(/const\s+QUOTE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const copy = footerCode ? localeRecordSlice(sliceAssignedValue(footerCode, 'copy'), locale) : '';
  const tagline = readStringField(copy, 'tagline');
  const quoteCta = readStringField(copy, 'quoteCta');
  const contactCta = readStringField(copy, 'contactCta');
  const contactTitle = readStringField(copy, 'contactHeading') || (isEn ? 'Contact Us' : '聯絡我們');
  const quickTitle = readStringField(copy, 'quickHeading') || (isEn ? 'Quick Links' : '快速連結');
  const address = readStringField(copy, 'address');
  const rights = readStringField(copy, 'rights') || (isEn ? 'All rights reserved.' : '保留所有權利.');
  const contactPath = isEn ? '/en/contact/' : '/contact/';
  const quickBlock = footerCode ? localeArraySlice(sliceAssignedValue(footerCode, 'quickLinks'), locale) : '';
  const quickLinks = extractLabeledHrefs(quickBlock, 8);
  const quoteLabel = quickBlock.match(/label:\s*['"]([^'"]+)['"]\s*,\s*path:\s*QUOTE_URL/)?.[1];
  if (quoteLabel && quoteUrl && !quickLinks.some((link) => link.label === quoteLabel)) {
    quickLinks.push({ label: quoteLabel, href: quoteUrl });
  }
  const phone = firstTextAnchor(footerCode, 'tel:[^"\']+');
  const whatsapp = firstTextAnchor(footerCode, 'https:\\/\\/wa\\.me\\/[^"\']+');
  const email = firstTextAnchor(footerCode, 'mailto:[^"\']+');
  const contactLines: LabeledHref[] = [phone, whatsapp, email].filter((link): link is LabeledHref => Boolean(link));
  const fallback: LabeledHref[] = (isEn
    ? [
        ['Services', '/services/'],
        ['Weddings', '/wedding-performance/'],
        ['Annual Dinner', '/annual-dinner/'],
        ['Music Insights', '/music-insights/'],
        ['Contact', '/contact/'],
      ]
    : [
        ['服務一覽', '/services/'],
        ['婚禮演出', '/wedding-performance/'],
        ['周年晚宴', '/annual-dinner/'],
        ['音樂資訊', '/music-insights/'],
        ['聯絡我們', '/contact/'],
      ]
  ).map(([label, href]) => ({ label, href }));
  const columnHtml =
    columns.length > 0
      ? columns
          .map(
            (column) =>
              `<div><h3>${escapeHtmlText(column.title)}</h3>\n  ${column.links.map((link) => anchorTag(link)).join('\n  ')}</div>`,
          )
          .join('\n  ')
      : `<div><h3>${isEn ? 'Links' : '連結'}</h3>\n  ${fallback.map((link) => anchorTag(link)).join('\n  ')}</div>`;
  const brandActions = [
    quoteCta && quoteUrl ? anchorTag({ label: quoteCta, href: quoteUrl }) : '',
    contactCta ? anchorTag({ label: contactCta, href: contactPath }) : '',
  ].filter(Boolean);
  return `<footer className="bg-background-100 text-foreground-950 px-8 py-10">
  <!-- footer-brand -->
  <span>BW Event Music</span>
  ${tagline ? `<p>${escapeHtmlText(tagline)}</p>` : ''}
  ${brandActions.join('\n  ')}
  <!-- footer-contact -->
  <h3>${escapeHtmlText(contactTitle)}</h3>
  ${contactLines.map((link) => anchorTag(link)).join('\n  ')}
  ${address ? `<p>${escapeHtmlText(address)}</p>` : ''}
  <!-- footer-quick -->
  <h3>${escapeHtmlText(quickTitle)}</h3>
  ${quickLinks.map((link) => anchorTag(link)).join('\n  ')}
  <!-- footer-groups -->
  ${columnHtml}
  <!-- footer-bar -->
  <p>© 2026 BW Event Music. ${escapeHtmlText(rights)}</p>
  <p>BW Solution Ltd.</p>
</footer>`;
}

function buildArticleAssembledTsx(
  page: ReaddyDiscoveredPage,
  article: ParsedArticleObject | null,
  navbarCode: string | undefined,
  footerCode: string | undefined,
): string {
  const title = article?.title || page.title;
  const subtitle = article?.subtitle || page.description || '';
  const blocks: string[] = [
    `/* === PAGE META: path="${page.path}" title="${title}" locale="${page.locale}" === */`,
  ];

  const nav = synthesizeCondensedNavbar(navbarCode, page.locale);
  if (nav) {
    blocks.push(`/* === COMPONENT: Navbar === */\n${nav}`);
  }

  blocks.push(`/* === COMPONENT: Article Hero === */
<section className="bg-background-50 text-foreground-950 py-16 px-8">
  <span>${article?.category || (page.locale === 'en' ? 'Music Insights' : '音樂資訊')}</span>
  <h1>${title}</h1>
  ${subtitle ? `<p>${subtitle}</p>` : ''}
  ${article?.heroImage ? `<img src="${article.heroImage}" alt="${article.heroAlt || title}" />` : ''}
</section>`);

  if (article) {
    if (article.intro.length > 0) {
      blocks.push(`/* === COMPONENT: Article Intro === */
<section className="bg-background-50 text-foreground-950 py-10 px-8">
  <h2>${page.locale === 'en' ? 'Overview' : '導讀'}</h2>
  ${article.intro.map((para) => `<p>${para}</p>`).join('\n  ')}
</section>`);
    }

    for (const sec of article.sections.slice(0, 6)) {
      const inner = [
        `<h2>${sec.h}</h2>`,
        ...sec.p.slice(0, 3).map((para) => `<p>${para}</p>`),
        ...sec.subs.slice(0, 4).map((sub) => `<h3>${sub.h}</h3>`),
        ...sec.listItems.slice(0, 6).map((li) => `<p>${li.replace(/\*\*/g, '')}</p>`),
        sec.imageSrc ? `<img src="${sec.imageSrc}" alt="${sec.h}" />` : '',
      ]
        .filter(Boolean)
        .join('\n  ');
      blocks.push(`/* === COMPONENT: ${sec.h} === */\n<section className="bg-background-50 text-foreground-950 py-10 px-8">\n  ${inner}\n</section>`);
    }

    if (article.faq.length > 0) {
      blocks.push(`/* === COMPONENT: FAQ === */
<section className="bg-background-100 text-foreground-950 py-12 px-8">
  <h2>${page.locale === 'en' ? 'Frequently Asked Questions' : '常見問題'}</h2>
  <div className="grid grid-cols-1 gap-4">
    ${article.faq
      .slice(0, 5)
      .map((item) => `<div><h3>${item.q}</h3><p>${item.a}</p></div>`)
      .join('\n    ')}
  </div>
</section>`);
    }
  }

  blocks.push(`/* === COMPONENT: Article CTA === */
<section className="bg-primary-500 text-background-50 py-12 px-8">
  <h2>${page.locale === 'en' ? 'Plan Your Event Live Music' : '為你的活動安排現場音樂'}</h2>
  ${article?.closing ? `<p>${article.closing}</p>` : ''}
  <button>${page.locale === 'en' ? 'Get Online Quote' : '立即網上報價'}</button>
</section>`);

  blocks.push(`/* === COMPONENT: Footer === */\n${synthesizeCondensedFooter(footerCode, page.locale)}`);
  return blocks.join('\n\n');
}

export function assembleReaddyPageCode(
  page: ReaddyDiscoveredPage,
  rawFiles: Record<string, string>,
  analysis: ReaddyProjectAnalysis,
): { code: string; includedFiles: string[]; summary: string } {
  const fileMap = fileMapForAssembly(rawFiles, page.sourceFile, analysis.sharedFiles);
  const allPaths = new Set(Object.keys(fileMap));
  const includedFiles: string[] = [];

  const navbarCode = analysis.sharedFiles.navbar ? fileMap[analysis.sharedFiles.navbar] : undefined;
  const footerCode = analysis.sharedFiles.footer ? fileMap[analysis.sharedFiles.footer] : undefined;

  // Case 1: Data-driven article page
  if (page.articleSlug) {
    let foundArticle: ParsedArticleObject | null = null;
    const preferredPrefix = page.articleLang === 'en' ? 'en-' : 'zh-';
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
    const code = buildArticleAssembledTsx(page, foundArticle, navbarCode, footerCode);
    return {
      code,
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
      summary: `找不到源檔 ${page.sourceFile}，已建立基礎頁面骨架`,
    };
  }

  includedFiles.push(page.sourceFile);

  // If single HTML or self-contained file with no local component imports
  const imports = extractLocalSectionImports(pageCode, page.sourceFile, allPaths);
  const usesPageLayout = /<PageLayout\b/.test(pageCode);

  if (!usesPageLayout && imports.length === 0) {
    return {
      code: `/* === PAGE META: path="${page.path}" title="${page.title}" locale="${page.locale}" === */\n${pageCode}`,
      includedFiles,
      summary: `單檔頁面（${page.sourceFile}）`,
    };
  }

  const blocks: string[] = [
    `/* === PAGE META: path="${page.path}" title="${page.title}" locale="${page.locale}" === */`,
  ];

  const isHomeRoute = page.path === '/' || page.path === '/en/' || page.path === '/cn/';

  // Add condensed Navbar if Navbar or PageLayout is used
  if (usesPageLayout || /\bNavbar\b/.test(pageCode)) {
    blocks.push(
      `/* === COMPONENT: Navbar === */\n${synthesizeCondensedNavbar(navbarCode, page.locale, isHomeRoute)}`,
    );
    if (analysis.sharedFiles.navbar) includedFiles.push(analysis.sharedFiles.navbar);
  }

  const quoteUrl = findQuoteUrl(fileMap);
  const layoutProps = usesPageLayout ? extractPageLayoutProps(pageCode) : null;
  if (layoutProps) {
    if (analysis.sharedFiles.pageLayout) includedFiles.push(analysis.sharedFiles.pageLayout);
    const primaryLabel = layoutProps.ctaText || (page.locale === 'en' ? 'Get Online Quote' : '立即網上報價');
    const primaryHref = resolveCtaHref(layoutProps.ctaLink, quoteUrl);
    const secondaryHref = resolveCtaHref(layoutProps.ctaSecondaryLink, quoteUrl);
    blocks.push(`/* === COMPONENT: PageLayout Hero === */
<section className="bg-background-50 text-foreground-950 py-20 px-8">
  <h1>${escapeHtmlText(layoutProps.title || page.title)}</h1>
  ${layoutProps.subtitle ? `<p>${escapeHtmlText(layoutProps.subtitle)}</p>` : ''}
  ${layoutProps.description ? `<p>${escapeHtmlText(layoutProps.description)}</p>` : ''}
  ${layoutProps.heroImage ? `<img src="${escapeHtmlAttr(layoutProps.heroImage)}" alt="${escapeHtmlAttr(layoutProps.heroAlt || layoutProps.title || page.title)}" />` : ''}
  ${primaryHref ? `<a href="${escapeHtmlAttr(primaryHref)}">${escapeHtmlText(primaryLabel)}</a>` : `<button>${escapeHtmlText(primaryLabel)}</button>`}
  ${layoutProps.ctaSecondaryText ? (secondaryHref ? `<a href="${escapeHtmlAttr(secondaryHref)}">${escapeHtmlText(layoutProps.ctaSecondaryText)}</a>` : `<button>${escapeHtmlText(layoutProps.ctaSecondaryText)}</button>`) : ''}
</section>`);
  }

  // Order imported components by their JSX appearance inside pageCode
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
  const layoutBodyBlocks = usesPageLayout ? buildPageLayoutBodyBlocks(pageCode) : [];

  if (isSectionComposerPage) {
    // Emit each imported section in exact JSX render order, plus inline ScenarioGallery if used
    let galleryInserted = false;
    const galleryMatch = pageCode.match(
      /<section\b[^>]*>[\s\S]*?<ScenarioGallery[\s\S]*?<\/section>/,
    );
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
  } else if (layoutBodyBlocks.length > 0) {
    for (const block of layoutBodyBlocks) {
      blocks.push(`/* === COMPONENT: ${block.name} === */\n${block.code}`);
    }
    for (const imp of orderedImports) {
      const usedInBody = layoutBodyBlocks.some((block) => new RegExp(`<${imp.localName}\\b`).test(block.code));
      if (usedInBody) continue;
      const compCode = fileMap[imp.resolvedPath];
      if (!compCode) continue;
      includedFiles.push(imp.resolvedPath);
      blocks.push(
        `/* === COMPONENT: ${imp.localName} (${imp.resolvedPath}) === */\n${prepareComponentCode(compCode, imp.resolvedPath, fileMap, allPaths)}`,
      );
    }
  } else if (orderedImports.length > 0 && inlineSectionCount === 0) {
    for (const imp of orderedImports) {
      const compCode = fileMap[imp.resolvedPath];
      if (!compCode) continue;
      includedFiles.push(imp.resolvedPath);
      blocks.push(
        `/* === COMPONENT: ${imp.localName} (${imp.resolvedPath}) === */\n${prepareComponentCode(compCode, imp.resolvedPath, fileMap, allPaths)}`,
      );
    }
  } else {
    blocks.push(
      `/* === COMPONENT: ${page.componentName} Body (${page.sourceFile}) === */\n${cleanedPageBody}`,
    );
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
    blocks.push(`/* === COMPONENT: Footer === */\n${synthesizeCondensedFooter(footerCode, page.locale)}`);
    if (analysis.sharedFiles.footer) includedFiles.push(analysis.sharedFiles.footer);
  }

  const dedupedFiles = Array.from(new Set(includedFiles));
  return {
    code: blocks.join('\n\n'),
    includedFiles: dedupedFiles,
    summary: `已自動組裝 ${dedupedFiles.length} 個關聯檔案（${blocks.length - 1} 個結構片段）`,
  };
}
