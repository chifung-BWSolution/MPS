# PRD｜社媒自動化營運（B100 併入 MPS 工具中心）

| 項目 | 內容 |
|---|---|
| 版本 | v1.1 |
| 日期 | 2026-11-25 |
| 狀態 | 待批准 |
| 類型 | 功能合併 + 新子系統 |
| 來源專案 | `D:\Project\B100-Manager`（Beauty100 Desk） |
| 目標專案 | `D:\Project\MPS` |
| 落點 | 工具中心 → 社媒自動化營運（`#tools-center/social-automation`） |
| 配套文件 | `執行清單-社媒自動化營運-v1.0.md`（同目錄） |

> 檔名沿用 `-v1.0` 以免既有連結失效；實際內容為 **v1.1**，兩份文件已同步修訂。

**v1.1 修訂紀錄（資料安全審查後）**

| # | 修訂 | 原因 |
|---|---|---|
| 1 | `seo_keywords` 5 個新欄改為**全部不給 DEFAULT**；`pipeline_status` 為 NULL 表示未啟用；planner 只挑 `='backlog'` 並用 `priority desc nulls last` | 原設計的 `default 'backlog'` 會回填全部歷史關鍵字，令其被自動生成 |
| 2 | `content_sites` FK 由 `on delete cascade` 改 **`on delete restrict`** | 避免既有「刪站點」操作連帶清空插件資料 |
| 3 | Storage 政策強制帶 `bucket_id='content-assets'`，bucket 改 **private** | 避免誤開放其他 bucket；草稿內容不應有公開 URL |
| 4 | pg_cron 改為**先部署函式、後建 job**，且要求進版本控制或留完整 SQL | 避免每 2 分鐘對不存在的函式發請求 |
| 5 | 新增 §6.6 施工安全規則、§13.1 SQL 安全審查 | 把「不破壞線上資料」變成可執行的檢查，而非口頭約定 |
| 6 | 新增前端 `42P01` 降級要求、`daily_article_limit` 出廠 0 | 部署順序顛倒或忘記啟用時，不出現白屏與意外花費 |

---

## 1. 背景與目標

### 1.1 背景

B100-Manager 是一個可運行的自媒體內容中台，包含兩條產品線：

1. **社媒線**（已可跑通）：熱點 → 生成「1 篇站內長文 + 每帳號一條導流」→ 人工審核 → 排期／發佈 → 數據回收。
2. **網站 SEO 線**（設計階段，完成度約 20–25%）：站點接入 → SEO 關鍵字 → 按站點頻率自動排程生成 → 總編輯 Confirm → 自動發佈 → 每日 Email 匯報。

MPS 是公司既有的營運中台（15 個模組、約 13.9 萬行原始碼、247 支 migration、38 支 Edge Functions），已有 Supabase 後端、員工身分、站點清單、GSC 倉儲、Resend 寄信與 pg_cron 排程。

本專案要把 B100 併入 MPS 的「工具中心」，成為一個插件，並重新設計 UI 與功能以符合 MPS 的設計語言與資料架構；同時補齊 B100 尚未實作的「自動化文章輸出三階段流程」。

### 1.2 目標

| # | 目標 | 衡量方式 |
|---|---|---|
| G1 | 集中管理站點與內容生產 | 一個後台可管理 50 站的站點、關鍵字、排程、文章、審核、發布與日報 |
| G2 | 依頻率自動生成文章 | 每站可設每日／隔日／每週，系統自動產生未來 30 天排程並按時生成 |
| G3 | 人工閘門不可繞過 | 未經總編輯 Confirm 的文章，任何路徑都不會上線 |
| G4 | 發布可追溯 | 每篇有 external_id／live URL／回執／重試紀錄 |
| G5 | 每日可視 | 每日固定時間寄出內容日報（或明確標示未寄出且可重寄） |
| G6 | 不破壞既有系統 | 其餘 15 個模組行為不變；`tsc --noEmit` 與 `npm run build` 通過 |

### 1.3 非目標（本期不做）

- Meta／Threads／Instagram 真 API 發佈（第二期）。
- Shopify／WordPress／Webflow adapter（本期只做 `manual`，adapter 介面先定義）。
- 熱點自動抓取與 LLM 事件聚簇（第二期）。
- B100 的公開雜誌站 `/magazine` 與手機交付頁 `/m/[postId]`。
- 已發佈文章的自動更新／撤回。
- B100 `data/b100.sqlite` 的歷史資料遷移。

---

## 2. 現況盤點

### 2.1 MPS

| 維度 | 現況 |
|---|---|
| 形態 | Vite + React 18 SPA，hash 路由 `#module/subModule`，單頁 15 個模組 |
| 資料 | 前端以 `supabase-js` 直連 Supabase；RLS 多為 `authenticated` 全開 |
| 後端 | 38 支 Edge Functions（Deno）、247 支 migration、Storage bucket、pg_cron + pg_net |
| 身分 | Supabase Auth，`users.role` + `staffs` 名錄；8 種內部角色 |
| 設計 | `#f5f8fc` 底、白卡、teal `#0D9488`、4px 圓角、Space Grotesk |
| 工具中心 | 8 個子項；只有 `Readdy → Framer 轉換` 是真功能，其餘為 `setTimeout` 假資料 |

**可直接複用的資產**

| 需求 | 現有資產 | 位置 |
|---|---|---|
| 站點註冊表 | `webandsystem_list`（domain／platform／brand／status／articles_count） | `supabase/migrations/20240618_create_webandsystem_list.sql` |
| 關鍵字庫 | `seo_keywords`（掛站點、來源 manual/gsc/ads/import、UNIQUE(站, 正規化詞)） | `supabase/migrations/20260805120000_gsc_seo_warehouse.sql` |
| GSC 機會詞 | `gsc_sites`／`gsc_query_daily_metrics`／`sync-gsc`／`gsc-oauth` | 同上 |
| 寄信 | `send-email`（to 可陣列、支援 cc/bcc/idempotencyKey）+ `_shared/resend.ts` | `supabase/functions/send-email/index.ts` |
| 收件人挑選 UI | `useStaffEmailRecipients` + 員工多選對話框 | `src/hooks/useStaffEmailRecipients.ts`、`src/components/marketing/AdsEmailAlertDialog.tsx` |
| 排程 | pg_cron + pg_net（GA4／GSC／廣告皆在用） | `supabase/migrations/20260818080054_ga4_incremental_daily_cron.sql` |
| 富文本 | `@tiptap/react`、`react-markdown`、`@tiptap/starter-kit` | `package.json` |
| 既有站點資料 | Beauty100 Magazine 已是影片頻道 V41（IG/FB 已開、Threads 待開） | `supabase/migrations/20260630_create_vchannels.sql` |

### 2.2 B100

| 維度 | 現況 |
|---|---|
| 形態 | Next.js 15 App Router、Server Components、25 支 Route Handler |
| 資料 | `node:sqlite`（21 張表）於 `data/b100.sqlite`；檔案在 `public/uploads` |
| 排程 | 程序內 `setInterval`（每分鐘發佈、每小時掃描、每 6 小時回收、每日續期） |
| 密鑰 | AES-256-GCM（`VAULT_SECRET`），密文存 sqlite |
| 身分 | 自建 cookie session，只有 admin / operator |

**核心能力**

- 熱點引擎：信源分級 → RSS／熱榜抓取 → URL 正規化 + 標題 simhash 判重 → 關鍵字預篩 → 雙評分 → 事件聚簇 → 熱度公式（tier 權重 × 24h 半衰）。
- 生成：1 篇站內長文（16:9 封面 + 章節插圖）+ 每平台每個帳號一條導流（同平台文案共用一份）。
- 審核狀態機：9 種狀態、9 個動作、admin/operator 兩級。
- 發佈：站內寫入 / IG / Threads / FB（Graph API 兩段式）、手動包（文案 + zip）、重試退避、每日上限與最小間隔、token 續期。
- 成本：`usage_logs` + 預算熔斷（full → single_score → vector_only → fetch_only）。

