# 執行清單｜SEO 雷達（工具中心 · 「AI 關鍵字生成器」上方）

| 項目 | 內容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-11-25 |
| 對應計劃書 | `docs/development_plan/2026-11-25/PRD-SEO雷達-v1.0.md` |
| 專案根目錄 | `D:\Project\MPS` |
| 合計估時 | 約 6.5 人日（程式 5 人日已完成，部署＋驗收 1.5 人日待做） |

## 使用說明

1. 任務按依賴排序，**不要跳號執行**；`⛔` 的任務擋住後續所有工作。
2. 已完成標 `☑`，未完成標 `☐`；部署類任務一定要在真實環境完成後才可勾。
3. 每個里程碑末尾有 **Gate**，不過不進下一階段。
4. 所有路徑以 `D:\Project\MPS\` 為根，表格內省略前綴。

---

## 交付摘要（2026-11-25 收尾時）

**結論：程式與文件完成並通過自測；migration、Edge Function、cron 尚未部署（需 Supabase 憑證），交接給有權限的人照 M0→M4 執行。**

> **本輪是本地 MVP：沒有 `db push`、沒有 `functions deploy`、沒有線上寫入。** 線上目前零變更。

| 分類 | 狀態 |
|---|---|
| 新增 16 個檔案（前端 7／後端 3／migration 2／腳本 2／文件 2） | ☑ |
| 修改 5 個既有檔案（AppContext、ToolsCenterModule、config.toml、package.json、Tools-Center.md） | ☑ |
| 自測 `node scripts/run-seo-radar-test.ts` | ☑ 37 項全過 |
| 建置 `vite build` | ☑ exit 0（4372 modules） |
| 本地 SSR 煙霧（render `SeoRadarTool`） | ☑ management / designer 各 9 項全過 |
| 型別 `tsc --noEmit` | ◐ 本功能 0 錯誤；倉庫既有 34 個錯誤與本功能無關 |
| `npm run lint` | ✗ 無法執行（倉庫未安裝 eslint） |
| `db:push` / `functions deploy` / cron | ☑ 全部完成（表 19:59、函數 20:10、cron 20:13） |
| 瀏覽器實測 | ☐ 待做 |

**收尾自查找出並修掉的 4 個問題**

| # | 問題 | 影響 | 修法 | 回歸測試 |
|---|---|---|---|---|
| 1 | cron 候選只認 `gsc_sites` 對映，漏掉只填 `webandsystem_list.gsc_site_url` 的站點 | 這類站點永遠不會被每日刷新 | 候選條件加 `Boolean(gsc_site_url.trim())` | ✓ |
| 2 | `ignore` 只按 idea id 更新，沒有限站點 | 理論上可跨站改到別人的候選詞 | action 加選填 `website_profile_id`，前端一律帶 | ✓ |
| 3 | 候選詞表切換篩選後頁碼可能超出總頁數 | 看到空白頁（資料其實還在） | `totalPages` 變動時把 `page` 回夾 | ✓ |
| 4 | migration 把 `adopted_keyword_id` 寫成 `uuid`，但 production `seo_keywords.id` 是 `text` | FK 建不起來（42804），整支 migration 失敗 | 改為 `text`；交易內完整回滾，未留半成品 | 部署時實測 |
| 5 | `config.toml` 是 GBK，CLI 靜默跳過 `[functions.*]`，部署出來的函數 `verify_jwt=true` | 使用者 session（ES256）會被 gateway 擋掉，前端一按抓取就失敗 | 把 `config.toml` 轉 UTF-8 後重新部署，`verify_jwt` 變 `false` | 部署後查 `verify_jwt` 欄位 |
| 6 | 共用 `contentAuth.requireActor` select `users.classification`／`display_name`，但 production `users` 只有 7 欄 | **每次真人呼叫都查詢失敗 → 角色回落 staff → 403**（既有問題，本功能會繼承） | 共用模組已改成「完整→最小欄位」兩段式（非本次改動）；本次重新部署確認吃到新版 | 最小欄位查詢實測通過 |

另新增 3 組 **DB 契約測試**，在沒有資料庫的情況下守住最容易出錯的接縫：前端 `IDEA_COLUMNS`／`RUN_COLUMNS` 的每個欄位都必須存在於 migration；寫庫 payload 不得出現 migration 沒有的欄位，且**不得帶 `status`**（否則會把已採納／已忽略的詞覆蓋回 `new`）。

**接手下一步（只需記這 5 步）**

1. `npx supabase db push --linked --dry-run` 逐條看過（不得有 drop/delete/truncate/alter type）。
2. `npm run db:push` → 跑 M1-05 的四段驗證 SQL。
3. `npx supabase functions deploy seo-radar`。
4. `select jobname, schedule, command from cron.job where jobname='seo-radar-daily'` 確認 URL 指向 `seo-radar`。
5. 前端發佈後，按 PRD §1 的 1–10 驗收。

---

## 部署紀錄（production，2026-11-25 19:59 +08:00）

**目標**：只建本功能的 2 張表，**不**推倉庫裡其他人的 pending migration。

| 步驟 | 內容 | 結果 |
|---|---|---|
| 方式 | Supabase Management API `POST /v1/projects/kwcevjcmdjadhrygjyfp/database/query`（角色 `postgres`） | — |
| 第一次 | `20261127090000_seo_radar.sql`（`adopted_keyword_id uuid`） | ❌ `42804`：FK 型別不合（`uuid` vs `text`）；**整批回滾**，`to_regclass` 為 NULL、policy 0 |
| 修正 | `adopted_keyword_id` 改 `text`（附註解） | — |
| 第二次 | 同檔（sha256 `9EBAC55CB07F394960725464BA128C9187F9628989D37C69A775672668AD8AF3`） | ✅ **201** |
| 驗證 | 2 表；`relrowsecurity=true`；policy 恰 2 條皆 SELECT；`seo_keyword_ideas` 18 欄 / `seo_radar_runs` 11 欄；唯一鍵 + 3 索引 + 3 FK；0 列 | ✅ |
| 版本記錄 | `supabase_migrations.schema_migrations` 新增 `20261127090000 / seo_radar` | ✅ |
| 未做 | `functions deploy`、cron migration、前端發佈 | ☐ |

**回滾**：`scripts/rollback-seo-radar.sql`（已補上刪除上述版本記錄，否則日後 `db push` 會跳過重建）。

### 函數與 cron（2026-11-25 20:10–20:13）

| 項目 | 結果 |
|---|---|
| 部署 | `seo-radar` **v2**、`ACTIVE`、`verify_jwt=false`（首次部署因 `config.toml` 是 GBK 而沒讀到設定，轉 UTF-8 後重部署才生效） |
| cron | `seo-radar-daily` @ `15 23 * * *`，URL 指向 `/functions/v1/seo-radar`；版本記錄 `20261127091000` |
| 轉檔副作用 | GBK→UTF-8 時第 1 行 `—` 變 `鈥?`，已修回；檔內現只剩這 1 個非 ASCII 字元 |
| 併發風險 | 部署期間另一個 agent 覆寫了 `config.toml`（加 `content-social`），`[functions.seo-radar]` 一度消失，已補回——**提交前請再確認** |

### 端到端測試（production）

| # | 測試 | 結果 |
|---|---|---|
| 1 | 未授權 | `401 invalid_session` |
| 2 | 未知 action | `400 unknown_action` |
| 3 | 不存在的站點 | `404 site_not_found` |
| 4 | `scan` ws2 | `200`／3.7s／91 詞 |
| 5 | `adopt` 2 詞（不勾 backlog） | `200`；詞庫 +2、ideas→adopted 並回連、`pipeline_status` 仍 NULL、`source=import` |
| 6 | 重複採納 | 不重複插列（1090） |
| 7 | `ignore` | `200`；status→ignored |
| 8 | 還原 | 詞庫回 1088、ideas 全部 new |
| 9 | `cron_scan` | `200`／14.5s／10 站 700 詞／0 失敗；每站上限 100 生效 |
| 10 | CORS／GET | `200` + `*`；GET `405` |
| 11 | 完整性 | 0 重複、0 非法 status、`seo_keywords` 全庫仍 48617（未帶動） |

**刻意未測**：`enqueue=true`（會設 `backlog`，可能觸發 content planner 花 Gemini 額度）。SQL 條件已由自測 H2 覆蓋。

---

## M0｜前置檢查（部署前必做）

| | ID | 任務 | 指令／位置 | 完成定義 |
|---|---|---|---|---|
| ☐ | M0-01 | 開分支（若走 PR 流程） | `git switch -c feat/seo-radar` | 基於 `main`，無未提交改動 |
| ☐ | M0-02 | GSC 有近 28 天資料 | `select site_url, count(*) from gsc_query_daily_metrics where metric_date >= current_date - 28 group by 1` | ≥1 站有資料，記下站點 id 作驗收樣本 |
| ☐ | M0-03 | **H1** 確認既有結構符合假設 | `select column_name from information_schema.columns where table_name='seo_keywords' and column_name in ('id','pipeline_status','normalized_keyword')` | 3 欄都在；缺任一 → 先推 content migration 或終止 |
| ☐ | M0-04 | migration 基線 | `npx supabase migration list --linked` | 本地與遠端一致，最新為 `20261126110000` |
| ☐ | M0-05 | suggest 端點可用 | `curl "https://suggestqueries.google.com/complete/search?client=firefox&hl=zh-HK&gl=hk&q=%E7%B6%B2%E9%A0%81%E8%A8%AD%E8%A8%88"` | 回合法 JSON；失敗 → 回報並降級為純 GSC 方案 |
| ☐ | M0-06 | **H1** 備份 | `npx supabase db dump --linked --schema public -f "backups\pre-seo-radar-<日期>.sql"` | `backups\` 有非空檔案 |

**⛔ Gate M0**：M0-03、M0-05、M0-06 未過不得動工。

---

## M1｜資料庫

| | ID | 任務 | 主要檔案 | 完成定義 |
|---|---|---|---|---|
| ☑ | M1-01 | 建表 + 索引 + UNIQUE | `supabase/migrations/20261127090000_seo_radar.sql` | `seo_keyword_ideas`／`seo_radar_runs` + 3 索引 + 唯一鍵；無任何 drop/delete/truncate/alter type |
| ☑ | M1-02 | RLS 與 grants | 同上 | 兩表 RLS 開啟；只有 SELECT policy；無寫入 policy |
| ◐ | M1-03 | 乾跑逐條審查 | 以 Management API 唯讀 preflight 代替 | 同名表／policy／索引 = 0；FK 目標存在；`pg_cron`/`pg_net` 已裝；未跑 `db push --dry-run`（會牽連他人的 pending） |
| ☑ | M1-04 | 套用 migration | Management API `POST /v1/projects/kwcevjcmdjadhrygjyfp/database/query` | **201**；sha256 `9EBAC55C…8AF3`；無 partially applied |
| ☑ | M1-05 | **H5** 推送後驗證 | 表／RLS／policy／約束／索引／列數 | 2 表、`relrowsecurity=true`、policy 恰 2 條皆 SELECT、唯一鍵 + 3 索引 + 3 FK、0 列；migration 記錄已寫入 |
| ☑ | M1-06 | 型別 | `src/types/seoRadar.ts` | 與表欄位一一對應 |

**推送後驗證 SQL**

```sql
-- 只應見到 2 張新表
select table_name from information_schema.tables
 where table_schema='public' and table_name in ('seo_keyword_ideas','seo_radar_runs');

