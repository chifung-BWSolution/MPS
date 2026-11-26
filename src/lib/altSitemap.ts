/**
 * ALT Pilot · sitemap 解析（純函式）
 *
 * 只負責把 sitemap XML 轉成 URL 清單；不判斷 host、不抓網絡。
 * Edge Function 會再做 allowlist 與 SSRF 檢查。
 */

export type SitemapKind = 'urlset' | 'sitemapindex';

export interface ParsedSitemap {
  kind: SitemapKind;
  urls: string[];
}

const LOC_RE = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const code = Number.parseInt(decimal, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

export function parseSitemap(xml: string, baseUrl: string): ParsedSitemap {
  const source = String(xml || '');
  const kind: SitemapKind = /<sitemapindex\b/i.test(source) ? 'sitemapindex' : 'urlset';
  const seen = new Set<string>();
  const urls: string[] = [];

  LOC_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LOC_RE.exec(source))) {
    const raw = decodeXmlEntities(
      (match[1] || '').replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim(),
    ).trim();
    if (!raw) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    resolved.hash = '';
    const href = resolved.href;
    if (seen.has(href)) continue;
    seen.add(href);
    urls.push(href);
  }

  return { kind, urls };
}
