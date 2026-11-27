# PRD｜SEO 雷達（工具中心 · 「AI 關鍵字生成器」上方）

| 項目 | 內容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-11-25 |
| 專案根目錄 | `D:\Project\MPS` |
| 入口 | 工具中心 → SEO 雷達（`#tools-center/seo-radar`） |
| 對應執行清單 | `docs/development_plan/2026-11-25/執行清單-SEO雷達-v1.0.md` |
| 狀態 | 程式與文件完成；migration／函數／cron 待部署（見 §11） |

---

## 1. 背景與目標

**問題**：網站文案與自動 blog 需要「熱門關鍵詞」，但工具中心現有的「AI 關鍵字生成器」是假數據空殼（[ToolsModule.tsx](../../../src/components/tools/ToolsModule.tsx) 用 `setTimeout` 回傳硬編碼 10 個詞），既沒有真實資料也沒有存庫，接不上自動化。

**目標**：讓行銷／文案在不離開 MPS 的情況下，用**自家站點的真實 GSC 數據 + Google 搜尋建議**，一鍵得到 100 個值得寫的詞，勾選後寫入既有關鍵字庫，並可按需排入自動 blog。

**成功標準**

1. 側邊欄「SEO 雷達」在「Readdy → Framer 轉換」之後、「AI 關鍵字生成器」之前；`#tools-center/seo-radar` 可直達且重整不掉頁。
2. 已綁 GSC 的站點按「抓取」→ 90 秒內回 ≤100 詞；抽 3 詞與 `gsc_query_daily_metrics` 近 28 天 sum 對得上。
3. 採納 3 詞 → `seo_keywords` 加 3 列、ideas 變 `adopted` 並帶 `adopted_keyword_id`、`pipeline_status` 仍 NULL。
4. 勾「同時加入自動生成佇列」→ 對應列 `pipeline_status='backlog'`，planner 可取用。
5. 未綁 GSC 不報錯，降級為只有建議詞 + 黃色提示。
6. 表未建立 → 顯示「功能尚未啟用」，不白屏、不影響其他模組。
7. 非 writer 角色看不到可用按鈕；繞過前端直接打 API 回 403。
8. `tsc`／`lint`／`npm run radar:test` 全綠；cron 成功跑一次並留 run 紀錄。

---

## 2. 五輪需求對齊（決策記錄）

| 輪次 | 決策 | 落地方式 |
|---|---|---|
| 1 | 資料來源＝GSC 28 天 + Google 搜尋建議；成本＝零 | 重用 `gsc_query_daily_metrics`；suggest 為免費端點；不新增 secret |
| 2 | 名稱＝**SEO 雷達**；與舊 AI 生成器並存；位置＝其正上方 | `submenu id = seo-radar`；`ai-keyword` 一行未改 |
| 3 | 市場＝跟隨域名自動判定（可覆寫）；熱門＝28 天曝光＋點擊 | `detectMarket()` TLD 對映；`selectGscIdeas()` 曝光 desc → 點擊 desc |
| 4 | 落地＝新表 `seo_keyword_ideas`；接 blog＝採納時可勾 backlog（預設不勾）；時機＝手動 + 每日 cron | 2 張新表；`adopt` 在 Edge Function；pg_cron `seo-radar-daily` |
| 5 | 權限＝沿用 WRITER_ROLES；每次 100 詞；交付＝完整切片＋文件＋自測 | `requireAction(actor,'write')` + `can(user,'write')`；`RADAR_MAX_IDEAS = 100` |

---

## 3. 範圍與非目標

**做**：菜單/路由、頁面（選站、市場覆寫、抓取、結果表、採納/刪除、deep link）、2 張表、1 支 Edge Function（5 actions）、每日 cron、共用純函式與自測、回滾腳本、文件。

**不做**：Google Trends、付費關鍵詞 API、真實月搜尋量、難度真值、文章生成（沿用 content worker）、成效追蹤頁、舊 `ai-keyword` 改動、`seo_keywords` 結構與 CHECK 改動。

---

## 4. 資訊架構

```
工具中心
├── 社媒自動化營運
├── Readdy → Framer 轉換
├── SEO 雷達                 ← 本功能（#tools-center/seo-radar）
├── AI 關鍵字生成器           ← 舊入口，未改動
├── AI SEO標題生成器
├── AI 圖片說明生成
├── 語氣校對改寫器
├── Prompt 資料庫
└── ...
```

**既有檔案改動（僅 4 處）**

| 檔案 | 改動 |
|---|---|
| `src/context/AppContext.tsx` | `tools-center.subMenus` 插入 `{ id: 'seo-radar', label: 'SEO 雷達' }` |
| `src/components/tools-center/ToolsCenterModule.tsx` | import + 早退 `if (subModule === 'seo-radar') return <SeoRadarTool />`；`getTitle()` 加 case |
| `supabase/config.toml` | `[functions.seo-radar] verify_jwt = false`（自行驗 JWT，cron 才能呼叫） |
| `package.json` | `"radar:test": "node scripts/run-seo-radar-test.ts"` |

**新增檔案**

