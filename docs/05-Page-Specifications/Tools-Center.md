# Page Specification — Tools Center (工具中心)

## Route: `/tools-center`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/tools-center/seo-radar` | SEO 雷達 | GSC 28 天曝光＋Google 搜尋建議，抓 100 個熱門詞並採納進關鍵字庫 |
| `/tools-center/crosspost` | AI跨平台一稿多發 | 活動／產品核心資訊＋受眾＋CTA，一次出 IG／FB／Threads／小紅書／eDM 五版，自動帶字數上限與 Hashtag |
| `/tools-center/alt-pilot` | ALT Pilot | 單頁 URL → 整頁文案＋圖片 vision＋站點關鍵字 → 逐張審批 → Framer 半自動填入 |
| `/tools-center/ai-keyword` | AI 關鍵字生成器 | OpenAI 關鍵字建議 |
| `/tools-center/ai-title` | AI SEO標題生成器 | SEO 標題建議 |
| `/tools-center/templates` | 模板庫 | 報價/EDM/工作範本 |
| `/tools-center/training-modules` | 培訓模組 | 學習資源 |
| `/tools-center/training-progress` | 培訓進度追蹤 | 個人進度 |

---

## SEO 雷達 (/seo-radar)

### 流程

```
Step 1: 選站點 + 市場
  ┌──────────────────────────────────────────────────────────────┐
  │ 站點: [BW Design Centre ● GSC 已連接 ▼]                      │
  │ 市場: [自動（香港・繁中）▼]        [抓取熱門關鍵詞]           │
  └──────────────────────────────────────────────────────────────┘

Step 2: 抓取（GSC 近 28 天前 60 個 + Google 建議詞補至 100）
  ┌──────────────────────────────────────────────────────────────┐
  │ 抓取詞 100 │ GSC 60 │ 建議詞 40 │ 已採納 12 │ 已忽略 3      │
  └──────────────────────────────────────────────────────────────┘

Step 3: 勾選 → 採納
  ┌──────────────────────────────────────────────────────────────┐
  │ ☑ 香港網頁設計公司   GSC   2,140  31  1.4%   8.2  2,295  新   │
  │ ☐ 網頁設計報價       GSC     880   4  0.5%  14.1    905  已採納│
  │ ☑ 網頁設計公司推薦   建議詞      0  0    —     —       25  新   │
  │                                                              │
  │ [採納到關鍵字庫 (2)]   ☐ 同時加入自動生成佇列（預設不勾）      │
  └──────────────────────────────────────────────────────────────┘
```

### 資料來源

| 來源 | 內容 | 限制 |
|---|---|---|
| `gsc_query_daily_metrics` | 近 28 天 query / impressions / clicks / position | 需站點已綁 GSC；本功能全程只讀 |
| Google suggest（非官方端點） | 以 GSC 前 5 詞 + 站名 + 品牌為種子 | 無搜尋量；timeout 6s、併發 3、整段預算 90s |

> 「曝光」不是月搜尋量：本期以 GSC 曝光替代 `search_volume`，與 `aggregateGscMetricsToKeywordRows` 同一口徑。

### Edge Function

`POST /functions/v1/seo-radar`（`verify_jwt = false`，函數自行驗 JWT；`write` 權限在伺服器重算）

```typescript
// 抓取
{ action: 'scan', website_profile_id: 'text-id', market_override?: 'hk' | 'tw' | 'sg' | 'my' | 'us' }
→ { run, gsc_terms, suggest_terms, inserted, updated,
    warnings: ['gsc_not_linked' | 'gsc_no_terms' | 'suggest_unavailable' | 'ideas_empty'] }

// 採納
{ action: 'adopt', website_profile_id: 'text-id', idea_ids: string[], enqueue?: boolean }
→ { adopted, skipped, enqueued, keyword_ids }

// 忽略（帶 website_profile_id 時限定站點，避免跨站誤改）
{ action: 'ignore', idea_ids: string[], website_profile_id?: string } → { updated }

// cron（service_role，body 不帶 action）
{} → { sites_scanned, ideas_upserted, skipped }
```

### 採納規則（不可協商）

- `seo_keywords.source`：GSC 詞 → `gsc`；建議詞 → `import`（**不擴充既有 CHECK**，真來源留在 `seo_keyword_ideas.source`）
- `search_volume = impressions`、`current_ranking = avg_position`、`level = level_3`、`status = monitoring`
- `pipeline_status` 只在 `enqueue = true` 時寫 `backlog`，且**只**覆寫目前是 `NULL` 或 `backlog` 的列
- 已存在的詞用 `ON CONFLICT DO NOTHING`，不覆寫人工調整過的欄位