### 2.3 為什麼不能直接搬

| B100 依賴 | MPS 沒有 | 對策 |
|---|---|---|
| Node runtime（`fs`／`node:sqlite`／`Buffer`／`createHmac`） | 只有瀏覽器與 Deno | 資料改 Postgres，檔案改 Storage，加密改 WebCrypto |
| 程序內定時器 | 無長駐程序 | `content_jobs` + pg_cron + Edge Function worker |
| 1–3 分鐘的同步生成請求 | Edge Function 有時限 | 一 job 一呼叫、可續跑、超時讓位 |
| Next.js 的 server component 直讀 DB | SPA | 前端 hooks + RLS；重活用 Edge Function |
| cookie session | Supabase Auth | 沿用 MPS 身分與角色 |

---

## 3. 決策記錄

| # | 決策 | 選項 | 理由 | 影響 |
|---|---|---|---|---|
| D1 | 執行環境 | **全部搬進 Supabase** | 不需常開機器；與 MPS 部署形態一致 | 生成／發佈／排程全部改寫成 Edge Function + pg_cron |
| D2 | 資訊架構 | **一個入口，內分兩區** | 符合「工具中心一個功能」的要求；側欄只多一格 | 插件自帶二級路由（hash query） |
| D3 | 站點模型 | **複用並擴充 `webandsystem_list`** | 全公司一份站點清單；`seo_keywords`／GSC 立即可用 | 新增 `content_sites` 作 1:1 設定擴充 |
| D4 | 關鍵字來源 | **CSV 匯入 + GSC 機會詞** | 不新增付費工具；GSC 倉儲已在 | 需做 CSV 逐行驗證與去重 |
| D5 | 日報寄送 | **Resend，收件人可自訂** | `send-email` 已通用，零改動 | 收件人存 `content_settings`，非 env |
| D6 | 總編輯角色 | **新增 `chief_editor`** | 權限語義清楚，日後可擴 | 改 `UserRole`、AuthContext 映射、Sidebar 標籤 |
| D7 | 社媒發佈 | **v1 手動／演練** | Meta App Review 需數週，不應卡第一階段 | 社媒線保留完整生成與審核，發佈走內容包 |
| D8 | 生成模型 | **Gemini，免費層先試跑** | 沿用既有密鑰；先驗證品質再談成本 | 需硬上限、用量看板、超限順延 |
| D9 | 配圖 | **品牌素材 + 矢量圖卡保底** | 不接影像 API；風險最低 | 需自製 SVG 圖卡並上傳 Storage |
| D10 | beauty100 接入 | **先不寫收稿端點，內容包人工貼** | 站方未提供端點 | **第一階段里程碑改寫**（見 §9.1） |

---

## 4. 目標架構

```
┌────────────────────── MPS SPA（Vite / Vercel 靜態） ──────────────────────┐
│ 工具中心 → 社媒自動化營運                                                 │
│   ├─ 社媒營運區（P4）        └─ 網站內容自動化區（P1–P3）                 │
│ supabase-js 讀寫（RLS）；長任務一律丟 Edge Functions                      │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │ JWT / anon key
┌──────────────────────────────▼────────────────────────────────────────────┐
│ Supabase                                                                  │
│  Postgres：webandsystem_list / seo_keywords（複用）+ content_*（13 表）   │
│  Edge Functions：content-sites / content-keywords / content-worker /       │
│                  content-publish / content-digest                         │
│  pg_cron + pg_net：worker tick、planner、digest tick、health              │
│  Storage：content-assets（封面、插畫、內容包 zip）                        │
│  Secrets：CONTENT_VAULT_KEY（新）+ GEMINI_API_KEY / RESEND_API_KEY /      │
│           APP_PUBLIC_URL（已在用）                                        │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │ 出站
        ┌──────────────────────┼───────────────────────────┐
   Gemini API（生成）      Resend（日報）          目標站（v1 人工貼）
```

### 4.1 架構約束

| 約束 | 對策 |
|---|---|
| Edge Function 執行時限 | 一 job 一呼叫；worker 每輪最多 3 個 job、達 100 秒即讓位 |
| 無長駐程序 | `content_jobs` + lease（`FOR UPDATE SKIP LOCKED`）；重啟自動恢復 |
| 前端不得持有密鑰 | 憑證只由 Edge Function 以 AES-256-GCM 解密；表對 `authenticated` 不開放 SELECT |
| 前後端判定要一致 | 排程、SEO 閘門、日報統計、狀態機寫成純函式於 `src/lib/content*.ts`，Edge Function 以相對路徑 import（MPS 已有 `siteUrl.ts`／`receivablesAlert.ts` 先例） |
| 圖片不可用本機路徑 | 一律上傳 Storage；內容包內含圖片檔 |

---

## 5. 資訊架構與路由

### 5.1 路由

插件掛在既有 hash 路由下，二級路由用 query（`AppContext.parseHash` 會保留 query）：

```
#tools-center/social-automation?zone=social|seo&page=<page>&id=<uuid>
```

| zone | page | 畫面 | 來源 |
|---|---|---|---|
| social | overview | 今日工作 | B100 `/desk` |
| social | queue | 進度看板（瀑布流） | B100 `/queue` |
| social | studio | 審核工作室（批次） | B100 `/studio/[id]` |
| social | radar | 熱點雷達 | B100 `/radar` |
| social | calendar | 發佈日曆 | B100 `/calendar` |
| social | library | 素材庫 | B100 `/library` |
| social | accounts | 品牌與帳號 | B100 `/admin/accounts` |
| social | usage | 用量 | B100 `/admin/usage` |
| social | settings | 設定／診斷 | B100 `/admin/settings`、`/admin/diagnostics` |
| seo | sites | 站點清單 | 設計書 §12 |
| seo | site | 站點詳情／接入精靈 | 設計書 §12 |
| seo | keywords | 關鍵字庫 | 設計書 §12 |
| seo | plan | 排程表 | 設計書 §12 |
| seo | articles | 文章佇列 | 設計書 §12 |
| seo | studio | 文章工作室（審核） | 設計書 §12 |
| seo | publish | 發佈回執 | 設計書 §12 |
| seo | digest | 每日日報 | 設計書 §12 |

預設 `zone=social`；最後瀏覽的 zone 記在 `localStorage`。

### 5.2 元件樹

```
src/components/tools-center/content/
├── ContentAutomationCenter.tsx      外殼：zone 切換、二級路由、錯誤邊界
├── shell/
│   ├── ContentZoneTabs.tsx          兩區切換
│   ├── ContentPageHeader.tsx        標題／副標／右側動作
│   ├── ContentStatusPill.tsx        狀態色票
│   ├── ContentEmptyState.tsx        空狀態引導
│   └── ContentMetricBar.tsx         今日生成／待審／已發／失敗
├── seo/
│   ├── SiteListView.tsx
│   ├── SiteWizard.tsx               5 步接入精靈
│   ├── SiteDetailView.tsx           設定／欄目／關鍵字／文章／健康
│   ├── SeoDefaultsForm.tsx          每站 SEO 預設 + 送出預覽
│   ├── KeywordLibraryView.tsx       列表 + CSV 匯入 + GSC 機會詞
│   ├── KeywordImportDialog.tsx      逐行錯誤回報
│   ├── PlanBoardView.tsx            站點 × 日期矩陣
│   ├── ArticleQueueView.tsx
│   ├── ArticleStudioView.tsx        左預覽 / 右檢查 / 底決策
│   ├── ArticleEditor.tsx            Markdown / 富文本 + 字數 + 樂觀鎖
│   ├── SeoQaPanel.tsx               硬／軟檢查
│   ├── ImagePickerPanel.tsx         素材挑選／換圖／重生成圖卡
│   ├── ConfirmDialog.tsx            批准 + 排定
│   ├── PublishLogView.tsx           回執
│   ├── DigestView.tsx               預覽／收件人／寄送紀錄／重寄
│   └── ContentSettingsView.tsx      模型／上限／cadence 預設
├── social/                           P4 才建（見 §10）
└── shared/
    ├── SiteSelect.tsx
    ├── KeywordSelect.tsx
    └── ContentTable.tsx             搜尋／排序／篩選／分頁／匯出 CSV
```

