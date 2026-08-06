# Asana Pitching 同步設定

Pitching 頁面透過 Supabase Edge Function `sync-asana-pitching` 從 Asana 專案拉取 Task，寫入 `pitching_records` 表。

## 同步邏輯（目前設定）

- **方向**：僅 Asana → MPS（不會把 MPS 手動新增的 Pitching 寫回 Asana）
- **專案**：僅 `BWT Active 1 開始緊密跟進中`（GID `1209549009281325`）
- **年份**：只同步 Task **建立日**在 **2026** 年的項目（`created_at` 年份 = `sync_year`）
- **查詢日期**：Asana Task **建立日**（`created_at` 的日期部分），非 due date
- **狀態**：來自 Asana **自訂欄位**（預設欄位名稱 `狀態`），對應 MPS：初步提案 / 跟進中 / 確認項目 / 已結案
- **其他欄位**：提案顯示名稱、負責 PM、項目類型等對應規則之後再細調

## 必要憑證（Supabase Secrets）

在 **Supabase Dashboard → Project Settings → Edge Functions → Secrets** 設定：

| Secret | 說明 |
|---|---|
| `ASANA_ACCESS_TOKEN` | Asana **Personal Access Token**（非 Client Secret） |
| `ASANA_PITCHING_PROJECT_GID` | 否 | 單一專案 GID（預設 `1209549009281325`） |
| `ASANA_SYNC_YEAR` | 否 | 只同步該建立年份的 Task（預設 `2026`） |
| `ASANA_STATUS_FIELD_NAME` | 否 | 狀態自訂欄位名稱（預設 `狀態`） |

### 如何取得 Personal Access Token

1. 前往 https://app.asana.com/0/my-apps  
2. **Manage Developer Apps** → **Personal access token**  
3. 建立 Token，權限至少：`tasks:read`、`projects:read`  
4. 複製 Token，貼到 Supabase Secret `ASANA_ACCESS_TOKEN`

> **注意：** OAuth 的 Client ID / Client Secret 用於 Cursor MCP 或使用者登入流程，**不能**直接取代 PAT 給 Edge Function 使用。

## 部署步驟

```bash
# 1. 執行 migration
supabase db push
# 或在 SQL Editor 依序執行：
#   supabase/migrations/20260806140000_pitching_asana_warehouse.sql
#   supabase/migrations/20260806150000_pitching_asana_sync_rules.sql

# 2. 部署 Edge Function
supabase functions deploy sync-asana-pitching --no-verify-jwt

# 3. 設定 Secrets（示例）
supabase secrets set ASANA_ACCESS_TOKEN=your_pat_here
supabase secrets set ASANA_PITCHING_PROJECT_GID=1209549009281325
supabase secrets set ASANA_SYNC_YEAR=2026
supabase secrets set ASANA_STATUS_FIELD_NAME=狀態
```

## 同步的 Asana 專案

Migration `20260806150000` 已將 `asana_pitching_projects` 設定為**只啟用**：

- `1209549009281325` — BWT Active 1 開始緊密跟進中（`sync_year = 2026`，`status_field_name = 狀態`）

其他先前 seed 的專案已設為 `enabled = false`。

## 欄位對應（初版）

| Asana | pitching_records |
|---|---|
| Task name | display_name |
| created_at（日期部分） | inquiry_date |
| 自訂欄位「狀態」 | status、asana_status_label |
| assignee.name | assigned_pm_name |
| notes | description |
| permalink_url | asana_link |
| gid | asana_task_gid |

## 前端使用

- 列表資料來自 Supabase `pitching_records`  
- **同步 Asana** → 呼叫 `/functions/v1/sync-asana-pitching`  
- **新增 Pitching** → 手動寫入 Supabase（可填 Asana 連結，不會自動建立 Asana Task）

## 安全提醒

- 切勿將 PAT、Client Secret 提交到 Git  
- 若憑證曾在聊天或郵件中暴露，請在 Asana 後台**立即撤銷並重新建立**
