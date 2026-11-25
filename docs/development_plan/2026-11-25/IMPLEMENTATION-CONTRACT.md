# 實作契約｜社媒自動化營運（M0–M3）

> 本文件是本次施工的**唯一協作契約**。並行開發時，任何跨檔案的假設都以這裡為準；
> 若與 PRD 衝突，以 PRD 為準，並在本文件補註。

## 0. 必讀（動工前）

| 文件 | 用途 |
|---|---|
| `docs/development_plan/2026-11-25/PRD-社媒自動化營運-併入工具中心-v1.0.md` | 需求（v1.1） |
| `docs/development_plan/2026-11-25/執行清單-社媒自動化營運-v1.0.md` | 任務與 Gate |
| `src/lib/contentTypes.ts` | DB ↔ TS 型別，**所有型別只從這裡取** |
| `src/lib/contentFormat.ts` | 時區／字數／slug／模板／格式化 |
| `src/lib/contentState.ts` | 四組狀態機、標籤、色票 |
| `src/lib/contentPlanner.ts` | cadence → slots |
| `src/lib/contentSeoQa.ts` | 硬 9／軟 6 檢查 |
| `src/lib/contentDigest.ts` | 日報統計與 HTML |
| `src/lib/contentApi.ts` | Edge Function 呼叫、錯誤降級、Storage 簽名 URL |
| `src/lib/contentNavigation.ts` | `ContentViewProps`、路由、頁面標題 |
| `src/lib/contentPermissions.ts` | `can(user, action)` |
| `src/lib/contentGenerate.ts`、`contentMedia.ts`、`contentPackage.ts` | 生成、圖卡、內容包 |

## 1. 架構邊界（不可越線）

```
瀏覽器（Vite/React）
  ├─ src/lib/content*.ts        純函式，前後端共用；不得 import 瀏覽器 API、不得 import supabase
  ├─ src/hooks/useContent*.ts   資料 hook（supabase-js + contentApi）
  └─ src/components/tools-center/content/**   只做 UI
Deno（supabase/functions）
  ├─ content-sites / content-keywords / content-worker / content-publish / content-digest
  └─ _shared/contentAuth.ts / contentVault.ts / contentLlm.ts
```

- **一般讀寫**走 `supabase-js`（RLS 已開）。
- **需要密鑰／憑證／長任務**走 `invokeContentFunction()`。
- 前端**永不**持有憑證明文；`content_site_credentials` 對 authenticated 完全封閉。

## 2. 設計語言（MPS）

- 底色 `#f5f8fc`、白卡、主色 teal `#0d9488`、深色字 `#0d1a2d`、邊框 `rgba(13,26,45,0.08)`、`shadow-card`。
- 標題：`ContentPageHeader`（32px bold + 14px muted 副標）。
- 情境色：待審／逾期 = amber、失敗 = rose、成功／已發佈 = teal、排程／進行中 = blue。
- 狀態**只用** `ContentStatusPill`（`machine` + `status`），不要自創顏色。
- 元件一律用 `src/components/ui/*`（`Button`、`Dialog`、`Sheet`、`Tabs`、`Table`、`Input`、`Textarea`、`Select`、`Switch`、`Badge`、`Progress`、`Tooltip`…），不要另寫一套。
- 文案：繁體中文（zh-HK）；金額 `US$`；時間一律用 `contentFormat` 的 `formatZoneDateTime` 等，不可直接 `toLocaleString()`。
- 圖示：`lucide-react`，尺寸 13–16，`strokeWidth` 1.75–2。
- toast：`import { toast } from 'sonner'`。

## 3. 頁面元件契約

所有畫面都是：

```tsx
import type { ContentViewProps } from '@/lib/contentNavigation.ts';

export function XxxView({ route, navigate }: ContentViewProps) { ... }
```

