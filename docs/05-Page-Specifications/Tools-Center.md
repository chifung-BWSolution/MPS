# Page Specification — Tools Center (工具中心)

## Route: `/tools-center`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/tools-center/seo-radar` | SEO 雷達 | GSC 28 天曝光＋Google 搜尋建議，抓 100 個熱門詞並採納進關鍵字庫 |
| `/tools-center/hotspot-radar` | 熱點雷達 | 抓對標 IG 帳號／Hashtag／Meta 廣告的近期熱門內容，雙軌熱度排序，收藏成靈感庫 |
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
Step 0: 頁首右上（全域動作，不需先選站點）
  ┌──────────────────────────────────────────────────────────────┐
  │ [全站抓取]  [⏸ 每日自動抓取]              上次抓取 2 小時前   │
  │  ↑ 一次性     ↑ 開關（綠底⏸＝已開啟 / 白底▶＝已暫停）        │
  │  兩者都會先跳二次確認浮層（非技術語言說明）                   │
  └──────────────────────────────────────────────────────────────┘

Step 1: 選站點 + 市場
  ┌──────────────────────────────────────────────────────────────┐
  │ 站點: [BW Design Centre ● GSC 已連接 ▼]                      │
  │ 市場: [自動（香港・繁中）▼]        [抓取熱門關鍵詞]           │
  └──────────────────────────────────────────────────────────────┘

Step 2: 抓取（GSC 近 28 天前 60 個 + Google 建議詞補至 100）
  ┌──────────────────────────────────────────────────────────────┐
  │ 抓取詞 100 │ GSC 60 │ 建議詞 40 │ 已採納 12             │
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
| Google suggest（非官方端點） | 以 GSC 前 5 詞 + 域名 + 站名 + 品牌作為查詢來源（介面顯示為「來源：<查詢詞>」） | 無搜尋量；timeout 6s、併發 3、整段預算 90s |

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

// 刪除（真刪除；只刪 status='new'，已採納的不動）
{ action: 'delete', website_profile_id: string, idea_ids: string[] } → { deleted }

// 手動全站抓取（一次最多 60 站；其餘由每日自動抓取補上）
{ action: 'scan_all' } → { sites_scanned, sites_remaining, ideas_upserted, skipped }

// 每日自動抓取狀態／開關（set_daily 只限管理層）
{ action: 'cron_status' } → { enabled, schedule, jobname }
{ action: 'set_daily', enabled: boolean } → { enabled, schedule, jobname }

// 忽略（舊版相容，軟隱藏；新 UI 已不用）
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
| 非 writer 角色 | 抓取／採納／刪除 disabled；直接打 API 回 403 |
| 抓取中 | 按鈕 spinner「抓取中…」 |
| 結果為空 | 表格空狀態文案 |

### 元件

```
SeoRadarTool.tsx
├── SeoRadarTable.tsx   // 勾選、排序、20 列/頁、來源 badge、狀態 pill
├── AdoptDialog.tsx     // 採納確認 + 「加入自動生成佇列」勾選（預設不勾）
├── DeleteDialog.tsx    // 刪除確認（不可復原提示；下一次抓取可能重新出現）
└── ConfirmActionDialog.tsx // 全站抓取／每日開關的二次確認（非技術語言）
```

---

## 熱點雷達 (/hotspot-radar)

### 流程

```
Step 1: 監測目標（管理層限定）
  ┌──────────────────────────────────────────────────────────────┐
  │ 類型[對標帳號▼] 內容[@brand_hk] 顯示名[競品 A] [驗證] [新增]  │
  │ @brand_hk      最後抓取 11/26 03:00  ☑啟用  [刪除]            │
  │ #網頁設計      從未抓取              ☑啟用  [刪除]            │
  └──────────────────────────────────────────────────────────────┘

Step 2: 立即抓取 → 第三方 API（IG 帳號／Hashtag／Meta 廣告庫）
  ┌──────────────────────────────────────────────────────────────┐
  │ [監測目標 3] [設定] [⏸ 每日自動抓取] [↻ 立即抓取]             │
  │ 上次抓取 2 小時前            本月 US$7.20 / US$40             │
  └──────────────────────────────────────────────────────────────┘

Step 3: 熱門池（雙軌熱度）
  [全部 1240][對標帳號 480][Hashtag 560][廣告 200][⭐靈感庫 18]
  平台[全部] 時間[30 天] 媒體[全部] 互動[300] □只看爆款 □只看未收藏 排序[綜合▼]

  ┌ 縮圖 ┬ @brand_hk · 3.2× 中位數 · 🔥爆款 · Reel · 2 天前
  │ 9:16 │ 前 3 秒用對比畫面抓注意力…
  │      └ ❤1,840 💬96  [⭐收藏][✓已用][✕不用][備註] [↗]
  └──────────────────────────────────────────────────────────────┘

Step 4: 收藏 → 標記待參考／已用／不用＋備註（團隊共享）
```

### 資料來源（第三方抓取 API，可換供應商）

| 來源 | 抓什麼 | 熱度訊號 |
|---|---|---|
| 對標帳號 | 公開商業／創作者帳號的近期貼文與 Reels（每次 12 則） | 讚＋留言；相對熱度＝互動 ÷ 該帳號 30 天中位數 |
| Hashtag | top／recent 貼文（每次 20 則） | 讚＋留言 |
| 廣告關鍵字 | Meta Ad Library 以關鍵字／Page 搜尋（每次 20 條） | **投放天數**（廣告庫沒有讚／留言） |