### 狀態

| 狀態 | 呈現 |
|---|---|
| 資料表未建立（42P01／PGRST205） | 「功能尚未啟用」+ `npm run db:push` 指引，不白屏 |
| 站點未綁 GSC | 黃色提示，只出建議詞 |
| 非 writer 角色 | 抓取／採納／忽略 disabled；直接打 API 回 403 |
| 抓取中 | 按鈕 spinner「抓取中…」 |
| 結果為空 | 表格空狀態文案 |

### 元件

```
SeoRadarTool.tsx
├── SeoRadarTable.tsx   // 勾選、排序、20 列/頁、來源 badge、狀態 pill
└── AdoptDialog.tsx     // 採納確認 + 「加入自動生成佇列」勾選（預設不勾）
```

---

## AI Keyword Generator (/ai-keyword)

### 流程

```
Step 1: 選擇網站
  ┌─────────────────────────────────────────────────────┐
  │ 目標網站: [BWDesign 官方網站 ▼]                     │
  │ 公司: BWDesign Centre • 品牌: BW 志豐企業           │
  └─────────────────────────────────────────────────────┘

Step 2: 輸入主題
  ┌─────────────────────────────────────────────────────┐
  │ 行業/主題: [品牌設計, 網站設計, 香港            ]   │
  │ 語言偏好:  [中文繁體 ▼]                            │
  │ 生成數量:  [20] 個                                  │
  │                                                      │
  │            [🤖 一鍵生成關鍵字]                       │
  └─────────────────────────────────────────────────────┘

Step 3: AI 生成結果
  ┌─────────────────────────────────────────────────────┐
  │ ✅ 已生成 20 個關鍵字建議                           │
  │                                                      │
  │ ☑ │ 關鍵字            │ 建議等級 │ 預估搜尋量│ 難度 │
  │───┼───────────────────┼──────────┼───────────┼──────│
  │ ☑ │ 品牌設計公司       │ S1 核心  │ 2,400     │ 72  │
  │ ☑ │ 香港網站設計       │ S1 核心  │ 1,800     │ 65  │
  │ ☑ │ 網頁設計報價       │ S2 目標  │ 880       │ 45  │
  │ ☐ │ 企業形象設計       │ S2 目標  │ 620       │ 52  │
  │ ☑ │ 品牌設計流程步驟   │ S3 長尾  │ 90        │ 22  │
  │ ...                                                  │
  │                                                      │
  │ 已選: 15/20                                          │
  │ [全選] [取消全選]       [確認存入 SEO 關鍵字庫 ✓]   │
  └─────────────────────────────────────────────────────┘
```

### Edge Function 調用

```typescript
// POST /functions/v1/supabase-functions-ai-keyword-generator
{
  website_id: "uuid",
  topic: "品牌設計, 網站設計, 香港",
  language: "zh-TW",
  count: 20
}

// Response
{
  keywords: [
    { keyword: "品牌設計公司", level: "level_1", searchVolume: 2400, difficulty: 72 },
    ...
  ]
}
```

---

## AI SEO Title Generator (/ai-title)

### 流程

```
Step 1: 選擇關鍵字
  ┌─────────────────────────────────────────────────────┐
  │ 目標網站: [BWDesign 官方網站 ▼]                     │
  │ 選擇關鍵字:                                         │
  │  ○ 品牌設計公司 (S1, Vol: 2400)                    │
  │  ● 香港網站設計 (S1, Vol: 1800)  ← 已選            │
  │  ○ 網頁設計報價 (S2, Vol: 880)                     │
  │                                                      │
  │ 額外指引: [包含價格資訊, 適合B2B客戶          ]    │
  │                                                      │
  │            [🤖 生成標題建議]                         │
  └─────────────────────────────────────────────────────┘

Step 2: 標題建議
  ┌─────────────────────────────────────────────────────┐
  │ 基於「香港網站設計」的標題建議 (5個):               │
  │                                                      │
  │ 1. 香港網站設計公司推薦｜2025年5大品牌比較          │
  │    SEO Score: 85 | 字數: 22                         │
  │    [複製]                                           │
  │                                                      │
  │ 2. 香港網站設計費用全攻略：從報價到上線的完整指南   │
  │    SEO Score: 82 | 字數: 25                         │
  │    [複製]                                           │
  │                                                      │
  │ 3. 為什麼選擇香港本地網站設計公司？6個關鍵優勢      │
  │    SEO Score: 78 | 字數: 23                         │
  │    [複製]                                           │
  │                                                      │
  │ [重新生成]                                          │
  └─────────────────────────────────────────────────────┘
```

