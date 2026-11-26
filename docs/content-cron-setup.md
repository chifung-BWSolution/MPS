# 內容自動化 · pg_cron 設定（content-* 四支工作）

> 對應 PRD v1.1 §7.3、執行清單 M2-16。
> **強制順序：先部署函式，後建 cron。** 函式未部署就建 cron，等於每 2 分鐘製造一次失敗紀錄。

> ⚠️ **未執行**：本次是本地 MVP，四支 cron 都沒有在遠端建立，migration 也沒有推送。
> 本文件是交接步驟；請在函式部署並驗證後才照做。

## 1. 前置條件（全部打勾才往下）

- [ ] `content-worker` Edge Function 已部署且 `ACTIVE`
- [ ] `content-digest` Edge Function 已部署（`send_digest` job 會重用其邏輯）
- [ ] `CONTENT_VAULT_KEY` 已設定：`npx supabase secrets set CONTENT_VAULT_KEY=<32+ 字元隨機字串>`
- [ ] `GEMINI_API_KEY` 已設定（生成需要；未設定時生成 job 會失敗並保留）
- [ ] `RESEND_API_KEY` / `RESEND_FROM_EMAIL` 已設定（日報需要；未設定時日報仍可預覽）
- [ ] 用 service role 手動呼叫成功：

```powershell
$env:SRK = "<service_role_key>"
$env:URL = "https://kwcevjcmdjadhrygjyfp.supabase.co"

# 應回 { ok: true, data: { processed: 0, ... } }
Invoke-RestMethod -Method Post `
  -Uri "$env:URL/functions/v1/content-worker" `
  -Headers @{ Authorization = "Bearer $env:SRK"; "Content-Type" = "application/json" } `
  -Body '{"limit":1}'
```

## 2. 建立方式 A（推薦）：跑 migration

`supabase/migrations/20261126110000_content_cron.sql` 會：

1. 從**任一已存在的 functions HTTP cron** 複製 `net.http_post` 命令（含 service role bearer，永不入庫）
2. 用 `regexp_replace` 換成 content-worker 路徑
3. 以 `if not exists (select 1 from cron.job ...)` 包覆，可重複執行

執行：

```powershell
cd D:\Project\MPS
npx supabase db push --linked --dry-run   # 先看 SQL
npm run db:push
```

migration 會 `RAISE NOTICE` 告訴你哪幾支建立了、哪幾支因找不到 auth 模板而跳過。

## 3. 建立方式 B（手動，migration 找不到模板時）

於 Supabase Dashboard → SQL Editor 執行。**不要**把 service role key 提交到版本控制，
執行後立即把 `command` 欄位貼回本文件附錄（只貼 jobname/schedule，不貼 key）。

```sql
-- 從既有 cron 取 auth 模板，逐一複製並改路徑
with src as (
  select command
  from cron.job
  where command ilike '%net.http_post%'
    and command ilike '%/functions/v1/%'
  order by jobname
  limit 1
)
select
  'content-worker-tick' as jobname,
  '*/2 * * * *'         as schedule,
  regexp_replace(command, 'functions/v1/[^'']+', 'functions/v1/content-worker', 'g') as command
from src
union all
select
  'content-planner-daily',
  '10 16 * * *',
  regexp_replace(command, 'functions/v1/[^'']+', 'functions/v1/content-worker?enqueue=plan_slots', 'g')
from src
union all
select
  'content-digest-tick',
  '0 * * * *',
  regexp_replace(command, 'functions/v1/[^'']+', 'functions/v1/content-worker?enqueue=send_digest', 'g')
from src
union all
select
  'content-health-daily',
  '0 18 * * *',
  regexp_replace(command, 'functions/v1/[^'']+', 'functions/v1/content-worker?enqueue=site_health', 'g')
