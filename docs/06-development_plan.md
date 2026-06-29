# 06 — 開發計劃（Development Plan）

## Marketing Project System — 開發計劃文檔管理規範 v1.0

---

## 1. 概述

「開發計劃」模塊位於 **規劃中心 → 開發計劃**，用於集中展示系統功能的 PRD / 方案文檔（HTML），供團隊查閱開發細節與業務邏輯。

- **前端入口**：規劃中心 → 開發計劃
- **交互形式**：列表 ↔ 詳情整頁切換，詳情頁左上角返回列表
- **權限**：暫不做額外權限控制

---

## 2. 文檔存放路徑

所有開發計劃 HTML 統一放在倉庫目錄：

```
docs/development_plan/{規劃日期}/{文件名}.html
```

### 路徑規則

| 部分 | 格式 | 示例 |
|------|------|------|
| 根目錄 | 固定 `docs/development_plan/` | — |
| 規劃日期 | `YYYY-MM-DD`（上傳當日） | `2025-06-29` |
| 文件名 | 有意義的英文/中文名 + `.html` | `PRD-工作匯報自動關聯-v2.0.html` |

### 完整示例

```
docs/development_plan/2025-06-29/PRD-工作匯報自動關聯-v2.0.html
```

### 瀏覽器訪問 URL

文檔在應用內 iframe 載入時，路徑映射為：

```
docs/development_plan/2025-06-29/xxx.html
  →  /development_plan/2025-06-29/xxx.html
```

Vite 開發服務器與 production build 均會將 `docs/development_plan/` 靜態發佈到上述 URL。

---

## 3. 資料表 `development_plan`

列表數據由 Supabase 表 `development_plan` 管理，對應前端列表四列。

### 3.1 表結構

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `id` | UUID | ✅ | 主鍵，自動生成 |
| `planning_date` | DATE | ✅ | **規劃日期**：依文檔上傳/註冊時間的日期部分 |
| `title` | TEXT | ✅ | **內容標題**：由 HTML 文件名推導（去掉 `.html` 後綴） |
| `owner` | TEXT | ✅ | **負責人**：由上傳者或文檔負責人指定 |
| `document_path` | TEXT | ✅ | **文檔地址**：完整倉庫路徑，如 `docs/development_plan/2025-06-29/xxx.html` |
| `file_name` | TEXT | ✅ | 原始文件名，如 `PRD-工作匯報自動關聯-v2.0.html` |
| `created_at` | TIMESTAMPTZ | ✅ | 記錄建立時間（默認 NOW()） |
| `updated_at` | TIMESTAMPTZ | ✅ | 記錄更新時間 |

### 3.2 字段自動推導規則

| 列表列 | 資料來源 | 規則 |
|--------|----------|------|
| 規劃日期 | `planning_date` | 上傳/註冊當天日期 `YYYY-MM-DD` |
| 內容標題 | `title` | 文件名去掉 `.html`，例：`PRD-工作匯報自動關聯-v2.0.html` → `PRD-工作匯報自動關聯-v2.0` |
| 負責人 | `owner` | 由文檔負責人或上傳者在註冊時填寫 |
| 查看 | `document_path` | 保存完整路徑；前端轉為 `/development_plan/...` 供 iframe 載入 |

---

## 4. 在 Cursor 中發佈新文檔

### 步驟 1：撰寫 HTML

在 Cursor 中新建或編輯 HTML，建議自包含樣式（`<style>` 內嵌），以便 iframe 完整渲染。

### 步驟 2：保存到指定目錄

將文件保存至：

```
docs/development_plan/{今日日期}/{文件名}.html
```

示例（2025-06-29 上傳）：

```
docs/development_plan/2025-06-29/PRD-新功能-v1.0.html
```

### 步驟 3：在資料庫註冊列表記錄

向 `development_plan` 表插入一筆記錄。可透過 Supabase Dashboard、SQL 或 Cursor 代你執行 migration/insert。

```sql
INSERT INTO public.development_plan (
  planning_date,
  title,
  owner,
  document_path,
  file_name
) VALUES (
  CURRENT_DATE,                                                    -- 規劃日期 = 上傳當日
  'PRD-新功能-v1.0',                                               -- 由文件名推導
  '張三',                                                          -- 負責人（由文檔負責人指定）
  'docs/development_plan/2025-06-29/PRD-新功能-v1.0.html',        -- 完整文檔路徑
  'PRD-新功能-v1.0.html'                                           -- 原始文件名
);
```

### 步驟 4：驗證

1. 啟動 dev server：`npm run dev`
2. 進入 **規劃中心 → 開發計劃**
3. 確認列表出現新記錄
4. 點擊「查看」，確認 HTML 正常展示
5. 點左上角「返回開發計劃列表」回到列表

---

## 5. 快速指令（Cursor 協助）

向 Cursor 描述需求即可，例如：

> 新增開發計劃：文件 `PRD-客戶報價優化-v1.0.html`，負責人「李四」，內容已寫好。

Cursor 應自動完成：

1. 保存 HTML 到 `docs/development_plan/{date}/`
2. 生成 migration 或 SQL insert
3. 必要時更新前端相關代碼

---

## 6. 前端實現摘要

| 文件 | 用途 |
|------|------|
| `src/components/planning-center/DevelopmentPlans.tsx` | 列表 ↔ 詳情 UI |
| `src/hooks/useDevelopmentPlans.ts` | 讀取 `development_plan` 表 |
| `src/lib/developmentPlanPaths.ts` | 路徑 ↔ URL 轉換、標題推導 |
| `vite.config.ts` | 靜態發佈 `docs/development_plan/` |
| `supabase/migrations/*_create_development_plan.sql` | 建表與種子數據 |

---

## 7. 注意事項

1. **文件名即標題**：列表標題直接取自文件名，命名時請使用清晰、可讀的名稱。
2. **日期文件夾**：同一日可有多份文檔，共用同一日期目錄。
3. **勿改 `document_path` 格式**：必須以 `docs/development_plan/` 開頭，否則 iframe 無法正確載入。
4. **更新文檔內容**：直接覆蓋同名 HTML 即可，無需改表（除非改文件名或負責人）。
5. **刪除文檔**：需同時刪除 HTML 文件及資料庫對應記錄。
6. **二期擴展**（可選）：應用內上傳表單、版本管理、權限控制。

---

## 8. 首期示例數據

| 規劃日期 | 內容標題 | 負責人 | 文檔路徑 |
|----------|----------|--------|----------|
| 2025-06-29 | PRD-工作匯報自動關聯-v2.0 | Dylan | `docs/development_plan/2025-06-29/PRD-工作匯報自動關聯-v2.0.html` |
