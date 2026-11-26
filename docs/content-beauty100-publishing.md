# Beauty100 自動發佈接入 MPS · 設計與營運手冊

> 版本：v1.0（2026-11-26）
> 範圍：只改 `D:\Project\MPS`。**不改 `D:\Project\beauty100-Next.js`、不改 Beauty100 程式碼、不 push、不未經批准推送 migration／部署。**

---

## 1. 結論

MPS 新增真正的 `beauty100` adapter，用 **專用 Beauty100 管理員帳號** 取得 Supabase JWT，直接呼叫 Beauty100 既有的：

- `POST /rest/v1/blog_articles`（發佈）
- `DELETE /rest/v1/blog_articles?id=eq.{id}`（真正刪文）
- `POST /storage/v1/object/{bucket}/...`（封面）

不新增 Beauty100 端點、不改它的資料表。MPS 仍走既有狀態機：

```
pending_review --approve--> approved --confirm--> scheduled --worker--> publishing --adapter--> published
```

### 需求對照

| 需求 | 落點 |
|---|---|
| 網站內容自動化看到 Beauty100 連接 | 站點清單標籤、站點詳情「Beauty100 連接」卡、測試連線實際驗證登入／表／bucket |
| 管理員審核過才可發 | `approve` 權限不變（management／system_dev／chief_editor）；`confirm` 與 worker 加 `reviewer_id`＋`approved_at` 硬閘門；沒封面擋 |
| 看得到狀態、可刪除 | 文章佇列「發佈」欄、工作室狀態帶；既有「刪除站點文章…」呼叫 Beauty100 真正刪文；回執永久保留 |

### 刪文後排版

**不會變佔位符。** 列表頁都是向 Supabase 抓 `status='active'` 的陣列再 `map`；刪除 row 後下一次載入少一張卡，CSS grid 自動重排。首頁是 ISR（`revalidate=300`），最多 5 分鐘後重排；被刪文章自己的詳情頁顯示「找不到文章」，不是空白卡片。`sitemap.xml` 是 build-time，可能暫時保留舊網址，不影響版面。

---

## 2. 已確認決策

| # | 決策 | 選擇 |
|---|---|---|
| 1 | 寫入身份 | 專用 Beauty100 管理員帳號（email + 密碼，存 MPS 加密憑證庫） |
| 2 | 發佈分類 | `trending-topics`（焦點話題，網址 `/topics/{handle}`） |
| 3 | 批准權限 | 管理層 + 總編輯（維持現狀） |
| 4 | 刪除入口 | 只在審核工作室（現有按鈕） |
| 5 | 內文映射 | 整篇 HTML 放 `intro`，`section_1–5` 留空 |
| 6 | 封面政策 | 必須有封面才可發佈 |

---

## 3. 現況與缺口

### 3.1 MPS

| 能力 | 現況 |
|---|---|
| Adapter registry | `beauty100` 目前 alias 到 `nextCustomAdapter`，會打不存在的 `/api/content/*` |
| 自動發佈 | `content-worker.runAutoPublishJob` 已存在，支援 `direct/draft` |
| 真遠端刪除 | `content-publish.delete_published` → `content-worker.delete_article` 已存在 |
| 審核 | `approve/confirm/delete_published` 需 `approve` 權限 |
| 狀態機 | `approved → scheduled → publishing → published`；`held` 可直接 `scheduled`（需補閘門） |
| UI | 工作室已有刪除；佇列缺發佈狀態；回執缺 `delete` label；站點頁缺 adapter 連線細節 |

### 3.2 Beauty100

| 項目 | 事實 |
|---|---|
| 技術 | Next.js 14 App Router；公開頁多為 client component，直接查 Supabase |
| 文章表 | `blog_articles`（`handle` unique、`intro jsonb`、`section_1..5_*`、`status draft/active`、`category`、`cover_image_url`） |
| 分類 | `facial-care`、`body-care`、`body-shaping`、`anti-aging`、`skincare`、`healthy-diet`、`entertainment`、`trending-topics`、`topics` |
| 路由 | trending-topics → `/topics/{handle}`；body-shaping 沒有專屬 `[slug]`，詳情 fallback 到 `/topics/{handle}` |
| 列表 | client 查 `status='active'` 後 `map`；首頁 server ISR 300 秒 |
| Storage | 封面使用 `uploads`／`blog-images` public bucket |
| RLS | `blog_articles` 由 `is_staff()`（`users.role` 為 `admin`／`marketing` 或 `roles` 陣列含兩者）管理 |
| Supabase | `https://gkqctvtteafjprkudgsb.supabase.co` |
| 已知站方問題 | production 文章頁 `<title>`／canonical 目前仍是分類預設值；MPS 因此改用 REST 驗證，不抓 HTML meta |