### 5.3 既有檔案改動（僅 5 處）

| 檔案 | 改動 |
|---|---|
| `src/context/AppContext.tsx` | `tools-center.subMenus` 加 `{ id: 'social-automation', label: '社媒自動化營運' }` |
| `src/components/tools-center/ToolsCenterModule.tsx` | 比照 `readdy-framer` 早退：`if (subModule === 'social-automation') return <ContentAutomationCenter />` |
| `src/types/app.ts` | `UserRole` 加 `'chief_editor'` |
| `src/context/AuthContext.tsx` | `mapRoleToInternal`／`mapRoleTagDisplay` 支援 `chief_editor`；`AppContext.validRoles` 加值 |
| `src/components/layout/Sidebar.tsx` | `getRoleLabel` 加「總編輯」 |

---

## 6. 資料模型

### 6.1 複用（不改語義）

| 表 | 動作 |
|---|---|
| `webandsystem_list` | **不改**。站點身份主檔（`id`／`domain_url`／`platform`／`brand`／`status`／`level`） |
| `seo_keywords` | 只加 5 個 nullable 欄，**全部不給 DEFAULT**（見 6.2.2）。既有列一律保持 NULL，不被回填、不被現有流程讀取 |
| `gsc_query_daily_metrics` | **不改**。機會詞來源 |
| `users` / `staffs` | **不改**。作者與審核人 |

### 6.2 新增表

#### 6.2.1 `content_sites`（站點設定，1:1 擴充）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `website_profile_id` | text PK | FK → `webandsystem_list(id)` **on delete restrict**（不可 cascade，見 §6.6 規則 3） |
| `tier` | text | `A1` / `A2` / `B` |
| `adapter` | text | `manual` / `next_custom` / `shopify` / `wordpress` / `webflow` / `beauty100` |
| `publish_mode` | text | `manual` / `draft` / `direct` |
| `locale` | text | 預設 `zh-HK` |
| `timezone` | text | 預設 `Asia/Hong_Kong` |
| `cadence` | jsonb | 見 6.2.5 |
| `seo_defaults` | jsonb | 見 §9.1.3 |
| `brand_voice` | jsonb | 語氣、禁用詞、讀者、CTA、事實邊界 |
| `health` | text | `untested` / `ok` / `degraded` / `down` |
| `last_verified_at` | timestamptz | |
| `status` | text | `active` / `paused` / `archived` |
| `notes` | text | |
| `created_at` / `updated_at` | timestamptz | |

#### 6.2.2 `seo_keywords` 加欄

| 欄位 | 型別 | 說明 |
|---|---|---|
| `intent` | text | `informational` / `commercial` / `transactional` / `navigational` |
| `priority` | int | 越大越先（人工 pin = 1000）。**不給 DEFAULT**，NULL 代表未分級 |
| `cluster` | text | 主題叢集 |
| `pipeline_status` | text | `backlog` / `planned` / `generating` / `in_review` / `published` / `rejected` / `parked`。**不給 DEFAULT**，NULL 代表「未啟用自動生成」 |
| `last_used_at` | timestamptz | |

> 既有 `status`（monitoring / optimizing / achieved / paused）語義不動，供 SEO 監控用。

**施工語句（必須照這個寫，不得加 DEFAULT）**

```sql
alter table public.seo_keywords
  add column if not exists intent          text,
  add column if not exists priority        integer,
  add column if not exists cluster         text,
  add column if not exists pipeline_status text,
  add column if not exists last_used_at    timestamptz;
```

**為什麼不能給 DEFAULT**：Postgres 的 `ADD COLUMN ... DEFAULT` 會讓既有列一併生效。若寫 `pipeline_status text default 'backlog'`，全站歷史關鍵字會在一瞬間變成「可被 planner 挑選」，接入站點後可能被自動拿去生成文章——這是資料語義被靜默改寫，不是程式錯誤，但更難發現。

**配套規則（寫進 planner 與 UI）**

1. planner 只挑 `pipeline_status = 'backlog'` 的詞；NULL 一律視為不可用。
2. 由人在「關鍵字庫」明確把要用的詞改為 `backlog`（單筆或批次），不可批次全選「全部歷史詞」。
3. 排序 `order by priority desc nulls last`——Postgres 的 `desc` 預設把 NULL 排最前，漏了 `nulls last` 會讓未分級的詞反而最優先。
4. `content-keywords` 匯入函式寫入時才設定 `pipeline_status`；既有詞不被觸碰。

#### 6.2.3 `content_site_sections`

`id uuid` PK、`site_id` FK、`name`、`external_id`、`slug`、`content_type`（article/post/page）、`mapping jsonb`、`created_at`。UNIQUE(site_id, slug)。

#### 6.2.4 `content_site_credentials`

`id uuid` PK、`site_id` FK、`kind`（`http_bearer` / `http_hmac` / `wp_app_password` / `shopify_admin` / `webflow_token`）、`ciphertext text`、`fingerprint text`（只顯示尾碼）、`expires_at`、`last_verified_at`、`status`（`active` / `invalid` / `untested`）。UNIQUE(site_id, kind)。**RLS 只給 service_role**。

#### 6.2.5 `content_slots`

`id uuid` PK、`site_id` FK、`keyword_id` FK→`seo_keywords`、`publish_at` timestamptz、`generate_at` timestamptz、`status`、`article_id uuid`、`reason text`、`created_at` / `updated_at`。UNIQUE(site_id, publish_at)，INDEX(status, generate_at)。

`cadence` JSON 結構：

```json
{
  "frequency": "daily|every_2_days|twice_weekly|weekly|custom",
  "weekdays": [1, 4],
  "publish_time": "10:00",
  "lead_time_hours": 48,
  "review_cutoff_hours": 4,
  "max_articles_per_day": 2,
  "blackout_dates": ["2026-12-25"]
}
```

#### 6.2.6 `content_articles`

| 欄位 | 說明 |
|---|---|
| `id` uuid PK | |
| `site_id`、`section_id`、`keyword_id`、`slot_id` | FK |
| `title` / `slug` / `excerpt` | |
| `body_md` / `body_html` | 正規內容與渲染後內容 |
| `cover_asset_id`、`image_asset_ids jsonb` | 指向 `content_assets` |
| `meta_title` / `meta_description` / `canonical` | |
| `og jsonb` / `json_ld jsonb` | |
| `language` | |
| `status` | 見 6.3 |
| `version int default 1` | 樂觀鎖 |
| `author_id` / `reviewer_id` | → `users` |
| `approved_at` / `scheduled_publish_at` / `published_at` | |
| `external_id` / `live_url` / `manual_url` | 發佈回執 |
| `checks jsonb` | 硬／軟檢查結果快照 |
| `created_at` / `updated_at` | |

UNIQUE(site_id, slug)、UNIQUE(site_id, keyword_id)。

#### 6.2.7 其餘表

| 表 | 用途 | 關鍵欄位 |
|---|---|---|
| `content_site_pages` | 內鏈與 cannibalization | `site_id`、`url`、`title`、`source`、`last_seen_at`；UNIQUE(site_id, url) |
| `content_article_revisions` | 版本快照 | `article_id`、`version`、`snapshot jsonb`、`actor_id`；UNIQUE(article_id, version) |
| `content_publish_logs` | append-only 回執 | `action`、`request jsonb`、`response jsonb`、`external_id`、`url`、`http_status`、`duration_ms`、`idempotency_key`、`actor_id` |
| `content_jobs` | 佇列 | `type`、`payload jsonb`、`run_at`、`status`、`attempts`、`max_attempts`、`locked_by`、`locked_until`、`last_error` |
| `content_llm_usage` | LLM 用量 | `model`、`use_case`、`tokens_in`、`tokens_out`、`cost_usd`、`article_id` |
| `content_assets` | 素材 | `storage_path`、`source`（upload/ai_generated/vector）、`tags`、`license_info`、`width`、`height` |
| `content_email_digests` | 日報紀錄 | `date` UNIQUE、`recipients jsonb`、`subject`、`html`、`status`、`sent_at`、`error` |
| `content_settings` | 單列設定 | `id text PK default 'default'`、`model`、`daily_article_limit`、`daily_llm_call_limit`、`digest_time`、`digest_enabled`、`digest_recipients jsonb`、`breaker_mode`、`feature_flags jsonb` |
| `content_site_checks` | 連線與健康檢查紀錄 | `site_id`、`checked_at`、`kind`（`settings` / `domain` / `sitemap` / `credential`）、`ok`、`detail jsonb` |

