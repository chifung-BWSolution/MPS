/**
 * 社媒自動化營運 · 二級路由（PRD §5.1、M0-14）
 *
 * 掛在既有 hash 路由下，二級路由用 query：
 *   #tools-center/social-automation?zone=seo&page=sites&id=<uuid>
 *
 * AppContext.parseHash 會保留 query，因此這裡只負責解析／組裝 query 部分，
 * 不做 history 操作；導航由 ContentAutomationCenter 透過 window.location.hash 完成。
 */

import type {
  ContentPage,
  ContentRoute,
  ContentZone,
  SeoPage,
  SocialPage,
} from './contentTypes.ts';

export const CONTENT_MODULE = 'tools-center';
export const CONTENT_SUBMODULE = 'social-automation';

/** 所有 content 頁面元件的統一 props（由 ContentAutomationCenter 注入） */
export type ContentNavigate = (zone: ContentZone, page: ContentPage, id?: string | null) => void;

export interface ContentViewProps {
  route: ContentRoute;
  navigate: ContentNavigate;
}

export const SOCIAL_PAGES: readonly SocialPage[] = [
  'overview',
  'queue',
  'studio',
  'radar',
  'calendar',
  'library',
  'accounts',
  'usage',
  'settings',
];

export const SEO_PAGES: readonly SeoPage[] = [
  'sites',
  'site',
  'keywords',
  'plan',
  'articles',
  'studio',
  'publish',
  'digest',
  'usage',
  'settings',
];

export interface ContentPageMeta {
  page: ContentPage;
  zone: ContentZone;
  label: string;
  description: string;
}

export const CONTENT_PAGE_META: Record<string, ContentPageMeta> = {
  // ---- social（P4）----
  overview: { page: 'overview', zone: 'social', label: '今日工作', description: '今天要你決定的事、節奏與頻道健康' },
  queue: { page: 'queue', zone: 'social', label: '進度看板', description: '話題 → 草稿 → 待批 → 排期 → 已發佈' },
  studio: { page: 'studio', zone: 'social', label: '審核工作室', description: '一篇長文 + 每帳號導流，批次審核' },
  radar: { page: 'radar', zone: 'social', label: '熱點雷達', description: '手動貼熱點或 CSV 匯入，累積靈感' },
  calendar: { page: 'calendar', zone: 'social', label: '發佈日曆', description: '七日泳道，拖動改期' },
  library: { page: 'library', zone: 'social', label: '素材庫', description: '上傳、標籤、以標籤換圖' },
  accounts: { page: 'accounts', zone: 'social', label: '品牌與帳號', description: '一帳號多組、登入狀態檢測' },
  // ---- seo ----
  sites: { page: 'sites', zone: 'seo', label: '站點', description: '接入站點、健康狀態與今日產出' },
  site: { page: 'site', zone: 'seo', label: '站點詳情', description: '設定／欄目／關鍵字／文章／健康' },
  keywords: { page: 'keywords', zone: 'seo', label: '關鍵字庫', description: 'CSV 匯入、GSC 機會詞、啟用自動生成' },
  plan: { page: 'plan', zone: 'seo', label: '排程表', description: '站點 × 日期矩陣，缺詞與逾期一眼看見' },
  articles: { page: 'articles', zone: 'seo', label: '文章佇列', description: '按站點／狀態／日期篩選與批次操作' },
  publish: { page: 'publish', zone: 'seo', label: '發佈回執', description: '內容包、external_id、live URL 與重試紀錄' },
  digest: { page: 'digest', zone: 'seo', label: '每日日報', description: '預覽、收件人、寄送紀錄與重寄' },
  usage: { page: 'usage', zone: 'seo', label: '用量', description: '每日呼叫、token、成本與上限' },
  settings: { page: 'settings', zone: 'seo', label: '設定', description: '模型、每日上限、日報時間與功能開關' },
};

export const ZONE_LABEL: Record<ContentZone, string> = {
  social: '社媒營運',
  seo: '網站內容自動化',
};

export const ZONE_DESCRIPTION: Record<ContentZone, string> = {
  social: '熱點 → 自動生成 → 審核 → 排期 → 交付',
  seo: '站點 → 關鍵字 → 排程 → 生成 → 總編輯 Confirm → 內容包上線 → 日報',
};