### 3.3 缺口

1. `beauty100` adapter 是假的。
2. adapter 輸入沒有 `section`／`author`／`tags`，無法決定分類與作者。
3. 沒有封面搬運。
4. `held → scheduled` 可繞過批准；confirm 會用呼叫者補批准欄位。
5. HTML 驗證會被站方 metadata 問題誤判。
6. 狀態／回執 UI 不完整。
7. 沒有 Beauty100 專用 credential kind。

---

## 4. 架構

```
MPS UI
  ├─ 站點清單／詳情（連接、測試）
  ├─ 文章佇列（發佈狀態）
  └─ 審核工作室（批准、排程、刪除站點文章）
        │
        ▼
MPS Supabase
  ├─ content-publish   approve / confirm / delete_published
  ├─ content-sites     save_credential / test_connection
  └─ content-worker    publish_article / verify_publish / delete_article
        │  adapter = beauty100
        ▼
Beauty100 Supabase
  ├─ Auth password grant → staff JWT
  ├─ PostgREST blog_articles SELECT/INSERT/DELETE
  └─ Storage uploads（封面）
```

---

## 5. 資料映射

| MPS | Beauty100 | 規則 |
|---|---|---|
| `title` | `title` | 直接 |
| `slug` | `handle` | 直接；唯一；URL 用 `encodeURIComponent` |
| `meta_title` | `seo_title` | 空則 title |
| `meta_description`／`excerpt` | `seo_description` | 空則截斷正文 155 字 |
| `seo_defaults.author` | `author` | 預設「Beauty100 編輯部」 |
| keyword + section.name | `tags` | 去重、最多 5 個 |
| `body_html` | `intro` | 整篇 HTML 字串；section 全 null |
| cover bytes | `cover_image_url`／`cover_image_alt` | 上傳 `uploads`；alt=title |
| 固定 | `status` | `active` |
| 固定 | `category` | `trending-topics`（可由 section.external_id 覆寫） |
| 發佈當下 | `published_at` | now ISO |
| 固定 | `is_celebrity` | `false` |
| remote id | MPS `external_id` | 寫回 |
| 計算 | MPS `live_url`／`canonical` | `/topics/{handle}`（依分類） |

### 分類 → 網址

```
trending-topics / topics → /topics/{handle}
facial-care              → /facial-care/{handle}
body-care                → /body-care/{handle}
body-shaping             → /topics/{handle}
anti-aging               → /anti-aging/{handle}
skincare                 → /skincare/{handle}
healthy-diet             → /healthy-diet/{handle}
entertainment            → /entertainment/{handle}
```

---

## 6. 憑證與連線

### 6.1 憑證格式（kind = `beauty100_admin`）

```json
{
  "supabase_url": "https://gkqctvtteafjprkudgsb.supabase.co",
  "anon_key": "<Beauty100 public anon key>",
  "email": "<專用 staff email>",
  "password": "<密碼>",
  "bucket": "uploads"
}
```

- 專用帳號必須在 Beauty100 的 `users.role` 是 `admin` 或 `marketing`（站方 `is_staff()` 的條件），
  建議用站方 admin → Staff 建立一個只給 MPS 用的帳號，不要共用個人帳號；也不要開 MFA
  （password grant 不支援 MFA）。
- 存 `content_site_credentials`（AES-256-GCM 加密）；前端只看 fingerprint。
- `bucket` 可選，預設 `uploads`；若站方 storage policy 不允許，改用 `public`（見 §14）。
- 舊的 `http_bearer` 憑證不會被 beauty100 adapter 採用；切換後請在憑證卡清除舊的那筆。
- 不把密碼／token 寫進 log 或錯誤訊息。

### 6.2 儲存驗證

`content-sites.save_credential` 對 `beauty100_admin`：

- 必須是合法 JSON。
- `supabase_url` 必須 `https://`。
- `anon_key`／`email`／`password` 必填。
- `bucket` 只允許 `[a-z0-9-_]`。
- 錯誤回 `400 invalid_credential`，列出缺少欄位。

### 6.3 連線測試

新增 check kind `adapter`：

1. Config 完整。
2. Auth：password grant 成功。
3. Table：帶 JWT 讀 `blog_articles` 成功。
4. Category：至少一個欄目且分類合法。
5. Storage：上傳 `_mps_probe/{uuid}.txt` 後刪除（上傳失敗 blocking；刪除失敗 warning）。