> 廣告不吃「互動 ≥ 門檻」的過濾，否則廣告會被全部濾掉（見 PRD §6.7）。

### 排序（五種，全部為全序）

`綜合`（預設）：相對熱度分層 ≥3／≥2／≥1.5／其他 → 層內自然內容先於廣告 → 自然比互動、廣告比投放天數 → 最新 → id。
另有 `絕對互動`、`相對熱度`（NULL 最後）、`最新`、`廣告投放天數`。

### Edge Function

`POST /functions/v1/hotspot-radar`（`verify_jwt = false`，函數自行驗 JWT；權限在伺服器重算）

| action | 權限 | 用途 |
|---|---|---|
| `scan` / `scan_all` | write | 手動抓取（指定目標／全部候選，≤40 目標、90 秒預算） |
| `test_target` | write | 新增目標前試抓 5 筆（**也計入月花費**） |
| `favorite` / `unfavorite` | write | 收藏／改狀態＋備註（≤500 字） |
| `settings` | view | 讀設定＋本月用量＋每日開關狀態 |
| `update_settings` / `set_daily` | manage_settings | 預算／門檻／筆數；cron job 開關 |
| `create_target` / `update_target` / `delete_target` | manage_settings | 目標 CRUD（`kind`／`value` 不可改） |
| `cron_scan`（無 action + service_role） | service_role | 每日抓取＋120 天保留清理 |

錯誤碼：`budget_blocked`(402)、`scan_in_progress`(409)、`provider_not_configured`(503)、`provider_auth_failed`(502)、`provider_rate_limited`(429)、`target_exists`(409)、`schema_missing`(500)、`forbidden`(403)。

### 成本護欄

- 月上限預設 **US$40**；80% 黃色、100% 紅色並停抓。
- 抓取前逐個目標累加估算成本，超出剩餘預算就裁剪（不是抓爆才發現）。
- 單價按類型（IG US$1.75／廣告 US$0.70 每 1,000 筆，可用 secrets 覆寫）。
- 預設負載 540 筆/日 ≈ US$25.2/月（63%）。

### 狀態

| 狀態 | 呈現 |
|---|---|
| 資料表未建立（42P01／PGRST205） | 「功能尚未啟用」+ migration 指引，不白屏 |
| 未設供應商 token | 黃色橫幅＋secrets 設定指引；舊資料仍可看 |
| 本月達上限 | 紅色橫幅，抓取按鈕 disabled |
| 非 writer 角色 | 抓取／收藏 disabled；直接打 API 回 403 |
| 抓取中 | 按鈕 spinner「抓取中…」 |
| 篩選後為空 | 空狀態＋「重設篩選」 |

### 元件

```
HotspotRadarTool.tsx
├── HotspotFilterBar.tsx      // 5 分頁、6 篩選、5 排序
├── HotspotCard.tsx           // 縮圖、相對熱度、爆款、廣告投放天數、收藏三狀態、備註
├── HotspotTargetsPanel.tsx   // 目標 CRUD＋test_target 驗證
├── HotspotSettingsDialog.tsx // 預算／門檻／每日開關＋用量
├── HotspotBudgetBanner.tsx   // 80%／100% 橫幅＋供應商設定指引
└── HotspotEmptyState.tsx     // 空狀態與停用態
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

### 批次盤點

ALT Pilot 上方 tab：[單頁生成] [站點盤點]。

- 站點盤點：抓 `/sitemap.xml`（或手動貼 URL）→ 勾選最多 10 頁 → `analyze` 逐頁分析。
- 顯示每頁：圖片數、缺 ALT、重複、過長、裝飾圖；按「開啟」進入單頁流程。
- 批次分析**不呼叫 LLM**，沒有 Grok 成本；仍受 `alt_settings.enabled` 控制。
- 「批次生成缺 ALT」只處理非裝飾、目前空白的 ALT；每批最多 20 張，需確認；結果只寫入建議，不自動批准或寫回。
- 盤點表含頁內重複、過長與跨頁重複；可匯出 `alt-pilot-inventory-YYYY-MM-DD.csv`。

### Edge Function

`POST /functions/v1/alt-pilot`（`verify_jwt = false`，函式自行 `auth.getUser()`）

```typescript
// 取得 sitemap 頁面（批次盤點用）
{ action: 'discover', site_id?: string, sitemap_url?: string }
→ { sitemap_url, kind, sitemap_count, pages: [{ url }], truncated, warnings }

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
- Grok 4.7 主（沿用現有 `XAI_API_KEY`）→ DeepSeek V4.1 Flash 1017 備援（`OPENCODE_GO_API_KEY`）→ Gemini 最後（`GEMINI_API_KEY`）；JSON parse 失敗重試一次。
- 錯誤碼：`invalid_url`、`host_not_allowed`、`fetch_forbidden`、`fetch_rate_limited`、`fetch_timeout`、`no_images`、`quota_exceeded`、`provider_error`、`schema_missing`。

### 資料表

| 表 | 用途 |
|---|---|
| `alt_runs` | 每次頁面分析（page_url、context_summary、keyword、counts） |
| `alt_suggestions` | 每張圖的建議與審批（`UNIQUE(run_id,image_url)`） |
| `alt_llm_usage` | 每次 LLM 呼叫的 token／成本 |
| `alt_settings` | 單列：`enabled`（預設 false，上線總開關）／`model`（預設 grok-4.5）／`daily_call_limit`（0 = 不限）／`max_images_*` |

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