---

## AI跨平台一稿多發 (/crosspost)

### 流程

```
Step 1: 輸入（三個必填）
  ┌──────────────────────────────────────────────────────┐
  │ 活動／產品核心資訊 *  [早鳥優惠 $1,880 三十分鐘療程…] │
  │ 目標受眾 *            [25–40 歲香港在職女性        ] │
  │ CTA *                 [立即預約，優惠碼 EARLY20     ] │
  │ 進階：品牌／語氣／語言／補充限制（可留空）           │
  │                                                      │
  │ 本次輸出：IG ≤2,200｜FB ≤63,206｜Threads ≤500        │
  │          ｜小紅書 ≤1,000｜eDM 主旨 ≤60／內文 ≤800     │
  │                    [🤖 生成五版文案]                  │
  └──────────────────────────────────────────────────────┘

Step 2: 五版結果（每個 tab 顯示字數／上限與 Hashtag）
  ┌──────────────────────────────────────────────────────┐
  │ 由 Grok 生成 · 21.3 秒 · 已存入歷史                   │
  │ [複製全部] [下載 .md] [重新生成]                     │
  │                                                      │
  │ [IG] [FB] [Threads] [小紅書] [eDM]                    │
  │ 上限 2,200｜建議 150–300｜Hashtag 8–12               │
  │ 正文…                                                │
  │ 1,234 / 2,200                                        │
  │ [#香港] [#早鳥優惠] …（點擊複製）                    │
  └──────────────────────────────────────────────────────┘
```

### 平台規則（程式常數，單一真實來源）

| 平台 | 正文上限 | 工具建議 | 標題／主旨 | Hashtag 建議 | 截斷上限 |
|---|---|---|---|---|---|
| IG | 2,200 | 150–300 | — | 8–12 | 30 |
| FB | 63,206 | 100–250 | — | 0–3 | 5 |
| Threads | 500 | 200–400 | — | 0–3 | 5 |
| 小紅書 | 1,000 | 400–800 | 20 | 8–10 | 10 |
| eDM | 內文 800 | 300–800 | 主旨 60／預覽 140 | 0 | 0 |

- 字數以 Unicode code point 計（含標點與換行），Hashtag 另存陣列。
- 超標只提示，不自動裁剪；Hashtag 由 AI 按平台數量建議，伺服器只做正規化與去重。
- 生成結果自動寫入歷史；可「開啟」重看或「重用 brief」再生成。

### Edge Function

`POST /functions/v1/crosspost-writer`（gateway 驗 JWT）

```typescript
{
  brief: { coreInfo, audience, cta, brandName?, tone?, language?, extraNotes? },
  platforms: ['ig', 'fb', 'threads', 'redbook', 'edm']
}
→ { ok: true, data: { variants, provider, model, latencyMs, missingPlatforms } }
→ { ok: false, code, error }
```

- 供應商：Grok（`XAI_API_KEY`／`GROK_API_KEY`）優先；失敗轉 Gemini（`GEMINI_API_KEY`）。
- 兩者皆失敗回 429／504／502，**不生成假文案**。
- 錯誤碼：`invalid_input` 400、`unauthorized` 401、`rate_limited` 429、`llm_unavailable` 502、`llm_not_configured` 503、`timeout` 504。

### 資料表

| 表 | 用途 |
|---|---|
| `crosspost_sets` | 一次生成的 brief＋品牌快照＋供應商／模型 |
| `crosspost_variants` | 該組的各平台版本（`UNIQUE(set_id, platform)`，`ON DELETE CASCADE`） |

Migration：`supabase/migrations/20261125120000_create_crosspost_copy.sql`（只新增兩表；回滾腳本 `scripts/rollback-crosspost-copy.sql`）。

> 本次交付為**本地 MVP**：migration 未推送、Edge Function 未部署；前端已可 build，接上函式後即可用。

---

## ALT Pilot (/alt-pilot)

### 流程