| 檔案 | 職責 |
|---|---|
| `src/types/seoRadar.ts` | 型別（idea / run / site / API 回應） |
| `src/lib/seoRadarMarket.ts` | `detectMarket()`、`MARKET_OPTIONS` |
| `src/lib/seoRadar.ts` | 純函式與常數（前後端共用） |
| `src/hooks/useSeoRadar.ts` | `useRadarSites()`、`useSeoRadar()` |
| `src/components/tools-center/seo-radar/SeoRadarTool.tsx` | 頁面外殼 |
| `src/components/tools-center/seo-radar/SeoRadarTable.tsx` | 結果表（排序／分頁） |
| `src/components/tools-center/seo-radar/AdoptDialog.tsx` | 採納確認 |
| `supabase/functions/seo-radar/index.ts` | 入口與 4 個 action |
| `supabase/functions/seo-radar/gsc-aggregate.ts` | 28 天 GSC 分頁讀取 |
| `supabase/functions/_shared/google-suggest.ts` | 搜尋建議抓取 |
| `supabase/migrations/20261127090000_seo_radar.sql` | 2 表 + 索引 + RLS |
| `supabase/migrations/20261127091000_seo_radar_daily_cron.sql` | `seo-radar-daily` |
| `scripts/run-seo-radar-test.ts` | 自測（31 項） |
| `scripts/rollback-seo-radar.sql` | 三步回滾 |

---

## 5. 資料模型

### 5.1 `public.seo_keyword_ideas`（候選詞池）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `website_profile_id` | text NOT NULL FK → `webandsystem_list(id)` ON DELETE CASCADE | 站點 |
| `keyword` / `normalized_keyword` | text NOT NULL | 顯示詞／正規化詞 |
| `source` | text NOT NULL CHECK ('gsc','suggest') | 真來源 |
| `market_code` | text NOT NULL CHECK ('hk','tw','sg','my','us') | 對應 `gl` |
| `language_code` | text NOT NULL | 對應 `hl` |
| `impressions` / `clicks` | integer NOT NULL DEFAULT 0 | 28 天合計 |
| `ctr` / `avg_position` | numeric | 曝光 0 時 NULL |
| `seed_keyword` | text | 建議詞的來源種子 |
| `score` | numeric NOT NULL DEFAULT 0 | 排序啟發值（**非搜尋量**） |
| `status` | text NOT NULL DEFAULT 'new' CHECK ('new','adopted','ignored') | |
| `adopted_keyword_id` | **text** FK → `seo_keywords(id)` ON DELETE SET NULL | 採納回連（production 的 `seo_keywords.id` 是 text，不是 uuid） |
| `run_id` | uuid FK → `seo_radar_runs(id)` ON DELETE SET NULL | 哪次抓取 |
| `first_seen_at` / `last_seen_at` | timestamptz NOT NULL DEFAULT now() | |
| UNIQUE | `(website_profile_id, market_code, normalized_keyword)` | upsert 目標 |

索引：`(website_profile_id, status)`、`(website_profile_id, score DESC)`、`(last_seen_at DESC)`。

### 5.2 `public.seo_radar_runs`

`id`／`trigger('manual'|'cron')`／`status('running'|'success'|'error')`／`sites_scanned`／`ideas_upserted`／`gsc_terms`／`suggest_terms`／`error_message`／`meta jsonb`／`started_at`／`finished_at`。

### 5.3 RLS

- 兩表 `ENABLE ROW LEVEL SECURITY`；**只有** `FOR SELECT TO anon, authenticated USING (true)`。
- 不建 INSERT／UPDATE／DELETE policy → 寫入只能經 service_role（Edge Function）。
- 不動任何既有表、policy、grant。

---

## 6. 後端

### 6.1 Actions

| action | 輸入 | 權限 | 回傳 |
|---|---|---|---|
| `scan` | `{ website_profile_id, market_override?, limit? }` | `write` | `{ run, gsc_terms, suggest_terms, inserted, updated, warnings[] }` |
| `scan_all` | 無 | `write` | `{ sites_scanned, sites_remaining, ideas_upserted, skipped[] }` — 手動全站，最多 60 站、100 秒預算 |
| `adopt` | `{ website_profile_id, idea_ids[], enqueue? }` | `write` | `{ adopted, skipped, enqueued, keyword_ids[] }` |
| `delete` | `{ website_profile_id, idea_ids[] }` | `write` | `{ deleted }` — 真刪除，只刪 `status='new'` |
| `ignore`（舊版相容） | `{ idea_ids[], website_profile_id? }` | `write` | `{ updated }` — 軟隱藏；新 UI 已不再使用 |
| `cron_scan` | `action` 省略 + service_role | service_role | `{ sites_scanned, ideas_upserted, skipped[] }` |
| `cron_status` | 無 | `write` | `{ enabled, schedule, jobname }`（經 RPC `seo_radar_daily_status`） |
| `set_daily` | `{ enabled: boolean }` | **`manage_settings`** | `{ enabled, schedule, jobname }`（經 RPC `seo_radar_set_daily` → `cron.alter_job`） |

`readAction`：service_role 且無 `action` → `cron_scan`；其餘 → 400。因此 cron migration 只需替換 URL。

### 6.2 scan 流程

1. 讀站點（`webandsystem_list`），不存在 → 404 `site_not_found`。
2. 市場：`market_override` 優先，否則 `detectMarket(domain_url)`。
3. GSC property：`gsc_sites.website_profile_id` ∪ `webandsystem_list.gsc_site_url`；沒有 → `gsc_not_linked`，仍做建議詞。
4. 讀 28 天 `gsc_query_daily_metrics`（1000/頁、依主鍵排序、最多 40 頁）。
5. GSC 名額：曝光 desc → 點擊 desc，取 `min(60, limit)`。
6. 建議詞：≤8 個種子（GSC 前 5 → 站名 → 品牌 → 其餘），併發 3、單請求 6s、整段預算 90s。
7. 合併去重後 upsert（**payload 不含 `status`**，既有 `adopted/ignored` 不會被覆蓋）。

