import type { HotspotItemDraft, HotspotKind } from '../../../../src/lib/hotspotRadar.ts';
import { HOTSPOT_ACCOUNT_ITEMS } from '../../../../src/lib/hotspotRadar.ts';
import { HotspotProviderError, type HotspotProvider } from './types.ts';

/**
 * IG 帳號 → RSS（免費、免 key、免登入）
 *
 * 來源：公共 RSSHub 實例的 IG user 路由 `${base}/instagram/user/{handle}`
 * 限制：
 *   - 只有 user 路由可用；tag 路由需要 IG cookie（503），所以本 provider 只支援 account 類
 *   - RSS 沒有讚／留言 → engagement=0、relative_heat 由 persist 依樣本算（全 0 → NULL）
 *   - 圖片不一定在 RSS 內；沒有時退回 `https://www.instagram.com/p/{code}/media/?size=l`
 *
 * 已實測（2026-11-26）：be_hk 最新 0.5 天、_jessica.see_ 0.8 天、hkwatsons 1.0 天、
 * sephorahk 1.2 天；未快取帳號首次抓取最慢約 16 秒 → timeout 25 秒、順序抓。
 */

const DEFAULT_BASE = "https://rsshub.liumingye.cn";
const FEED_TIMEOUT_MS = 20_000;
// 只嘗試一次：慢帳號（大品牌）可能吃滿 20 秒，重試會令多目標 run 逼近函數牆鐘上限；
// 失敗會把該目標標記失敗，下一輪再試即可。
const MAX_RETRY = 0;

function baseUrl(): string {
  return (Deno.env.get("HOTSPOT_IG_RSS_BASE") || DEFAULT_BASE).replace(/\/+$/, "");
}

/** CDATA / HTML entity 解碼 */
function decodeEntities(raw: string): string {
  return String(raw ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => {
      try {
        return String.fromCodePoint(Number(code));
      } catch {
        return "";
      }
    })
    .replace(/&amp;/g, "&");
}

interface ParsedPost {
  shortcode: string;
  url: string;
  caption: string;
  thumbnail: string | null;
  postedAt: string | null;
  hasRssImage: boolean;
}

function pickTag(itemXml: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(itemXml);
  return decodeEntities(match?.[1] ?? "").trim();
}

function parseFeed(xml: string, limit: number): ParsedPost[] {
  const posts: ParsedPost[] = [];
  const seen = new Set<string>();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

  for (const match of items) {
    if (posts.length >= limit) break;
    const itemXml = match[1];
    const link = pickTag(itemXml, "link");
    const shortcode = /instagram\.com\/p\/([A-Za-z0-9_-]{5,})/.exec(link)?.[1] ?? "";
    if (!shortcode || seen.has(shortcode)) continue;
    seen.add(shortcode);

    const description = pickTag(itemXml, "description");
    const imageMatch = /<img[^>]+src="([^"]+)"/i.exec(description);
    const caption = description
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const pubDate = pickTag(itemXml, "pubDate");
    const parsedTime = pubDate ? Date.parse(pubDate) : Number.NaN;

    posts.push({
      shortcode,
      url: `https://www.instagram.com/p/${shortcode}/`,
      caption,
      // RSS 沒圖時退回升解像度端點（免登入，實測回 200 image/jpeg）
      thumbnail: imageMatch?.[1]?.trim() || `https://www.instagram.com/p/${shortcode}/media/?size=l`,
      postedAt: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : null,
      hasRssImage: Boolean(imageMatch?.[1]),
    });
  }

  return posts;
}