from src;
```

把上列 `jobname/schedule/command` 逐支以 `cron.schedule()` 建立：

```sql
select cron.schedule('content-worker-tick', '*/2 * * * *', $$<上列對應 command>$$);
select cron.schedule('content-planner-daily', '10 16 * * *', $$<...>$$);
select cron.schedule('content-digest-tick', '0 * * * *', $$<...>$$);
select cron.schedule('content-health-daily', '0 18 * * *', $$<...>$$);
```

> 若連既有 cron 都沒有，只剩手動 POST 一途，格式參考 repo 內 `docs/ga4-setup.md`；
> 這種情況請先在 PR 描述說明原因，並在下方附錄記錄完整 SQL 與執行日期。

## 4. 四支工作與時間

| 工作名 | 排程（UTC） | 當地時間（HKT） | 動作 |
|---|---|---|---|
| `content-worker-tick` | `*/2 * * * *` | 每 2 分鐘 | POST `content-worker`（limit 3），處理佇列 |
| `content-planner-daily` | `10 16 * * *` | 00:10 | `?enqueue=plan_slots`：為 active 站產生未來 30 天 slot |
| `content-digest-tick` | `0 * * * *` | 每小時整點 | `?enqueue=send_digest`：HKT 對上 `content_settings.digest_time` 才真的寄 |
| `content-health-daily` | `0 18 * * *` | 02:00 | `?enqueue=site_health`：站點健康 + 內鏈頁面刷新 |
| `content-social-tick` | `*/2 * * * *` | 每 2 分鐘 | POST `content-social?action=auto_tick`：推進到期社媒稿 + 自動把新熱點產成「1 長文 + 每帳號導流」 |
| `content-sources-hourly` | `15 * * * *` | 每小時 :15 | POST `content-sources?action=fetch_sources`：抓 RSS、去重評分、寫入新熱點 |

## 5. 建立後驗證（必做）

```sql
-- 1) 四支都在、schedule 正確
select jobname, schedule, active
from cron.job
where jobname like 'content-%'
order by jobname;

-- 2) 手動觸發一次（不必等排程）
select cron.schedule('content-worker-tick-manual', '* * * * *', command)
from cron.job where jobname = 'content-worker-tick';
-- 60 秒後刪掉臨時 job
select cron.unschedule('content-worker-tick-manual');

-- 3) 看執行結果，應為 succeeded
select jobname, status, return_message, start_time
from cron.job_run_details
where jobname like 'content-%'
order by start_time desc
limit 20;

-- 4) 確認沒有動到既有 job
select count(*) from cron.job where jobname like 'content-%';          -- 4
select count(*) from cron.job where jobname not like 'content-%';      -- 應與施工前相同
```

## 6. 停用與回滾（L3 級）

只停插件排程，不動任何既有 job：

```sql
select cron.unschedule('content-worker-tick');
select cron.unschedule('content-planner-daily');
select cron.unschedule('content-digest-tick');
select cron.unschedule('content-health-daily');
```

要停止生成但保留排程，改用 L2（不需要動 cron）：

```sql
update public.content_settings
set daily_article_limit = 0, digest_enabled = false
where id = 'default';
```

## 7. 疑難排查

| 現象 | 檢查 | 處理 |
|---|---|---|
| `cron.job_run_details` 一直失敗 | 函式是否存在、`verify_jwt` 設定、service role bearer 是否被換掉 | 先手動 POST 驗證；再重建該 job |
| 每 2 分鐘都有 401 | command 內的 bearer 不是 service_role | 刪掉該 job 重新由 migration 複製 |
| planner 沒產生 slot | `content_sites.status` 是否 active、cadence 是否合法 | 看 job `last_error`；用 `validateCadence` 檢查 |
| 日報沒寄 | `digest_enabled`、`digest_time`、`digest_recipients`、Resend 設定 | `content-digest` 的 `preview` 可先驗內容 |
| worker 卡住 | `content_jobs` 有 `running` 且 `locked_until < now()` | 下一次 tick 會自動回收為 `queued` |

## 附錄：本環境執行紀錄

| 日期 | 執行者 | 方式 | 結果 | 備註 |
|---|---|---|---|---|
| 2026-11-25 | Lead（本地 MVP → production main） | `20261126110000_content_cron.sql`（透過 `scripts/content-apply-migrations.mjs`，Management API） | ✅ 4 支 ACTIVE | 函式先部署（`--use-api`），再由 migration 建立；auth 從既有 functions HTTP cron 複製 |

實際建立結果（部署當日）：

```text
content-digest-tick   0 * * * *    active
content-health-daily  0 18 * * *   active
content-planner-daily 10 16 * * *  active
content-social-tick   */2 * * * *  active
content-worker-tick   */2 * * * *  active
```

首次執行驗證（`cron.job_run_details`，join `cron.job`）：

```text
content-worker-tick   succeeded  2026-11-25 11:00 UTC
content-digest-tick   succeeded  2026-11-25 11:00 UTC
content-social-tick   succeeded  2026-11-25 11:48 UTC（並在背景自動產出 8 批社媒稿）
```

> 提醒：本次 repo 仍有其他工作線的 33 支 pending migration（與 content 無關），
> 未來若要 `db push`，請先跑 `node scripts/content-remote-audit.mjs` 確認範圍。