### 6.3 adopt 流程

1. 讀 ideas（限同站點；`new` 與舊版 `ignored` 都可以採納，與表格可勾選範圍一致）。
2. `seo_keywords` upsert `ignoreDuplicates: true`：
   - `source`：gsc → `'gsc'`；suggest → `'import'`（不擴充既有 CHECK）。
   - `search_volume = impressions`、`current_ranking = avg_position`、`level='level_3'`、`status='monitoring'`。
3. 回查 `seo_keywords.id`，把 ideas 標 `adopted` 並寫 `adopted_keyword_id`。
4. `enqueue=true` 時以 SQL 條件更新（H2）：

```sql
update public.seo_keywords
   set pipeline_status = 'backlog', updated_at = now()
 where id = any($1::uuid[])
   and (pipeline_status is null or pipeline_status = 'backlog');
```

### 6.4 cron

`seo-radar-daily`，`15 23 * * *` UTC（在 `gsc-incremental-daily` 22:45 之後）。授權克隆自現有 functions HTTP cron；URL 替換失敗則不建立 job。`cron_scan` 候選＝`status in ('live','maintenance')` 且有 GSC 映射或 30 天內有 ideas，依「上次抓取最舊」排序，每次 ≤10 站。

### 6.5 錯誤碼

`site_not_found`(404)／`gsc_not_linked`(warning)／`suggest_unavailable`(warning)／`ideas_empty`(warning)／`forbidden`(403)／**`scan_in_progress`(409，已有全站抓取在跑)**／`schema_missing`(500, 42P01)／`internal_error`(500)。

---

## 7. 純函式與常數（`src/lib/seoRadar.ts`）

| 常數 | 值 |
|---|---|
| `RADAR_WINDOW_DAYS` | 28 |
| `RADAR_MAX_IDEAS` | 100 |
| `RADAR_GSC_BUDGET` | 60 |
| `RADAR_MAX_SEEDS` | 8 |
| `RADAR_SITE_LIMIT` | 10 |
| `RADAR_SCAN_BUDGET_MS` | 90 000 |
| `RADAR_SUGGEST_TIMEOUT_MS` | 6 000 |

| 函式 | 行為 |
|---|---|
| `normalizeKeywordPhrase` | NFKC → trim → 小寫 → 壓縮空白 |
| `isUsableKeywordPhrase` | 長度 2–80 且含字母或數字 |
| `aggregateGscRows` | 同詞合併、曝光加權平均排名、CTR |
| `selectGscIdeas` | 過濾 → 排序 → 截斷 → 轉 draft |
| `buildSuggestSeeds` | ≤8、去重、站名/品牌去尾 |
| `parseSuggestPayload` | firefox 與舊格式；容錯；非 JSON 拋 `SuggestFormatError` |
| `scoreGscIdea` | `impressions + clicks*5 + (pos≤10?25 : ≤20?10 : 0)` |
| `scoreSuggestIdea` | `seedImpressions*0.35 + 5` |
| `mergeScanResults` | GSC 優先、建議補位、去重、≤limit |
| `clampLimit` | 收斂到 10–300，預設 100 |

**口徑說明**：本期的「搜尋量」一律以 GSC 曝光替代（與 `aggregateGscMetricsToKeywordRows` 的 `search_volume = impressions` 一致），UI 欄名寫「曝光」，避免誤導。

---

## 8. 前端

### 8.1 頁面結構

```
SEO 雷達                        [全站抓取] [⏸ 每日自動抓取]   [上次抓取 2 小時前]
抓取真實熱門關鍵詞：GSC 28 天曝光＋Google 搜尋建議，勾選後一鍵採納進關鍵字庫。

站點 [BW Design Centre ● GSC 已連接]  市場 [自動（香港・繁中）]  [抓取熱門關鍵詞] [↻]

┌ 抓取詞 100 │ GSC 60 │ 建議詞 40 │ 已採納 12 ┐
[全部 100][GSC 60][建議詞 40][已採納 12]      [關鍵字庫↗][刪除][採納（3）]

☐ 關鍵字      來源    曝光   點擊  CTR   平均排名  分數  狀態
```

- 站點選擇器**直讀** `webandsystem_list`，並以 `gsc_sites` / `gsc_site_url` 顯示連接狀態；不經 `content_sites`（未配置的站點會消失），也不用 `useWebsiteProfiles`（空表會回退假資料）。
- 站點記在 `localStorage['mps.seo-radar.site']`。
- 表格：勾選（只允許 `status='new'`）、來源 badge、曝光／點擊／CTR／平均排名／分數、狀態 pill、**每欄表頭皆有排序箭頭（含「來源」，可把 GSC 與建議詞分開看）**、20 列/頁。
- 「關鍵字庫」→ `buildContentHash('seo','keywords', siteId)` = `#tools-center/social-automation?zone=seo&page=keywords&id=<siteId>`。

### 8.2 狀態

| 狀態 | 呈現 |
|---|---|
| `missingSchema` | 「功能尚未啟用」+ `db:push` 指引（不阻塞工具中心其他入口） |
| 未選站點 | 空狀態引導 |
| 未綁 GSC | 黃色提示，仍可抓建議詞 |
| 抓取中 | 按鈕 spinner「抓取中…」 |
| 結果為空 | 表格空狀態文案 |
| 權限不足 | 抓取／採納／刪除 disabled + tooltip |

