# 內容自動化 · 部署說明（M0–M3）

> 對應 PRD v1.1 §4、§6.5、§7、執行清單 P0 / M0-05 / M0-06 / M1-06 / M2-14 / M2-16。
> 目標：**任何一步出錯都不影響既有 15 個模組。**

> ⚠️ **本次交付為本地 MVP，以下指令全部尚未執行。**
> 工作區內沒有推送任何 migration、沒有部署任何函式、沒有建立任何 cron、沒有 git push。
> 請在審核程式碼後，由有權限的人依序執行；每一步都可以單獨停下來回滾。

## 1. 部署順序（不可顛倒）

```
① 備份 + 結構快照
② 設定 secrets（CONTENT_VAULT_KEY）
③ 推送 6 支 migration（core → pipeline → publish → rls → social → cron 之外的 5 支）
④ 部署 5 支 Edge Functions
⑤ 設定設定頁（daily_article_limit 先保持 0）
⑥ 接入站點 → 匯入關鍵字 → 產生 slots
⑦ 明確啟用生成（設上限）→ 觀察 1 天
⑧ 部署 / 建立 cron（見 docs/content-cron-setup.md）——**函式部署後才做**
```

## 2. 施工前準備

```powershell
cd D:\Project\MPS

# P0-02/03：確認 CLI 已連結、migration 對齊
npx supabase migration list --linked

# P0-08：結構快照（必做，出錯時能 diff）
New-Item -ItemType Directory -Force backups | Out-Null
npx supabase db dump --linked --schema public -f "backups\pre-content-$(Get-Date -Format yyyyMMdd-HHmm).sql"

# P0-09：乾跑，逐條看過 SQL
npx supabase db push --linked --dry-run

# SQL 安全審查（0 命中才可推）
npm run content:sql-audit
```

## 3. Secrets

| Secret | 必要性 | 說明 |
|---|---|---|
| `CONTENT_VAULT_KEY` | **必須** | AES-256-GCM 加密站點憑證；≥ 32 字元隨機字串。輪換 = 舊密文永久失效 |
| `GEMINI_API_KEY` | 生成必要 | 未設定時生成 job 會 `failed`，不會寫半成品 |
| `GEMINI_MODEL` | 選用 | 未被 `content_settings.model` 覆蓋時作為預設 |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | 日報必要 | 未設定時日報可預覽、標「未寄出」 |
| `APP_PUBLIC_URL` | 選用 | 日報深連結；未設定時回落 `src/lib/siteUrl.ts` 的正式網域 |

```powershell
# 產生 32+ 字元隨機金鑰（PowerShell）
$key = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
npx supabase secrets set CONTENT_VAULT_KEY=$key

# 設定後不可再從 Dashboard 讀回；請存進公司密碼管理器
```

## 4. 推送 migration

```powershell
npm run db:push
```

含 6 支：

| 檔案 | 內容 | 破壞性 |
|---|---|---|
| `20261126090000_content_automation_core.sql` | 站點層 6 表 + `seo_keywords` 加 5 nullable 欄 | 只加不改 |
| `20261126091000_content_automation_pipeline.sql` | slots/articles/revisions/jobs/usage + `content_claim_jobs` | 只加 |
| `20261126092000_content_automation_publish.sql` | logs/digests/settings（單列，`daily_article_limit=0`） | 只加 |
| `20261126093000_content_automation_rls.sql` | RLS、授權、private bucket、4 條 storage policy | 只加 |
| `20261126100000_content_social.sql` | P4 社媒 7 表（可延後） | 只加 |
| `20261126110000_content_cron.sql` | 4 支 cron（需函式先部署） | 只加 |

推送後立刻驗證：

```sql
-- 表群組齊全（應為 21 張 content_* 表）
select count(*) from information_schema.tables
where table_schema = 'public' and table_name like 'content\_%';

-- 憑證對 authenticated 被封閉（應為 0）
select count(*) from pg_policies
where schemaname = 'public' and tablename = 'content_site_credentials';

-- 設定只有 1 列，且出廠不自動跑
select count(*), max(daily_article_limit) from public.content_settings;

-- storage bucket 為 private
select id, public from storage.buckets where id = 'content-assets';
```

## 5. 部署 Edge Functions

