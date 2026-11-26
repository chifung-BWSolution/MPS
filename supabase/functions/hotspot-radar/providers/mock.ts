import type { HotspotItemDraft, HotspotKind } from '../../../../src/lib/hotspotRadar.ts';
import type { HotspotProvider } from './types.ts';

/**
 * 本機／示範用的固定樣本供應商：完全不碰網路、不花錢。
 *
 * 用途：
 *   - 還沒有第三方金鑰時，按「立即抓取」也能即時看到完整效果（HOTSPOT_PROVIDER=mock）
 *   - 讓「抓取 → 正規化 → 中位數 → 卡片」可在本機與線上 demo 驗證
 *
 * 樣本會反映實際設定的目標：
 *   - 帳號目標 → author_handle 用該 handle，才有「相對熱度／爆款」可看
 *   - hashtag 目標 → caption 帶該 tag，不同 tag 產生不同 external_id（不會互相覆蓋）
 *   - 廣告關鍵字 → caption 帶關鍵字，投放天數固定 45／21／6 天
 * 單價固定 0，示範不計入月費。
 */

const BASE_MS = Date.UTC(2026, 10, 20, 9, 0, 0);

function daysAgo(days: number): string {
  return new Date(BASE_MS - days * 86_400_000).toISOString();
}

/** 穩定的短 key（同一個目標每次跑都拿到同一批 external_id） */
function targetKey(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 0xffffff;
  return hash.toString(36).toUpperCase();
}

function accountItem(index: number, handle: string, likes: number, comments: number, reel: boolean, days: number): HotspotItemDraft {
  const externalId = `MOCKACC_${targetKey(handle)}_${index}`;
  return {
    platform: 'instagram',
    source_kind: 'account',
    external_id: externalId,
    url: `https://www.instagram.com/p/${externalId}/`,
    media_type: reel ? 'reel' : 'image',
    caption: `@${handle} 示範貼文 ${index}：開頭三秒 hook 與剪法可參考`,
    thumbnail_url: null,
    author_handle: handle,
    author_name: null,
    author_followers: 24_800,
    posted_at: daysAgo(days),
    likes,
    comments,
    plays: reel ? likes * 6 : null,
    ad_started_at: null,
    ad_active_days: null,
    ad_status: null,
    raw: { provider: 'mock', target: handle },
  };
}

function hashtagItem(index: number, tag: string, likes: number, comments: number): HotspotItemDraft {
  const externalId = `MOCKTAG_${targetKey(tag)}_${index}`;
  return {
    platform: 'instagram',
    source_kind: 'hashtag',
    external_id: externalId,
    url: `https://www.instagram.com/p/${externalId}/`,
    media_type: index % 2 === 0 ? 'reel' : 'carousel',
    caption: `#${tag} 示範內容 ${index}：這個題材最近互動唔錯，可以參考切角`,
    thumbnail_url: null,
    author_handle: `creator_${index}`,
    author_name: null,
    author_followers: 5_000 + index * 1_200,
    posted_at: daysAgo(2 + index),
    likes,
    comments,
    plays: null,
    ad_started_at: null,
    ad_active_days: null,
    ad_status: null,
    raw: { provider: 'mock', target: tag },
  };
}

function adItem(index: number, keyword: string, activeDays: number): HotspotItemDraft {
  const externalId = `MOCKAD_${targetKey(keyword)}_${index}`;
  return {
    platform: 'facebook',
    source_kind: 'ad_keyword',
    external_id: externalId,
    url: `https://www.facebook.com/ads/library/?id=${externalId}`,
    media_type: 'ad',
    caption: `「${keyword}」示範廣告 ${index}：主打通勤族，長期投放中`,
    thumbnail_url: null,
    author_handle: `advertiser_${index}`,
    author_name: `Advertiser ${index}`,
    author_followers: null,
    posted_at: daysAgo(activeDays),
    likes: 0,
    comments: 0,
    plays: null,
    ad_started_at: daysAgo(activeDays).slice(0, 10),
    ad_active_days: activeDays,
    ad_status: 'active',
    raw: { provider: 'mock', target: keyword },
  };
}

export function createMockProvider(): HotspotProvider {
  return {
    name: 'mock',

    async fetchAccount(handle: string, limit: number): Promise<HotspotItemDraft[]> {
      const items: HotspotItemDraft[] = [
        accountItem(1, handle, 1800, 96, true, 1),
        accountItem(2, handle, 640, 32, false, 3),
        accountItem(3, handle, 320, 18, true, 6),
        accountItem(4, handle, 150, 9, false, 9),
        accountItem(5, handle, 90, 6, true, 12),
        accountItem(6, handle, 45, 3, false, 20),
      ];
      return items.slice(0, limit);
    },

    async fetchHashtag(tag: string, limit: number): Promise<HotspotItemDraft[]> {
      const items: HotspotItemDraft[] = [
        hashtagItem(1, tag, 2400, 140),
        hashtagItem(2, tag, 980, 61),
        hashtagItem(3, tag, 460, 22),
        hashtagItem(4, tag, 210, 11),
        hashtagItem(5, tag, 120, 7),
      ];
      return items.slice(0, limit);
    },

    async fetchAds(keyword: string, limit: number): Promise<HotspotItemDraft[]> {
      const items: HotspotItemDraft[] = [
        adItem(1, keyword, 45),
        adItem(2, keyword, 21),
        adItem(3, keyword, 6),
      ];
      return items.slice(0, limit);
    },

    unitPricePer1000(_kind: HotspotKind): number {
      // 示範模式不呼叫付費 API，也不該吃掉月費預算
      return 0;
    },
  };
}
