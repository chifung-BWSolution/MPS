import { useLocation } from './routerShim';

export type Lang = 'zh' | 'cn' | 'en';

/** Detect the active language from the current pathname. */
export function getLangFromPath(pathname: string): Lang {
  if (pathname === '/cn' || pathname.startsWith('/cn/')) return 'cn';
  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
  return 'zh';
}

/** React hook that returns the active language for the current route. */
export function useLang(): Lang {
  const { pathname } = useLocation();
  return getLangFromPath(pathname);
}

/**
 * Reduce any language-prefixed path back to its canonical Traditional Chinese
 * (un-prefixed) form, e.g. `/cn/services/` -> `/services/`, `/en` -> `/`.
 */
function toBasePath(path: string): string {
  let clean = path.split('?')[0].split('#')[0];
  if (!clean.startsWith('/')) clean = `/${clean}`;
  if (!clean.endsWith('/')) clean = `${clean}/`;

  if (clean === '/cn/') return '/';
  if (clean.startsWith('/cn/')) return clean.slice(3);
  if (clean === '/en/') return '/';
  if (clean.startsWith('/en/')) return clean.slice(3);
  return clean;
}

/**
 * Convert a path into its equivalent in the target language.
 * `/`      -> zh stays `/`, en -> `/en`, cn -> `/cn`
 * `/services/` -> en -> `/en/services/`, cn -> `/cn/services/`
 */
export function toLangPath(path: string, lang: Lang): string {
  if (/^https?:\/\//.test(path)) return path;

  const base = toBasePath(path);

  if (lang === 'zh') return base;
  if (lang === 'en') return base === '/' ? '/en' : `/en${base}`;
  return base === '/' ? '/cn' : `/cn${base}`;
}

/**
 * Pages that intentionally have NO English equivalent. Keep this list in sync so
 * we never emit an hreflang alternate or a language-switch link pointing at a URL
 * that does not exist (which would return 404 to crawlers and users).
 * Traditional Chinese is the source language and Simplified Chinese mirrors it,
 * so only English can have gaps.
 */
const MISSING_EN_PATHS = new Set<string>([
  '/online-quotation/',
  '/music-insights/mall-event-music-guide/',
  '/music-insights/proposal-live-music-guide/',
  '/music-insights/outdoor-event-live-music-guide/',
  '/music-insights/wedding-band-vs-dj/',
  '/music-insights/event-music-licensing-guide/',
  '/music-insights/mall-festival-performance-guide/',
]);

/** Whether a given path resolves to a real page in the target language. */
export function langPathExists(path: string, lang: Lang): boolean {
  if (lang === 'en') return !MISSING_EN_PATHS.has(toBasePath(path));
  return true;
}

/**
 * Localized path guaranteed to exist. If the exact page is missing in the target
 * language, fall back to the nearest existing ancestor section (or the language
 * home) instead of linking to a 404.
 */
export function toSafeLangPath(path: string, lang: Lang): string {
  if (langPathExists(path, lang)) return toLangPath(path, lang);

  const segments = toBasePath(path).split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 1; i -= 1) {
    const ancestor = `/${segments.slice(0, i).join('/')}/`;
    if (langPathExists(ancestor, lang)) return toLangPath(ancestor, lang);
  }
  return lang === 'zh' ? '/' : `/${lang}`;
}