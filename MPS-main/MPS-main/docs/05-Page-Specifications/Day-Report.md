# Page Specification — Day Report (工作匯報)

## Route: `/day-report`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/day-report/submit` | 提交匯報 | 多步驟提交表單 |
| `/day-report/calendar` | 工作日曆 | 月/週日曆視圖 |
| `/day-report/team` | 團隊匯報 | PM/管理層審批介面 |
| `/day-report/monthly` | 月度報告 | 月度工時統計 |
| `/day-report/analytics` | 工時分析 | 圖表分析 |
| `/day-report/templates` | 常用範本 | 快捷範本管理 |

---

## Submit Sub-page (提交匯報)

### 多步驟表單流程

```
Step 1: 日期 & 模式選擇
  ┌─────────────────────────────────────────┐
  │ 📅 日期: [2025-01-15]                  │
  │                                          │
  │ 模式: ○ 正常工作日  ○ 半日假  ○ 全日假  │
  │                                          │
  │ (如選假期) 假期類型: [年假 ▼]            │
  └─────────────────────────────────────────┘

Step 2: 工作記錄（動態多條）
  ┌─────────────────────────────────────────┐
  │ 記錄 #1                                  │
  │ 公司: [BWDesign ▼] → 品牌: [BW ▼]       │
  │ 項目: [BW 官網重建 ▼]                    │
  │ 網站: [bwdesign.hk ▼] (可選)            │
  │ 類別: [網站建設 ▼]                       │
  │ 描述: [首頁切版完成RWD調整...]           │
  │ 工時: [3.5] h                            │
  │ 時間: [09:00] - [12:30]                  │
  │ 輸出: [code ▼]  URL: [https://...]       │
  │ 附件: [+ 上傳]                           │
  │                                          │
  │ [+ 新增工作記錄]   [使用範本 ▼]          │
  └─────────────────────────────────────────┘

Step 3: 確認 & 提交
  ┌─────────────────────────────────────────┐
  │ 總工時: 8.5h ✅ (≥8h)                   │
  │ 超時: 0.5h (橙色標記)                    │
  │                                          │
  │ 工作記錄摘要:                            │
  │ • 網站建設 - BW官網 - 3.5h              │
  │ • 文章撰寫 - ACI品牌 - 2.0h            │
  │ • 會議 - 部門週會 - 1.5h                │
  │ • SEO工作 - BW SEO - 1.5h              │
  │                                          │
  │ [儲存草稿]           [提交匯報]          │
  └─────────────────────────────────────────┘
```

### 驗證規則

| 條件 | 規則 | 錯誤訊息 |
|------|------|---------|
| 正常工作日 | total_hours ≥ 8 | 「正常工作日工時不足8小時」 |
| 半日假 | total_hours ≥ 4 | 「半日假工時不足4小時」 |
| 全日假 | 免驗證 | — |
| 超時標記 | total_hours > 8 → is_overtime = true | 橙色顯示 |
| 重複日期 | 同用戶同日期不可重複提交 | 「該日期已有匯報記錄」 |
| 未來日期 | report_date ≤ today | 「不可提交未來日期的匯報」 |

### 級聯選擇器邏輯

```
公司選擇 → 動態載入該公司下的品牌
品牌選擇 → 動態載入該品牌下的項目
項目選擇 → 動態載入該項目下的網站 (可選)
```

---

## Calendar Sub-page (工作日曆)

### 視圖

- 月視圖（預設）+ 週視圖切換
- 每日格子顯示：工時數 + 顏色方塊
- 顏色對應 task_category（13種顏色）

### 顏色對照表

| 類別 | 顏色 |
|------|------|
| 網站建設 | Teal #0D9488 |
| 文章撰寫 | Blue #3B82F6 |
| 影片拍攝 | Purple #8B5CF6 |
| 社交媒體 | Pink #EC4899 |
| EDM | Amber #F59E0B |
| SEO | Green #10B981 |
| 廣告管理 | Red #EF4444 |
| 會議 | Indigo #6366F1 |
| 培訓 | Cyan #14B8A6 |
| 行政 | Stone #78716C |
| 請假 | Gray #9CA3AF |
| 公眾假期 | Light Gray #D1D5DB |
| 其他 | Slate #64748B |

---

## Team Sub-page (團隊匯報) — PM/管理層

### 佈局

```
┌─────────────────────────────────────────────────────────┐
│ 篩選: [日期範圍] [成員 ▼] [項目 ▼] [狀態 ▼]          │
├─────────────────────────────────────────────────────────┤
│ 📋 待審批 (3)                                           │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 陳小華 | 2025-01-15 | 8.5h | 提交中               │ │
│ │ 項目: BW官網(3.5h), ACI品牌(2h), 會議(1.5h)...    │ │
│ │                              [✅ 批准] [❌ 退回]    │ │
│ └────────────────────────────────────────────────────┘ │
│                                                          │
│ ✅ 已審批 (12)                                          │
│ ...                                                      │
└─────────────────────────────────────────────────────────┘
```

### 操作權限

- **批准**: 設定 status = 'approved', reviewer_id, reviewed_at
- **退回**: 設定 status = 'rejected' + 必填 reviewer_comment
- **Inline 操作**: 不需跳轉頁面

---

## Analytics Sub-page (工時分析)

### 圖表類型

1. **橫向疊加長條圖** — 每人每日工時，按 task_category 堆疊
2. **環形圓餅圖** — 工時按類別分布
3. **折線圖** — 每日/每週工時趨勢
4. **排行榜** — 同事工時排名

### 篩選

- 日期範圍
- 公司/品牌
- 特定用戶
- 任務類別

---

## 組件結構

```
DayReportModule.tsx
├── DayReportSubmitForm.tsx    // 多步驟表單
│   ├── DateModeSelector.tsx   // Step 1
│   ├── TaskEntryForm.tsx      // Step 2 (repeatable)
│   └── SubmitConfirm.tsx      // Step 3
├── DayReportCalendar.tsx      // 工作日曆
├── TeamReportView.tsx         // 團隊審批
├── MonthlyReport.tsx          // 月度
├── AnalyticsCharts.tsx        // 分析
└── TemplateManager.tsx        // 範本
```

---

## 數據交互

| 操作 | API | Table |
|------|-----|-------|
| 提交匯報 | INSERT | day_reports + day_report_entries |
| 審批 | UPDATE | day_reports (status, reviewer_id) |
| 載入日曆 | SELECT | day_reports + entries WHERE user_id, month |
| 團隊列表 | SELECT | day_reports WHERE status='submitted' |
| 分析數據 | SELECT + GROUP BY | day_report_entries |
| 使用範本 | SELECT | report_templates WHERE user_id |
| 儲存範本 | INSERT | report_templates |
