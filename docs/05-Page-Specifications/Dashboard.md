# Page Specification — Dashboard (首頁儀表板)

## Route: `/dashboard`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/dashboard/overview` | 儀表板 | 主要KPI + 統計面板 |
| `/dashboard/my-projects` | 我的項目 | 用戶相關項目列表 |

---

## Overview Sub-page

### 1. 頂部公司/品牌篩選器

```
┌─────────────────────────────────────────────────────────┐
│ [All Companies ▼]  [All Brands ▼]    📅 2025年1月       │
└─────────────────────────────────────────────────────────┘
```

- 管理層可看所有公司
- 其他角色受 `accessible_companies` 限制
- 品牌下拉動態載入（級聯篩選）

### 2. KPI Stats Grid (4 卡片)

| 卡片 | 數值來源 | 變化 |
|------|---------|------|
| 網站總數 | COUNT(website_profiles WHERE status='live') | vs 上月 |
| 文章總數 | COUNT(articles WHERE content_status='published') | vs 上月 |
| 影片總數 | COUNT(videos WHERE status='published') | vs 上月 |
| 總投入工時 | SUM(day_report_entries.hours) 本月 | vs 上月 |

### 3. 今日工時狀況 (Staff Hours Alert)

```
┌──────────────────────────────────────────────┐
│ 📅 2025-01-15 (星期三)                       │
│                                               │
│ ✅ 陳小華    8.5h   已達標                    │
│ ✅ 李美玲    8.0h   已達標                    │
│ 🔴 張偉明    6.5h   未達標 (-1.5h)           │
│ ⚠️ 朴賢俊    尚未提交                        │
└──────────────────────────────────────────────┘
```

### 4. 項目進度面板

- 水平進度條列表
- 顯示：項目名稱 | 品牌標籤 | 進度% | 狀態標籤
- 預算 >80% 顯示警告 badge
- 點擊跳轉到項目詳情

### 5. 通知與待辦中心

- 分類Tab: 全部 | 待處理 | 提醒 | 系統
- 列表項: icon + 標題 + 時間 + 操作按鈕
- 重要通知(critical)紅色高亮

### 6. 應收款提醒

- 按公司分組顯示未收款發票
- 顯示：發票號 | 客戶 | 金額 | 逾期天數
- 逾期標紅色

### 7. 快捷操作卡片 (4 格)

| 操作 | 圖示 | 跳轉 |
|------|------|------|
| 提交日報 | 📝 | /day-report/submit |
| 新報價 | 💰 | /quotation/new |
| 新增任務 | ➕ | /project (modal) |
| 上傳影片 | 🎬 | /video/list |

### 8. 最近記錄列表

- 最近 5 條：網站、文章、影片、社交帖文
- 每個區塊有「查看全部」連結

### 9. 最近活動時間線

- 最近 10 條系統操作記錄
- 格式：[時間] [用戶] [操作] [目標]

---

## 組件結構

```
DashboardModule.tsx
├── KPIStatsGrid.tsx          // 4 KPI 卡片
├── ProjectProgressPanel.tsx  // 項目進度
├── NotificationCenter.tsx    // 通知待辦
├── QuickActions.tsx          // 快捷操作
├── RecentActivity.tsx        // 時間線
└── MyProjects.tsx            // 我的項目
```

---

## 數據源

| 組件 | Table(s) | Filter |
|------|----------|--------|
| KPI Cards | website_profiles, articles, videos, day_report_entries | company_id, brand_id |
| Staff Hours | day_reports, users | report_date = today |
| Project Progress | projects | status IN ('active', 'planning') |
| Notifications | notifications | user_id, is_read = false |
| Quick Actions | — | Static links |
| Recent Records | articles, videos, social_posts, website_profiles | ORDER BY created_at DESC LIMIT 5 |
| Activity Timeline | login_logs, day_reports, projects | ORDER BY created_at DESC LIMIT 10 |

---

## 狀態管理

- 使用 `selectedCompanyId` 和 `selectedBrandId` from AppContext
- 切換篩選器時重新載入所有面板數據
- 通知數量即時更新（Supabase Realtime）

---

## 響應式設計

| 斷點 | 佈局 |
|------|------|
| Desktop (≥1280px) | 4列KPI + 2列面板 |
| Tablet (768-1279px) | 2列KPI + 1列面板 |
| Mobile (<768px) | 1列堆疊 |
