# 工作匯報自動關聯 — 業務模塊對接指南

> 版本：v1.0 · 更新：2026-06-30  
> 詳細方案：[PRD-工作匯報自動關聯-v2.0.html](./development_plan/2026-06-29/PRD-工作匯報自動關聯-v2.0.html)

## 1. 目標

業務模塊任務完成時，將工作項寫入 **待匯報佇列**（`pending_report_items`）；用戶在「提交匯報」頁面自動看到預填工作項，確認後提交。**不自動提交匯報**。

## 2. 整體流程

```
業務模塊完成任務（含必填工時）
    → createPendingReportItem()
    → pending_report_items（status=pending）

用戶打開提交匯報（選日期）
    → 自動 merge pending → 表單 entries（工時預填）
    → status=pulled

用戶提交匯報
    → day_report_entries
    → status=consumed
```

**狀態流轉：** `pending` → `pulled` → `consumed`；用戶刪除自動項 → `dismissed`

## 3. 核心規則

| 規則 | 說明 |
|------|------|
| 當日關聯 | `report_date` = 任務完成日（本地日期） |
| 首次觸發 | 狀態**首次**進入完成態才寫入 pending |
| 工時必填 | 任務端填寫 `suggestedHours > 0`，匯報頁自動帶入（可修改） |
| 去重 | `UNIQUE(staff_id, source_module, source_type, source_id)` |
| 歸屬 | 操作者 `bubble_staff_id` |
| 非目標 | 不自動提交、不自動填滿 8h、一期不做跨日拆分 |

## 4. 業務模塊接入步驟（Checklist）

每個新模塊對接時，按以下清單實施：

- [ ] **1. 完成 UI 增加「匯報工時 (h)」**（若業務表已有 `hoursSpent` 等欄位可復用）
- [ ] **2. 保存前校驗**工時 > 0
- [ ] **3. 在「首次完成」Handler 末尾**調用 `createPendingReportItem()`
- [ ] **4. 解析操作者** `staffId`：`resolveBubbleStaffId(systemUser)`
- [ ] **5. 確認 `day_report_type`** 已有對應類別（無則加 migration 種子）
- [ ] **6. 手動驗收**：完成任務 → 提交匯報頁出現自動項 → 提交後 pending 變 consumed

> **匯報頁側**（`DayReportModule`）已實現自動合併 / 刷新 / dismiss / consume，**業務模塊只需寫入 pending**。

## 5. 統一服務 API

**文件：** `src/services/reportLinkService.ts`

### 業務模塊需調用

```typescript
import {
  createPendingReportItem,
  updatePendingReportHours,
  resolveBubbleStaffId,
  localDateString,
} from '@/services/reportLinkService';
import { useAuth } from '@/context/AuthContext';

// 首次完成
await createPendingReportItem({
  staffId,                          // resolveBubbleStaffId(systemUser)
  reportDate: localDateString(),    // 完成日 YYYY-MM-DD
  sourceModule: 'marketing',        // 見下表
  sourceType: 'social_post',        // 見下表
  sourceId: post.id,              // 來源實體 ID
  category: 'social_media',          // day_report_type.id
  title: '發佈 IG Reel — xxx',      // 工作內容描述
  suggestedHours: post.hoursSpent,  // 必填 > 0
  relatedId: post.websiteProfileId,
  relatedName: 'ACI Global',
  outcomeType: 'url',               // 可選
  outcomeUrl: post.postUrl,         // 可選
  metadata: { platform: 'instagram' },
});

// 已完成任務再次編輯工時（pending/pulled 狀態）
await updatePendingReportHours(staffId, sourceModule, sourceType, sourceId, newHours);
```

### 首次完成判斷模板

```typescript
const wasCompleted = prev.status === 'published'; // 舊狀態
const isCompleted = data.status === 'published';  // 新狀態

if (!wasCompleted && isCompleted) {
  if (!data.hoursSpent || data.hoursSpent <= 0) {
    throw new Error('請填寫匯報工時');
  }
  await createPendingReportItem({ /* ... */ });
}
```

## 6. 模塊接入規格表