- 由 `ContentAutomationCenter` 掛載；`route.page` / `route.id` 決定內容。
- `navigate(zone, page, id?)` 用於頁內跳轉（會同步 hash）。
- 每頁自己渲染 `ContentPageHeader`；外殼只提供 zone tab 與收件匣數字。
- 必須處理四態：`loading`（骨架或 spinner）、`empty`（`ContentEmptyState`）、`error`（可重試）、`missingSchema`（資料表未建 → 「功能尚未啟用」）。
- 角色權限：用 `useAuth()` 取 `user.role`，再 `can({role}, 'approve')` 之類決定顯示／禁用；**後端仍會再驗**。

## 4. 共用元件的 props（跨檔案依賴，必須照這個簽名）

```ts
// shared/SiteSelect.tsx
interface SiteSelectProps {
  value: string | null;
  onChange: (siteId: string | null) => void;
  sites?: ContentSiteWithProfile[];   // 不給就自己載入
  allowAll?: boolean;                 // true 時有「全部站點」
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}
export function SiteSelect(props: SiteSelectProps): JSX.Element;

// shared/KeywordSelect.tsx
interface KeywordSelectProps {
  siteId: string | null;
  value: string | null;
  onChange: (keywordId: string | null) => void;
  onlyBacklog?: boolean;              // 只列 pipeline_status='backlog'
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}
export function KeywordSelect(props: KeywordSelectProps): JSX.Element;

// shared/ContentTable.tsx
export interface ContentTableColumn<T> {
  key: string;
  header: React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => React.ReactNode;
}
export interface ContentTableProps<T> {
  columns: ContentTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  pageSize?: number;        // 預設 20
  searchable?: boolean;
  searchText?: (row: T) => string;
  toolbar?: React.ReactNode;
  className?: string;
}
export function ContentTable<T>(props: ContentTableProps<T>): JSX.Element;
```

## 5. Hook 契約（同一 owner 內使用；跨 owner 只准 import 這份清單）

```ts
// useContentSites.ts
export function useContentSites(): {
  sites: ContentSiteWithProfile[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
};
export function useContentSite(siteId: string | null): {
  site: ContentSiteWithProfile | null;
  sections: ContentSiteSection[];
  checks: ContentSiteCheck[];
  credentials: ContentCredentialMeta[];
  pages: ContentSitePage[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
};

// useContentKeywords.ts
export function useContentKeywords(siteId: string | null): {
  keywords: ContentKeyword[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  importRows: (rows: ContentKeywordImportRow[]) => Promise<ContentKeywordImportResult>;
  scanGsc: () => Promise<{ inserted: number; scanned: number }>;
  updateKeyword: (id: string, patch: Partial<ContentKeyword>) => Promise<void>;
};

// useContentSlots.ts
export function useContentSlots(range?: { siteId?: string | null; days?: number }): {
  slots: ContentSlot[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  planNow: (siteId?: string) => Promise<{ created: number }>;
  updateSlot: (id: string, patch: Partial<ContentSlot>) => Promise<void>;
};

// useContentArticles.ts
export function useContentArticles(filter?: { siteId?: string | null; status?: string | null; page?: number }): {
  items: ContentArticleListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  page: number;
  setPage: (page: number) => void;
};
export function useContentArticle(articleId: string | null, currentUserId?: string | null): {
  detail: ContentArticleDetail | null;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  saveDraft: (patch: { title?: string; body_md?: string; excerpt?: string; meta_title?: string; meta_description?: string; slug?: string; canonical?: string }, expectedVersion: number) => Promise<void>;
  submitForReview: (expectedVersion: number) => Promise<void>;
  approve: (expectedVersion: number, scheduledPublishAt?: string | null) => Promise<void>;
  requestChanges: (expectedVersion: number, reason: string) => Promise<void>;
  confirm: (input: { expectedVersion: number; scheduledPublishAt: string }) => Promise<void>;
  generateCover: () => Promise<void>;
  setCover: (assetId: string | null) => Promise<void>;
};

// useContentSettings.ts
export function useContentSettings(): {
  settings: ContentSettings | null;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  save: (patch: Partial<ContentSettings>) => Promise<void>;
};

// useContentUsage.ts
export function useContentUsage(days?: number): {
  summary: ContentUsageSummary;
  daily: ContentUsageDay[];
  byModel: ContentUsageByModel[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

// useContentDigest.ts
export function useContentDigests(): {
  digests: ContentEmailDigest[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};
```