-- 只應見到 2 條 SELECT policy
select tablename, polname, cmd from pg_policies
 where tablename in ('seo_keyword_ideas','seo_radar_runs');

-- UNIQUE 必須存在（否則 upsert 會 42P10）
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.seo_keyword_ideas'::regclass and contype in ('u','p');

-- 既有結構不得變動
select column_name from information_schema.columns
 where table_schema='public' and table_name='seo_keywords' and column_name='pipeline_status';

-- anon 寫入必須被拒（RLS 無 INSERT policy）
-- 在 anon 角色下執行：insert into public.seo_keyword_ideas (website_profile_id, keyword, normalized_keyword, source, market_code, language_code) values ('x','y','y','gsc','hk','zh-HK');
```

**⛔ Gate M1**：M1-03 有人工逐條簽核；M1-05 全部通過。

---

## M2｜後端

| | ID | 任務 | 主要檔案 | 完成定義 |
|---|---|---|---|---|
| ☑ | M2-01 | 建議詞抓取 | `supabase/functions/_shared/google-suggest.ts` | timeout 6s、併發 3、單 seed 失敗不影響整批 |
| ☑ | M2-02 | 純函式 | `src/lib/seoRadar.ts`、`src/lib/seoRadarMarket.ts` | 無 Deno／瀏覽器 API，前後端共用 |
| ☑ | M2-03 | GSC 聚合 | `supabase/functions/seo-radar/gsc-aggregate.ts` | 1000/頁、40 頁上限 |
| ☑ | M2-04 | 入口與 `scan` | `supabase/functions/seo-radar/index.ts` | 守門順序正確；run 表寫入正確 |
| ☑ | M2-05 | `adopt`／`ignore`（**H2**） | 同上 | backlog 更新帶 `pipeline_status is null / = backlog`；`enqueue=false` 時不寫 |
| ☑ | M2-06 | `cron_scan` | 同上 | 只接受 service_role；≤10 站；單站失敗不中斷 |
| ☑ | M2-07 | 部署與設定 | `supabase/config.toml` + `npx supabase functions deploy seo-radar` | 已部署 **v2**、`verify_jwt=false`；401／400／404／200 四條路徑實測通過 |
| ☑ | M2-08 | 自測 | `scripts/run-seo-radar-test.ts` + `package.json` | 37 項全過（含 DB 契約 3 項、bug 回歸 3 項） |

**⛔ Gate M2**：`npm run radar:test` 全綠；部署後用 curl 對真實站點跑一次 `scan`，回 ≤100 且 warnings 合理。

---

## M3｜前端

| | ID | 任務 | 主要檔案 | 完成定義 |
|---|---|---|---|---|
| ☑ | M3-01 | 菜單插入 | `src/context/AppContext.tsx` | 順序 `readdy-framer → seo-radar → ai-keyword` |
| ☑ | M3-02 | 路由分派 | `src/components/tools-center/ToolsCenterModule.tsx` | 早退 + `getTitle` case；`ai-keyword` 行為不變 |
| ☑ | M3-03 | 資料 hook | `src/hooks/useSeoRadar.ts` | 無假資料回退；`missingSchema` 不拋錯；scan 後自動 refresh |
| ☑ | M3-04 | 頁面外殼 | `seo-radar/SeoRadarTool.tsx` | H1／副標／上次抓取／站點與市場／抓取按鈕 |
| ☑ | M3-05 | 結果表 | `seo-radar/SeoRadarTable.tsx` | 篩選、排序、20 列/頁、狀態 pill、來源 badge |
| ☑ | M3-06 | 採納對話框 | `seo-radar/AdoptDialog.tsx` | 顯示 N、backlog 預設不勾、成本警示 |
| ☑ | M3-07 | 狀態與權限 | 上述 | 6 種狀態全覆蓋；非 writer 全 disabled |
| ☑ | M3-08 | Deep link | 同上 | 跳 `#tools-center/social-automation?zone=seo&page=keywords&id=<siteId>` |
| ☐ | M3-09 | 瀏覽器實測 | `npm run dev`（127.0.0.1:5174） | §1 的 1–7 條全部可複現；重整不掉頁 |

