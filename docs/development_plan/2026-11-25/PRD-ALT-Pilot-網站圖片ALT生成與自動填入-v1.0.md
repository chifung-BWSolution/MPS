# PRD｜ALT Pilot — 網站圖片 ALT 生成與自動填入

| 項目 | 內容 |
|---|---|
| 版本 | v1.1 |
| 日期 | 2026-11-25 |
| 狀態 | **Production DB＋Edge Function＋前端已部署；`enabled=false`；開關 UI 已上線** |
| 類型 | 工具中心新插件（新子模組） |
| 落點 | `#tools-center/alt-pilot` |
| 名稱 | **ALT Pilot**（副標：用整頁文案與圖片畫面生成 ALT，半自動填入 Framer） |
| 主要檔案 | `src/components/tools-center/alt-pilot/*`、`supabase/functions/alt-pilot/*`、`src/lib/alt*.ts` |
| 配套文件 | `執行清單-ALT-Pilot-v1.0.md`（同目錄） |

> **目前狀態**：migration 已用單支 SQL 套用到 production（未用 `db push`，因 remote migration drift）；`alt-pilot` Edge Function 已部署；`alt_settings.enabled=false`；**前端與 git 尚未推送**。因此正式站目前看不到 ALT Pilot，資料庫與 function 已就緒。

---

## 1. 背景與問題

現時同事用 Gork bot 填 ALT，但 ALT 只描述畫面本身，沒有結合「這張圖在整頁文案中的角色」與「該頁要打什麼關鍵字」，所以：

- 圖片搜尋（Google Images）曝光有限，ALT 與頁面主題脫節。
- 同頁多張圖的 ALT 容易重複、空泛（「圖片」「照片」「香港裝修」）。
- 裝飾圖也被硬塞關鍵字，反而傷害無障礙與品質評分。
- 人手逐張寫 ALT 慢，且無法追溯「誰在什麼時候改了哪張圖」。

ALT Pilot 不是「另一個看圖說故事工具」，而是：**把整頁文案、圖片畫面、站點關鍵字與品牌語氣一起交給模型，產出可審批、可匯出、可追溯的 ALT 對照表**。

---

## 2. 五輪需求對齊

| 輪次 | 問題 | 決定 | 影響 |
|---|---|---|---|
| 1 | 落點與名稱 | 工具中心新增獨立子模組 **ALT Pilot** | 側欄多一格；Prompt 資料庫加入口卡 |
| 2 | 輸入來源 | **單頁 URL**（MVP） | 只做單頁抓取；多頁／sitemap 留第二期 |
| 3 | 自動填入落點 | **Framer 半自動** | 對照表＋一鍵複製＋CSV；不做 Framer 寫入 API |
| 4 | 生成依據 | **頁面全文＋圖片 vision＋站點關鍵字**；**Grok 4.5 主（沿用現有 XAI key）、Gemini 備援** | 需要 server-side 抓頁、抓圖、base64 vision |
| 5 | 治理 | **逐張人工審批＋歷史＋每日成本上限** | 4 張 `alt_*` 表；DELETE 只給 service_role |

---

## 3. 目標與非目標

### 3.1 目標

| # | 目標 | 衡量方式 |
|---|---|---|
| G1 | ALT 切合頁面主題與畫面 | 30 張盲測 ≥80% 無需修改即批准 |
| G2 | 降低人手成本 | 20 張圖由約 30 分鐘降至 ≤10 分鐘（待 baseline 實測） |
| G3 | 可追溯 | 每次生成、編輯、批准、匯出都有紀錄與操作人 |
| G4 | 不失控 | 每頁 ≤40 張、每次 ≤6 張、每日 ≤300 次 LLM 呼叫 |
| G5 | 不破壞既有系統 | 其餘工具中心子項與 Prompt 資料庫行為不變 |
| G6 | 部署安全 | migration 只做加法，不改既有表／policy／bucket／cron |

### 3.2 非目標（第一期）