### 8.3 權限

`can({ role: systemUser?.role ?? null }, 'write')`（與 `KeywordLibraryView` 一致）；後端 `requireAction(actor,'write')` 重算，不信任前端。

---

## 9. 安全與合規（DB 影響）

| 類別 | 內容 |
|---|---|
| 建 | 2 張新表、3 索引、2 條只讀 policy、2 組 GRANT、1 個 cron job |
| 改 | **DB 層 0** |
| 刪 | **0** |
| 前向遷移 DML | 0 筆 |
| 執行期會碰既有資料 | 只有 2 種：追加 `seo_keywords` 新列；對本次採納且為 NULL/backlog 的列寫 `pipeline_status` |

**高危操作對照**：前向遷移無 DROP／DELETE／TRUNCATE／ALTER TYPE／policy 變更／cron 修改；`drop table` 只出現在 `scripts/rollback-seo-radar.sql`（手動回滾，按「快照 → 撤回 → drop」順序）。

**舊資料相容**：新表從零開始，不存在回填；6 個 NOT NULL 無 DEFAULT 欄位全由函數提供；FK 依賴 `webandsystem_list(id)`（text PK）與 `seo_keywords(id)`（uuid PK）。唯一隱含假設是 `seo_keywords.pipeline_status` 已存在（由 content migration 加入），已在清單 M0-03 前置檢查。

---

## 10. 測試與驗收

### 自動

`node scripts/run-seo-radar-test.ts`（或 `npm run radar:test`）— **46 項**：市場判定、正規化、GSC 聚合與排序、種子分級與預篩（縮寫／中文／英文）、建議詞解析、評分、合併與上限、回看窗口、接線契約（菜單順序、早退分支、權限檢查、H2 條件、migration 無破壞性語句、cron 斷言）、DB 契約（前端 `IDEA_COLUMNS`／`RUN_COLUMNS` ↔ migration 欄位；寫庫 payload 不得有不存在欄位、不得帶 `status`）、刪除邊界與「來源」排序／標籤回歸。

### 手動驗收

見 §1 的 1–8，另加：

9. `designer` 帳號 → 按鈕 disabled；devtools 直接 POST → 403。
10. `select jobname, schedule from cron.job where jobname='seo-radar-daily'` 有列；觸發後 `seo_radar_runs` 有 `trigger='cron'` success 列。

---

## 11. 交付結論與現況

### 11.1 一句話結論

**資料表已於 production 建立並驗證通過（2026-11-25 19:59 +08:00）；Edge Function 與每日 cron 仍未部署。**
DB 層是純新增（2 張新表、0 筆 DML、0 個既有物件被改），可逆；唯一的執行期副作用是「使用者主動採納」時往 `seo_keywords` 追加列。

> **部署方式**：沒有用 `db push`（那會把倉庫裡其他人的 pending migration 一起推），改以 Supabase **Management API** 只套用本功能的 `20261127090000_seo_radar.sql`，並補寫 `supabase_migrations.schema_migrations` 一筆，避免日後 `db push` 重跑同一支。
> 前端頁面現在已能讀到空表（「功能尚未啟用」橫幅會消失）；按「抓取熱門關鍵詞」仍需先部署 `seo-radar` 函數。

### 11.2 交付物

**新增 16 個檔案**

| 類別 | 檔案 |
|---|---|
| 前端（7） | `src/types/seoRadar.ts`、`src/lib/seoRadar.ts`、`src/lib/seoRadarMarket.ts`、`src/hooks/useSeoRadar.ts`、`src/components/tools-center/seo-radar/SeoRadarTool.tsx`、`SeoRadarTable.tsx`、`AdoptDialog.tsx` |
| 後端（3） | `supabase/functions/seo-radar/index.ts`、`supabase/functions/seo-radar/gsc-aggregate.ts`、`supabase/functions/_shared/google-suggest.ts` |
| 資料庫（2） | `supabase/migrations/20261127090000_seo_radar.sql`、`20261127091000_seo_radar_daily_cron.sql` |
| 腳本（2） | `scripts/run-seo-radar-test.ts`、`scripts/rollback-seo-radar.sql` |
| 文件（2） | 本 PRD、`docs/development_plan/2026-11-25/執行清單-SEO雷達-v1.0.md` |

**修改 5 個既有檔案**

| 檔案 | 改動 |
|---|---|
| `src/context/AppContext.tsx` | 插入一行 `{ id: 'seo-radar', label: 'SEO 雷達' }` |
| `src/components/tools-center/ToolsCenterModule.tsx` | import + 3 行早退 + 1 行 `getTitle` case |
| `supabase/config.toml` | 追加 `[functions.seo-radar] verify_jwt = false` |
| `package.json` | 追加 `"radar:test"` script |
| `docs/05-Page-Specifications/Tools-Center.md` | sub-route 表加一行 + 新增「SEO 雷達」頁面規格一節 |

### 11.3 驗證證據（本機實跑）