> `content_settings` 的預設列必須 `insert ... on conflict (id) do nothing`，否則 migration 重跑會撞主鍵而整支失敗。

### 6.3 狀態機

```
article: draft → pending_review
                  ├─ changes_requested → draft
                  ├─ held（審核逾期，永不自動發）
                  ├─ approved → scheduled → publishing → published → updating → published
                  │                                      └→ publish_failed → scheduled（重試）
                  └─ cancelled
         manual: scheduled → manual_done（人工貼上後回填 URL）

slot:    planned → generating → draft_ready → in_review → approved → scheduled
         → publishing → published ／ failed ／ held ／ skipped

keyword: backlog → planned → generating → in_review → published → archived
                 ↘ rejected ／ parked

job:     queued → running → done ／ failed → queued（重試）／ dead
```

**硬性不變量（DB 檢查 + Edge Function 校驗）**

1. `approved` 必須有 `reviewer_id` 與 `approved_at`。
2. `scheduled` 必須有 `scheduled_publish_at`（或 `slot_id`）。
3. `published` 必須有 `external_id` 與 `live_url`。
4. `held` 必須有 `reason`，且不得由任何自動流程轉為 `published`。
5. `manual_done` 不計入「已公開發布」漏斗。
6. 一個關鍵字在一個站只產生一篇主文章（DB UNIQUE）。

### 6.4 RLS 原則

| 表 | authenticated | service_role |
|---|---|---|
| `content_sites`／`sections`／`pages`／`slots`／`articles`／`revisions`／`assets`／`settings` | SELECT/INSERT/UPDATE/DELETE | 全開 |
| `content_jobs`／`publish_logs`／`llm_usage`／`email_digests` | 只讀 | 全開 |
| `content_site_credentials` | **0 條 policy（deny all）** | 全開 |

**四條硬規則**

1. **既有 policy 零改動。** 本專案不執行 `drop policy`、`alter policy`，也不對任何既有表新增 policy。所有 policy 的 `on public.content_*` 目標都必須是新表。
2. **credentials 用「不建 policy」實現封閉**，而不是 `using (false)`；RLS 開啟 + 無 policy = 對 `authenticated` 全拒，`service_role` 仍可繞過。
3. **`content_claim_jobs` 必須 `security definer` + 固定 `search_path`**，並 `revoke all on function ... from public, anon, authenticated`、只 `grant execute ... to service_role`。否則任何登入使用者都能直接呼叫，把別人的 job 改成 `running` 卡死。
4. **Storage 政策每條都要帶 `bucket_id = 'content-assets'`**，且 bucket 設 **private**（不開 public read）。草稿文章與未上線內容包不應有公開 URL；預覽用 `createSignedUrl`（有效期 ≤ 1 小時），發佈流程不受影響（v1 為人工貼）。

### 6.5 Migration 檔案

| 檔名 | 內容 |
|---|---|
| `20261126090000_content_automation_core.sql` | `content_sites`、`site_sections`、`site_pages`、`site_credentials`、`site_checks`、`content_assets`、`seo_keywords` 加欄 |
| `20261126091000_content_automation_pipeline.sql` | `content_slots`、`content_articles`、`content_article_revisions`、`content_jobs`、`content_llm_usage`、claim RPC |
| `20261126092000_content_automation_publish.sql` | `content_publish_logs`、`content_email_digests`、`content_settings` |
| `20261126093000_content_automation_rls.sql` | 全部 RLS 政策、索引、`content-assets` bucket 與 storage 政策 |
| `20261126100000_content_social.sql` | P4 社媒線表（可延後至 P4 前再上） |
| `20261126110000_content_cron.sql` | pg_cron + pg_net 四支工作（worker tick／planner／digest tick／health） |

全部使用 `create table if not exists` / `add column if not exists`，與 repo 既有風格一致；RLS 政策用 `do $$ ... if not exists (select 1 from pg_policies ...) ... $$` 包覆，可重複執行。`seo_keywords` 的 5 個新欄**不得帶 DEFAULT**。

### 6.6 施工安全規則（不可協商）

> 目標：**任何一支 migration 出錯，都不應該影響既有資料與既有功能。**

| # | 規則 | 原因 |
|---|---|---|
| 1 | **只做加法**：不 `drop table`、不 `drop column`、不 `alter column ... type`、不 `rename`、不 `delete`、不 `truncate` | 這些是本專案唯一能真正破壞線上資料的語句，一律不做 |
| 2 | **既有表只碰 `seo_keywords`，且只加 nullable 欄、不給 DEFAULT** | 避免回填改寫既有語義（見 6.2.2） |
| 3 | **`content_sites` 的 FK 用 `on delete restrict`，不用 cascade** | `webandsystem_list` 是既有模組在用的表；cascade 會讓「刪站點」這個既有操作連帶清空插件資料。restrict 會擋下刪除並回報錯誤，資料不會消失 |
| 4 | **不改既有 RLS policy、不改既有 Storage policy、不改既有 pg_cron job** | 權限與排程是全站共用資源，改動的影響面無法用本專案的測試覆蓋 |
| 5 | **每支 migration 前後各一次結構快照** | 出錯時能 diff 出「到底改了什麼」，而不是靠記憶 |
| 6 | **前端必須容忍資料表不存在**（Postgres `42P01`） | 部署順序若顛倒（前端先上、migration 未跑），插件應顯示「功能尚未啟用」，不可白屏或拋錯 |
| 7 | **新功能預設關閉**：`content_settings.daily_article_limit` 初始值 0 | 裝好不等於開跑；由人明確設定後才開始生成 |

**明確禁止的語句（PR 內出現即退回）**

```sql
drop table ...            delete from ...          truncate ...
drop column ...           alter column ... type ...
drop policy ...           alter policy ...
cron.unschedule(...)      既有 function 的 create or replace
update public.<既有表>     （無 where 或 where 條件不是主鍵）
```

---

## 7. 後端設計

### 7.1 Edge Functions

| 函式 | 職責 | 主要輸入 | 主要輸出 |
|---|---|---|---|
| `content-sites` | 站點 CRUD、欄目同步、`testConnection`、憑證寫入（加密）、健康檢查紀錄 | `{ action, site_id, payload }` | 站點／健康結果／憑證 metadata |
| `content-keywords` | CSV 匯入（逐行驗證）、正規化去重、GSC 機會詞掃描 | `{ action: 'import'\|'scan_gsc', site_id, rows }` | `{ inserted, skipped, errors[] }` |
| `content-worker` | 認領並執行 job（`plan_slots` / `generate_article` / `publish_article` / `verify_publish` / `refresh_site_pages` / `site_health`） | `{ worker, limit }` | `{ processed, failed, duration_ms }` |
| `content-publish` | 產內容包（HTML + 圖片 + meta + 指引 + zip）、回填 URL、重試、撤回紀錄 | `{ action, article_id }` | 包路徑／回執 |
| `content-digest` | 組日報、寄送、寫紀錄、重寄 | `{ action: 'send'\|'resend', date }` | `{ status, id }` |

**共通要求**