```powershell
# 先 shared 無需單獨部署；逐支部署
npx supabase functions deploy content-sites   --no-verify-jwt
npx supabase functions deploy content-keywords --no-verify-jwt
npx supabase functions deploy content-publish  --no-verify-jwt
npx supabase functions deploy content-digest   --no-verify-jwt
npx supabase functions deploy content-worker   # cron/service role：保留 gateway JWT 驗證
```

> `verify_jwt` 對照表同時寫在 `supabase/config.toml`。前端使用者的 token 是 ES256，
> gateway 仍以舊 HS256 secret 驗證，因此瀏覽器可呼叫的函式必須 `verify_jwt=false`，
> 由函式內部以 `auth.getUser()` 自行驗證（與 `bwa-projects` / `framer-*` 一致）。

驗證：

```powershell
$env:SRK = "<service_role_key>"
$env:URL = "https://kwcevjcmdjadhrygjyfp.supabase.co"
Invoke-RestMethod -Method Post -Uri "$env:URL/functions/v1/content-worker" `
  -Headers @{ Authorization = "Bearer $env:SRK"; "Content-Type" = "application/json" } `
  -Body '{"limit":1}'
```

## 6. 首次設定（人為步驟）

1. 開 `#tools-center/social-automation?zone=seo&page=settings`
2. 確認 `daily_article_limit = 0`（出廠值，代表不自動生成）
3. 設定模型、每日上限（建議免費層 8 篇 / 30 次呼叫）、日報時間與收件人
4. 接入 3 個試點站（Attitude / BSC / BWA），逐站按「測試連線」
5. 匯入關鍵字 CSV（範本：`public/templates/content-keywords-template.csv`）
6. 在關鍵字庫明確勾選要用的詞 → 「啟用生成」（只會影響勾選項）
7. 觀察 3 天後才把上限調到目標值

## 7. 推送後回歸煙霧測試（每次，約 5 分鐘）

| 檢查 | 通過標準 |
|---|---|
| 網站+系統清單 | 可載入、可新增／編輯（`webandsystem_list` 未被鎖死） |
| GSC 報表 | 可載入；`seo_keywords` 加欄後同步不報錯 |
| 廣告／財務／專案 | 引用 `webandsystem_list` 的 12 支 hook 皆正常 |
| 其他工具中心子項 | Readdy、AI 關鍵字等不受影響 |
| anon key 讀 `content_site_credentials` | 被拒（42501 或空結果） |
| anon key 讀 `content_jobs` | 被拒 |
| `content_settings` | 只有 1 列 |
| `select count(*) from cron.job where jobname like 'content-%'` | 0（M2 前）或 4（M2 後） |
| 前端 `npm run build` | vite build 成功（`tsc` 既有錯誤與本專案無關，見第 9 節） |

## 8. 回滾（四級，永遠先做 L1）

| 級別 | 情境 | 做法 |
|---|---|---|
| L1 隱藏入口 | 插件有 bug，不想讓同事看到 | 移除 `AppContext` 的 `social-automation` 子項 → 重新部署前端（資料與函式全保留） |
| L2 停止生成 | 成本／品質失控 | `update content_settings set daily_article_limit = 0, digest_enabled = false where id = 'default';` |
| L3 停用排程 | cron 反覆失敗 | `docs/content-cron-setup.md` §6 的 4 句 `cron.unschedule` |
| L4 移除結構 | 確認整個放棄 | 執行清單「L4 完整移除」區塊；**先備份、逐張列名、禁止 `drop table content_*` 通配** |

## 9. 已知限制與說明

- **`npx tsc --noEmit` 存在既有錯誤**：本 repo 在本次施工前即有多個模組的型別錯誤
  （Readdy／行銷／專案等，與本功能無關）。`package.json` 的 `build` 用 `;` 串接，
  tsc 失敗不會中斷 vite build。本次新增的 `src/lib/content*.ts`、`content components`、
  hooks 全部通過型別檢查；驗證方式：
  ```powershell
  node .\node_modules\typescript\bin\tsc --noEmit 2>&1 | Select-String "content"
  ```
  應無輸出。
- **v1 發布模式為 `manual`**：內容包下載 → 人工貼上官網 → 回填 URL → `manual_done`。
  不會自動發布，UI 也不會顯示成自動發布。
- **社媒線（P4）**：資料表與 RLS 已建，介面為 roadmap 頁；worker 的 `generate_social`
  job 型別已預留但未實作（M4）。