| 檢查 | 指令 | 結果 |
|---|---|---|
| 自測 | `node scripts/run-seo-radar-test.ts` | **46 項全部通過**（含種子分級／預篩、刪除邊界、來源排序與標籤） |
| 建置 | `vite build` | **exit 0**，4372 modules，12s；bundle 已含 `seo-radar` 路由、頁面文案、`採納到關鍵字庫` |
| 型別 | `tsc --noEmit` | 本功能 **0 錯誤**；倉庫既有 **34** 個錯誤（ads／quotation／settings／hooks 等），與本功能無關 |
| 語法 | esbuild transform（9 個新檔） | 全部通過 |
| 頁面渲染（本機 SSR 煙霧） | 暫存 esbuild + `react-dom/server` 渲染 `SeoRadarTool`（跑完即刪，未入庫） | **management 與 designer 兩種角色各 9 項全過**；markup 13.8 KB；writer 無權限 tooltip、非 writer 出現「需要管理層…」；未誤判為「功能尚未啟用」 |
| 接線 | 自測內的檔案斷言 | 菜單 `readdy-framer → seo-radar → ai-keyword`；`ToolsCenterModule` 早退存在；migration 無破壞性語句 |
| 線上建表（production） | Management API `POST /v1/projects/kwcevjcmdjadhrygjyfp/database/query` | **201**；2 表、`relrowsecurity=true`、policy 恰 2 條（皆 SELECT）、唯一鍵 + 3 索引 + 3 FK、0 列；migration 記錄已寫入 |

### 11.4 未完成（環境限制，非設計缺陷）

| 項目 | 原因 | 誰來做 |
|---|---|---|
| ~~`npm run db:push`~~ → 改以 Management API 套用單支 | 避免一次推其他人的 pending migration | ☑ 已完成（2026-11-25 19:59） |
| `supabase functions deploy seo-radar` | 需 CLI 登入（已完成）＋網路 | 下一步（M2-07） |
| cron 部署與觸發驗證 | 依賴函數部署 | 下一步（M4-02） |
| 瀏覽器實測（§1 的 1–7） | 依 `AGENTS.md`，未經明確要求不做 GUI 驗證 | 部署後人工走一次（M3-09） |
| `npm run lint` | **倉庫根本沒有安裝 eslint，也沒有 eslint 設定檔**（既有狀況） | 不阻塞；如要補，需先決定引入 eslint 的範圍 |

### 11.5 交接步驟

**已完成（2026-11-25 19:59 +08:00）**

| 步驟 | 實際做法 | 結果 |
|---|---|---|
| ① 前置檢查 | Management API 唯讀查詢：同名表／policy／索引 = 0、FK 目標存在、`pg_cron`/`pg_net` 已裝 | 通過 |
| ② 套用建表 migration | `20261127090000_seo_radar.sql`（sha256 `9EBAC55C…8AF3`） | 201，2 表建立 |
| ③ 推送後驗證 | 表／RLS／policy／常見約束／索引／授權／列數 | 全部符合 |
| ④ 記錄版本 | `schema_migrations` 寫入 `20261127090000 / seo_radar` | 已寫入 |

**剩下（依序）**

```
⑤ 部署函數    npx supabase functions deploy seo-radar --project-ref kwcevjcmdjadhrygjyfp
⑥ 部署 cron   套用 20261127091000_seo_radar_daily_cron.sql（會克隆 gsc-incremental-daily 的授權）
              驗證：select jobname, schedule, command from cron.job where jobname='seo-radar-daily'
⑦ 前端發佈    依現有流程（Vercel）
⑧ 人工驗收    PRD §1 的 1–10（含 designer 角色 403、cron 觸發留紀錄）
```

### 11.6 部署紀錄與部署期修正

**第一次嘗試失敗（已完整回滾，無殘留）**

```
42804: foreign key constraint "seo_keyword_ideas_adopted_keyword_id_fkey" cannot be implemented
DETAIL: Key columns "adopted_keyword_id" and "id" are of incompatible types: uuid and text.
```

原因：repo 舊 migration 把 `seo_keywords.id` 寫成 `uuid PRIMARY KEY DEFAULT gen_random_uuid()`，但 **production 實際是 `text`**；我照檔案假設寫成 `uuid`，FK 型別不合。整個批次在單一交易內，失敗即回滾——已驗證當時 `to_regclass` 為 NULL、policy 數 0。

**修正**：`adopted_keyword_id` 改為 `text`（附註解說明原因），重跑成功。

**第二次嘗試成功**

| 項目 | 值 |
|---|---|
| 檔案 | `20261127090000_seo_radar.sql` |
| sha256 | `9EBAC55CB07F394960725464BA128C9187F9628989D37C69A775672668AD8AF3` |
| 執行方式 | Management API（角色 `postgres`） |
| 結果 | 201，`[]` |
| 驗證 | 2 表；`relrowsecurity=true`；policy 恰 2 條且皆 `SELECT`；`seo_keyword_ideas` 18 欄、`seo_radar_runs` 11 欄；唯一鍵 + 3 自訂索引 + 3 FK；0 列 |
| 版本記錄 | `supabase_migrations.schema_migrations` 新增 `20261127090000 / seo_radar` |

**另一個觀察（不是 bug）**：Supabase 的預設權限會給 `authenticated` 表級 INSERT/UPDATE/DELETE/TRUNCATE，即使我只 `GRANT SELECT`。因為 RLS 只建了 SELECT policy，實際寫入一律被拒；這與專案其他既有表（`seo_keywords` 等）的行為一致，故不改，但文件不可再寫成「只有 SELECT 權限」。

### 11.7 函數與 cron 部署（2026-11-25 20:13 +08:00）

