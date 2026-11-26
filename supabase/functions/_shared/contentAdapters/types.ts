/**
 * 內容發佈 Adapter 介面（M5-03）
 *
 * 目的：把「發布到站點」抽象成可替換的 adapter，v1 只有 manual（人工內容包），
 * 日後接 Next 自訂端點／Shopify／WordPress／Webflow 時，只新增 adapter，不改流程。
 *
 * 純 TS：不得 import Deno API，方便以 Node 跑契約測試。
 */

import type {
  ContentAdapterName,
  ContentPublishMode,
} from '../../../../src/lib/contentTypes.ts';

export interface AdapterCredentials {
  /** 已由 Edge Function 解密後的明文；manual adapter 不使用 */
  secret: string | null;
  metadata?: Record<string, unknown>;
}

export interface AdapterSite {
  id: string;
  name: string;
  domain: string | null;
  publishMode: ContentPublishMode;
  timezone: string;
  /**
   * 站點第一個欄目的 external_id（例如 Beauty100 的 trending-topics）。
   * 連線測試用；實際發佈時以 article.section 為準。
   */
  sectionExternalId?: string | null;
}

export interface AdapterImage {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  alt?: string;
}

/** 發佈時文章所屬的站內欄目（給 adapter 決定分類／collection） */
export interface AdapterSection {
  id: string;
  name: string;
  slug: string;
  externalId: string | null;
  contentType: string;
  mapping?: Record<string, unknown>;
}

export interface AdapterArticleInput {
  title: string;
  slug: string;
  excerpt: string;
  bodyHtml: string;
  bodyMd: string;
  canonical: string;
  metaDescription: string;
  metaTitle?: string | null;
  coverImage?: AdapterImage | null;
  /** 以下為選填：不知道的 adapter 可忽略 */
  author?: string | null;
  tags?: string[];
  keyword?: string | null;
  section?: AdapterSection | null;
}

export interface AdapterArticleResult {
  ok: boolean;
  externalId: string | null;
  liveUrl: string | null;
  draftUrl: string | null;
  httpStatus: number | null;
  raw?: unknown;
  /**
   * 站點實際使用的 canonical。有值時 worker 會寫回 MPS，
   * 避免 canonical 路徑與站方不一致而讓上線驗證誤判。
   */
  canonicalUrl?: string | null;
}

export interface AdapterVerifyInput {
  externalId: string;
  liveUrl: string;
  slug: string;
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** 文章所屬欄目的 external_id（例如 Beauty100 的 trending-topics） */
  sectionExternalId?: string | null;
}

export interface AdapterVerifyResult {
  ok: boolean;
  httpStatus: number | null;
  checks: AdapterCheck[];
  raw?: unknown;
}

export interface AdapterDeleteResult {
  ok: boolean;
  /** 平台回 404/410 代表已經不存在 → 視為刪除成功（冪等） */
  alreadyGone: boolean;
  httpStatus: number | null;
  raw?: unknown;
}

export interface AdapterCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface AdapterTestResult {
  ok: boolean;
  checks: AdapterCheck[];
}

export interface ContentAdapter {
  name: ContentAdapterName;
  /** 這個 adapter 支援哪些發布模式（manual / draft / direct） */
  supports(mode: ContentPublishMode): boolean;
  /**
   * true = 發佈前必須有封面。前端會提前禁用 Confirm；
   * content-publish／worker 也會再擋一次（不可只靠 UI）。
   */
  requiresCover?: boolean;
  testConnection(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterTestResult>;
  createArticle(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    article: AdapterArticleInput;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterArticleResult>;
  uploadImage?(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    image: AdapterImage;
    fetchImpl?: typeof fetch;
  }): Promise<{ ok: boolean; url: string | null; raw?: unknown }>;
  /**
   * 有實作時，verify_publish 會用站點 API／資料驗證，不再抓 HTML meta。
   * 適合前端 client-render、metadata 不可靠的站（Beauty100）。
   */
  verifyArticle?(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    article: AdapterVerifyInput;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterVerifyResult>;
  /**
   * 真正刪除站點上的文章（不是只刪 MPS 記錄）。
   * 未實作＝該 adapter 不支援遠端刪除；呼叫端必須明確報錯，不可靜默假成功。
   */
  deleteArticle?(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    externalId: string;
    slug?: string | null;
    /** 發佈時上傳的封面（若有記錄）；刪文時 best-effort 清掉 */
    cover?: { bucket: string; path: string } | null;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterDeleteResult>;
}

export class AdapterError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;

  constructor(code: string, message: string, httpStatus: number | null = null) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