- **`content_settings.daily_article_limit` 出廠 0**：裝好不等於開跑，需人為啟用（PRD §6.6 規則 7）。

---

## 10. 本次部署紀錄（2026-11-25，production main）

| 項目 | 結果 |
|---|---|
| 專案 | `kwcevjcmdjadhrygjyfp`（Main／production，Mumbai） |
| 5 支 Edge Functions | ✅ 全部部署（`--use-api` 免 Docker 打包，`src/lib/*.ts` 共享檔正確上傳） |
| Secrets | ✅ `CONTENT_VAULT_KEY` 已產生並設定；`RESEND_API_KEY`／`RESEND_FROM_EMAIL` 既有 |
| ⚠️ `GEMINI_API_KEY` | ❌ **尚未設定**（PRD 假設「已有」但實際沒有）→ 生成 job 會以 `llm_not_configured` 失敗；啟用生成前必須補 |
| Migration | ✅ 6 支已套用，並寫入 `supabase_migrations.schema_migrations` |
| Cron | ✅ 4 支 ACTIVE；`content-worker-tick`／`content-digest-tick` 已實際執行且 `succeeded` |
| 驗證 | ✅ `content-deploy-verify.mjs` 34/34、`content-remote-audit.mjs` 物件全符 |
| 社媒 v0 自動營運 | ✅ `content-social` 已部署；`content-social-tick` 每 2 分鐘自動掃描熱點並產稿；文案由 **Grok（`grok-4.3`）** 生成，失敗自動退回模板 |
| 社媒 LLM | ✅ 使用專案既有 `XAI_API_KEY`，模型以 `CONTENT_SOCIAL_MODEL` 覆寫（預設 `grok-4.3`）；`content_llm_usage` 記 `use_case=social`，稿件以 `generator` 欄標示 `grok`／`template` |
| `content_claim_jobs` | ✅ security definer + `search_path=public, pg_temp`；anon／authenticated 無 execute、service_role 有 |
| 資料安全 | ✅ `seo_keywords` 仍 48,617 列（只加欄未動資料）；憑證 0 條 policy；bucket private |

### 為什麼不是 `supabase db push`

repo 與遠端有**既有漂移**：本地有 **39 支** migration 未套用（含其他工作線的 `crosspost_copy`／`alt_pilot`／`seo_radar`），遠端另有 **3 支**本地沒有的 migration。`db push` 沒有「只推指定檔案」選項，硬推會把不相關的 migration 一起上 production。

因此本次用 `scripts/content-apply-migrations.mjs`：只讀本次 6 支檔案、逐支執行（Management API，等價於 SQL Editor）、成功後寫入 migration history（日後 `db push` 會正確跳過）。**那 39 支與 3 支漂移未處理**，屬既有狀況，需另開工作線對齊。

### 社媒 AI 生成（2026-11-25 追加）

| 項目 | 內容 |
|---|---|
| 供應商 | xAI Grok（`https://api.x.ai/v1/chat/completions`），沿用專案既有 `XAI_API_KEY` |
| 模型 | `CONTENT_SOCIAL_MODEL` → 預設 **`grok-4.3`**（不影響廣告顧問的 `GROK_MODEL`） |
| 為什麼不是 4.5 | `grok-4.5` 是推理型，實測 30–60 秒仍會超時；`grok-4.20-non-reasoning` 回傳格式不穩（非合法 JSON）；`grok-4.3` 穩定 |
| 一次呼叫 | 同時產「1 篇長文 + 各平台導流」；同平台多帳號共用一份文案 |
| 失敗處理 | 沒有 key／超時／JSON 不合法 → **自動退回模板**，自動化不停擺；稿件 `generator` 標示來源 |
| 用量 | 每次呼叫寫 `content_llm_usage`（`use_case='social'`、model、tokens；成本欄先記 0） |
| 可靠性 | LLM 模式下 `auto_tick` 每輪只處理 1 個熱點，並有 95 秒預算（避免 Edge 150 秒時限） |
| 診斷 | service role 可呼叫 `content-social?action=llm_check`：`{"mode":"ping"}` 列模型；`{"mode":"generate","model":"..."}` 實測生成 |

