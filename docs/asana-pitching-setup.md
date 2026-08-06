# Asana Pitching 同步設定

Pitching 頁面透過 Supabase Edge Function `sync-asana-pitching` 從 Asana 專案拉取 Task，寫入 `pitching_records` 表。

## 必要憑證（Supabase Secrets）

在 **Supabase Dashboard → Project Settings → Edge Functions → Secrets** 設定：

| Secret | 說明 |
|---|---|
| `ASANA_ACCESS_TOKEN` | Asana **Personal Access Token**（非 Client Secret） |
| `ASANA_WORKSPACE_GID` | Workspace GID，預設 `6649488167653` |

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
# 或在 SQL Editor 執行 supabase/migrations/20260806140000_pitching_asana_warehouse.sql

# 2. 部署 Edge Function
supabase functions deploy sync-asana-pitching --no-verify-jwt

# 3. 設定 Secrets（示例）
supabase secrets set ASANA_ACCESS_TOKEN=your_pat_here
supabase secrets set ASANA_WORKSPACE_GID=6649488167653
```

## 同步的 Asana 專案

Migration 已預設 seed 以下 project GID（可在 `asana_pitching_projects` 表調整）：

- `1209549009281325` — BWT Active 1 開始緊密跟進中  
- `1201898424971757` — BWL Active 1 準備報價單  
- 其他 BWT / BWL Active 專案  

點擊 Pitching 頁面 **「同步 Asana」** 會一併嘗試 discover 名稱含 Active / 報價 的專案。

## 欄位對應

| Asana | pitching_records |
|---|---|
| Task name | display_name |
| created_at / due_on | inquiry_date |
| assignee.name | assigned_pm_name |
| notes | description |
| permalink_url | asana_link |
| gid | asana_task_gid |
| Section / Project 名稱 | status、project_types |

## 前端使用

- 列表資料來自 Supabase `pitching_records`  
- **同步 Asana** → 呼叫 `/functions/v1/sync-asana-pitching`  
- **新增 Pitching** → 手動寫入 Supabase（可填 Asana 連結，不會自動建立 Asana Task）

## 安全提醒

- 切勿將 PAT、Client Secret 提交到 Git  
- 若憑證曾在聊天或郵件中暴露，請在 Asana 後台**立即撤銷並重新建立**