1. 入口先驗 JWT（`Authorization: Bearer <user jwt>`）；cron 呼叫用 service role。
2. 每次寫入前重算角色權限（不信任前端）。
3. 所有回應走 `{ ok, data, error }`；錯誤碼沿用 MPS 風格（400 參數、403 權限、409 衝突、502 外部服務）。
4. CORS 標頭與現有函式一致。

### 7.2 Job Queue

- RPC：`content_claim_jobs(p_worker text, p_limit int)` → `select ... for update skip locked` 後 `update ... set status='running', locked_by=..., locked_until=now()+interval '5 min'`，回傳認領列。
- 重試：發布 3 次（1／5／15 分鐘）、生成 2 次；超過進 `dead`，寫入當日日報「待處理」。
- 崩潰恢復：`status='running' and locked_until < now()` → 回 `queued`。
- 並發：站點 1、全域 3。
- 額度守門：`generate_article` 執行前檢查 `content_settings.daily_article_limit` 與 `daily_llm_call_limit`；超限 → `run_at` 順延至次日 00:05，slot 轉 `held` 並記原因。

### 7.3 pg_cron

| 工作名 | 排程（UTC） | 動作 |
|---|---|---|
| `content-worker-tick` | `*/2 * * * *` | POST `content-worker`（limit 3） |
| `content-planner-daily` | `10 16 * * *`（00:10 HKT） | enqueue `plan_slots` |
| `content-digest-tick` | `0 * * * *` | 本地時間對上 `content_settings.digest_time` 才 enqueue `send_digest` |
| `content-health-daily` | `0 18 * * *`（02:00 HKT） | enqueue `site_health` + `refresh_site_pages` |

**建立順序（強制）**

1. 先部署 `content-worker` 等函式，並確認可用 service role 呼叫成功。
2. 再建立 cron job。**函式未部署就建 cron，等於每 2 分鐘製造一次失敗紀錄**，還會稀釋 Supabase 日誌。
3. 第一次建立後手動觸發一次，確認 `cron.job_run_details` 顯示 `succeeded`。

**可重現性要求**

不得只在 SQL editor 手動建立。migration 內以 `cron.schedule` + `if not exists (select 1 from cron.job where jobname = ...)` 包覆，做到可重複執行且進入版本控制；若因 service role key 不能入庫而必須手動，則把**完整 SQL 與執行日期**寫進 `docs/content-cron-setup.md`，並在 PR 描述附上 `select jobname, schedule, command from cron.job where jobname like 'content-%'` 的截圖。

### 7.4 Secrets

| Secret | 狀態 | 用途 |
|---|---|---|
| `CONTENT_VAULT_KEY` | **新增** | AES-256-GCM 加密站點憑證 |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | 已有 | 文章生成（模型由 `content_settings` 決定，預設 `gemini-2.5-flash`） |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | 已有 | 日報 |
| `APP_PUBLIC_URL` | 已有 | 日報深連結 |

### 7.5 前後端共用純函式

| 模組 | 內容 | 使用方 |
|---|---|---|
| `src/lib/contentState.ts` | 狀態機、合法轉換、狀態標籤 | 前端 UI、`content-worker` |
| `src/lib/contentPlanner.ts` | cadence → slots（時區、lead time、cutoff、blackout、冪等鍵） | 前端預覽、`plan_slots` job |
| `src/lib/contentSeoQa.ts` | 硬／軟檢查、字數、標題長度、內鏈、禁用詞 | 前端面板、`generate_article` |
| `src/lib/contentDigest.ts` | 日報統計與 HTML 組裝 | `content-digest`、Digest 預覽 |
| `src/lib/contentFormat.ts` | slug 正規化、日期、時區、字數 | 前後端共用 |

> Deno 匯入方式沿用 `supabase/functions/receivables-alert/index.ts` 的相對路徑寫法（`../../../src/lib/xxx.ts`），不引入任何瀏覽器 API。

---

## 8. 前端設計

### 8.1 設計語言對映

| B100 | MPS 對映 |
|---|---|
| 紙色底 `#faf8f3` + 石墨導軌 | `#f5f8fc` 底 + 既有側欄（`#0d1a2d`） |
| 朱紅 = 要你動手 | `--warning` 琥珀（待審／逾期）、rose（失敗） |
| 襯線標題、大留白 | Space Grotesk；頁標題 32px bold、副標 14px muted |
| 自製 `ui.tsx`（13KB） | 丟棄，改用 `src/components/ui/*`（61 個 shadcn 元件） |
| 自製 Rail／toast／dialog | 丟棄，改用頁內 tab bar + `sonner` + Radix Dialog |
| 圓角 2–4px、細邊 | `--radius: 4px`、`border-[rgba(13,26,45,0.08)]`、`shadow-card` |

**狀態色票**（統一由 `ContentStatusPill` 輸出）

| 狀態 | 顏色 |
|---|---|
| 草稿 | slate |
| 待審 | amber |
| 已批准 | teal |
| 已排程 | blue |
| 已發佈 | teal-700 |
| 待手動上線 | indigo |
| 已手動上線 | indigo outline |
| 失敗 | rose |
| held | amber outline |

### 8.2 畫面規格

#### 8.2.1 站點清單

