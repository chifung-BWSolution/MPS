# 內容自動化 · 故障排查（M5-05）

> 先看「症狀 → 檢查 → 處理」，再看「預防」。指令一律在 `D:\Project\MPS` 執行。

## 1. 頁面顯示「功能尚未啟用」

**症狀**：插件顯示「功能尚未啟用（42P01）」。
**檢查**：

```powershell
node scripts/content-remote-audit.mjs   # 看 content_* 物件與 migration 版本
```

**處理**：migration 未推 → `node scripts/content-apply-migrations.mjs`（只套內容 migration）或 `npm run db:push`（先確認沒有其他 pending）。
**預防**：部署順序固定為「函式 → migration → cron」。

## 2. API 401／403

**症狀**：所有操作回 401，或寫入回 403「目前角色沒有 write 權限」。
**檢查**：

- 瀏覽器 DevTools → Network → `content-*` → Response 的 `code`。
- SQL：`select role_tag from public.users where auth_user_id = '<你的 auth id>';`
- `select has_function_privilege('authenticated','public.content_claim_jobs(text,integer)','execute');` 應為 false（claim 只給 service_role）。

**處理**：role_tag 不在 `users` 或不認識 → 由管理層補 `role_tag`（copywriter／marketing／chief_editor／management）；JWT 過期 → 重新登入。
**預防**：角色只加值、不改既有 8 種行為；後端每次 action 重算權限。

## 3. Grok 生成失敗／退回模板

**症狀**：新稿標「模板草稿」，或 console 出現 `Grok 生成失敗`。
**檢查**（service role）：

```powershell
# 看模型清單與 key 是否有效
curl -X POST "https://kwcevjcmdjadhrygjyfp.supabase.co/functions/v1/content-social?action=llm_check" `
  -H "Authorization: Bearer <service_role>" -H "Content-Type: application/json" `
  -d '{"mode":"ping"}'

# 實測生成
curl -X POST ".../content-social?action=llm_check" -H "..." -d '{"mode":"generate","model":"grok-4.3","timeout_ms":60000}'
```

**處理**：

- 401／403 → `XAI_API_KEY` 失效或額度用盡；到 xAI 後台確認。
- timeout → 維持 `CONTENT_SOCIAL_MODEL=grok-4.3`（4.5 是推理型，實測會超時）。
- bad_json → 模型換 `grok-4.3` 重試；仍失敗會自動退回模板，不影響流程。
  **預防**：LLM 模式下 `auto_tick` 每輪只處理 1 個熱點 + 95 秒預算。

## 4. 熱點沒有自動抓取

**症狀**：熱點雷達沒有新內容。
**檢查**：

```sql
select name, enabled, last_fetched_at, consecutive_empty, last_error
from public.content_sources order by name;

select jobname, status, start_time
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname = 'content-sources-hourly' order by start_time desc limit 5;
```

**處理**：

- `last_error` 有值 → 來源網站擋機器人或 RSS 失效；停用該來源或換 URL。
- cron 沒跑 → 確認函式已部署、`cron.job` 有 `content-sources-hourly`；必要時手動觸發：
  `select cron.schedule('content-sources-hourly-manual','* * * * *', command) from cron.job where jobname='content-sources-hourly';`（測完刪除）。
- 抓到了但沒有稿件 → 看 `content-social-tick` 與 Grok（每 2 分鐘 1 個熱點）。

**預防**：來源 `fetch_interval_minutes` 不要小於 30；連續失敗 3 次會在健康告警出現。

## 5. cron 沒有執行／一直失敗

**檢查**：

```sql
select jobname, schedule, active from cron.job where jobname like 'content-%';
select jobname, status, return_message, start_time
from cron.job_run_details where jobname like 'content-%' order by start_time desc limit 20;
```

**處理**：

- 沒有 job → 重跑 cron migration（`20261126110000`、`20261126120000`、`20261126140000`）。
- `401` → cron command 的 service_role bearer 被換掉；刪除該 job 讓 migration 重建（或依 docs/content-cron-setup.md 手動建）。
- `404` → 函式未部署；先部署再建 cron。

## 6. 日報沒有寄出

**檢查**：`select digest_date, status, error, sent_at from public.content_email_digests order by digest_date desc limit 5;`
**處理**：`RESEND_API_KEY`／`RESEND_FROM_EMAIL` 未設 → 補 secrets；收件人為空 → 設定頁補；寄送失敗 → 重寄。
**預防**：`digest_enabled` 只在你確認收件人後開啟。

## 7. migration 漂移（不要直接 db push）

**症狀**：`db push` 想推幾十支不相關 migration。
**檢查**：`node scripts/content-remote-audit.mjs` 看「待推送」清單。
**處理**：只用 `content-apply-migrations.mjs` 推內容相關的檔案；其他漂移另開工作線。
**預防**：每次推送前跑 `content-sql-audit.mjs` 與 remote-audit。

## 8. 常見資料問題

| 症狀 | 檢查 | 處理 |
|---|---|---|
| 熱點標題變 `????` | `select title from content_hot_events where title ~ '\?'` | 用 UTF-8 重新輸入；不要用 PowerShell `Invoke-RestMethod` 送中文 JSON |
| 同一熱點重複出現 | `select dedupe_key, count(*) from content_hot_events group by 1 having count(*)>1` | 若 unique index 未建，重跑 `20261126140000` |
| 內容包下載 403 | Storage bucket 是否 private、簽名 URL 是否過期 | 重新按「下載內容包」取得新 URL（1 小時） |
| 文章 slug 衝突 | 同站 UNIQUE(site_id, slug) | 系統會補後綴；不要手動覆蓋既有文章 |

## 9. 需要人工介入的訊號

- `content_jobs.status='dead'`
- `content_social_posts.status='held'` 超過 1 天
- `content_site_credentials.status='invalid'`
- `content_sources.consecutive_empty >= 3`
- 日報連續 2 天 `failed`

以上都會出現在「今日工作」的營運告警橫幅與日報的「待處理」區塊。

## 10. 熱點重複／聚簇

**症狀**：雷達或看板出現同一個事件的多個標題。

**機制**：抓取時先比 URL；不同媒體的同一事件再用標題相似度找候選，強的（≥0.75）直接合併，弱的（0.32–0.75）讓 Grok 判斷，同一事件只留一個 `content_hot_events`，其餘報導掛在 `content_hot_items`。

**檢查**：

```sql
select id, title, item_ids, heat from content_hot_events
where status <> 'ignored' order by created_at desc limit 20;

select count(*) from content_hot_items where event_id is null; -- 舊資料可能沒有 event 對應
```

**處理**：

- 冪等回填（分批，每次最多 4 次模型判斷，Edge 150 秒上限）：
  `POST content-sources?action=dedupe_backfill` body `{"max_checks":4}`（service_role），重複呼叫直到 `merged=0`。
- 指定兩則合併：`POST content-sources?action=merge_events` body `{"keep_id":"…","drop_id":"…"}`（會把 drop 的稿件移到 keep、寫入 item、把 drop 標 ignored）。
- 單獨驗證模型判斷：`POST content-sources?action=judge_check` body `{"titleA":"…","titleB":"…"}`。

**注意**：聚簇是保守的——模型說不同就不合併；寧可多一篇，也不要誤併不同品牌／活動。