- Framer 專案自動寫入（MCP XML 寫入未驗證）。
- WordPress REST 自動寫入（有 WP 站時再開）。
- 整站 sitemap 掃描、排程自動生成。
- 背景圖（CSS `background-image`）、`<video poster>`、iframe 內圖片。
- 圖片重新托管、CDN 快取、圖片壓縮。
- 多語 UI（介面繁中；ALT 語言跟頁面 `lang`）。
- 與 Gork bot 的 API 整合。
- 依賴 `content_*` 表或 `src/lib/content*.ts`（ALT Pilot 獨立部署）。

---

## 4. 現況與可複用資產

| 需求 | 現有資產 | 備註 |
|---|---|---|
| 工具中心路由 | `AppContext.tsx` 的 `tools-center.subMenus`；`ToolsCenterModule.tsx` 以 `subModule` 分派 | 照 `readdy-framer` 模式早退 |
| Prompt 資料庫 | `PromptLibrary.tsx` | 純前端 mock；只加入口卡 |
| 站點主檔 | `webandsystem_list`（76 站，seed 多為 Framer） | 有 `domain_url`／`platform`；無頁面清單 |
| 關鍵字 | `seo_keywords` | 直接查，不新增欄 |
| AI provider | `ads-campaign-advisor`（Grok 主、Gemini 備援） | 沿用 `XAI_API_KEY`／`GROK_API_KEY`、`GROK_MODEL`、`GEMINI_API_KEY` |
| Edge Function 慣例 | `verify_jwt=false` 時自行驗 session（ES256） | 見 `config.toml` 與 `contentApi.ts` |
| 測試慣例 | `scripts/run-*-test.ts` | 新增 `scripts/run-alt-pilot-test.ts` |
| 設計語言 | `#f5f8fc` 底、白卡、teal `#0D9488`、4px、sticky header | 見 `docs/01-Technical-Architecture.md` |

---

## 5. 架構

```
使用者 → ALT Pilot UI（#tools-center/alt-pilot）
  ├─ supabase-js：alt_runs / alt_suggestions / alt_llm_usage / alt_settings
  ├─ supabase-js：webandsystem_list（站點）、seo_keywords（關鍵字）
  └─ POST /functions/v1/alt-pilot
        ├─ 驗 session、host allowlist、SSRF 防護
        ├─ fetch 頁面 HTML（≤2MB、10s、≤2 redirect）
        ├─ analyzePage：title / meta / H1–H3 / 正文 / img 清單
        ├─ fetch 圖片（≤6MB，jpeg/png/webp）→ base64
        ├─ Gemini 2.5 Flash vision → 失敗轉 Grok
        ├─ altPrompt + altQuality
        └─ 寫 alt_suggestions / alt_llm_usage / alt_runs
```

**資料流原則**

1. 頁面 HTML 與圖片不落 Storage；只存 URL、hash、摘要與建議文字。
2. analyze 與 generate 分開：先看抓到什麼，再決定花錢生成哪幾張。
3. 生成每批 ≤6 張，前端逐批呼叫；完成即寫入。
4. 批准與匯出在前端完成；LLM 與外部抓取只在 Edge Function。

---

## 6. 路由與前端

| 項目 | 內容 |
|---|---|
| 主路由 | `#tools-center/alt-pilot` |
| 深連結 | `#tools-center/alt-pilot?run=<uuid>` |
| 側欄 | `tools-center.subMenus` 加 `{ id: 'alt-pilot', label: 'ALT Pilot' }` |
| 模組分派 | `ToolsCenterModule` 早退 `<AltPilotPage />` |
| Prompt 資料庫 | 頂部入口卡「網站圖片 ALT 生成（ALT Pilot）」→ `navigateTo('tools-center','alt-pilot')` |

### 6.1 元件樹

```
src/components/tools-center/alt-pilot/
├── AltPilotPage.tsx          外殼：狀態、流程、深連結、ErrorBanner
├── AltPilotHeader.tsx        sticky header、用量、歷史
├── PageAnalyzeForm.tsx       站點 + URL + 分析
├── PageSummaryCard.tsx       頁面摘要、關鍵字、重新分析、驗證
├── AltBatchPage.tsx          站點盤點：sitemap、批次分析（不呼叫 LLM）
├── AltImageTable.tsx         表格、全選、批次
├── AltSuggestionRow.tsx      單列：縮圖、現有/建議 ALT、風險
├── AltDetailDrawer.tsx       大圖、上下文、理由、備選
├── AltRunHistory.tsx         歷史 run
├── AltExportBar.tsx          CSV / JSON / 複製 / 標記已匯出
├── FramerPasteGuide.tsx      Framer 貼上步驟
├── AltBadges.tsx             狀態／風險／位置／問題提示
├── AltEmptyState.tsx         首次使用與範圍說明
└── AltPilotUtils.ts          UI helper
```