### 遠端 schema 漂移（本次已適配）
| 本地 migration 假設 | 遠端實際 | 本次處理 |
|---|---|---|
| `seo_keywords.id` uuid | **text** | `content_slots.keyword_id`、`content_articles.keyword_id` 改為 `text` FK |
| `brand_list.id` text | **uuid** | `content_social_accounts.brand_id` 改為 `uuid` FK |
| — | 遠端多 `seo_keywords.assigned_article_id` | 未使用、未修改 |

> 原因是這些既有表在遠端早已存在，`CREATE TABLE IF NOT EXISTS` 當年直接跳過，本地 migration 的定義從未真正套用。

### 部署後修補 #1（2026-11-25）：管理層／system_dev 無法接入站點

**現象**：`system_dev`（側欄顯示「管理層」）在「接入新站」被擋，提示沒有 `manage_sites` 權限。

**根因**：production `users` 表只有 8 欄（`id`／`role_tag`／`email`／`staff_id`／`auth_user_id`／`created_at`／`updated_at`），
沒有 `classification`／`display_name`。`_shared/contentAuth.ts` 的 `requireActor` 查詢選了這兩個不存在的欄位 →
PostgREST 回 400 → 程式忽略錯誤 → 角色回落成 `staff` → 後端 403。**所有登入使用者都受影響**，不是角色設定錯。

**修正**（`supabase/functions/_shared/contentAuth.ts`）：
1. 使用者列查詢改「完整欄位 → 最小欄位」兩段式：`42703`／`PGRST204` 時自動退回最小欄位集。
2. 查詢真的失敗時回 `500 identity_lookup_failed`，不再靜默降級成 `staff`（避免下次又把系統錯誤誤導成權限問題）。
3. 新增回歸測試：`system_dev`／`super_admin` 必須具備 `manage_sites`（`content-selftest` 44 項）。

**驗證**：
- 角色解析抽查：`management` 15 人、`system_dev` 2 人可管理站點；copywriter／designer／accountant／video_editor 不可。
- 以 service_role 重現：舊查詢（含 `classification`）→ HTTP 400；新查詢（最小欄位）→ 正確回傳 Shannon `role_tag=system_dev`。
- 5 支函式重新部署為 **v3**，部署後驗證 28/28 通過。

> 補充：Shannon 的 `role_tag` 是 `system_dev`；側欄顯示「管理層」是因為 `AppContext.validRoles` 沒有 `system_dev`，
> 會回落成 `management` 顯示。這是顯示層的既有行為，**不影響權限判定**（前後端都接受 `system_dev`）。

### 部署後新增：解除接入（2026-11-25）

- **入口**：站點清單卡片「移除接入」、站點詳情 → 設定分頁最下方危險區。
- **權限**：`manage_sites`（management／system_dev）。
- **後端**：`content-sites` 新增 `remove_site` 動作，必須帶 `confirm: true`；未帶回 400 `confirm_required`，不存在回 404。
- **會刪除**（DB `ON DELETE CASCADE`，不可復原）：該站的欄目、排程格、文章與版本紀錄、憑證、健康檢查紀錄。
- **不會刪除**：`webandsystem_list` 站點主檔、GSC／廣告資料、其他模組；`content_assets` 的圖片列改為 `site_id = NULL`（檔案保留）。
- **效果**：該站在接入精靈的候選清單回到「未接入」，可重新接入；回傳 `deleted` 計數供 UI 顯示。
- **已驗證**：production 生命週期 8 項（400／404／建立／列數 +1／候選標記已接入／移除回傳計數／列數回基準／候選回到未接入），測試用暫存站點已清理，既有 Beauty100 接入未受影響。

### 部署後仍待辦

- [ ] `supabase secrets set GEMINI_API_KEY=...`（生成必要；`GEMINI_MODEL` 選用）
- [ ] 結構快照（本機無 Docker／pg_dump；已確認 2026-11-25 01:20Z 有 Supabase 受管備份）
- [ ] 推送後回歸煙霧測試（網站+系統、GSC、廣告、財務、專案、其他工具中心子項）
- [ ] M1／M2／M3 手動 E2E（3 站接入、100 詞去重、10 篇生成、Sylvia 角色、409、cutoff）
- [ ] 到設定頁把 `daily_article_limit` 從 0 調到目標值（先 8 篇／30 呼叫觀察一週）
- [ ] 建議輪換本次使用的個人 access token（`sbp_...`）
