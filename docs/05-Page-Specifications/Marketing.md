# Page Specification — Marketing (行銷管理)

## Route: `/marketing`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/marketing/calendar` | 行銷日曆 | 全渠道排期日曆 |
| `/marketing/social` | 社交媒體 | Social Posts 管理 |
| `/marketing/edm` | EDM 管理 | 電郵/短訊營銷 |
| `/marketing/paid-ads` | 付費廣告 | Paid Ads 管理 |
| `/marketing/seo` | SEO 關鍵字 | 全站 SEO 管理 |
| `/marketing/seo-upgrade` | SEO 升級 | 升級記錄 |
| `/marketing/graphic-design` | 平面設計 | 平面設計製作追蹤 |
| `/marketing/backlink` | 反向連結 | 反向連結購買紀錄 |
| `/marketing/google-business` | Google Business | Google Business 登記 |

---

## Google Business

> 前端 DataStore；後續再落 Supabase 表。登記已建立的 Google Business 檔案。亦於「網站+系統 → 網站詳情 → Google Business」Tab 顯示該站紀錄。

### 欄位

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| 所屬網站 | Select (網站檔案) | ✅ | `websiteProfileId` |
| Google Business 網址 | Text (URL) | ✅ | g.page / maps 連結 |
| 登記日期 | Date | ✅ | |
| 登記內容 | Textarea | ✅ | 業務資訊、地址、營業時間等 |

---

## Backlink (反向連結)

> 前端 DataStore；後續再落 Supabase 表。網站／供應商來自「供應商 → 網頁供應商」。

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

## Marketing Calendar

### 視圖切換
- 月視圖 (預設)
- 週視圖

### 色彩標識

| 內容類型 | 顏色 | 說明 |
|---------|------|------|
| 文章發佈 | Blue #3B82F6 | 文章排期 |
| 影片發佈 | Purple #8B5CF6 | 影片排期 |
| 社交帖文 | Pink #EC4899 | FB/IG/XHS 帖文 |
| EDM | Amber #F59E0B | 電郵發送 |
| 付費廣告 | Red #EF4444 | 廣告Campaign |
| 活動 | Green #10B981 | 線下活動 |

### 篩選
- 公司/品牌
- 內容類型 (多選)
- 平台
- 網站

---

## Social Media Sub-page

### 列表視圖

```
┌─────────────────────────────────────────────────────────────────┐
│ 篩選: [公司▼] [品牌▼] [平台▼] [狀態▼]  [搜尋...]  [+新增帖文]│
├─────────────────────────────────────────────────────────────────┤
│ 平台  │ 類型   │ 內容 (截取)      │ 排期         │ 狀態 │ 互動 │
│───────┼────────┼──────────────────┼──────────────┼──────┼──────│
│ 📘 FB │ Image  │ BW新年優惠...    │ 01-15 10:00  │ 已發 │ 120  │
│ 📷 IG │ Reel   │ 辦公室日常...    │ 01-16 14:00  │ 排期 │ —    │
│ 📕 XHS│ Carsl  │ 5個設計趨勢...   │ 01-17 09:00  │ 草稿 │ —    │
└─────────────────────────────────────────────────────────────────┘
```

### 新增帖文表單

| 欄位 | 類型 | 必填 |
|------|------|------|
| 網站 | Select (website_profiles) | ✅ |
| 平台 | Select (FB/IG/XHS/LI/YT/TW) | ✅ |
| 帖文類型 | Select (image/video/carousel/story/reel) | ✅ |
| 內容 | Textarea | ✅ |
| 媒體檔案 | File Upload (多檔) | ❌ |
| 排期日期 | DateTime Picker | ❌ |
| 關聯文章 | Select | ❌ |
| 關聯影片 | Select | ❌ |
| 標籤 | Tag Input | ❌ |
| 工時 | Number | ❌ |

---

## EDM Sub-page

### Campaign 列表

| 欄位 | 說明 |
|------|------|
| 類型 | email / sms badge |
| 主題 | subject |
| 模板 | template_name |
| 收件人數 | recipient_count |
| 發送日期 | send_date |
| 狀態 | status badge |
| 開信率 | open_rate (bar) |
| 點擊率 | click_rate (bar) |

### 模板管理
- 按公司分類的模板列表
- 預覽模板內容
- 可直接從模板建立新Campaign

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

## SEO Keywords Sub-page (全站整合)

### 與 Website Detail SEO Tab 的差異
- 全站視圖：顯示所有網站的關鍵字
- 按公司/品牌/網站篩選
- 額外統計面板

### 統計面板

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 總關鍵字 │ │ 優化中   │ │ 已達標   │ │ AI生成   │
│   85     │ │   23     │ │   18     │ │   34     │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## SEO Upgrade Sub-page

### 列表

| 欄位 | 說明 |
|------|------|
| 網站 | website_profiles.website_name |
| 類型 | upgrade_type badge |
| 供應商 | suppliers.name |
| 費用 | cost + currency |
| 承擔公司 | companies.company_name_zh |
| 日期 | start_date — end_date |
| 狀態 | active/completed/cancelled |
| 排名變化 | ranking_before → ranking_after (↑↓) |

---

## 組件結構

```
MarketingModule.tsx
├── MarketingCalendar.tsx       // 行銷日曆
├── SocialPostsModule.tsx       // 社交媒體
│   ├── SocialPostsList.tsx     // 帖文列表
│   └── SocialPostForm.tsx      // 新增/編輯
├── EdmModule.tsx               // EDM
│   ├── EdmManagementModule.tsx // Campaign 列表
│   └── EdmTemplates.tsx        // 模板
├── PaidAdsModule.tsx           // 付費廣告
│   └── PaidAdsList.tsx         // 廣告列表
├── SeoKeywordsModule.tsx       // SEO 關鍵字
│   └── SeoKeywordsList.tsx     // 關鍵字列表
└── SeoUpgradeModule.tsx        // SEO 升級
```