### 6.2 畫面規格

```
┌ ALT Pilot · 網站圖片 ALT 生成與自動填入 ─────────────── [歷史紀錄] ┐
│ 站點 [BW Interior ▼]  頁面 URL [https://...]        [分析頁面]      │
│ 今日 18/300 次 · gemini-2.5-flash                                 │
├────────────────────────────────────────────────────────────────────┤
│ 頁面摘要：H1、語言、字數、圖片數、主關鍵字、[重新分析] [驗證已填]   │
│ [全選] [生成 ALT（12）] [批准（12）] [略過]                        │
├──┬────┬──────────────┬──────────┬──────────────┬──────┬──────┬────┤
│☑ │縮圖│檔名／位置     │現有 ALT  │建議 ALT       │狀態  │置信度│操作│
└──┴────┴──────────────┴──────────┴──────────────┴──────┴──────┴────┘
│ 已批准 N · 待批准 M        [複製] [JSON] [匯出 CSV] [標記已匯出]   │
└────────────────────────────────────────────────────────────────────┘
```

- 頁標 32px bold、副標 14px muted；sticky `top-[48px]`、`bg-[#f5f8fc]/95`。
- 卡片白底、`rounded-lg`、`border-[rgba(13,26,45,0.08)]`、`shadow-card`。
- 風險色：low teal、medium amber、high rose；狀態 pill 對應。
- 表格窄螢幕橫向滾動；抽屜用 `Sheet`。
- 八種狀態：schema 未建立、無站點、無圖片、分析失敗、配額用盡、生成失敗、全部已達標、歷史為空。
- schema 未建立時，除「重新檢查」外提供「預覽介面（示範資料）」；示範資料只存在記憶體，不寫 DB、不呼叫 LLM，用來先看 UI 與流程。
- 本機亦可直接開 `#tools-center/alt-pilot?demo=1`；若 build 時設 `VITE_ALT_PILOT_DEMO=1`，會多一個無需登入的 `/alt-pilot-demo` 預覽路由（正常 build 不含）。

### 6.3 站點 ALT 盤點（批次）

ALT Pilot 上方有兩個 tab：

- **單頁生成**：原有流程。
- **站點盤點**：一次查看多頁的 ALT 缺口，不呼叫 LLM。

流程：

1. 選站點 → 按「取得頁面」抓 `/sitemap.xml`（可手動改 sitemap URL，或手動貼 URL）。
2. sitemap index 會再抓最多 5 個子 sitemap；只保留 allowlist 網域。
3. 勾選最多 **10 頁** → 按「分析選取」。
4. 每頁呼叫現有 `analyze`，逐頁顯示：圖片數、缺 ALT、重複、過長、裝飾圖。
5. 按「開啟」進入該頁的單頁生成／審批流程。

限制與邊界：

- 批次分析**不呼叫 Grok**，只抓 HTML；沒有 token 成本。
- 每批 10 頁；sitemap 最多列 100 頁。
- 仍受 `alt_settings.enabled` 總開關控制。
- **批次生成缺 ALT**：只處理非裝飾且目前空白的 ALT；每批最多 20 張，生成前有確認對話框；呼叫 Grok，結果只寫入 `alt_suggestions`，**不自動批准、不自動寫回**。
- 盤點指標另含**跨頁重複 ALT**；可按「匯出盤點 CSV」下載每頁缺口報告。
- 尚未做「自動排程」與「自動寫回」；這兩項留第二期後段。

---

## 7. 後端

### 7.1 Edge Function `alt-pilot`