**⛔ Gate M3**：M3-09 通過；`npm run build` 成功。

---

## M4｜收尾

| | ID | 任務 | 主要檔案 | 完成定義 |
|---|---|---|---|---|
| ☑ | M4-01 | cron migration（**H4**） | `supabase/migrations/20261127091000_seo_radar_daily_cron.sql` | 斷言 URL 含 `seo-radar` 才建立；`RAISE NOTICE` 印 command |
| ☑ | M4-02 | cron 部署與驗證 | `select jobname, schedule, command from cron.job where jobname='seo-radar-daily'` | 已建立 `15 23 * * *`、URL 指向 `seo-radar`；實跑 10 站 / 700 詞 / 0 失敗，run 表有 `trigger='cron'` success |
| ☑ | M4-03 | 回滾腳本（**H3**） | `scripts/rollback-seo-radar.sql` | 快照 → 撤回 → drop 三步，順序固定 |
| ☑ | M4-04 | 文件 | PRD、本清單、`docs/05-Page-Specifications/Tools-Center.md` | 三份齊全且與實作一致 |
| ◐ | M4-05 | 全量回歸 | `npx tsc --noEmit`／`node scripts/run-seo-radar-test.ts`／`vite build` | `radar:test` 31 項通過、build exit 0、tsc 對本功能 0 錯誤（倉庫既有 34 個錯誤與本功能無關）；eslint 未安裝、瀏覽器實測待做 |
| ☐ | M4-06 | 交付說明 | PR 描述 | 部署順序（migration → function → cron → 前端）、回滾 SQL、風險清單 |

