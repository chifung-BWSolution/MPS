# Page Specification — Marketing (行銷管理)

## Route: `/marketing`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/marketing/google-ads` | Google Ads | MCC Campaign 成效（每日指標彙總） |
| `/marketing/google-ads-sync` | Google Ads 同步 | 歷史回填 / 增量同步 |
| `/marketing/facebook-ads` | Facebook Ads | Meta Campaign 成效（多 Business） |
| `/marketing/facebook-ads-sync` | Facebook Ads 同步 | 歷史回填（約 37 個月） / 增量同步 |
| `/marketing/ads-comparison` | 廣告比較圖表 | 三欄並排比較 Google / Facebook Campaign 每日成效 |
| `/marketing/backlink` | 反向連結 | 反向連結購買紀錄 |
| `/marketing/ads-tags` | 廣告標籤 | 管理 `ads_tags` 標籤目錄（含 `is_active`） |

平面設計已移至頂部導航（影片製作之後），路由為 `#graphic-design/list`。舊網址 `#marketing/graphic-design` 會自動導向新位置。

### Google Ads — Campaign 詳情

- **列表：** `#marketing/google-ads` — MCC campaign 成效表；點擊列開啟詳情。編輯欄鉛筆圖示開啟標籤 popup（寫入 `ads_campaign_tags`）。
- **詳情：** `#marketing/google-ads?campaign={customerId}:{campaignId}&preset=30d&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - 繼承列表的日期區間，詳情頁可再調整；變更會寫回 hash（可重新整理／分享）。
  - 資料來源：`google_ads_campaign_daily_metrics`（campaign 每日指標）。
  - 區塊：KPI（含前期比較與 sparkline）、Performance 趨勢圖、Traffic efficiency donut、Day-of-week、Daily metrics 表。
  - 細項：Ad Groups / Keywords / Search Terms 為**即時 Google Ads API**（依詳情頁日期區間；Search Terms Top 100 by Cost）。不落倉庫。
  - 即時細項日期上限 92 日（`7d/14d/30d/90d` 可用；`ytd` / `all` / 過長自訂區間會顯示提示，不呼叫 API）。
  - 共用 shell（`AdsCampaignDetailShell`）供 Google / Facebook Ads 詳情複用。

### Facebook Ads — Campaign 詳情

- **列表：** `#marketing/facebook-ads` — Meta campaign 成效表；點擊列開啟詳情（品牌按鈕仍只開設定 dialog；編輯欄鉛筆圖示開啟標籤 popup）。
- **詳情：** `#marketing/facebook-ads?campaign={adAccountId}:{campaignId}&preset=30d&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - 版面與 Google Ads 詳情相同（同一 `AdsCampaignDetailShell`）：KPI、趨勢圖、donut、Day-of-week、Daily metrics。
  - 每日指標來源：`facebook_ads_campaign_daily_metrics`。
  - 細項：Ad Sets / Ads / Placements 為**即時 Meta Marketing API**（Insights；Ads Top 150 by Cost）。不落倉庫。
  - 即時細項日期上限 92 日（與 Google 相同）。
  - Header 顯示帳戶、Business、品牌（手動 `brand_list`），無 Google 網站連結。

### 廣告比較圖表

- **路由：** `#marketing/ads-comparison`
- **版面：** 三欄；每欄獨立篩選：
  - 日期區間（與 Google Ads 列表相同：近 7/14/30/90 日、今年至今、全部已同步、自訂）
  - 平台：Google Ads / Facebook Ads
  - Campaign 搜尋下拉（依平台動態載入）
  - 指標：Impr. / Clicks / Cost / Conv.（另含 CTR、Avg. CPC，與詳情頁 KPI 卡片對應）
  - 篩選下方可「從欄位 N 複製」，套用其他欄的日期／平台／Campaign／指標
- **圖表：** 所選指標的每日折線圖（資料來自 `google_ads_campaign_daily_metrics` / `facebook_ads_campaign_daily_metrics`）。
- **Conv.：** 與列表頁同一欄位（Google `metrics.conversions` 倉庫值；Facebook 倉庫 `conversions`，即 sync 時 `sumConversions` 結果），勿另算 actions。
- **KPI 卡片：** 每欄圖表下方顯示與 Campaign 詳情相同的六張卡片（含前期比較與 sparkline）。點擊卡片會把該欄指標篩選切到對應 metric。

### 廣告標籤

- **路由：** `#marketing/ads-tags`（行銷管理 → 設定）
- **目錄表：** `ads_tags`（`name`、`color`、`sort_order`、**`is_active`**）。停用後不會出現在 Campaign 標籤選單，已套用的仍會顯示。
- **關聯表：** `ads_campaign_tags`（`tag_id` + `platform` `google|facebook` + `campaign_row_id`）。
- **列表操作：** Google Ads / Facebook Ads 列表「編輯」欄鉛筆按鈕開啟 popup，可勾選多個標籤。

---

## Backlink (反向連結)

> Supabase（`useBacklinkPurchases`）。網站來自 `useWebsiteProfiles`；供應商來自「供應商 → 網頁供應商」。

### 欄位

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| 所屬網站 | Select (網站檔案) | ✅ | `websiteProfileId`；亦於網站詳情「反向連結」Tab 顯示 |
| 供應商網址 | Select (網頁供應商) | ✅ | 顯示網址；選中後帶出供應商名稱 |
| 供應商 | 唯讀 | — | 來自所選網頁供應商 |
| 費用 | Number + 幣別 USD/HKD | ✅ | 本次購買費用；統計按幣別分列 |
| 購買日期 | Date | ✅ | |
| 反向連結數量 | Number | ✅ | |

### 列表統計
- 購買筆數、總連結數、費用合計 (USD)、費用合計 (HKD)

---

## Paid Ads Sub-page

### 廣告列表

```
┌─────────────────────────────────────────────────────────────────┐
│ 篩選: [公司▼] [平台▼] [狀態▼] [日期範圍]    [+新增廣告]       │
├─────────────────────────────────────────────────────────────────┤
│ 廣告名稱        │ 平台    │ 類型   │ 預算    │ 花費    │ 成效  │
│─────────────────┼─────────┼────────┼─────────┼─────────┼───────│
│ BW Google搜尋   │ Google  │ Search │ $5,000  │ $3,200  │ 64%   │
│ ACI FB再營銷    │ FB      │ Social │ $8,000  │ $7,500  │ 94%⚠️│
│ FCC IG限時優惠  │ IG      │ Display│ $3,000  │ $1,800  │ 60%   │
└─────────────────────────────────────────────────────────────────┘
```

### 廣告詳情/新增

| 區域 | 欄位 |
|------|------|
| 基本 | campaign_name, platform, ad_type, status |
| 預算 | budget, actual_spend, currency, credit_card_id |
| 日期 | start_date, end_date |
| 公司歸屬 | company_id, brand_id |
| 目標 | target_audience (textarea) |
| 成效 | impressions, clicks, conversions |
| 計算值 | CPC (auto), CTR (auto), ROAS |

### 預算警告
- actual_spend / budget ≥ 80% → 黃色
- actual_spend / budget ≥ 100% → 紅色

---

## 組件結構

```
MarketingModule.tsx
├── GoogleAdsModule.tsx         // Google Ads
├── GoogleAdsSyncModule.tsx     // Google Ads 同步
├── FacebookAdsModule.tsx       // Facebook Ads
├── FacebookAdsSyncModule.tsx   // Facebook Ads 同步
├── AdsComparisonModule.tsx     // 廣告比較圖表
└── BacklinkModule.tsx          // 反向連結
```