| 項目 | 內容 |
|---|---|
| 路徑 | `supabase/functions/alt-pilot/index.ts` |
| `verify_jwt` | `false`（ES256；函式自行 `auth.getUser()`） |
| Actions | `analyze` / `generate` / `regenerate` / `verify` |
| 回應 | `{ ok:true, data }` / `{ ok:false, code, error }` |
| 抓頁 | `text/html`、≤2MB、10s timeout、≤2 redirect |
| 抓圖 | `image/jpeg|png|webp`、≤6MB、≤2 redirect |
| Provider | **Grok 4.7 主（`alt_settings.model`）**；失敗轉 **DeepSeek V4.1 Flash 1017**（`OPENCODE_GO_API_KEY`），最後才 Gemini；JSON parse 失敗重試一次 |
| 配額 | `alt_settings.daily_call_limit`（HKT 當日）；**0 = 不限**，預設 0 |

### 7.2 SSRF 與 allowlist

1. 只接受 `http/https`；拒絕帳密、IP 字面值、單一標籤主機。
2. 頁面 host 必須屬於 `webandsystem_list.domain_url` 或 `ALT_ALLOWED_HOSTS`。
3. redirect 每跳重驗 host；最多 2 跳。
4. 拒絕 private／loopback／link-local／metadata IP；頁面額外做 DNS A 記錄檢查。
5. 圖片 CDN 可與頁面不同 host，但仍擋 private IP 與限制大小／格式。
6. 不轉發 cookie／Authorization。

### 7.3 HTML 解析

`src/lib/altPageParser.ts`：移除 script/style/noscript/template/svg；抽 title、meta、canonical、lang、H1–H3、p/li/figcaption；抽 img 的 `src`／`data-src`／`srcset`（挑最大）／alt／width／height／aria-hidden；判斷 header/main/footer、裝飾圖、SVG/GIF/1x1/重複；每頁最多 40 張。

### 7.4 Prompt

`src/lib/altPrompt.ts`：system + user；要求具體視覺細節、主關鍵字最多一次、不得照抄 H1、不得用「圖片」開頭、裝飾圖 `alt=""`、只輸出 JSON。輸出 schema：

```json
{
  "alt": "...",
  "short_alt": "...",
  "alternatives": ["...", "..."],
  "rationale": "...",
  "confidence": 0.86,
  "risk": "low",
  "decorative": false,
  "issues": []
}
```

### 7.5 品質規則

| 類型 | 規則 |
|---|---|
| 硬 | 空（非裝飾）、>125 字元、圖片/照片/image 開頭、HTML、同頁重複、關鍵字 >1 次或只有關鍵字、語言不符、檔名外洩 |
| 軟 | 中文 <12 字／英文 <25 字元、沒有視覺細節、與 H1 過像、與 caption 重複、全大寫、與頁面主題無關 |

分數 `100 - 硬 40/項 - 軟 8/項`；風險 low ≥80、medium 60–79、high <60 或任何硬規則。**不自動批准**。

---

## 8. 資料模型

Migration：`supabase/migrations/20261125183000_alt_pilot.sql`（只做加法）。

| 表 | 用途 | 關鍵欄位 |
|---|---|---|
| `alt_runs` | 每次頁面分析 | `page_url`、`page_host`、`context_summary`、`keyword`、`status`、`image_count`、`generated_count`、`approved_count`、`model`、`created_by` |
| `alt_suggestions` | 每張圖的建議 | `run_id`、`image_url`、`current_alt`、`suggested_alt`、`short_alt`、`alternatives`、`rationale`、`confidence`、`risk`、`issues`、`decorative`、`status`、`final_alt`、`reviewed_by`；`UNIQUE(run_id,image_url)` |
| `alt_llm_usage` | LLM 用量 | `run_id`、`model`、`provider`、`tokens_in/out`、`cost_usd` |
| `alt_settings` | 單列設定（**上線總開關**） | `enabled`（預設 **false**）、`model`（預設 `grok-4.5`）、`fallback_model`、`daily_call_limit`、`max_images_per_run`、`max_images_per_call` |

### 8.1 RLS