```
Step 1: 選站點 + 貼單頁 URL
  ┌──────────────────────────────────────────────────────────────┐
  │ 站點: [BW Interior 志豐設計工程 ▼]                            │
  │ URL:  [https://www.bwteam.com/office-design        ] [分析]   │
  └──────────────────────────────────────────────────────────────┘

Step 2: 分析結果（不花 LLM）
  ┌──────────────────────────────────────────────────────────────┐
  │ 頁面摘要：H1、語言、字數、可處理圖片 N 張、主關鍵字            │
  │ [全選] [生成 ALT（N）] [批准（N）] [略過]                     │
  │ ☑ 縮圖 │ 檔名／位置 │ 現有 ALT │ 建議 ALT │ 狀態／風險 │ 信心 │
  └──────────────────────────────────────────────────────────────┘

Step 3: 逐張審批 → 匯出
  ┌──────────────────────────────────────────────────────────────┐
  │ 已批准 N · 待批准 M  [複製已批准] [JSON] [匯出 CSV] [標記已匯出]│
  └──────────────────────────────────────────────────────────────┘
```

- 生成每批 ≤6 張；`alt_settings.daily_call_limit` 預設 **0 = 不限**，可設正整數作軟上限。
- 裝飾圖回傳 `alt=""`；非裝飾圖空字串會被硬規則擋下。
- Framer 沒有公開 server-side alt API，第一期是「匯出對照表 → 人工貼上 → 驗證已填」。

### Edge Function

`POST /functions/v1/alt-pilot`（`verify_jwt = false`，函式自行 `auth.getUser()`）

```typescript
// 分析
{ action: 'analyze', site_id?: string, url: string, keyword?: string }
→ { run, page, images, usage }

// 生成（每批 ≤6 張）
{ action: 'generate', run_id: string, images: AltImageCandidate[], keyword?: string }
→ { suggestions, errors, usage }

// 單張重生成
{ action: 'regenerate', suggestion_id: string, keyword?: string }
→ { suggestion, usage }

// 驗證已填
{ action: 'verify', run_id: string }
→ { checked, matched, missing }
```

- 頁面 host 必須屬於 `webandsystem_list.domain_url` 或 `ALT_ALLOWED_HOSTS`；拒絕 private IP、IP 字面值、單一標籤主機。
- 頁面 ≤2MB、10s timeout、≤2 redirect；圖片 ≤6MB，只收 jpeg/png/webp。
- Grok 4.5 主（沿用現有 `XAI_API_KEY`）、Gemini 備援；JSON parse 失敗重試一次。
- 錯誤碼：`invalid_url`、`host_not_allowed`、`fetch_forbidden`、`fetch_rate_limited`、`fetch_timeout`、`no_images`、`quota_exceeded`、`provider_error`、`schema_missing`。

### 資料表

| 表 | 用途 |
|---|---|
| `alt_runs` | 每次頁面分析（page_url、context_summary、keyword、counts） |
| `alt_suggestions` | 每張圖的建議與審批（`UNIQUE(run_id,image_url)`） |
| `alt_llm_usage` | 每次 LLM 呼叫的 token／成本 |
| `alt_settings` | 單列：`enabled`（預設 false，上線總開關）／`model`（預設 grok-4.5）／`daily_call_limit`／`max_images_*` |

Migration：`supabase/migrations/20261125183000_alt_pilot.sql`（只新增表；不改既有表／policy／cron）。

### 元件

```
AltPilotPage.tsx
├── AltPilotHeader.tsx + PageAnalyzeForm.tsx
├── PageSummaryCard.tsx
├── AltImageTable.tsx → AltSuggestionRow.tsx
├── AltDetailDrawer.tsx
├── AltRunHistory.tsx
├── AltExportBar.tsx
├── FramerPasteGuide.tsx
└── AltEmptyState.tsx
```

---

## Templates (/templates)

### 模板類別

| 類別 | 說明 | 數據來源 |
|------|------|---------|
| 報價模板 | 預設報價項目組合 | app_config or dedicated |
| EDM 模板 | 電郵/短訊內容模板 | edm_templates |
| 工作範本 | Day Report 快捷範本 | report_templates |

### 介面

```
┌─────────────────────────────────────────────────────────┐
│ Tab: [報價模板] [EDM模板] [工作範本]                    │
├─────────────────────────────────────────────────────────┤
│ 報價模板列表:                                           │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ 📄 網站設計標準包                                │    │
│ │ 包含: 設計(15000) + 開發(15000) + 內容(10000)   │    │
│ │ 總計: HKD 40,000                                │    │
│ │ [編輯] [複製] [刪除]                            │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ 📄 品牌設計全套                                  │    │
│ │ 包含: Logo(20000) + VI(25000) + 名片(5000)     │    │
│ │ 總計: HKD 50,000                                │    │
│ │ [編輯] [複製] [刪除]                            │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ [+ 新增模板]                                            │
└─────────────────────────────────────────────────────────┘
```

