# Page Specification — Website Detail (網站管理樞紐頁)

## Route: `/website/:id`

### 概述
Website Profile 是系統的**內容樞紐頁**，從這裡可查看和管理與該網站相關的所有內容模組。

### Sub-routes (Tab 結構)
| Path | Label | Description |
|------|-------|-------------|
| `/website/:id` | 概覽 | 基本資料 + 統計摘要 |
| `/website/:id/pages` | 頁面管理 | Web Pages CRUD |
| `/website/:id/articles` | 文章 | 關聯文章列表 |
| `/website/:id/videos` | 影片 | 關聯影片列表 |
| `/website/:id/social` | 社交帖文 | Social Posts |
| `/website/:id/edm` | EDM | 電郵/短訊記錄 |
| `/website/:id/ads` | 付費廣告 | Paid Ads |
| `/website/:id/seo` | SEO 關鍵字 | Keywords 管理 |
| `/website/:id/traffic` | 網站流量 | 開啟 GA4 報表（`#website/traffic`） |
| `/website/:id/seo-upgrades` | SEO 升級 | 升級記錄 |
| `/website/:id/plugins` | 插件/工具 | 訂閱管理 |
| `/website/:id/links` | 外部連結 | 相關連結 |
| `/website/:id/calendar` | 內容日曆 | 排期日曆 |

---

## 概覽 Tab

### Header 區域

```
┌─────────────────────────────────────────────────────────────────┐
│ [← 返回網站列表]                                                 │
│                                                                   │
│ 🌐 BWDesign 官方網站                         🟢 Live            │
│ https://bwdesign.hk                                              │
│ BWDesign Centre • BW 志豐企業                                    │
│ Platform: WordPress | Hosting: Cloudways                         │
│ Launch: 2024-06-15                                               │
│                                                                   │
│ 開發進度: [Planning] [Design] [Development] [Testing] [✅Launched]│
└─────────────────────────────────────────────────────────────────┘
```

### 統計卡片 (6 格)

| 卡片 | 數據源 | 圖示 |
|------|--------|------|
| 頁面數 | web_pages COUNT | 📄 |
| 文章數 | articles COUNT | ✏️ |
| 影片數 | videos COUNT | 🎬 |
| 社交帖 | social_posts COUNT | 📱 |
| 關鍵字 | seo_keywords COUNT | 🔑 |
| 插件數 | plugins COUNT | 🧩 |

### 快捷操作

- [+ 新增頁面] [+ 新增文章] [+ 新增影片] [+ 新增帖文]

### 指派人員

```
┌────────────────────────────────────────┐
│ 👤 陳小華 (Developer)                  │
│ 👤 李美玲 (Designer)                   │
│ 👤 王小明 (Copywriter)                 │
│ [+ 新增成員]                           │
└────────────────────────────────────────┘
```

---

## Pages Tab (頁面管理)

### 表格結構

| 欄位 | 說明 |
|------|------|
| 排序 | 拖拉排序 (sort_order) |
| 頁面名稱 | page_name |
| URL | page_url |
| 狀態 | planning/designing/developing/live/archived |
| 負責人 | assigned_to → users.full_name |
| 工時 | hours_spent |
| 操作 | 編輯 / 刪除 |

### 操作
- 新增頁面 (Modal)
- 拖拉排序
- Inline 狀態更新

---

## Articles Tab (文章列表)

### 表格

| 欄位 | 說明 |
|------|------|
| 標題 | title (link to article detail) |
| 渠道 | channel badge |
| 狀態 | content_status |
| 作者 | author_id → users |
| 字數 | word_count |
| SEO 分數 | seo_score (0-100 色彩條) |
| 發佈日期 | publish_date |

### 操作
- [+ 新增文章] → 彈出表單
- 搜尋/篩選 (狀態, 渠道)

---

## SEO Keywords Tab

### 佈局