| 表 | authenticated | service_role |
|---|---|---|
| `alt_runs` | SELECT／INSERT／UPDATE；**DELETE 只給 service_role** | 全開 |
| `alt_suggestions` | SELECT／INSERT／UPDATE；**DELETE 只給 service_role** | 全開 |
| `alt_settings` | SELECT only | 全開 |
| `alt_llm_usage` | SELECT only | 全開 |

不建 anon policy；不改任何既有 policy。

### 8.2 上線總開關

`alt_settings.enabled` 預設 **false**：

- false：前端顯示「ALT Pilot 目前已停用」，分析／生成按鈕停用；Edge Function 的 `analyze`／`generate`／`regenerate` 回 `disabled`。歷史與 `verify` 仍可讀。
- true：功能開放；`daily_call_limit` 預設 **0 = 不限**。若日後要加軟上限，可設正整數（例如 50），超過才擋。

開啟方式（只動新表、帶主鍵 WHERE）：

```sql
update public.alt_settings
set enabled = true,
    daily_call_limit = 0
where id = 'default';
```

關閉方式（用 `enabled`，不要用 limit=0 當關閉）：

```sql
update public.alt_settings
set enabled = false
where id = 'default';
```

### 8.2 安全審查結論

- migration 內沒有 `DROP TABLE`／`DROP COLUMN`／`DELETE`／`TRUNCATE`／無 WHERE 的 `UPDATE`／`ALTER COLUMN TYPE`／修改或刪除既有 RLS policy／pg_cron。
- 既有表只被 FK 引用，且 `on delete set null`，不 cascade。
- 反向 migration 可移除新表／function；新表資料需先匯出。
- 上線前必做：`to_regclass` 檢查、`supabase db push --dry-run`、禁止語句掃描、推送後 anon/DELETE 權限回歸。

---

## 9. 匯出與 Framer 流程

1. 生成／編輯 ALT（不需要批准）。
2. 匯出 CSV（UTF-8 BOM）／JSON，或按「複製全部」（`filename<TAB>alt`）。
3. 在 Framer 依檔名／URL／位置找到圖層，貼上 ALT 並 Publish。
4. 回 ALT Pilot 按「重新分析」→「驗證已填」，比對線上 alt。
5. 若仍是舊值，檢查是否貼到 asset 而非頁面圖層。

歷史紀錄以浮層顯示；管理人員（management／super_admin／system_dev 等）可刪除紀錄。刪除會移除該次 `alt_runs` 與其 `alt_suggestions`（cascade）；`alt_llm_usage` 保留但 `run_id` 會設為 NULL，作為匿名成本紀錄。

CSV 欄位：`page_url,image_url,filename,location,current_alt,suggested_alt,short_alt,keyword,confidence,risk,status,note`。

---

## 10. 失敗模式

| 場景 | 處理 |
|---|---|
| 網域未登記 | `host_not_allowed`；提示先加站點或 allowlist |
| 403／429／timeout | `fetch_forbidden`／`fetch_rate_limited`／`fetch_timeout` |
| 頁面無 `<img>` | 表格空狀態；背景圖／iframe 不支援 |
| 圖片過大／格式不支援 | 該列 `image_skipped` |
| Grok 429／5xx | 自動轉 Gemini；兩者失敗 → 該列 failed |
| Gemini 不支援圖片 | `provider_no_vision`；不硬寫純文字 |
| 配額用盡 | `quota_exceeded`；顯示重置時間 |
| 資料表未建立 | 顯示「功能尚未啟用」；不白屏 |
| Framer 貼上未生效 | 「驗證已填」比對；提示檢查圖層／CMS |

---

## 11. 成本

| 項目 | 估算 |
|---|---|
| 每張圖 | Grok 成本依 XAI 帳單（本系統暫記 0）；Gemini 備援約 US$0.0013／張 |
| 每頁 20 張 | Grok 依實際 token；Gemini 備援約 US$0.026 |
| 每日用量 | 以 `alt_llm_usage` 的 token 與帳單核對；目前**沒有每日硬上限** |
| 每月 20 工作日 | 依實際使用量；需要時可把 `daily_call_limit` 設為正整數作軟上限 |

