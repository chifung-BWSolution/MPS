# Asana Pitching 同步設定

Asana 同步寫入暫存表 `asana_synced_tasks`，**不會**自動建立或覆寫 `quotation_client_project`。使用者在 **客戶報價 → Asana 待匯入** 選取任務，以表單（帶入 Asana 預設值）建立實際的報價客戶項目。

Pitching 與 Project 頁面只讀 `quotation_client_project`。Project 頁面只顯示狀態為 **確認項目** 的紀錄。

## 同步邏輯（目前設定）

- **方向**：僅 Asana → `asana_synced_tasks`（不會把 MPS 手動新增的 Pitching 寫回 Asana）
- **粒度**：Asana **Task**（配置的 board 見 `asana_pitching_projects`）
- **年份 / 區塊**：沿用 `asana_pitching_projects` 的 `sync_year` / `sync_year_from` / `sync_date_mode` / `sync_section_name`
- **查詢日期**：Asana Task **建立日**（`created_at` 的日期部分），非 due date（`active_deal` 模式除外）
- **狀態**：寫入暫存列的 `mapped_status`。匯入時作為新 `quotation_client_project.status` 預設（表單沒有狀態欄）。BWT Active 3 等 `sync_default_status = confirmed` 的任務，匯入後會出現在 Project 頁
- **已存在的 QCP**：舊版自動同步建立的列會保留，並以 `asana_task_gid` 視為已匯入（預設待匯入清單會隱藏）

## 必要憑證（Supabase Secrets）

在 **Supabase Dashboard → Project Settings → Edge Functions → Secrets** 設定：

| Secret | 說明 |
|---|---|
| `ASANA_ACCESS_TOKEN` | Asana **Personal Access Token**（非 Client Secret） |
| `ASANA_PITCHING_PROJECT_GID` | 否 | 單一專案 GID（預設 `1208704092427502`） |
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
# 1. 執行 migration（含 asana_synced_tasks）
supabase db push

# 2. 部署 Edge Function
supabase functions deploy sync-asana-pitching --no-verify-jwt
supabase functions deploy asana-task-stories --project-ref kwcevjcmdjadhrygjyfp
supabase functions deploy asana-attachment-download --project-ref kwcevjcmdjadhrygjyfp

# 3. 設定 Secrets（示例）
supabase secrets set ASANA_ACCESS_TOKEN=your_pat_here
supabase secrets set ASANA_PITCHING_PROJECT_GID=1208704092427502
supabase secrets set ASANA_SYNC_YEAR=2026
supabase secrets set ASANA_STATUS_FIELD_NAME=狀態
```

## 同步的 Asana 專案

僅同步 `asana_pitching_projects.enabled = true` 的 boards。現行常見設定：

- `1208704092427502` — BWT Active 1 開始緊密跟進中
- `1208704092427590` — BWT Active 3 已成交+開工 DONE Deal（`sync_default_status = confirmed`）
- `1201898424971757` — BWL Active 1 準備報價單（區塊含 Quote Stage）

~~`1209549009281325`~~ — 舊 seed 錯誤（實為 BWA Video V12，已停用）

## 欄位對應

| Asana | asana_synced_tasks | 匯入後 quotation_client_project |
|---|---|---|
| Task name | display_name | display_name（表單可改） |
| created_at（日期部分） | inquiry_date | inquiry_date |
| 自訂欄位「狀態」或 board 預設 | mapped_status | status |
| assignee.name | assigned_pm_name | assigned_pm_name / main_pm_id（名稱比對） |
| notes | description | description |
| permalink_url | asana_link | asana_link |
| gid | asana_task_gid | asana_task_gid（去重） |

## 前端使用

- **Asana 待匯入** → 讀 `asana_synced_tasks`，預設只顯示尚未出現在 `quotation_client_project` 的任務；可切換成「全部」
- **同步 Asana** → 此頁自動（2 分鐘冷卻）或手動呼叫 `/functions/v1/sync-asana-pitching`，只寫入暫存表
- **匯入** → 開啟 Pitching 表單（Asana 預設值）→ `insert quotation_client_project`
- **Pitching / Project** → 只顯示已建立的 `quotation_client_project`，不再觸發 Asana 同步
- **跟進記錄** → 呼叫 `/functions/v1/asana-task-stories`；下載附件再呼叫 `/functions/v1/asana-attachment-download`
- **新增 Pitching** → 手動寫入（可填 Asana 連結，不會自動建立 Asana Task）

`backfill_main_pm` 仍是一次性修補現有 QCP 的 `main_pm_id`，不是匯入流程的一部分。

## 安全提醒

- 切勿將 PAT、Client Secret 提交到 Git  
- 若憑證曾在聊天或郵件中暴露，請在 Asana 後台**立即撤銷並重新建立**