async function fetchFeed(handle: string): Promise<string> {
  const url = `${baseUrl()}/instagram/user/${encodeURIComponent(handle)}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          accept: "application/rss+xml,application/xml,text/xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      });

      if (res.status === 404) {
        // 帳號不存在／私人：不要讓它中斷整批（retryable=true 由 runScan 記 warning 繼續）
        throw new HotspotProviderError(
          "provider_unavailable",
          `IG 帳號 @${handle} 找不到（可能不存在、已改名或私人帳號）`,
          502,
          true,
        );
      }
      if (!res.ok) {
        lastError = new HotspotProviderError(
          res.status === 429 ? "provider_rate_limited" : "provider_unavailable",
          `RSS 渠道回應 ${res.status}`,
          res.status === 429 ? 429 : 502,
          true,
        );
        continue;
      }

      const text = await res.text();
      if (!/<item>|<rss|<feed/i.test(text)) {
        lastError = new HotspotProviderError(
          "provider_unavailable",
          "RSS 渠道回應不是 feed（實例可能被擋或改版）",
          502,
          true,
        );
        continue;
      }
      return text;
    } catch (error) {
      if (error instanceof HotspotProviderError) throw error;
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? "未知錯誤");
  throw new HotspotProviderError("provider_unavailable", `抓取 @${handle} RSS 失敗：${message}`, 502, true);
}

function toDraft(handle: string, post: ParsedPost): HotspotItemDraft {
  // RSS 內的 CDN 圖片 URL 被 HTML 轉義成 &amp;（簽名會失效 → 403）；
  // 而且 CDN 簽名會過期。因此縮圖一律用 IG 的穩定 media 端點（免登入、不需存檔）：
  //   https://www.instagram.com/p/{shortcode}/media/?size=m
  const cdnImage = post.thumbnail && !post.thumbnail.includes("/media/?size=")
    ? post.thumbnail.replace(/&amp;/g, "&")
    : null;

  return {
    platform: "instagram",
    source_kind: "account",
    external_id: post.shortcode,
    url: post.url,
    // RSS 沒有可靠 media type；保留 unknown 交由 UI 顯示「內容」
    media_type: "unknown",
    caption: post.caption || null,
    thumbnail_url: `https://www.instagram.com/p/${post.shortcode}/media/?size=m`,
    author_handle: handle,
    author_name: null,
    author_followers: null,
    posted_at: post.postedAt,
    likes: 0,
    comments: 0,
    plays: null,
    ad_started_at: null,
    ad_active_days: null,
    ad_status: null,
    raw: {
      provider: "ig_rss",
      shortcode: post.shortcode,
      feed: `${baseUrl()}/instagram/user/${handle}`,
      has_rss_image: post.hasRssImage,
      // CDN 原始連結（可能過期，只作後備）
      cdn_image: cdnImage,
      // 明確標記：這個來源沒有讚／留言，前端不可用互動門檻篩走
      engagement_available: false,
    },
  };
}

export function createIgRssProvider(): HotspotProvider {
  return {
    name: "ig_rss",

    supports(kind: HotspotKind): boolean {
      // RSSHub 的 IG tag 路由需要 cookie → 免費模式下只支援帳號
      return kind === "account";
    },

    async fetchAccount(handle: string, limit: number): Promise<HotspotItemDraft[]> {
      const effectiveLimit = Math.min(limit > 0 ? limit : HOTSPOT_ACCOUNT_ITEMS, 50);
      const xml = await fetchFeed(handle);
      const posts = parseFeed(xml, effectiveLimit);
      return posts.map((post) => toDraft(handle, post));
    },

    async fetchHashtag(): Promise<HotspotItemDraft[]> {
      throw new HotspotProviderError(
        "provider_unavailable",
        "IG RSS 渠道不支援 Hashtag（RSSHub tag 路由需要 IG cookie）",
        502,
        true,
      );
    },

    async fetchAds(): Promise<HotspotItemDraft[]> {
      throw new HotspotProviderError(
        "provider_unavailable",
        "IG RSS 渠道不支援廣告（廣告需 FB 廣告庫）",
        502,
        true,
      );
    },

    unitPricePer1000(): number {
      // 免費渠道，不計費
      return 0;
    },
  };
}