`daily_call_limit = 0` 代表不限；`alt_llm_usage` 會記 model／provider／tokens／cost_usd，Grok 的 cost_usd 目前記 0，需以 XAI 帳單為準。沒有硬上限時，建議每週檢查用量。

---

## 12. 測試與驗收

### 12.1 已執行（本機）

- `node scripts/run-alt-pilot-test.ts`：parser、prompt、quality、CSV、URL、字數、SSRF guard 測試全過。
- `node scripts/run-alt-pilot-contract-test.ts`：mock fetch／provider，覆蓋 host allowlist、redirect、頁面過大、PNG／SVG、private IP、Gemini 429→Grok fallback、Gemini 成功、無 key，全過。
- `node scripts/alt-sql-audit.mjs`：靜態掃描 migration，確認 0 個 DROP／DELETE／TRUNCATE／無 WHERE UPDATE／ALTER COLUMN TYPE／DROP POLICY／cron，且 4 表／8 policy／4 RLS／3 trigger 數量正確，passed。
- `npx tsc --noEmit`：**新增檔案 0 錯誤**（專案其他既有檔案仍有既存錯誤）。
- `vite build`：成功產出 bundle。

### 12.2 未執行（需環境）

- 真實頁面 analyze／generate／verify（需本機或 staging Supabase + Edge Function）。
- 30 張盲測。
- 真實 Framer 貼上與驗證。
- migration `db push`（本機 MVP 明確禁止推線上）。

### 12.3 驗收門檻

| # | 指標 | 門檻 |
|---|---|---|
| A1 | 頁面分析成功率 | ≥95% |
| A2 | 圖片抽取覆蓋 | ≥95% 可見 `<img>` |
| A3 | 生成成功率 | ≥95%；每批 6 張 p95 ≤30s |
| A4 | 盲測品質 | 30 張 ≥24 張免改 |
| A5 | 硬規則違規 | 已批准匯出 0 張 |
| A6 | 成本 | 每頁 20 張 ≤US$0.05 |
| A7 | 回歸 | 其他工具中心子項、Prompt 資料庫正常 |
| A8 | 安全 | anon 不可呼叫；非 allowlist 網域被拒；authenticated 不可 DELETE |

---

## 13. 風險與假設

| # | 風險／假設 | 對策 |
|---|---|---|
| R1 | Framer 無公開 server-side alt API | 半自動；第二期做 MCP spike |
| R2 | Framer CDN 擋 server fetch | P0 驗證；失敗改「上傳圖片」 |
| R3 | 頁面 JS 渲染，HTML 內沒有圖 | 回 `parse_empty`；第二期 headless |
| R4 | 模型編造細節 | prompt 明令不確定不要寫＋人工批准 |
| R5 | 關鍵字硬塞 | 硬規則 `keyword_stuffing` |
| R6 | 成本失控 | 每日／每頁／每批三層上限 |
| R7 | SSRF | allowlist＋private IP 阻擋＋redirect 重驗 |
| R8 | 與內容自動化同時改 `AppContext`／`ToolsCenterModule` | 兩者只加一行；合併時手動解衝突 |
| R9 | 半成品同名 `alt_*` 表 | 上線前 `to_regclass` 檢查 |

---

## 14. 檔案清單

| 類型 | 檔案 |
|---|---|
| Migration | `supabase/migrations/20261125183000_alt_pilot.sql` |
| Edge Function | `supabase/functions/alt-pilot/index.ts`、`guard.ts`、`providers.ts` |
| 純函式 | `src/lib/altTypes.ts`、`altText.ts`、`altUrl.ts`、`altPageParser.ts`、`altPrompt.ts`、`altQuality.ts`、`altCsv.ts`、`altApi.ts` |
| UI | `src/components/tools-center/alt-pilot/*` |
| 測試 | `scripts/run-alt-pilot-test.ts`、`scripts/fixtures/alt-page-*.html` |
| 既有檔案改動 | `AppContext.tsx`（加子項）、`ToolsCenterModule.tsx`（早退）、`PromptLibrary.tsx`（入口卡）、`supabase/config.toml`（function 設定） |

**未改**：任何既有資料表、既有 RLS policy、既有 Storage bucket、pg_cron、其他工具中心模組。