| 項目 | 結果 |
|---|---|
| Edge Function | `seo-radar` **version 2**、status `ACTIVE`、`verify_jwt=false`；打包時一併上傳 `src/lib/*`、`_shared/*`（跨目錄 import 正常） |
| cron | `seo-radar-daily` @ `15 23 * * *`（UTC）；command URL 確認指向 `/functions/v1/seo-radar`；版本記錄 `20261127091000` 已寫入 |

**部署期間的 3 件事（都已處理）**

1. **`verify_jwt` 首次部署仍是 `true`**：`config.toml` 是 GBK，CLI 沒讀到 `[functions.seo-radar] verify_jwt = false`。→ 把 `config.toml` 轉成 UTF-8（TOML 規範本就要求 UTF-8）後重新部署，`verify_jwt` 才變 `false`。
2. **轉檔時我把一個字元弄壞了**：GBK 解碼把第 1 行的破折號 `—`（U+2014）變成 `鈥?`。已偵測並還原；轉檔後全檔只剩這 1 個非 ASCII 字元，已確認正確。
3. **併發覆寫**：部署期間另一個 agent 新增 `[functions.content-social]` 並覆寫 `config.toml`，我的 `[functions.seo-radar]` 區塊一度消失。已重新補回——**提交前請再確認一次這個區塊還在**。

**端到端測試（production，20:10–20:13）**

| # | 測試 | 結果 |
|---|---|---|
| 1 | 未授權（publishable key） | `401 invalid_session` |
| 2 | 未知 action | `400 unknown_action` |
| 3 | 不存在的站點 | `404 site_not_found` |
| 4 | `scan`（ws2） | `200`，3.7s，91 詞（GSC 60 + 建議 35，去重後 31） |
| 5 | `adopt` 2 詞（`enqueue=false`） | `200`；詞庫 +2、ideas 轉 `adopted` 並回連、`pipeline_status` 仍 **NULL**、`source=import` |
| 6 | 重複採納 | 不重複插列（仍 1090） |
| 7 | `delete` | `200`；刪 3 筆（91→88）、重複刪 0、跨站被擋、重掃後 3 個詞全部回來（8/8） |
| 8 | 資料還原 | 詞庫回到 **1088**、ideas 全部回到 `new` |
| 9 | `cron_scan`（service_role、無 action） | `200`，14.5s，**10 站 / 700 詞 / 0 失敗**；每站上限 100 生效（最高站剛好 100） |
| 10 | CORS preflight / GET | `200` + `Access-Control-Allow-Origin: *`；GET → `405 method_not_allowed` |
| 11 | 資料完整性 | 0 組重複、0 個非法 status、0 個 GSC 詞曝光為 0；`seo_keywords` 全庫仍 48617（未被帶動） |

**刻意未測**：`enqueue=true` 沒有在 production 跑——它會把 `pipeline_status` 設成 `backlog`，可能被 `content-planner-daily` 排進自動生成並消耗 Gemini 額度。該 SQL 條件已由自測（H2）覆蓋；建議第一次真人使用時再驗。

### 11.8 部署期發現的既有共用模組問題

`_shared/contentAuth.ts` 的 `requireActor()` 原本 select `users.classification` 與 `users.display_name`，但 **production 的 `users` 表只有 7 欄**（`id, role_tag, updated_at, created_at, email, staff_id, auth_user_id`）。這會讓**每一次真人呼叫**查詢失敗 → 角色回落成 `staff` → 一律 403。這是既有問題，不是本功能引入，但本功能會繼承。

- 現況：共用模組已被改成「完整欄位 → 最小欄位」兩段式查詢（`42703/PGRST204` 時自動退回），本次重新部署已吃到新版。
- 影響：其他 `content-*` 函數若仍跑舊版程式，真人呼叫時可能同樣 403；要不要一併重新部署由該功能負責人決定。
- 驗證：以最小欄位查詢 `users`（`id, role_tag, email, staff_id, auth_user_id`）實測成功。

**角色對照（production 實際分佈）**

| role_tag | 人數 | `requireActor` 映射 | 可否掃描 |
|---|---|---|---|
| `super_admin` | 8 | `management`（含 `admin` 字樣） | ✅ |
| `management` | 7 | `management` | ✅ |
| `copywriter` | 3 | `copywriter` | ✅ |
| `system_dev` | 2 | `system_dev` | ✅ |
| `video_editor` | 1 | `video_editor` | ❌ 403（設計如此） |
| `designer` | 1 | `designer` | ❌ 403 |
| `accountant` | 1 | `accountant` | ❌ 403 |

**重新部署後回歸**：函數 **v4**、`verify_jwt=false`；重掃 `ws2` → `inserted=0 / updated=91`（upsert 冪等，不會重複建列）。

### 11.9 2026-11-26 變更：「忽略」→「刪除」

| 層 | 改動 |
|---|---|
| UI | 「忽略」按鈕改為**「刪除」**（rose 樣式）；新增 `DeleteDialog` 二次確認；篩選 chip 與指標移除「已忽略」 |
| Edge Function | 新增 `action: 'delete'`：帶 `website_profile_id`、只刪 `status in ('new','ignored')`、以 service_role 執行；舊 `ignore` 保留給舊前端 |
| 為什麼排除 `adopted` | 已採納的詞是「這篇文章用過這個詞」的證據，不該被刪 |
| 部署 | 函數 **v5**、`verify_jwt=false` |
| 線上實測 | 8/8：刪 3 筆（91→88）、重複刪 `deleted=0`、跨站 `deleted=0`、重掃後 3 個詞全部回來（`inserted=7 updated=79`） |

