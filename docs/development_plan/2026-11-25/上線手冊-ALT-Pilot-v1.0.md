# 上線手冊｜ALT Pilot（生產環境）

| 項目 | 內容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-11-25 |
| 對象 | 有 Supabase production 權限的工程師 |
| 前置 | 已完成程式碼審查、staging 驗證、備份 |
| 狀態 | **未執行**；本文件是操作步驟，不代表已上線 |

> 本手冊只處理 ALT Pilot 的 migration、Edge Function 與前端。**不要**在未確認 pending migrations 前直接 `db push`。

---

## 0. 上線前 10 分鐘檢查

```powershell
cd D:\Project\MPS
node scripts/run-alt-pilot-test.ts
node scripts/run-alt-pilot-contract-test.ts
node scripts/alt-sql-audit.mjs
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

| 檢查 | 通過標準 |
|---|---|
| 單元測試 | `alt pilot tests passed` |
| 契約測試 | `alt pilot contract tests passed` |
| SQL audit | `ALT Pilot SQL audit passed`，0 destructive statement |
| pending list | 只包含你已審批的 migration；若有其他 `content-*`／`seo-radar` pending，先協調 |
| dry-run | 逐條看過，沒有 `drop table`／`delete`／`truncate`／`alter column type` |

---

## 1. 備份

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
npx supabase db dump --linked --schema public -f "backups\pre-alt-pilot-$(Get-Date -Format yyyyMMdd-HHmm).sql"
```

確認檔案非空。若 Supabase 方案有 PITR，記下目前時間點。

---

## 2. Staging 先套用

1. 對 staging 專案執行同一支 migration。
2. 跑 §4 的 smoke SQL 與權限測試。
3. 用 1 個真實頁跑 analyze → generate 6 張 → 批准 1 張 → 匯出 CSV。
4. 確認 `alt_llm_usage` 有 6 筆、`alt_settings` 只有 1 列。
5. staging 通過才進 production。

---

## 3. Production 套用

```powershell
npx supabase db push --linked
```

推完立刻刷新 PostgREST schema cache：

```sql
notify pgrst, 'reload schema';
```

> 若你是用 Dashboard SQL Editor 手動貼 SQL，而不是 `db push`，CLI 不會記錄 migration 版本；下次 `db push` 可能再跑一次。本檔大致可重跑（`IF NOT EXISTS`／`ON CONFLICT`），但仍建議用 CLI，或手動補 `supabase_migrations.schema_migrations` 記錄。

---

## 4. 推送後 smoke test

```sql
select to_regclass('public.alt_runs'),
       to_regclass('public.alt_suggestions'),
       to_regclass('public.alt_llm_usage'),
       to_regclass('public.alt_settings');

select count(*) from public.alt_settings;  -- 必須 = 1
select count(*) from public.alt_llm_usage; -- 初始 0
```

權限：

| 測試 | 預期 |
|---|---|
| anon key `GET /rest/v1/alt_runs` | 被拒（401／42501／空） |
| authenticated `GET /rest/v1/alt_runs` | 200 |
| authenticated `PATCH /rest/v1/alt_suggestions?id=eq...` | 200（批准／編輯） |
| authenticated `DELETE /rest/v1/alt_runs?id=eq...` | 被拒（無 DELETE grant／policy） |
| service_role `DELETE` | 可（只在維護腳本使用） |

Edge Function：

```powershell
npx supabase functions deploy alt-pilot
# XAI_API_KEY 系統已有（Grok 主）
# OPENCODE_GO_API_KEY 是 DeepSeek V4.1 Flash 1017 備援
# GEMINI_API_KEY 只作最後備援，可選
npx supabase secrets set XAI_API_KEY=...
npx supabase secrets set OPENCODE_GO_API_KEY=...
```

- `supabase/config.toml` 已設 `[functions.alt-pilot] verify_jwt = false`，函式自行驗 session。
- `alt_settings.model` 預設 `grok-4.7`，所以會先用系統現有的 XAI key；Grok 失敗先轉 DeepSeek V4.1 Flash 1017（若已設 `OPENCODE_GO_API_KEY`），最後才 Gemini。
- `alt_settings.fallback_model` 正式站已設 `deepseek-v4.1-flash`。
- 若三個 key 都沒設，function 會回 `provider_not_configured`。
- `ALT_ALLOWED_HOSTS` 選填，用於未登記在 `webandsystem_list` 的網域。
- `ALT_ALLOW_ANON` 保持 false。

---

## 4.1 Production E2E smoke（需要登入 token）

腳本：`scripts/alt-pilot-production-smoke.mjs`