export const DEFAULT_ZONE: ContentZone = 'social';
export const DEFAULT_PAGE_BY_ZONE: Record<ContentZone, ContentPage> = {
  social: 'overview',
  seo: 'sites',
};

const ZONE_STORAGE_KEY = 'mps.content-automation.zone';

export function pagesForZone(zone: ContentZone): readonly ContentPage[] {
  return zone === 'social' ? SOCIAL_PAGES : SEO_PAGES;
}

export function isContentZone(value: unknown): value is ContentZone {
  return value === 'social' || value === 'seo';
}

export function isPageInZone(zone: ContentZone, page: unknown): page is ContentPage {
  return typeof page === 'string' && (pagesForZone(zone) as readonly string[]).includes(page);
}

export function pageMeta(route: Pick<ContentRoute, 'zone' | 'page'>): ContentPageMeta {
  const meta = CONTENT_PAGE_META[route.page];
  if (meta && meta.zone === route.zone) return meta;
  return {
    page: DEFAULT_PAGE_BY_ZONE[route.zone],
    zone: route.zone,
    label: ZONE_LABEL[route.zone],
    description: ZONE_DESCRIPTION[route.zone],
  };
}

/** 從 hash（含或不含 `#`）解析出 content 路由；非法值一律安全回落 */
export function parseContentRoute(hash: string): ContentRoute {
  const raw = String(hash || '').replace(/^#/, '');
  const queryIndex = raw.indexOf('?');
  const query = queryIndex >= 0 ? raw.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(query);

  const zoneParam = params.get('zone');
  const zone: ContentZone = isContentZone(zoneParam)
    ? zoneParam
    : readRememberedZone() ?? DEFAULT_ZONE;

  const pageParam = params.get('page');
  const page: ContentPage = isPageInZone(zone, pageParam)
    ? pageParam
    : DEFAULT_PAGE_BY_ZONE[zone];

  const idParam = params.get('id');
  return { zone, page, id: idParam && idParam.trim() ? idParam.trim() : null };
}

/** 組出完整 hash（含 `#`），供 window.location.hash 或 <a href> 使用 */
export function buildContentHash(
  zone: ContentZone,
  page: ContentPage,
  id?: string | null,
): string {
  const safePage = isPageInZone(zone, page) ? page : DEFAULT_PAGE_BY_ZONE[zone];
  const params = new URLSearchParams({ zone, page: safePage });
  if (id) params.set('id', id);
  return `#${CONTENT_MODULE}/${CONTENT_SUBMODULE}?${params.toString()}`;
}

export function buildContentHref(
  zone: ContentZone,
  page: ContentPage,
  id?: string | null,
): string {
  return `${window.location.pathname}${window.location.search}${buildContentHash(zone, page, id)}`;
}

export function sameRoute(
  a: Pick<ContentRoute, 'zone' | 'page' | 'id'>,
  b: Pick<ContentRoute, 'zone' | 'page' | 'id'>,
): boolean {
  return a.zone === b.zone && a.page === b.page && (a.id ?? null) === (b.id ?? null);
}

export function routeKey(route: Pick<ContentRoute, 'zone' | 'page' | 'id'>): string {
  return `${route.zone}/${route.page}${route.id ? `/${route.id}` : ''}`;
}

/** 最後瀏覽的 zone（PRD §5.1：記在 localStorage） */
export function readRememberedZone(): ContentZone | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(ZONE_STORAGE_KEY);
    return isContentZone(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function rememberZone(zone: ContentZone): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ZONE_STORAGE_KEY, zone);
  } catch {
    // 私密模式或儲存被封鎖時忽略即可，不影響功能
  }
}

/** 對外可分享的深連結（絕對路徑，供日報／通知使用） */
export function contentDeepLink(
  siteOrigin: string,
  zone: ContentZone,
  page: ContentPage,
  id?: string | null,
): string {
  const origin = (siteOrigin || '').replace(/\/$/, '');
  return `${origin}/${buildContentHash(zone, page, id)}`;
}