```
┌─────────────────────────────────────────────────────────────────┐
│ [S1 核心字 (5)] [S2 目標字 (12)] [S3 長尾字 (28)]              │
│ [+ 新增] [🤖 AI 生成]                     [搜尋...]            │
├─────────────────────────────────────────────────────────────────┤
│ 關鍵字        │ 等級 │ 搜尋量 │ 排名  │ 目標  │ 難度 │ 狀態    │
│───────────────┼──────┼────────┼───────┼───────┼──────┼─────────│
│ 品牌設計      │ S1   │ 2,400  │ #12   │ #5    │ 65   │ 優化中  │
│ 香港網站設計  │ S1   │ 1,800  │ #8    │ #3    │ 72   │ 優化中  │
│ 網頁設計公司  │ S2   │ 880    │ #25   │ #10   │ 45   │ 監控中  │
│ 📈 (看趨勢)   │      │        │       │       │      │         │
└─────────────────────────────────────────────────────────────────┘
```

### AI 生成流程
1. 點擊 [🤖 AI 生成]
2. 輸入主題/行業
3. Edge Function 調用 OpenAI
4. 回傳建議關鍵字列表（含搜尋量、難度評估）
5. 用戶勾選確認
6. 自動分級存入 seo_keywords 表

---

## Plugins Tab (插件/工具)

### 表格

| 欄位 | 說明 |
|------|------|
| 插件名稱 | plugin_name |
| 費用 | cost + currency |
| 計費週期 | billing_cycle |
| 到期日 | expiry_date (紅色=即將到期) |
| 狀態 | active/expired/cancelled |
| 自動續訂 | auto_renew toggle |
| 操作 | 編輯/取消 |

### 到期提醒邏輯
- expiry_date - 30 days → 黃色提醒
- expiry_date - 7 days → 紅色警告
- expired → 灰色標記

---

## Content Calendar Tab (內容日曆)

### 視圖

- 月視圖顯示所有計劃內容
- 色彩區分: 文章(藍) / 影片(紫) / 社交(粉) / EDM(橙)
- 點擊日期可新增內容計劃
- 來源: content_entries + articles + social_posts

---

## 組件結構

```
WebsiteModule.tsx
├── WebsiteList.tsx              // 網站列表
└── WebsiteDetailTabs.tsx        // 詳情 Tab Container
    ├── WebsiteOverview.tsx      // 概覽
    ├── WebsitePages.tsx         // 頁面管理
    ├── WebsiteArticles.tsx      // 文章
    ├── WebsiteVideos.tsx        // 影片
    ├── WebsiteSocial.tsx        // 社交
    ├── WebsiteEdm.tsx           // EDM
    ├── WebsiteAds.tsx           // 廣告
    ├── WebsiteSeo.tsx           // SEO 關鍵字
    ├── WebsiteTrafficTab.tsx    // 網站流量（跳轉 GA4 報表）
    ├── WebsiteSeoUpgrades.tsx   // SEO 升級
    ├── WebsitePlugins.tsx       // 插件
    ├── WebsiteLinks.tsx         // 外部連結
    └── WebsiteCalendar.tsx      // 內容日曆
```

---

## 數據加載策略

| Tab | 主查詢 | JOIN |
|-----|--------|------|
| 概覽 | website_profiles WHERE id | — |
| 頁面 | web_pages WHERE website_profile_id | users (assigned_to) |
| 文章 | articles WHERE website_profile_id | users (author_id) |
| 影片 | videos WHERE website_profile_id | users (editor_id) |
| 社交 | social_posts WHERE website_profile_id | — |
| EDM | edm_campaigns WHERE website_profile_id | edm_templates |
| 廣告 | paid_ads WHERE website_profile_id | credit_cards |
| SEO | seo_keywords WHERE website_profile_id | articles (assigned) |
| 流量 | ga4_properties WHERE website_profile_id | 詳情見 Website-Traffic.md |
| 升級 | seo_upgrades WHERE website_profile_id | suppliers |
| 插件 | plugins WHERE website_profile_id | — |

### 延遲加載
- 只有切換到對應 Tab 時才加載該 Tab 的數據
- 概覽 Tab 的統計數字使用 COUNT 查詢，不載入完整列表