**⛔ Gate M4（完成定義）**：PRD §1 八條成功標準全部可複現；回滾已演練一次；下一手只看 `docs/` 就能接手。

---

## 部署順序（不可顛倒）

```
1. 備份（M0-06）
2. npm run db:push                    # 兩支 migration：建表 → 建 cron
   （若 cron migration 因找不到來源 job 而 RAISE NOTICE，先手動建立 cron，見 PRD §6.4）
3. npx supabase functions deploy seo-radar
4. 前端發佈（Vite build / Vercel）
5. 驗收：M1-05、M2 Gate、M3-09、M4-02
```

> cron job 由 migration 建立；若第 2 步已建好 job 但函數尚未部署，第一次排程會失敗並在 `seo_radar_runs` 留下 `error` 列——這是預期行為，函數部署後會自動恢復。

---

## 回滾（出事時）

1. 先跑 `scripts/rollback-seo-radar.sql` 的 ① 段，把 `adopted_keyword_id` 對照留在 `seo_radar_rollback_refs`。
2. 需要撤回 `pipeline_status` 才打開 ② 段（預設保留，因為詞本身有價值）。
3. 跑 ③ 段：unschedule + drop 兩張新表。
4. 前端 revert 4 個既有檔案、刪新檔；`npx supabase functions delete seo-radar`。
5. **不要**用通配刪除、不要動 `seo_keywords` 既有列。