> 刪除不可復原，但**下一次抓取會重新抓到**（只要該詞仍有 GSC 曝光或搜尋建議）。這也是為什麼刪除要二次確認：它不是「永久封鎖某個詞」。

### 11.9.1 補修（同日 11:30）：舊「已忽略」的詞勾不到、也刪不掉

| 項目 | 內容 |
|---|---|
| 症狀 | 之前用舊版 UI 按過「忽略」的詞，checkbox 灰掉、選不中，因此無法刪除 |
| 根因 | `SeoRadarTable` 的勾選條件一直是 `status === 'new'`；而 `delete` 後端也只收 `status='new'`。`ignored` 變成兩邊都不認的孤兒狀態 |
| 前端修正 | 抽出 `isSelectable()`：`new` 與 `ignored` 可勾，只有 `adopted` 不行（表頭「全選本頁」同步） |
| 後端修正 | `handleDelete` 改為 `.in("status", ["new", "ignored"])` |
| 資料清理 | production 共 5 個 `ignored`（全在 `ws58` Food Channels，都是「復仇者聯盟」系列），已用新的 delete 路徑刪除；現時 `ignored` 數量 = 0 |
| 部署 | 函數 **v6**、`verify_jwt=false` |
| 驗證 | 自測 **45 項**（新增「已忽略仍可勾選」斷言）；表格渲染 6/6（新詞可勾、已忽略可勾、已採納不可勾、全選可用） |
| 回歸 | 重掃 `ws58`：`inserted=9 updated=2`，**「復仇者聯盟」系列 0 個**（新版種子預篩已擋掉），14 個詞全為餐飲相關 |

**2026-11-26 追加：UI 用詞「種子」→「來源」**

表內建議詞下方的副標由 `種子：FCC` 改為 `來源：FCC`——使用者反映「種子」這個說法太模糊。技術文件與程式碼仍用 seed（`seed_keyword`、`buildSuggestSeeds`），只有介面文案改。注意：表格另有一欄「來源」顯示 `GSC／建議詞`，兩者語義不同（欄位＝資料類型；副標＝產生該詞的查詢來源）。

### 11.10 2026-11-26 追加：一鍵全站抓取與每日開關

| 項目 | 內容 |
|---|---|
| UI | 頁首右上兩個入口：`全站抓取`（一次性，**白底**、無圖示）、`▶／⏸ 每日自動抓取`（開關，**已開啟＝綠底＋⏸／已暫停＝白底＋▶**） |
| 二次確認 | 兩者都開 `ConfirmActionDialog`；文案刻意用非技術語言（不出現 GSC／cron／API／SQL），自測有斷言守住 |
| 權限 | 全站抓取＝`write`；每日開關＝`manage_settings`（只有管理層），前端 `canManageDaily` 與後端 `ADMIN_ONLY_ACTIONS` 一致 |
| 後端 | `scan_all`（最多 60 站、100 秒預算，回 `sites_remaining`）、`cron_status`、`set_daily` |
| DB | `20261127120000_seo_radar_controls.sql`：兩支 `SECURITY DEFINER` RPC，只授權 `service_role`；用 `cron.alter_job(active => …)` 切換，**不刪 job、不動其他 job** |
| 部署 | 函數 **v8**（`verify_jwt=false`）；migration 已套用並寫入 `schema_migrations` |
| 線上實測 | **8/8**：讀狀態 → 暫停（`cron.job.active=false`）→ 恢復（`true`）；`scan_all` **60 站 / 79 秒 / 3,159 詞 / 剩 9 站** |
| 前端驗證 | 頁首渲染 10/10（兩個入口、SVG 圖示、class 無 `border`、浮層預設不顯示）；`tsc` 0 錯誤、`vite build` exit 0 |

> 「全站」是**分批**的：一次最多 60 站（Edge Function 有牆鐘上限），其餘由每日自動抓取補上，回應裡的 `sites_remaining` 會告訴使用者還剩多少。站點總數目前 69。

### 11.11 競態與併發加固（2026-11-26 二次審查）

| 問題 | 為什麼是 bug | 修法 | 驗證 |
|---|---|---|---|
| 切站時舊請求後回來，把 A 站的詞寫進 B 站的畫面 | `refresh()` 只認呼叫當下的 siteId，慢的請求會「後蓋前」 | 加 `siteIdRef` + 遞增 `refreshSeq`，回應回來時比對站點與序號，過期就丟 | 自測斷言 + 不影響原有流程 |
| 兩個「全站抓取」可同時跑 | 重複打 Google 建議、浪費額度，且兩筆 run 交錯 | 後端先查 10 分鐘內 `meta.scope='all'` 的 running run，有就回 **409 `scan_in_progress`** | 線上 5/5：造假的 running run → 409；刪掉後單站抓取仍 200；>10 分鐘的舊 run 不擋 |

> 併發保護只看「10 分鐘內」的 run，崩潰留下的 `running` 不會永久鎖住功能。

### 11.12 2026-11-27：非技術同事的易用性與安全調整

| 項目 | 改動 |
|---|---|
| 匯入預設 | CSV 未填 `pipeline_status` 時，由 **backlog（會自動生成文章）** 改為 **parked（暫緩、不啟用）**；匯入對話框移除 backlog／parked 選項，只留一句白話：「匯入的詞會先標為『暫緩』，不會自動生成文章；要生成時再到列表逐個啟用。」 |
| 資料安全提醒 | 移除關鍵字庫頁那段技術說明（提到 pipeline_status／backlog／parked），因為預設已安全，說明不再需要 |
| 返回入口 | 關鍵字庫頁新增「← 返回 SEO 雷達」 |
| 工具列 | 「關鍵字庫」按鈕移除箭頭圖示；順序改為 **關鍵字庫 → 採納 → 刪除**；tooltip 寫明會前往「網站內容自動化 → 關鍵字庫」 |