健康：settings／domain／**adapter** 任一失敗 → `down`；只有 sitemap 失敗 → `degraded`。

---

## 7. 發佈

### 7.1 流程

```
approve（管理層/總編）→ approved
confirm（排程）→ scheduled
worker 到點 → publishing → adapter：
  1. 登入
  2. 查 handle 是否已存在
     - 不存在 → 建
     - 存在且 title 相同 → adopt（上次成功但未回寫）
     - 存在且 title 不同 → slug_conflict
  3. 上傳封面
  4. INSERT blog_articles
  5. 回傳 externalId／liveUrl／canonicalUrl
→ published（寫 external_id／live_url／canonical／published_at）
→ verify_publish（REST 驗證）
```

### 7.2 硬閘門

只對 `publish_mode !== 'manual'`：

- `reviewer_id` 與 `approved_at` 必須存在；否則 `409 not_approved`（confirm）／`publish_failed`（worker）。
- site.status 必須 `active`。
- `requiresCover` 的 adapter（beauty100）必須有 `cover_asset_id`；否則 `409 cover_required`。

### 7.3 失敗分類

| 情況 | 可重試 |
|---|---|
| 憑證錯／帳號停用／slug_conflict／缺封面 | 否 |
| 429／5xx／timeout | 是（max 3） |
| insert 後 MPS 寫回失敗 | 重試 adopt 同 title row |

### 7.4 狀態顯示

| 條件 | 顯示 |
|---|---|
| `deleted_at` | 已下架（遠端刪除） |
| `verify_failed` | 上線驗證失敗 |
| `publish_failed` | 發佈失敗 |
| `published` + verify ok | 已發佈（成功） |
| `published` 無 verify | 已發佈（驗證中） |
| `publishing` | 發佈中 |
| `scheduled` | 排隊中（超過 10 分鐘提示檢查 worker） |
| `approved` | 已批准（未排程） |
| 其他 | 未排程／不可發佈 |

---

## 8. 上線驗證

`ContentAdapter` 新增可選 `verifyArticle`；worker 有就用，沒有才走既有 HTML 檢查。

Beauty100 REST 驗證：

1. row 存在。
2. `status='active'`。
3. `handle` 一致。
4. `title` 一致（或 seo_title）。
5. 封面 URL 存在且 HEAD 200。
6. live URL HTTP 200。

**不檢查** HTML title／meta／canonical／JSON-LD：站方目前文章頁 metadata 是分類預設值，HTML 檢查會誤判成功為失敗。

---

## 9. 刪除與排版

```
工作室「刪除站點文章…」→ delete_published
  → delete_article job
  → DELETE /rest/v1/blog_articles?id=eq.{external_id}
  → 成功：cancelled + deleted_at + deleted_reason；清 live_url
  → 寫 delete 回執（append-only）
  → 封面 best-effort 刪除（失敗只 warning）
```

- 404／空陣列 → `alreadyGone`，視為成功。
- 失敗：不寫 `deleted_at`；寫一筆 `delete` 失敗回執，job 依 5xx/429 重試。
- MPS 文章 row 不刪；只標記已下架。

### 排版重排

| 頁面 | 行為 |
|---|---|
| `/topics`、分類頁 | client `map`；刪除後下一次載入重排 |
| 首頁 | server ISR 300s；最多 5 分鐘 |
| `/topics/{handle}` | client 找不到 → 「找不到文章」狀態 |
| 側欄／相關 | client 查詢，下一次載入更新 |
| sitemap | build-time，可能延遲；不影響版面 |

**不會變佔位符**：站方沒有 fixed slots／placeholder 元件。

---

## 10. UI

- 站點清單：`Beauty100 自動發佈` 標籤、網域連結。
- Beauty100 在站點清單以**專用卡**置頂：有管理設定、文章佇列、排程、測試連線、暫停／啟用、前往官網；
  **不提供「移除接入」**（站點詳情也不顯示），避免一次連帶刪除 MPS 的文章、排程與憑證。
- 站點詳情：Beauty100 連接卡（adapter／模式／分類／憑證／健康／最後測試／前往網站）。
- 憑證卡：adapter=beauty100 時預設 kind `beauty100_admin`，JSON textarea＋範本。
- 文章佇列：新增「發佈」欄（狀態 pill／live URL／失敗原因）。
- 工作室：發佈狀態帶；刪除文案加入 Beauty100。
- 回執：`delete` action label／filter。
- Confirm：direct 文案改成「到點由 adapter 直接公開」；顯示分類與 URL；未批准／沒封面 disabled。

---

## 11. 檔案變更

