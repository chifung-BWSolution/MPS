/**
 * 社媒半自動交付（C）：平台 deeplink、交付說明與分組。
 *
 * 純函式，不呼叫任何平台 API（PRD §1.3 非目標）。
 * 目的：把「貼文」從幾分鐘縮到幾秒——複製文案 → 開平台 → 貼上 → 回 MPS 標記已發。
 */

import { platformOrder, socialPlatformLabel } from './contentSocialGenerate.ts';

export interface SocialDeliveryLink {
  id: string;
  label: string;
  href: string;
  /** 平台限制說明（例如不支援網頁預填內文） */
  note?: string;
}

export interface SocialDeliveryTargetRef {
  id: string;
  account_id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  copy_text: string;
  status: string;
  published_url: string | null;
  published_at: string | null;
}

export interface SocialDeliveryPlatformGroup {
  platform: string;
  label: string;
  copyText: string;
  targets: SocialDeliveryTargetRef[];
  links: SocialDeliveryLink[];
  hint: string;
}

/** 各平台一鍵開啟的入口；沒有可預填的官方網頁時，href 只開平台首頁並用 note 說明 */
export function buildSocialDeliveryLinks(platform: string, text: string): SocialDeliveryLink[] {
  const copy = (text || '').trim();
  switch (String(platform || '').toLowerCase()) {
    case 'threads':
      return [
        {
          id: 'threads-intent',
          label: '開啟 Threads 發文',
          href: copy
            ? `https://www.threads.net/intent/post?text=${encodeURIComponent(copy)}`
            : 'https://www.threads.net/',
          note: copy ? '內文會自動帶入，確認後即可發佈' : undefined,
        },
      ];
    case 'facebook':
      return [
        {
          id: 'facebook-open',
          label: '開啟 Facebook',
          href: 'https://www.facebook.com/',
          note: 'Facebook 不支援網頁預填內文，請先複製文案再貼上',
        },
      ];
    case 'instagram':
      return [
        {
          id: 'instagram-open',
          label: '開啟 Instagram',
          href: 'https://www.instagram.com/',
          note: 'Instagram 不支援網頁預填；請先複製文案，用手機 App 發佈',
        },
      ];
    case 'xiaohongshu':
      return [
        {
          id: 'xiaohongshu-open',
          label: '開啟小紅書創作者中心',
          href: 'https://creator.xiaohongshu.com/',
          note: '小紅書沒有公開 API；請手動貼上文案與圖片',
        },
      ];
    case 'youtube':
      return [
        {
          id: 'youtube-studio',
          label: '開啟 YouTube Studio',
          href: 'https://studio.youtube.com/',
          note: 'YouTube 上傳沒有預填網址；請手動上傳並貼上說明',
        },
      ];
    default:
      return [];
  }
}

export function deliveryHint(platform: string): string {
  switch (String(platform || '').toLowerCase()) {
    case 'threads':
      return '按「開啟 Threads 發文」→ 確認內文 → 發佈 → 回來按「已發」。';
    case 'facebook':
      return '複製文案 → 開啟 Facebook → 貼上 → 發佈 → 回來按「已發」。';
    case 'instagram':
      return '複製文案 → 用手機 Instagram App 發佈（可先下載封面）→ 回來按「已發」。';
    case 'xiaohongshu':
      return '複製文案 → 小紅書 App／創作者中心貼上 → 發佈 → 回來按「已發」。';
    case 'youtube':
      return '複製說明文案 → YouTube Studio 上傳 → 回來按「已發」。';
    default:
      return '複製文案 → 到平台手動發佈 → 回來按「已發」。';
  }
}

/**
 * 依平台分組交付資料：同平台多帳號共用一份文案（與 PRD §10 一致），
 * 取第一個非空文案；平台順序與看板一致。
 */
export function buildDeliveryPlatformGroups(
  targets: readonly SocialDeliveryTargetRef[],
): SocialDeliveryPlatformGroup[] {
  const buckets = new Map<string, SocialDeliveryTargetRef[]>();
  for (const target of targets) {
    const platform = String(target.platform || 'other');
    const list = buckets.get(platform) ?? [];
    list.push(target);
    buckets.set(platform, list);
  }

  return [...buckets.entries()]
    .sort((a, b) => platformOrder(a[0]) - platformOrder(b[0]))
    .map(([platform, list]) => {
      const copyText =
        list.map((target) => (target.copy_text || '').trim()).find((text) => text.length > 0) ?? '';
      return {
        platform,
        label: socialPlatformLabel(platform),
        copyText,
        targets: [...list].sort((a, b) => String(a.handle).localeCompare(String(b.handle))),
        links: buildSocialDeliveryLinks(platform, copyText),
        hint: deliveryHint(platform),
      };
    });
}

export function deliveryTargetLabel(target: Pick<SocialDeliveryTargetRef, 'handle' | 'display_name'>): string {
  const handle = target.handle ? `@${target.handle}` : '';
  return target.display_name ? `${handle}（${target.display_name}）` : handle || '未命名帳號';
}

/** 交付頁的完成度：全部 target 都 published 才算完成 */
export function deliveryProgress(targets: readonly Pick<SocialDeliveryTargetRef, 'status'>[]): {
  total: number;
  published: number;
  remaining: number;
} {
  const published = targets.filter((target) => target.status === 'published').length;
  return { total: targets.length, published, remaining: Math.max(0, targets.length - published) };
}