```
┌ 內容自動化 · 站點 ────────────────────────────── [＋ 接入新站] ┐
│ 今日：生成 12 · 待審 5 · 已發 8 · 失敗 1 · 缺關鍵字 2        │
├──────────────────────────────────────────────────────────────┤
│ ┌ A1 · BWA 知識中心 ─────────────┐ ┌ A1 · Attitude ────────┐ │
│ │ example.com  · manual · 健康 OK│ │ …                     │ │
│ │ cadence: 每週一 10:00          │ │                       │ │
│ │ 今日 2/2 · 待審 1 · 已發 1     │ │                       │ │
│ │ [詳情] [排程] [暫停]           │ │                       │ │
│ └────────────────────────────────┘ └───────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

空狀態：引導接入第一站（不顯示空表格）。

#### 8.2.2 接入精靈（5 步）

1. 選站（從 `webandsystem_list` 搜尋，已接入的標記）
2. 欄目（新增／對應 external_id）
3. 語言與品牌語氣（locale、語氣、禁用詞、讀者、CTA）
4. cadence 與發布模式（頻率、時間、lead time、模式）
5. 連線測試（逐步結果：設定完整 → 網域可達 → sitemap → 憑證；失敗可回上一步且不丟資料）

#### 8.2.3 排程表

站點 × 日期矩陣；格子顏色代表 slot 狀態；缺關鍵字、審核逾期、站點 down 以圖示加邊框標示；點格子開右側抽屜（文章、改時間、暫停、補關鍵字）。

#### 8.2.4 文章工作室

```
┌ 站點 / 欄目 / 關鍵字 / 排程時間 / 狀態 ────────────────────── ┐
├───────────────────────────┬──────────────────────────────────┤
│ 站點版式預覽              │ SEO 硬檢查 ✓✓✓✗（slug 重複）     │
│ 封面 16:9                 │ meta title / description（可改）  │
│ H1 / H2 / 正文 / 圖片     │ slug / canonical                  │
│ 字數 1,240                │ 內鏈 2 條（可換）                 │
│                           │ 圖片 3 張（可換／重生圖卡）       │
├───────────────────────────┴──────────────────────────────────┤
│ [存草稿] [送審] [駁回…]                    [批准並排定 →]     │
└──────────────────────────────────────────────────────────────┘
```

#### 8.2.5 Confirm 面板

顯示：站點／欄目／語言、標題／slug／字數、封面與內文圖縮圖、發布時間（站點時區）、模式（manual／draft／direct）、硬檢查結果、是否更新既有文章、不可逆提示。硬檢查未過 → 按鈕禁用並列出未過項目。

#### 8.2.6 日報

預覽 HTML、收件人（員工多選或外部 email）、寄送時間、測試寄送、寄送紀錄、重寄。

### 8.3 空狀態與錯誤態

| 情境 | 呈現 |
|---|---|
| 資料表尚未安裝（Postgres `42P01`） | 顯示「功能尚未啟用，請先執行 migration」＋文件連結；不白屏、不拋紅字 |
| 沒有站點 | 引導接入第一站 |
| 沒有關鍵字 | 提示匯入 CSV 或同步 GSC（附範本下載） |
| 站點未驗證 | 禁止排程，顯示「先測試連線」 |
| 站點 down | 相關文章 hold，顯示原因與修復入口 |
| 審核逾期 | 顯示「已 hold，不會發布」，提供重新排程 |
| 發布失敗 | 顯示錯誤、重試、人工標記；不顯示「已發布」 |
| Email 未設定 | 日報可看，標「未寄出」 |
| LLM 額度用盡 | 顯示今日用量／上限與順延說明 |

---

## 9. 功能規格（三階段）

### 9.1 第一階段：串接與基礎設定

#### 9.1.1 站點接入

- 從 `webandsystem_list` 選站 → 建 `content_sites`（tier／adapter／publish_mode／locale／timezone）。
- 欄目：`content_site_sections`（名稱、external_id、slug、content_type）。
- 品牌語氣：`brand_voice`（語氣、禁用詞、讀者、CTA、事實邊界、是否允許 AI 圖）。
- 狀態：`active` / `paused` / `archived`（歸檔不刪除）。

#### 9.1.2 連線測試（`testConnection`）

手動站（v1 全部）：

1. 必填設定齊全（tier／locale／seo_defaults 必填項／至少一個欄目）。
2. 網域可達（HEAD，10 秒 timeout）。
3. `sitemap.xml` 可解析（可選；失敗記警告不阻擋）。
4. 憑證可解密（若已設定）。
5. 寫 `content_site_checks` 紀錄，更新 `health` 與 `last_verified_at`。

失敗 → `health=down`（設定缺失為 `untested`），UI 顯示原因；未通過不得排程。

#### 9.1.3 每站基礎 SEO 參數（`seo_defaults`）

| 參數 | 說明 | 預設 |
|---|---|---|
| `locale` | 站點語言 | `zh-HK` |
| `titleTemplate` | `{title}｜{brand}` | 同左 |
| `metaTemplate` | `{excerpt}` | 同左 |
| `slugRule` | 英文 kebab-case、≤ 8 詞、全站唯一 | 同左 |
| `canonicalBase` | canonical 前綴 | 站點網域 |
| `author` / `publisher` | 作者與 JSON-LD publisher | 品牌名 |
| `ogImage` | 預設 OG 圖 | 品牌封面 |
| `jsonLdType` | `BlogPosting` / `Article` | `BlogPosting` |
| `categoryMap` | 分類 → 站內欄目 | 空 |
| `robots` | 草稿 `noindex`、正式 `index,follow` | 同左 |
| `wordCountMin` / `wordCountMax` | 字數 | 800 / 1500 |
| `internalLinksMin` / `Max` | 內鏈數 | 2 / 3 |
| `bannedWords` | 禁用詞（醫療療效等） | 空 |

驗收：審核頁可預覽「這篇將送出的 title／meta／slug／canonical／JSON-LD」。

#### 9.1.4 第一階段里程碑（**已改寫**）

依決策 D10，v1 不寫 beauty100 收稿端點，因此里程碑定義為：

1. 中台可為 beauty100 產生**完整內容包**（HTML + 圖片 + meta + 貼上指引，可下載 zip）。
2. 人工貼上官網後回填 URL。
3. 狀態轉 `manual_done`，回執寫入 `content_publish_logs`。
4. UI 明確標示「已手動上線」，**不得顯示為自動發布**。

> 若日後站方提供 `/api/content/articles`，只需新增 `next_custom` adapter 並把 `publish_mode` 改 `direct`，流程其餘不變。

### 9.2 第二階段：自動排程與生成

#### 9.2.1 站點頻率（`cadence`）

`daily` / `every_2_days` / `twice_weekly` / `weekly` / `custom`；含 `publish_time`、`timezone`、`lead_time_hours`（預設 48）、`review_cutoff_hours`（預設 4）、`max_articles_per_day`、`blackout_dates`。

#### 9.2.2 Slot 產生

每日 00:10（HKT）與設定變更時：

1. 按 cadence 算未來 30 天 `publish_at`。
2. `generate_at = publish_at - lead_time_hours`。
3. 以 `unique(site_id, publish_at)` 冪等 upsert。
4. 已有文章或已發布的 slot 不覆蓋。
5. 關鍵字在生成時才指派（避免提早鎖死）。
6. 缺關鍵字 → slot 保持 `planned`，到 `generate_at` 轉 `held` 並告警。

#### 9.2.3 自動生成

`generate_article` job 流程：

1. 取 slot → 檢查站點 `active`、`health != down`、額度未超。
2. 指派關鍵字：**只挑 `pipeline_status = 'backlog'`**（NULL 視為不可用），排序 `priority desc nulls last`；人工 pin（priority ≥ 1000）> GSC 機會詞 > volume/難度 綜合分；同 cluster 14 天內不重複。
3. 組 brief（站點語氣、locale、字數、內鏈候選、CTA、禁用詞、SERP 大綱〔v1 可空〕）。
4. 呼叫 Gemini（JSON 輸出），解析失敗重試 1 次；再失敗 → job `failed`、slot `held`、不寫半成品。
5. SEO QA：硬檢查跑一次；未過 → 仍存 `draft`，但 `checks` 標記未過項目（人工可見）。
6. 配圖：素材庫標籤匹配 → 否則產 SVG 圖卡（標題 + 漸變底）→ 上傳 `content-assets` → 寫 `content_assets`。
7. 寫 `content_articles`（`status='pending_review'`）、`content_llm_usage`、slot → `in_review`、keyword → `in_review`。

#### 9.2.4 每日 Email 日報

- 時間與收件人存 `content_settings`，可在 UI 改；預設 09:00 HKT。
- 內容：今日生成數、待審數與最舊等待、已批准／已排程、已發布、失敗與順延、每站明細、未來 3 天排程、待處理（缺關鍵字／憑證失效／審核逾期／額度不足）。
- 標題例：`[MPS] 11/25 內容日報：生成 18 · 待審 7 · 已發布 9 · 失敗 1`。
- 寄送失敗：保留 HTML，`status='failed'`，UI 可重寄；未設定 Resend → 標「未寄出」，日報仍可看。

### 9.3 第三階段：總編輯審核與上線

#### 9.3.1 角色

`chief_editor`（Sylvia）：可審閱、編輯、批准、Confirm、排程、發布。`admin`／`management` 可兼任。`writer`（copywriter／marketing／project_manager）只能生成、編輯、送審。

#### 9.3.2 審核介面

佇列（按站點／狀態／日期篩選）→ 文章工作室（左站點版式預覽、右 SEO 與品牌檢查、底決策條）→ 線上微調（Markdown／富文本、即時字數、版本快照、樂觀鎖）→ Confirm。

#### 9.3.3 Confirm 的語義

**Confirm = 批准 + 排定發布**（不是立即發布）。

- 硬檢查未過 → 禁用並列出原因。
- `publish_at` 已過：2 小時內可「立即發布」；超過則排到下一個空 slot 並明示。
- 面板必須顯示站點、欄目、語言、標題、slug、字數、封面縮圖、時間、模式、檢查結果、是否更新、不可逆提示。

#### 9.3.4 到點發布與驗證

| 模式 | 行為 | 終態 |
|---|---|---|
| `manual`（v1） | 產內容包、通知負責人；人工貼上後回填 URL | `manual_done` |
| `draft`（日後） | 呼叫 adapter 建草稿，回 external_id + 後台連結 | `draft_published` |
| `direct`（日後） | 呼叫 adapter 直接公開，回 external_id + live_url | `published` |

`verify_publish`：抓 live URL，檢查 HTTP 200、title、meta description、canonical、JSON-LD 可解析、無 `noindex`、圖片 200；結果寫 `checks` 與 `publish_logs`。失敗標 `verify_failed` 並告警。

#### 9.3.5 內容包規格

```
b100-<site>-<slug>.zip
├── article.html          完整 HTML（含圖片、JSON-LD、canonical）
├── article.md            Markdown 原稿
├── meta.json             title / description / slug / canonical / og / 關鍵字
├── images/
│   ├── cover-16x9.svg
│   └── figure-01.svg
└── README.txt            貼上步驟與注意事項（欄目、發佈時間、需人工確認項）
```

---

## 10. 社媒線（P4）

| B100 模組 | MPS 落點 | v1 能力 |
|---|---|---|
| 品牌／帳號組（一帳號多組） | `content_social_accounts` + `content_social_groups`（以 `brand_list` 為品牌主檔的 1:1 擴充）+ 成員表 | 新增／改名／歸檔／多組勾選／登入狀態檢測 |
| 熱點雷達 | `content_hot_items` + `content_hot_events` | 手動貼熱點（標題／連結／摘要）＋ CSV 匯入；自動抓取延後 |
| 生成（1 長文 + 每帳號一導流） | `content_social_posts` + `generate_social` job | 沿用「同平台文案共用一份」語義 |
| 審核／看板／日曆 | `social/queue`、`social/studio`、`social/calendar` | 批次批准、逐帳號勾選、拖動排期 |
| 發佈 | `content_publish_logs` + 手動包 | 複製文案、下載圖片包、手機交付頁、標記已發 |
| 用量／診斷 | `content_llm_usage` + 診斷頁 | 按日期 · 模型 · 用途列出 token 與圖片張數 |

**刻意不做**：Meta/Threads 真 API、熱點自動抓取、公開雜誌站、手機交付頁（第二期決策）。

---

## 11. 權限矩陣

| 動作 | staff / designer / accountant / video_editor | copywriter / marketing / project_manager | chief_editor | management |
|---|---|---|---|---|
| 檢視 | ✓ | ✓ | ✓ | ✓ |
| 生成／編輯／送審 | ✗ | ✓ | ✓ | ✓ |
| 批准／駁回／Confirm／排程 | ✗ | ✗ | ✓ | ✓ |
| 站點接入／憑證／全域設定 | ✗ | ✗ | ✗ | ✓ |

- 前端：`src/lib/contentPermissions.ts` 的 `can(user, action)`；UI 只做隱藏／禁用。
- 後端：每支 `content-*` 函式入口重算權限；`content_site_credentials` 對 `authenticated` 完全封閉。
- 既有 `users.role` 在 migration 內未見 CHECK 約束，新增角色只需資料列 + 前端映射。

---

## 12. 失敗模式

| 場景 | 處理 |
|---|---|
| 站點憑證失效 | 預檢即 `health=down`，相關 slot `held`，日報 + 即時告警，不重試 |
| 429／rate limit | 指數退避，尊重 `Retry-After`，站點並發 1 |
| 5xx／timeout | 重試 3 次；仍失敗 → `publish_failed`，人工可重試 |
| slug 衝突 | 中台加後綴，**不覆蓋**既有文章 |
| 圖片不可讀 | 不發布（除站點允許），標「圖片失敗」 |
| 缺關鍵字 | slot `held` + 告警，不硬湊 |
| 審核逾期 | `publish_at - cutoff` 未批准 → `held`，永不自動發 |
| worker 停機 | 重啟掃 `queued` 與逾時 `running`；逾期 >6 小時順延到下一個 slot，原文保留 `held` |
| 重複 Confirm | 冪等鍵 `content:<articleId>:v<version>` + `external_id` 檢查，更新不重建 |
| LLM 額度用盡 | 當日剩餘 job 順延至次日 00:05，slot `held`，日報標「額度不足」 |
| 日報寄送失敗 | 保留 HTML，`failed` 狀態，UI 可重寄 |
| 免費層降額 | 用量看板顯示實際區間；上限值可在設定改，不改程式 |

---

## 13. 測試與驗收

| 層級 | 內容 | 指令 |
|---|---|---|
| **SQL 安全審查（新增，最優先）** | 每支 migration 逐條核對 §6.6 禁止語句；推送前先 `--dry-run` 看實際 SQL；推送後做結構 diff | 見 §13.1 |
| 型別 | 全專案型別檢查（`npm run build` 的 `tsc ; vite build` 用 `;` 串接，tsc 失敗不會中斷，必須單獨跑） | `npx tsc --noEmit` |
| 純函式自測 | slot 產生（含時區／DST／切換週）、SEO 硬軟閘門、狀態機合法轉換、日報統計、slug 正規化 | `node scripts/content-selftest.mjs` |
| 契約測試 | `testConnection` 失敗矩陣（401／403／429／500／timeout／DNS 失敗） | 手動腳本 + mock 站 |
| 整合 | 兩分頁同時改同一篇（樂觀鎖）、重複 Confirm、worker 中斷恢復、重複 job 認領 | 手動 |
| E2E | 接入 1 站 → 匯 10 詞 → 14 天 slots → 到點生成 → 改稿換圖 → Confirm → 到點產包 → 回填 URL → live 驗證 → 收日報 | 手動清單 |
| 回歸 | 其餘 15 個模組切換正常；其他工具中心子項不受影響 | 手動 |

### 13.1 SQL 安全審查（每次推送前必做）

```powershell
cd D:\Project\MPS