| 模塊 | source_module | source_type | 觸發條件 | category | 接入位置 | 工時欄位 | 狀態 |
|------|---------------|-------------|----------|----------|----------|----------|------|
| 藝人管理 | `talent` | `interview` | `interviewed = true`（首次） | `talent_interview` | `TalentModule` · 面試 onSave | `artist_apply.report_hours` | ✅ 已上線 |
| 行銷 · 社媒 | `marketing` | `social_post` | `status → published`（首次） | `social_media` | `updateSocialPost()` | `hoursSpent` | ⏳ |
| 行銷 · EDM | `marketing` | `edm_campaign` | `status → sent`（首次） | `edm` | `updateEdmCampaign()` | `hoursSpent` | ⏳ |
| 行銷 · SEO | `marketing` | `seo_keyword` | `status → achieved`（首次） | `seo` | `updateSeoKeyword()` | `hoursSpent` | ⏳ |
| 行銷 · 廣告 | `marketing` | `paid_ad` | `status → completed`（首次） | `paid_ads` | `updatePaidAd()` | `hoursSpent` | ⏳ |
| 影片製作 | `video` | `video_demo_done` | 保存時有工時（操作者） | `video_editing` | `VideoManagementModule` · EditVideoModal | `video_output_work_logs` | ✅ |
| 影片製作 | `video` | `video_published` | 有 `published_date` 且保存時有工時 | `video_editing` | 同上 | 同上 | ✅ |
| 網站+系統 | `website` | `article_published` | `contentStatus → published` | `article_writing` | 文章更新 Handler | 需新增 | ⏳ |
| 專案策劃 | `project` | `kanban_task` | 看板拖至 `done`（首次） | 依 task 映射 | `ProjectDetail.handleDragEnd` | `estimatedHours` 或新增 | ⏳ |

### 關聯對象（related_id）

| category | related_id |
|----------|------------|
| `social_media` / `edm` / `seo` / `paid_ads` / `video_editing` / `article_writing` | 網站 ID 或 Vchannel ID（影片管理用 `vchannel_id` + 頻道公開名） |
| `kanban_task` | 專案 ID |
| `talent_interview` | 無（`relation_type=none`） |

## 7. 數據表 `pending_report_items`

| 欄位 | 說明 |
|------|------|
| `staff_id` | 操作者 `bubble_staff_id` |
| `report_date` | 建議匯報日期 |
| `source_module` / `source_type` / `source_id` | 來源標識（去重鍵） |
| `category` | → `day_report_type.id` |
| `title` | 工作內容 |
| `suggested_hours` | 任務端填寫的工時 |
| `related_id` / `related_name` | 關聯對象 |
| `outcome_type` / `outcome_url` | 成果（可選） |
| `metadata` | JSONB 擴展 |
| `status` | `pending` / `pulled` / `consumed` / `dismissed` |

**Migration：** `supabase/migrations/20260630_work_report_pending_items.sql`

## 8. 參考實現：藝人面試（已上線）

**文件：** `src/components/talent/TalentModule.tsx`

1. `InterviewRatingEditor` 增加必填「匯報工時 (h)」
2. 保存 `artist_apply.report_hours`
3. 首次 `interviewed: true` → `createPendingReportItem({ sourceModule: 'talent', sourceType: 'interview', ... })`
4. 再次保存 → `updatePendingReportHours(...)`

## 9. 匯報頁（已實現，無需各模塊重複開發）

**文件：** `src/components/day-report/DayReportModule.tsx`

| 能力 | 說明 |
|------|------|
| 自動合併 | 載入日期後 merge `status=pending` 項 |
| 刷新待匯報 | 手動同步新 pending |
| 自動角標 | `isAutoPulled` 標記 |
| 刪除自動項 | 調用 `dismissPendingItem` |
| 提交 consume | 成功寫入 entries 後標記 consumed |

**Hook：** `src/hooks/usePendingReportItems.ts` — 待匯報數量提示

## 10. 驗收清單（每模塊）

- [ ] 任務完成且工時已填 → 當日提交匯報頁出現對應自動項
- [ ] 工時與任務端一致（匯報頁可改）
- [ ] 工時未填無法完成任務
- [ ] 同一任務重複操作不產生重複 pending
- [ ] 提交匯報後 pending → consumed
- [ ] 刪除自動項後刷新不再出現（dismissed）
- [ ] 當日已提交後再完成任務 → 補充匯報可合併新項

## 11. 實施路線圖

| 階段 | 範圍 | 狀態 |
|------|------|------|
| Phase 1a | 基礎設施（pending 表、reportLinkService、匯報頁合併） | ✅ |
| Phase 1 · 藝人 | 面試完成 | ✅ |
| Phase 1 · 行銷+影片 | 社媒 / EDM / SEO / 廣告 / 影片 | ⏳ |
| Phase 1 · 網站+藝人擴展 | 文章發佈 | ⏳ |
| Phase 1 · 專案 | 看板 done + 補充匯報 | ⏳ |
| Phase 2 | 跨日任務拆分 | ⏳ |

## 12. 相關文件

| 文件 | 用途 |
|------|------|
| `src/services/reportLinkService.ts` | 統一服務（create / merge / consume / dismiss） |
| `src/hooks/usePendingReportItems.ts` | 待匯報數量 |
| `src/components/day-report/DayReportModule.tsx` | 提交匯報頁 |
| `supabase/migrations/20260630_work_report_pending_items.sql` | 表結構 |
| `docs/development_plan/2026-06-29/PRD-工作匯報自動關聯-v2.0.html` | 完整 PRD |