> 後端 `content-keywords` 的 `DEFAULT_PIPELINE_STATUS` 仍是 `backlog`（只影響非 UI 呼叫者）；目前所有 UI 匯入都會帶明確的 `parked`，不會走到該預設。若要連 API 層也安全，需內容自動化負責人改一行並重新部署該函數。

---

## 12. 假設與風險

1. 側邊欄標籤「SEO 雷達」（原文「SEO雷達」，加空格符合「AI 關鍵字生成器」排版）。
2. 市場以 TLD 判定，`.com` 類網域一律當香港繁中，可手動覆寫（存 localStorage，不入庫）。
3. Google suggest 為非官方端點，無 SLA；任何失敗降級為 warning，不影響 GSC 結果。
4. `seo_keywords.source` CHECK 不改；建議詞映射 `'import'`，真來源留在 ideas。
5. 本期不新增 secret、不用 `GEMINI_API_KEY`。
6. 數值上限（100 詞／8 種子／10 站）集中在 `src/lib/seoRadar.ts`，調整不需改 UI。

| 風險 | 對策 |
|---|---|
| suggest 限流／改格式 | timeout + warning + 只出 GSC；解析容錯；種子 ≤8 |
| 新站 GSC 歷史不足 | 站名/品牌當種子；UI 提示「GSC 詞僅 N 個」 |
| cron 與 GSC 撞期 | 排 23:15 UTC，晚 30 分鐘 |
| 誤勾 backlog | 預設不勾 + dialog 明示 + SQL 條件只碰 NULL/backlog |
| cron 克隆錯 URL | 替換後斷言，失敗不建立 job 並 `RAISE NOTICE` |
| 半成品表（IF NOT EXISTS 掩蓋） | push 後驗證 UNIQUE／policy（清單 M1-05） |
| 候選詞會累積（每次抓取只 upsert、不刪舊） | 單站可能超過 100（目前 3 站：115／102／101） | UI 已寫明「舊候選會保留，不會自動清掉」；要清就用「刪除」，日後可加保留策略 |

---

## 13. 回滾

見 `scripts/rollback-seo-radar.sql`（三步：快照 `adopted_keyword_id` → 可選撤回 `pipeline_status` → unschedule + drop 兩張新表）。前端回滾＝revert 4 個既有檔案 + 刪新檔 + `supabase functions delete seo-radar`。不可逆項：已產生的文章草稿與 LLM token 成本。

---

## 14. 實作注意事項（接手必讀）

1. **`supabase/config.toml` 已於 2026-11-25 由 GBK 轉為 UTF-8。** 原因：GBK 會讓 Supabase CLI **靜默跳過** `[functions.*]` 設定，導致部署出來的函數 `verify_jwt` 一直是 `true`。轉檔後全檔只剩 1 個非 ASCII 字元（第 1 行的 `—`），已確認正確。**這個檔已不是 GBK，舊筆記若寫「用 GBK 寫入」請忽略。**
2. **工作區同時有其他人未提交的功能**（`crosspost`、`tone-rewrite`）。本功能只做新增；`ToolsCenterModule.tsx` 的 early return 與它們並存（順序：`social-automation` → `readdy-framer` → `seo-radar` → 其餘）。合併時兩個分支都要保留。
3. **`seo_keywords.source` 沿用既有四值**（`manual/gsc/ads/import`），建議詞寫 `'import'`，真來源保存在 `seo_keyword_ideas.source`。若日後要區分，需同步改：migration 的 CHECK、`src/types/seo.ts` 的 union、`KeywordLibraryView` 的 `SOURCE_FILTER_OPTIONS`、`content-keywords` 的 `KEYWORD_SOURCES`——屬獨立變更，不要順手改。
4. **「曝光」不是月搜尋量。** UI、CSV、對外說明都要維持這個措辭，否則會被誤讀成 Keyword Planner 的數據。
5. **cron 是靠「無 action + service_role」判定的。** 若日後要傳 body（例如指定站點），必須同時改 cron migration 的 URL 克隆邏輯（目前只替換 URL，body 沿用來源 job 的 `{}`）。
6. **Edge Function 未跑過 `deno check`**：本機沒有安裝 Deno，只做了 esbuild 語法檢查與人工 review。部署前若環境有 Deno，建議補跑 `deno check supabase/functions/seo-radar/index.ts`。
7. **production 的 `seo_keywords.id` 是 `text`，不是 uuid**（repo 舊 migration 寫的是 uuid）。任何指向它的 FK 都必須用 `text`；本次已在 migration 裡加註解，避免下一個人再踩。
8. **`GRANT SELECT` 不等於「只有 SELECT 權限」**：Supabase 預設權限會給 `authenticated` 全表權限，真正攔阻寫入的是 RLS（只有 SELECT policy）。要收緊需額外 `REVOKE`，本期未做——與專案其他表保持一致。
9. **`contentAuth.ts` 修好之後要重新部署才會生效**：`_shared/` 是在部署時打包進每個函數的。本次只重新部署了 `seo-radar`；其他 `content-*` 函數若仍跑舊版，真人呼叫可能 403，需各自重新部署。