> 未列在清單的 hook 屬該 owner 私有，其他 owner 不得 import。

## 6. Edge Function 契約

所有函式：`POST` JSON body、回應 `{ ok: true, data }` / `{ ok: false, code, error }`。

### content-sites

| action | 權限 | payload | data |
|---|---|---|---|
| `list` | view | `{}` | `ContentSiteWithProfile[]` |
| `get` | view | `{ site_id }` | `{ site, sections, checks, credentials, pages }` |
| `upsert_settings` | manage_sites | `{ site_id, patch }` | `ContentSite` |
| `set_status` | manage_sites | `{ site_id, status, notes? }` | `ContentSite` |
| `list_sections` / `upsert_section` / `delete_section` | manage_sites | `{ site_id, section? / section_id }` | 同上 |
| `save_credential` | manage_sites | `{ site_id, kind, secret, expires_at? }` | `ContentCredentialMeta`（只有 fingerprint，永不含明文） |
| `clear_credential` | manage_sites | `{ site_id, kind }` | `{ cleared: true }` |
| `test_connection` | manage_sites | `{ site_id }` | `ContentConnectionTestResult` |
| `list_site_candidates` | manage_sites | `{ query? }` | `{ id, website_name, domain_url, platform, brand, connected }[]` |

### content-keywords

| action | 權限 | payload | data |
|---|---|---|---|
| `import` | write | `{ site_id, rows: ContentKeywordImportRow[] }` | `ContentKeywordImportResult` |
| `scan_gsc` | write | `{ site_id }` | `{ inserted, scanned }` |
| `list_candidates` | view | `{ site_id }` | `ContentKeyword[]`（只 backlog，供說明用） |

### content-worker

- cron/service only（`requireServiceRole`），`?enqueue=<type>` query 可 enqueue。
- 若 `enqueue` 有值 → 建立對應 job（帶 dedupe_key），回應 `{ enqueued }`。
- 否則 claim ≤ limit（預設 3）→ 執行 → 100 秒預算內讓位。
- job 型別：`plan_slots`、`generate_article`、`publish_article`、`verify_publish`、`refresh_site_pages`、`site_health`、`send_digest`。

### content-publish

| action | 權限 | payload | data |
|---|---|---|---|
| `approve` / `reject` / `confirm` | approve | `{ article_id, expected_version, reason?, scheduled_publish_at? }` | `ContentArticle` |
| `build_package` | approve | `{ article_id }` | `{ package_path, signed_url, filename }` |
| `manual_done` | write | `{ article_id, live_url }` | `ContentPublishLog` |
| `retry` | approve | `{ article_id }` | `{ queued: true }` |

### content-digest

| action | 權限 | payload | data |
|---|---|---|---|
| `preview` | view | `{ date? }` | `ContentDigestEmail`（不寄） |
| `send` / `resend` | manage_settings | `{ date?, resend? }` | `ContentEmailDigest` |

## 7. 硬規則（違反即退）

1. **不得修改**：`src/lib/content*.ts`、`src/components/tools-center/content/ContentAutomationCenter.tsx`、`shell/*`、`src/context/*`、`src/types/app.ts`、既有任何模組。
2. 不得新增 npm 依賴；不得改 `package.json`。
3. 不得 `any` 滿天飛；型別只從 `contentTypes.ts` 取。
4. 不得在 UI 直接寫 `fetch`；一律 `invokeContentFunction`。
5. 不得在 `src/lib/content*.ts` 引入 React／supabase／瀏覽器 API。
6. SQL 一律不改既有 policy、不 drop／delete／truncate（本階段只寫前端與函式）。
7. 不確定就先讀現有檔案：`readdy-framer/*`、`website/gsc/*`、`hooks/useSeoKeywords.ts` 是本 repo 的風格樣本。