```powershell
$env:SUPABASE_URL="https://kwcevjcmdjadhrygjyfp.supabase.co"
$env:SUPABASE_ANON_KEY="<anon key>"
$env:ALT_USER_JWT="<登入後的 access token>"
$env:ALT_TEST_URL="https://www.bwteam.com/office-design"

# 只 analyze，不呼叫 LLM
node scripts/alt-pilot-production-smoke.mjs

# 測 1 張 Grok（會寫 1 筆 suggestion）
$env:ALT_GENERATE="1"
node scripts/alt-pilot-production-smoke.mjs
```

- token 不要寫入 repo、不要貼在對話。
- 執行前先把 `alt_settings.enabled=true`；測完立即關閉。
- 腳本不列印 token；只印 run_id、page、suggestion、usage。

## 4.2 歷史紀錄與刪除

- 歷史紀錄改為浮層；點擊可重看該次分析。
- 只有管理人員（`users.role_tag` = `management`／`super_admin`／`system_dev` 等）看到刪除按鈕。
- 刪除經 Edge Function `delete_run`，由 service_role 執行；前端 authenticated 仍然沒有直接 DELETE 權限。
- 刪除 `alt_runs` 會 cascade 刪除 `alt_suggestions`；`alt_llm_usage` 保留，`run_id` 設 NULL。

## 5. 前端部署

```powershell
# CI 不要設 VITE_ALT_PILOT_DEMO
npx vite build
```

- 正常 build **不包含** `/alt-pilot-demo`；可用 `Select-String dist/assets/index-*.js -Pattern 'alt-pilot-demo'` 確認（應無結果）。
- 部署後開 `/#tools-center/alt-pilot`，應顯示「ALT Pilot 目前已停用」（`alt_settings.enabled=false`）。
- 先用 function 對 1 個頁面跑 analyze，確認 Grok 正常；再把開關打開（目前不設每日上限）：

```sql
update public.alt_settings
set enabled = true,
    daily_call_limit = 0
where id = 'default';
```

（`daily_call_limit = 0` 代表不限。這是唯一建議的人工 UPDATE，帶主鍵 WHERE，只動新表。關閉用 `enabled=false`，不要用 limit=0 當關閉。）

---

## 6. 監控

| 指標 | 位置 | 警戒 |
|---|---|---|
| 今日呼叫數 | `select count(*) from alt_llm_usage where created_at >= ...` | 接近 `daily_call_limit` |
| 失敗率 | `alt_suggestions.status='failed'` | >10% |
| provider 錯誤 | Edge Function logs | 429／5xx 連續 |
| 抓頁失敗 | function logs `fetch_forbidden`／`fetch_timeout` | 單站連續失敗 |
| 成本 | `sum(cost_usd)` | 超過每日預算 |

---

## 7. 回滾

| 級別 | 動作 | 影響 |
|---|---|---|
| L1 隱藏入口 | 移除 `AppContext` 的 `alt-pilot` 子項，重新部署前端 | 功能不可見，資料保留 |
| L2 停用生成 | `update alt_settings set enabled=false, daily_call_limit=0 where id='default';` | 只能看歷史 |
| L3 回退 function | 重新部署上一版 `alt-pilot` | 不影響 DB |
| L4 移除新表 | **先匯出**，再手動 drop（見下） | 只影響 ALT 資料 |

```sql
-- 手動、先備份／匯出；不要放進自動 migration
drop table if exists public.alt_suggestions;
drop table if exists public.alt_llm_usage;
drop table if exists public.alt_runs;
drop table if exists public.alt_settings;
drop function if exists public.alt_touch_updated_at();
```

> 既有表從未被修改，所以 L4 不需要「還原舊資料」；它只是把 ALT Pilot 新增的物件移除。

---

## 8. 常見問題

**推完仍見「尚未啟用」**

1. 確認 `VITE_SUPABASE_URL` 的 project ref 與你 push 的 project 一致。
2. 執行 `select to_regclass('public.alt_settings');`；NULL 代表推錯庫。
3. 執行 `notify pgrst, 'reload schema';`。
4. 重新登入／重新整理。

**function 回 401**

- SPA 的 access token 是 ES256；`verify_jwt=false` 必須生效，函式自行 `getUser`。
- 確認部署的是最新 `config.toml`。

**function 回 `provider_not_configured`**

- 確認 `XAI_API_KEY` 已存在（Grok 主）；只設一個也可以，另一邊會失敗後 fallback。

**圖片全部 `image_unsupported`**

- 目標 CDN 回 AVIF／SVG；本期只收 jpeg／png／webp。先確認 `curl -I` 的 content-type。