---

## Training Modules (/training-modules)

### 列表視圖

```
┌─────────────────────────────────────────────────────────────────┐
│ 篩選: [類別▼] [資源類型▼] [適用角色▼]     [搜尋...]          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 📽️ 前端開發基礎                     ⭐ 推薦                    │
│ 類別: 技術培訓 | 影片 | 45分鐘                                  │
│ 適用: designer, copywriter                                       │
│ [開始學習]                                                       │
│                                                                   │
│ 📄 SEO 優化完全指南                  ⭐ 推薦                    │
│ 類別: 市場推廣 | 文件 | 30分鐘                                  │
│ 適用: marketing, copywriter, project_manager                     │
│ [開始學習]                                                       │
│                                                                   │
│ 🔗 Figma 入門教學                                               │
│ 類別: 設計工具 | 外部連結 | 60分鐘                              │
│ 適用: designer                                                   │
│ [開始學習]                                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Training Progress (/training-progress)

### 個人進度面板

```
┌─────────────────────────────────────────────────────────────────┐
│ 我的培訓進度                                                     │
│                                                                   │
│ 完成率: ████████████░░░░░░░░ 60% (6/10 modules)                │
│                                                                   │
│ ✅ 前端開發基礎          完成 2025-01-05  Score: 92             │
│ ✅ SEO 優化完全指南      完成 2025-01-08  Score: 88             │
│ ✅ 品牌設計原則          完成 2025-01-10  Score: 95             │
│ 🔄 Figma 入門教學       進行中 (60%)                            │
│ ⬜ 影片剪輯基礎          未開始                                  │
│ ⬜ 客戶溝通技巧          未開始                                  │
│                                                                   │
│ 推薦下一步: 影片剪輯基礎 [開始]                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 組件結構

```
ToolsCenterModule.tsx
├── AIKeywordGenerator.tsx       // AI 關鍵字
├── AITitleGenerator.tsx         // AI SEO 標題
├── crosspost/                   // AI跨平台一稿多發
│   ├── CrosspostModule.tsx
│   ├── CrosspostComposer.tsx
│   ├── CrosspostResultView.tsx
│   ├── PlatformVariantCard.tsx
│   └── CrosspostHistoryView.tsx
├── alt-pilot/                   // ALT Pilot
│   ├── AltPilotPage.tsx
│   ├── AltPilotHeader.tsx
│   ├── AltImageTable.tsx
│   ├── AltDetailDrawer.tsx
│   └── AltRunHistory.tsx
├── TemplateManager.tsx          // 模板庫
│   ├── QuotationTemplates.tsx
│   ├── EdmTemplates.tsx
│   └── ReportTemplates.tsx
├── TrainingModules.tsx          // 培訓模組
└── TrainingProgress.tsx         // 培訓進度
```

---

## Edge Functions

| Function | Path | Purpose |
|----------|------|---------|
| ai-keyword-generator | POST /functions/v1/supabase-functions-ai-keyword-generator | OpenAI 關鍵字生成 |
| ai-title-generator | POST /functions/v1/supabase-functions-ai-title-generator | OpenAI 標題生成 |
| crosspost-writer | POST /functions/v1/crosspost-writer | 五平台文案生成（Grok → Gemini 後備） |
| alt-pilot | POST /functions/v1/alt-pilot | 抓頁＋圖片 vision＋ALT 生成／重生成／驗證 |

### 環境變數 (Edge Function)
- `OPENAI_API_KEY` — OpenAI API Key (Supabase Secrets)
- `GEMINI_API_KEY` — ALT Pilot 主 provider（Gemini 2.5 Flash vision）
- `XAI_API_KEY`／`GROK_API_KEY`、`GROK_MODEL` — ALT Pilot 備援 provider
- `ALT_ALLOWED_HOSTS` — 選填，額外允許分析的網域（逗號分隔）
- `ALT_ALLOW_ANON` — 選填，預設 false；只供本機開發
- `XAI_API_KEY`／`GROK_API_KEY` — Grok 文案生成（AI跨平台一稿多發首選）
- `GEMINI_API_KEY` — Gemini 文案生成（Grok 失敗時的後備）