| 檔案 | 變更 |
|---|---|
| `src/lib/contentBeauty100.ts`（新） | 憑證解析、分類常數、URL、範本 |
| `src/lib/contentTypes.ts` | `beauty100_admin`、`adapter` check kind |
| `src/lib/contentState.ts` | `publishStage`、`isApprovedForPublish`、文案、`ADAPTER_REQUIRES_COVER` |
| `supabase/functions/_shared/contentAdapters/types.ts` | section／author／tags、canonicalUrl、requiresCover、verifyArticle、delete cover |
| `supabase/functions/_shared/contentAdapters/beauty100.ts`（新） | 完整 adapter |
| `supabase/functions/_shared/contentAdapters/index.ts` | 改指向真 adapter |
| `supabase/functions/content-worker/index.ts` | 發佈／刪除／驗證／guard |
| `supabase/functions/content-publish/index.ts` | confirm 閘門 |
| `supabase/functions/content-sites/index.ts` | 憑證驗證、adapter check、health |
| `src/hooks/useContentSites.ts` | 憑證選項、check label、文章欄位 |
| `src/components/tools-center/content/seo/SiteListView.tsx` | Beauty100 標籤 |
| `src/components/tools-center/content/seo/SiteDetailView.tsx` | 連接卡、憑證 textarea、文章發佈欄 |
| `src/components/tools-center/content/seo/ArticleQueueView.tsx` | 發佈欄 |
| `src/components/tools-center/content/seo/ArticleStudioView.tsx` | 狀態帶、刪除文案 |
| `src/components/tools-center/content/seo/PublishLogView.tsx` | delete label |
| `src/components/tools-center/content/seo/ConfirmDialog.tsx` | direct 文案、封面／批准 disabled |
| `supabase/migrations/20261127130000_content_beauty100_publish.sql`（新） | 兩個 CHECK 擴充 |
| `scripts/content-adapter-contract.mjs` | Beauty100 契約測試 |
| `scripts/beauty100-selftest.mjs` | Beauty100 純函式回歸測試（8 項） |
| `scripts/content-selftest.mjs` | 純函式測試 |
| `scripts/beauty100-smoke.mjs`（新） | 真實環境 smoke |
| `package.json` | `content:beauty100-smoke`、`content:beauty100-selftest` |
| `docs/content-automation-deployment.md`／`content-operations-manual.md`／`content-troubleshooting.md` | 補本次說明 |

---

## 12. 部署（未執行）

1. 只套用 `20261127130000_content_beauty100_publish.sql`（不要 `db push`）。
2. 部署 `content-sites`、`content-publish`、`content-worker`（`--use-api`）。
3. 前端 build／部署（不 push）。
4. 站點：adapter=`beauty100`、publish_mode=`direct`、status=`active`；欄目 `external_id='trending-topics'`。
5. 貼 credential JSON → 儲存 → 測試連線。
6. 依驗收清單測試。

### 回滾

| 級別 | 做法 |
|---|---|
| L1 | publish_mode 改 `manual`／site paused |
| L2 | 清除 `beauty100_admin` 憑證 |
| L3 | 重新部署上一個函式版本 |
| L4 | CHECK 改回原清單 |
| L5 | 既有「移除接入」（不動 Beauty100 已發文章） |

---

## 13. 測試

- `node scripts/content-adapter-contract.mjs`
- `node scripts/beauty100-selftest.mjs`
- `node scripts/content-selftest.mjs`- `npx tsc --noEmit`（只看本次檔案）
- `npm run build`
- `node scripts/beauty100-smoke.mjs --test-connection`
- `node scripts/beauty100-smoke.mjs --full --cleanup`（需同意；會寫 Beauty100）

Production 驗收：未批准 409、沒封面 409、排程 → 排隊中 → 發佈中 → 已發佈、Beauty100 列表出現、刪除後列表重排且 URL 顯示「找不到文章」、回執有 delete。

---

## 14. 風險

| 風險 | 對策 |
|---|---|
| staff 帳號權限大 | 專用帳號、強密碼、輪換；不用 service_role |
| `uploads` bucket policy／MIME 不明 | 測試連線上傳＋公開讀取 probe；必要時改 `bucket: "public"`，或在 MPS 換 PNG／JPG 封面 |
| 站方 metadata bug | REST 驗證繞開；SEO 問題另跟進 |
| 首頁 ISR 5 分鐘 | 可接受；列表即時 |
| 併發／重試 | handle 查重＋title adopt |
| 已發文章再編輯 | 本次不支援 |
| 中文 handle | `encodeURIComponent`＋測試 |
| SVG 封面社交分享 | 站方列表可顯示；未來可轉 PNG |