# 1) 禁止語句掃描：有任何命中就停下來逐條確認
Select-String -Path supabase/migrations/2026112*.sql `
  -Pattern 'drop\s+table|drop\s+column|alter\s+column.*type|truncate|delete\s+from|drop\s+policy|alter\s+policy|unschedule' `
  -CaseSensitive:$false

# 2) 確認新欄位沒有 DEFAULT（回填風險）
Select-String -Path supabase/migrations/20261126090000_content_automation_core.sql `
  -Pattern 'seo_keywords' -Context 0,8

# 3) 確認 storage policy 都帶 bucket_id
Select-String -Path supabase/migrations/20261126093000_content_automation_rls.sql `
  -Pattern 'storage\.objects' -Context 0,3

# 4) 乾跑：只列印將執行的 SQL，不落庫
npx supabase db push --linked --dry-run

# 5) 推送前結構快照（可選但建議）
npx supabase db dump --linked --schema public -f "backups\pre-content-$(Get-Date -Format yyyyMMdd-HHmm).sql"
```

**推送後的回歸檢查（每次都要，約 5 分鐘）**

| 檢查 | 通過標準 |
|---|---|
| 網站+系統清單可載入 | 列表正常、可新增／編輯（`webandsystem_list` 未被鎖死） |
| GSC 報表可載入 | `seo_keywords` 加欄後，GSC 頁面與同步不報錯 |
| 廣告／財務／專案頁可載入 | 引用 `webandsystem_list` 的模組皆正常（共 12 支 hook） |
| 其他工具中心子項 | Readdy、AI 關鍵字等頁面不受影響 |
| anon key 讀 `content_site_credentials` | 被拒（42501 或空結果） |
| anon key 讀 `content_jobs` | 被拒 |
| `content_settings` 只有 1 列 | `select count(*) = 1` |

**驗收門檻**：生成成功率 ≥95%、發布成功率 ≥98%、到點誤差 ±2 分鐘、跨站誤發 0、審核週轉中位數 <24 小時。

---

## 14. 里程碑

| 里程碑 | 內容 | 估時 | Exit Criteria |
|---|---|---|---|
| M0 骨架 | 5 支 migration、`CONTENT_VAULT_KEY`、插件外殼、`chief_editor`、設計 token 對映 | 2–3 人日 | 側欄出現「社媒自動化營運」，兩區可切；`tsc --noEmit` 通過 |
| M1 第一階段 | 站點清單／精靈／詳情、連線測試、SEO 預設、CSV 匯入、GSC 機會詞、內容包 | 4–6 人日 | 3 站可用；100 詞去重正確；beauty100 內容包可交付並回填 `manual_done` |
| M2 第二階段 | planner、worker、Gemini 生成、SEO QA、配圖、每日日報 | 5–7 人日 | 每站 14 天 slots；10 篇由關鍵字生成；日報連續 3 天寄出；無重複文章 |
| M3 第三階段 | 文章佇列、工作室、Confirm、發布 job、live 驗證、回執、稽核 | 6–9 人日 | Sylvia 可審可改可 Confirm；3 篇走完上線與驗證；失敗可重試 |
| M4 社媒線 | 品牌／帳號、熱點（手動）、批次生成、看板／工作室／日曆、手動發佈包、用量 | 8–12 人日 | 一批「1 長文 + N 導流」可生成→審核→排期→手動發佈→標記已發 |
| M5 鋪開 | 50 站分批接入、熱點自動抓取、多 adapter、監控告警 | 依站點配合 | ≥90% 站點可接入或有 manual 流程；單站接入 <30 分鐘 |

M0–M4 合計約 **25–37 人日**。

---

## 15. 假設與非目標

**假設**

- A1：第一階段里程碑以「內容包 + 人工上線 + 回填 URL」計算（D10）。若要真自動發布，需在 M3 前補上官網端點，工期 +3–5 人日。
- A2：不遷移 `D:\Project\B100-Manager\data\b100.sqlite`；B100 專案本期不改、不停用，兩者並行，M4 後才建議停用。
- A3：`src/components/articles/ArticlesModule.tsx`（mock、未掛側欄）**不刪不動**；新實作一律 `content_*` 命名。
- A4：站點身份以 `webandsystem_list` 為唯一主檔，`content_sites` 只是 1:1 設定擴充。
- A5：生成預設 `gemini-2.5-flash`；**出廠 `daily_article_limit = 0`（裝好不自動跑）**，由人明確啟用時建議設免費層上限 8 篇／日、30 次呼叫／日（可在設定改）。
- A6：配圖只做品牌素材 + SVG 圖卡。
- A7：時間存 UTC ISO，顯示 `Asia/Hong_Kong`，站點可各自設時區。
- A8：日報收件人存 `content_settings`，可員工多選或填外部 email。

**非目標**：見 §1.3。

---

## 16. 待提供資料（阻塞對應里程碑）

| # | 資料 | 阻塞 |
|---|---|---|
| 1 | A1 三站（Attitude／BSC／BWA）的網域、語言、欄目名稱、負責人（CSV 範本由 M1 提供） | M1 |
| 2 | 每站品牌語氣、禁用詞、字數下限、是否允許 AI 圖 | M2 |
| 3 | Sylvia 的 MPS 登入 email（設 `chief_editor`）與第二位備援 EIC | M0／M3 |
| 4 | 日報收件人與期望寄送時間 | M2 |
| 5 | beauty100 內容包格式偏好（HTML／Markdown／zip） | M1 |
| 6 | 品牌素材位置（或先用 SVG 圖卡） | M2 |
| 7 | `GEMINI_API_KEY` 所屬專案是否已開計費（只影響上限值） | M2 |

---

## 17. 風險

| 風險 | 影響 | 緩解 |
|---|---|---|
| 免費層隨時降額 | 每日產出不足 | 硬上限 + 用量看板 + 明確告警，不靜默失敗 |
| Edge Function 時限 | 生成中斷 | 一 job 一呼叫、超 100 秒讓位、生成 timeout 120 秒 |
| 內容包人工貼 → 漏貼／錯貼 | 上線延誤 | `manual_done` + 未回填清單進日報 + 站點隔離校驗 |
| SEO 硬閘門誤擋 | 產能下降 | 每站可覆寫門檻；先軟後硬，觀察一週 |
| 50 站接入被低估 | 延期 | 先 3 站試點、精靈模板化、manual 為正式模式 |
| 與現有模組搶站點資料 | 資料不一致 | `content_sites` 只做 1:1 擴充，不改既有欄位語義 |
| 角色體系改動波及全站 | 權限錯亂 | 只加值與映射，不改既有 8 角色行為；`permissions.ts` 不動 |
| `pipeline_status` 若給了 DEFAULT，既有關鍵字會被自動生成 | 誤產內容、浪費額度 | 新欄不給 DEFAULT；planner 只挑 `='backlog'`；上線前 `daily_article_limit=0` |
| `content_sites` FK 若用 cascade，既有「刪站點」會清空插件資料 | 設定與排程消失 | 改 `on delete restrict` |
| Storage 政策漏了 `bucket_id` 條件 | 其他 bucket 被連帶公開 | 每條 policy 必帶 `bucket_id='content-assets'`；bucket 設 private |
| 部署順序顛倒（前端先上、表未建） | 白屏／console 報錯 | 前端遇 `42P01` 顯示「尚未啟用」；部署順序寫進 SOP |
| cron 早於函式部署 | 每 2 分鐘失敗、日誌被洗版 | 先函式、後 cron；建完手動觸發一次 |
| 有人直接在 SQL editor 改結構 | 環境漂移、無法重現 | 一律走 migration；cron 例外須留完整 SQL 與日期 |

---

## 附錄 A｜B100 → MPS 對照

| B100 檔案／能力 | MPS 落點 | 處置 |
|---|---|---|
| `src/lib/db.ts`（21 表） | Postgres `content_*` + 複用表 | 重寫 |
| `src/lib/pipeline.ts`（熱點） | `content_hot_*` + `content-worker` | P4 移植（先手動） |
| `src/lib/generate.ts` | `src/lib/contentGenerate.ts` + worker job | 重寫 |
| `src/lib/publish.ts` | `content-publish` + adapter 介面 | 重寫（v1 manual） |
| `src/lib/meta.ts`（Graph API） | 第二期 adapter | 暫不移植 |
| `src/lib/vault.ts` | WebCrypto + `CONTENT_VAULT_KEY` | 重寫 |
| `src/lib/llm.ts` + `models.ts` | `content_llm_usage` + 設定表 | 重寫（Gemini） |
| `src/lib/batches.ts` | `useContentSlots` / `queue` 聚合 | 重寫 |
| `src/lib/content.ts`（本地寫作／SVG） | `contentGenerate.ts` 的 fallback | 移植純函式 |
| `src/components/studio.tsx` | `ArticleStudioView` + `social/StudioView` | 重設計 |
| `src/components/shell.tsx` | 丟棄（用 MPS AppLayout） | 不移植 |
| `src/components/ui.tsx` | 丟棄（用 `components/ui/*`） | 不移植 |
| `src/app/**/page.tsx` | `ContentAutomationCenter` 內頁 | 重寫 |
| `src/app/api/**/route.ts` | Edge Functions | 重寫 |
| `scripts/check.ts` | `scripts/content-selftest.mjs` | 重寫 |

## 附錄 B｜新增檔案總表

```
supabase/migrations/
  20261126090000_content_automation_core.sql
  20261126091000_content_automation_pipeline.sql
  20261126092000_content_automation_publish.sql
  20261126093000_content_automation_rls.sql
  20261126100000_content_social.sql
  20261126110000_content_cron.sql

supabase/functions/
  content-sites/index.ts
  content-keywords/index.ts
  content-worker/index.ts
  content-publish/index.ts
  content-digest/index.ts
  _shared/contentVault.ts
  _shared/contentLlm.ts

src/lib/
  contentNavigation.ts  contentTypes.ts  contentState.ts  contentPlanner.ts
  contentSeoQa.ts  contentDigest.ts  contentApi.ts  contentPermissions.ts
  contentFormat.ts  contentGenerate.ts  contentMedia.ts  contentSocialApi.ts

src/hooks/
  useContentSites.ts  useContentKeywords.ts  useContentSlots.ts
  useContentArticles.ts  useContentJobs.ts  useContentSettings.ts  useContentUsage.ts

src/components/tools-center/content/  （見 §5.2）

scripts/
  content-selftest.mjs

docs/
  development_plan/2026-11-25/PRD-社媒自動化營運-併入工具中心-v1.0.md
  development_plan/2026-11-25/執行清單-社媒自動化營運-v1.0.md
```