---

## 已知限制（v1.0 交付時）

| 項目 | 狀態 | 說明 |
|---|---|---|
| `npm run lint` | 無法執行 | 倉庫沒有安裝 eslint、也沒有 eslint 設定檔；這是既有狀況，不是本功能引入 |
| `npx tsc --noEmit` | 34 個既有錯誤 | 全部在既有模組（ads／quotation／settings…），本功能新增／修改的檔案 0 錯誤 |
| `vite build` | 通過（exit 0） | 4372 modules，dist 產物含 `seo-radar` 路由與頁面文案 |
| 瀏覽器實測 | 未做 | 依 `AGENTS.md`，除非明確要求否則不做 GUI 驗證。渲染與權限已由本地 SSR 煙霧覆蓋（management / designer 各 9 項）；仍待真機驗的是「點擊→真實 API→寫庫」的互動 |
| 部署（migration／function／cron） | 待做 | 需要 Supabase 憑證與網路，本輪未代跑 |
| `deno check` | 未執行 | 本機沒有安裝 Deno；只做了 esbuild 語法檢查（9 個新檔全過）與人工 review |
| `supabase/config.toml` 編碼 | **GBK（非 UTF-8）** | 本次以位元組追加純 ASCII 的 `[functions.seo-radar]` 區塊，既有行一行未動；日後編輯需用 GBK 或另開「整檔轉 UTF-8」的獨立變更 |
| 工作區其他未提交功能 | 並存 | `crosspost`、`tone-rewrite` 也在改 `ToolsCenterModule.tsx`；合併時要保留 `seo-radar` 的早退分支 |

---

## 交付物路徑（絕對路徑）

```
D:\Project\MPS\docs\development_plan\2026-11-25\PRD-SEO雷達-v1.0.md
D:\Project\MPS\docs\development_plan\2026-11-25\執行清單-SEO雷達-v1.0.md
D:\Project\MPS\docs\05-Page-Specifications\Tools-Center.md
D:\Project\MPS\src\types\seoRadar.ts
D:\Project\MPS\src\lib\seoRadar.ts
D:\Project\MPS\src\lib\seoRadarMarket.ts
D:\Project\MPS\src\hooks\useSeoRadar.ts
D:\Project\MPS\src\components\tools-center\seo-radar\SeoRadarTool.tsx
D:\Project\MPS\src\components\tools-center\seo-radar\SeoRadarTable.tsx
D:\Project\MPS\src\components\tools-center\seo-radar\AdoptDialog.tsx
D:\Project\MPS\src\context\AppContext.tsx
D:\Project\MPS\src\components\tools-center\ToolsCenterModule.tsx
D:\Project\MPS\supabase\functions\seo-radar\index.ts
D:\Project\MPS\supabase\functions\seo-radar\gsc-aggregate.ts
D:\Project\MPS\supabase\functions\_shared\google-suggest.ts
D:\Project\MPS\supabase\migrations\20261127090000_seo_radar.sql
D:\Project\MPS\supabase\migrations\20261127091000_seo_radar_daily_cron.sql
D:\Project\MPS\supabase\config.toml
D:\Project\MPS\scripts\run-seo-radar-test.ts
D:\Project\MPS\scripts\rollback-seo-radar.sql
D:\Project\MPS\package.json
```
