# 執行清單｜AI文案工坊 — 文案多角度轉寫 × 語氣校對

| 項目 | 內容 |
|---|---|
| 版本 | v1.4 |
| 日期 | 2026-11-26 |
| 狀態 | **程式完成、function 已部署（version 9，provider 已回退原設定）；生成待 Grok 充值；未 commit／未 push** |
| 對應計劃書 | `D:\Project\MPS\docs\development_plan\2026-11-26\PRD-AI文案工坊-文案多角度轉寫與語氣校對-v1.0.md` |
| 專案根目錄 | `D:\Project\MPS` |
| 路由 | `#tools-center/tone-rewrite`（顯示名稱：AI文案工坊） |
| 資料庫 | **零變更**（沒有 migration／SQL／RLS／cron） |
| 新依賴 | **無** |
| 執行邊界 | **本地 MVP ＋ function 已部署**；未 commit／未 push；未執行 `secrets set`／`db push` |

> 狀態圖例：`[x]` 完成｜`[ ]` 未做／待部署。
> 本清單的「實際結果」是本次施工的實測，不是預估。

---

## 使用說明

1. 全部程式任務與 function 部署已完成；`[ ]` 只剩「瀏覽器手動 smoke」與「CSV Excel 手動檢查」。
2. 本清單**沒有** database gate：不需要 `db push`、migration、secrets set。
3. 路徑以 `D:\Project\MPS\` 為根；表格內省略前綴。
4. 工作區同時有「熱點雷達」「社媒自動化」等未提交工作流；本次只改本清單列出的檔案。
5. `npm` 在此機受 PowerShell 執行原則阻擋；所有指令用 `node`／`supabase.cmd` 直接執行。

## 本地 MVP 邊界（本次）

- 只在 `D:\Project\MPS` 工作區修改；**未 commit、未 push**。
- **未**呼叫 Supabase DB、**未**執行 `db push`、`functions deploy`、`secrets set`。
- 驗證只用本機 Node＋Vite＋TypeScript；沒有連任何線上環境。
- 正式部署（function deploy／前端上線）需另行 review 與批准；本清單不包含部署步驟的執行。

---

## P0｜前置檢查

| | ID | 任務 | 指令／位置 | 完成定義 | 實際結果 |
|---|---|---|---|---|---|
| ☑ | P0-01 | 確認 Node 可執行 TypeScript 測試 | `node -v` | 可直接跑 `.ts` 測試 | v26.13.1；`node scripts/run-ad-creative-test.ts` 可執行 |
| ☑ | P0-02 | 確認工具中心現有結構 | `src/context/AppContext.tsx`、`ToolsCenterModule.tsx`、`ContentZoneTabs.tsx` | 知道子選單、頁面分派、切換器位置 | 已確認 `tone-rewrite`／`content`／`FeatureTabs` |
| ☑ | P0-03 | 確認不需要資料庫 | 檢查工具中心現有子項 | 純前端＋Edge Function 即可 | 確認**零 DB 變更** |
| ☑ | P0-04 | 確認與內容自動化工作流邊界 | `content/**`、`content*.ts`、`supabase/functions/content-*` | 不動對方檔案 | 只改 `ContentZoneTabs`（切換器）與共用 UI |
| ☑ | P0-05 | 確認本機沒有 Deno／Docker | `Get-Command deno`、`docker` | 知道 function 只能做契約測試 | 無 Deno；部署留 gate |
| ☑ | P0-06 | 確認設計語言與可用 UI | `src/components/ui/*`、`tailwind.config.js` | 不新增依賴 | 用 Input／Textarea／lucide／sonner／Tailwind |

**Gate**：P0-03 已確認零 DB；P0-05 已確認 function 不在本地執行。

---

## M1｜共用純函式層

| | ID | 任務 | 主要檔案 | 完成定義 | 實際結果 |
|---|---|---|---|---|---|
| ☑ | M1-01 | 型別、切角庫、平台規則、limits、label | `src/lib/adCreative.ts` | 6 切角、3 平台、4 目標、4 語氣齊全 | 已實作；`AD_ANGLES`／`AD_PLATFORM_RULES`／`AD_GOAL_LABELS`／`AD_TONE_LABELS` |
| ☑ | M1-02 | normalize／validate／prompt | 同上 | 空白、超長、offer 缺失、切角 3–5 都有明確結果 | `normalizeAdBrief`／`validateAdBrief`／`buildAdCreativePrompt` |
| ☑ | M1-03 | parse／fitText／warnings | 同上 | JSON 容錯、修剪、warning 齊全 | fence／雜訊／alias／缺 A/B／`fitText`／未核實數字／絕對化／A/B 同標題／主文差異 |
| ☑ | M1-04 | CSV rows／TSV／可讀文字 | 同上 | 6–10 列、BOM、quote、公式防護 | `buildAdCsvRows`／`toCsv`／`buildAdMatrixTsv`／`buildAdCopyAllText` |
| ☑ | M1-05 | 契約測試 | `scripts/run-ad-creative-test.ts` | 全部 assert 通過 | `ad creative: ok` |
| ☑ | M1-06 | 更新 HK 測試 1 行 | `scripts/run-hk-rewrite-test.ts` | 只改元件名，其餘不動 | 已改 1 行；HK 測試全過 |

### M1 完成定義

- [x] 引擎可被 Node 直接 import（模組內部用 `.ts` 副檔名）。
- [x] 純函式，不 import React／DOM／Supabase／Node API。
- [x] 切角最少 3、最多 5；沒有 offer 時 `offer` 被移除並補位。
- [x] `fitText` 以 code point 計，URL／email 不切斷。
- [x] CSV 有 UTF-8 BOM、CRLF、quote、公式注入防護。

---

## M2｜API 與 Edge Function

| | ID | 任務 | 主要檔案 | 完成定義 | 實際結果 |
|---|---|---|---|---|---|
| ☑ | M2-01 | 服務探測＋generate＋錯誤映射 | `src/lib/adCreativeApi.ts` | 404→missing；180s timeout；payload 再驗證 | 已實作；AbortController＋error mapping；顯示 server detail |
| ☑ | M2-02 | 新 Edge Function | `supabase/functions/ad-creative-writer/index.ts` | OPTIONS／405／auth／validate／Gemini→Grok／錯誤碼 | 已實作；`Deno.serve`、`validateSession`、重試、429／504／502 |
| ☑ | M2-03 | config entry | `supabase/config.toml` | `[functions.ad-creative-writer] verify_jwt = false` | 已加 |
| ☑ | M2-04 | 靜態契約檢查 | `scripts/run-ad-creative-test.ts` | import shared、無 DB、keys、CORS、config | 全部通過 |
| ☑ | M2-05 | 部署 function | `supabase functions deploy ad-creative-writer` | function 上線、GET 405／POST 200 | **已部署**：最新 version 9、ACTIVE、2026-11-26 10:36:49 UTC |
| ☑ | M2-06 | Secrets 確認 | Supabase dashboard／CLI | `XAI_API_KEY` 或 `GEMINI_API_KEY` 存在 | 兩者都在；Grok 欠費；依指示不改 provider 主備 |

### M2 完成定義

- [x] 函式只回傳 3–5 個有效切角；不足會 retry 一次，仍不足回 `bad_json`。
- [x] 429／timeout／格式錯誤／上游錯誤有明確 code。
- [x] 不寫 DB、不生成假文案。
- [x] 部署與 provider 呼叫（Grok 曾成功；現已回退原 provider 設定；Grok 欠費、Gemini 2.5 停用）。

---

## M3｜UI

| | ID | 任務 | 主要檔案 | 完成定義 | 實際結果 |
|---|---|---|---|---|---|
| ☑ | M3-01 | 共用 `FeatureTabs` | `FeatureTabs.tsx` | 寬度貼字、badge 條件渲染、可橫向捲動 | `w-fit`、`shrink-0`、`whitespace-nowrap`；移除固定槽位 |
| ☑ | M3-02 | 重構 `ContentZoneTabs` | `ContentZoneTabs.tsx` | 公開 props 不變；視覺不回歸 | 改用 `FeatureTabs`；props 不變 |
| ☑ | M3-03 | AI文案工坊外殼 | `CopyStudioTool.tsx` | 兩 tab；hidden 保持 mounted；預設文案多角度轉寫 | 已實作；預設 ad tab；`hidden` 切換 |
| ☑ | M3-04 | 文案多角度轉寫表單 | `AdBriefForm.tsx` | 必填、切角 3–5、平台／長度、示例、隱私提示 | 已實作；Ctrl／Cmd+Enter、limit draft |
| ☑ | M3-05 | A/B 卡＋矩陣表 | `AdAngleCard.tsx`、`AdMatrixTable.tsx` | 逐格編輯、字數、複製、stale | 已實作；icon-only copy、line-clamp |
| ☑ | M3-06 | 狀態 hook | `useAdCreative.ts` | probe、generate、cancel、edits、stale | 已實作；requestId 防競態 |
| ☑ | M3-07 | CSV／TSV／可讀文字 | `adCopyExport.ts`＋shared lib | 下載與複製可用 | 已實作；Blob＋BOM |
| ☑ | M3-08 | 服務／錯誤 banner | `AdServiceBanner.tsx` | missing／unknown／各錯誤碼 | 已實作 |
| ☑ | M3-09 | 搬 `CopyButton` | `shared/CopyButton.tsx`＋3 imports | HK 行為不變 | 已搬；舊路徑保留 re-export |
| ☑ | M3-10 | 側欄與標題 | `AppContext.tsx`、`ToolsCenterModule.tsx` | AI文案工坊／副標／render；側欄在 ALT Pilot 前 | 已改；標題與順序都已更新 |

### M3 完成定義

- [x] 手機單欄、桌面 A/B 兩欄、矩陣表橫向捲動。
- [x] 所有顏色／卡片樣式沿用工具中心。
- [x] 沒有新增 npm 依賴。
- [x] 切 tab 不丢輸入／結果／改字（面板保持 mounted）。
- [ ] 瀏覽器 360px／hover／剪貼簿手動測試（未執行）。

---

## M4｜驗證與驗收

| | ID | 指令／方法 | 通過標準 | 實際結果 |
|---|---|---|---|---|
| ☑ | M4-01 | `node scripts/run-ad-creative-test.ts` | 全部 assert 通過 | `ad creative: ok` |
| ☑ | M4-02 | `node scripts/run-hk-rewrite-test.ts` | 全部 assert 通過 | `hk cantonese rewrite: ok` |
| ☑ | M4-03 | `tsc --noEmit` 新檔 filter | 無輸出 | 無輸出；全專案仍有既有錯誤 |
| ☑ | M4-04 | `vite build` | `✓ built` | `✓ built in 12.18s`（PowerShell 因 Browserslist 警告回 exit 1） |
| ☑ | M4-05 | SSR smoke（臨時腳本） | 新元件不拋錯、有預期文案 | `ad ssr: ok 49691`；腳本已刪 |
| ☑ | M4-06 | 靜態檢查 | 無 DB／migration／新依賴；只改清單檔案 | 已檢查；未改 package.json／SQL |
| ☑ | M4-07 | `git diff --stat` 人工 review | 無誤覆蓋、無 commit／push | 已 review；未 commit／push |
| ☐ | M4-08 | 部署後真實生成 | 3–5 切角、A/B、長度 | **回退後未再生成**；Grok 欠費、Gemini 2.5 已停用，預期仍會 `llm_unavailable` |
| ☐ | M4-09 | 瀏覽器手動 smoke | 兩個 tab、360px、複製、CSV 下載 | **未執行**（無瀏覽器工具；留人手） |

### M4 完成定義

- [x] 新檔案零錯誤；HK 測試全過。
- [x] production build 成功。
- [x] SSR 可渲染 `FeatureTabs`／`ContentZoneTabs`／`AdCreativePanel`／`AdAngleCard`／`AdMatrixTable`。
- [ ] 部署後端到端（provider 已回退，待 Grok 充值）。
- [ ] 瀏覽器手動 smoke。

---

## M5｜文件與部署 gate

| | ID | 任務 | 完成定義 | 實際結果 |
|---|---|---|---|---|
| ☑ | M5-01 | 寫 PRD | 含五個決策、IA、AI 契約、測試結果 | 本目錄 `PRD-AI文案工坊-文案多角度轉寫與語氣校對-v1.0.md` |
| ☑ | M5-02 | 寫執行清單 | M0–M5、實際結果、未完成項標示 | 本文件 |
| ☑ | M5-03 | 部署 function | `supabase functions deploy ad-creative-writer`；GET 405／POST 200 | **已執行**：deploy 成功、最新 version 9、GET 405、POST 200 |
| ☐ | M5-04 | 真實生成 smoke | 示例 brief → 3–5 切角、A/B、長度 | **回退後未再生成**；待 Grok 充值或另行批准改 provider |

---

## 本次檔案清單

### 新增

| 路徑 | 說明 |
|---|---|
| `src/lib/adCreative.ts` | 共用純函式層 |
| `src/lib/adCreativeApi.ts` | API client（probe／generate） |
| `src/components/tools-center/FeatureTabs.tsx` | 共用切換器 |
| `src/components/tools-center/copy-studio/CopyStudioTool.tsx` | AI文案工坊外殼 |
| `src/components/tools-center/copy-studio/ad/AdCreativePanel.tsx` | 文案多角度轉寫 orchestrator |
| `src/components/tools-center/copy-studio/ad/AdBriefForm.tsx` | 表單 |
| `src/components/tools-center/copy-studio/ad/AdAngleCard.tsx` | A/B 卡 |
| `src/components/tools-center/copy-studio/ad/AdMatrixTable.tsx` | 矩陣表 |
| `src/components/tools-center/copy-studio/ad/AdServiceBanner.tsx` | 服務／錯誤 banner |
| `src/components/tools-center/copy-studio/ad/useAdCreative.ts` | 狀態 hook |
| `src/components/tools-center/copy-studio/ad/adCopyExport.ts` | CSV 下載 |
| `src/components/tools-center/shared/CopyButton.tsx` | 共用複製按鈕 |
| `supabase/functions/ad-creative-writer/index.ts` | Edge Function |
| `scripts/run-ad-creative-test.ts` | 契約測試 |
| `docs/development_plan/2026-11-26/PRD-AI文案工坊-文案多角度轉寫與語氣校對-v1.0.md` | PRD |
| `docs/development_plan/2026-11-26/執行清單-AI文案工坊-文案多角度轉寫與語氣校對-v1.0.md` | 本文件 |

### 修改

| 路徑 | 說明 |
|---|---|
| `src/context/AppContext.tsx` | label → AI文案工坊 |
| `src/components/tools-center/ToolsCenterModule.tsx` | import／title／render |
| `src/components/tools-center/content/shell/ContentZoneTabs.tsx` | 改用 `FeatureTabs` |
| `src/components/tools-center/tone-rewrite/hk/HkRewritePanel.tsx` | CopyButton import |
| `src/components/tools-center/tone-rewrite/hk/SocialPreview.tsx` | CopyButton import |
| `src/components/tools-center/tone-rewrite/hk/RewriteRulesPanel.tsx` | CopyButton import |
| `src/components/tools-center/tone-rewrite/hk/CopyButton.tsx` | 相容 re-export |
| `supabase/config.toml` | function entry |
| `scripts/run-hk-rewrite-test.ts` | 1 行靜態斷言 |

- **未改** `package.json`、`src/lib/crosspost.ts`、`supabase/functions/crosspost-writer/**`、`content/**`、任何 `.sql`／migration。

---

## 備份紀錄（本次）

| 項目 | 結果 |
|---|---|
| 原始碼 zip | `D:\Project\MPS-backups\MPS-source-20261126-171924.zip`（7.3 MB；src／supabase／scripts／docs／public／設計／設定） |
| Working tree diff | `D:\Project\MPS-backups\worktree-20261126-171924.diff` |
| Git status／untracked 清單 | `git-status-20261126-171924.txt`、`untracked-20261126-171924.txt` |
| Manifest | `manifest-20261126-171924.txt`（含 HEAD `a43ea20`） |
| DB backup | 未做本機 `pg_dump`（沒有 `SUPABASE_DB_PASSWORD`）；使用 Supabase 既有 physical backup，最新 `2026-11-26 01:24:10 UTC` |
| DB 改動 | **0**（本次沒有 migration／SQL／DDL／DML／RLS／cron） |

> 注意：`supabase db push` 會把工作區其他未跟蹤 migration 一併帶上；本次沒有執行 `db push`。

---

## 部署 checklist（已執行）

- [x] `supabase functions deploy ad-creative-writer --project-ref kwcevjcmdjadhrygjyfp --use-api --no-verify-jwt`
- [x] 確認 `XAI_API_KEY`／`GEMINI_API_KEY` 已設
- [x] `GET /functions/v1/ad-creative-writer` 回 405（不是 404）
- [ ] 用示範 brief 生成一次：**回退後未做**（Grok 欠費、Gemini 2.5 停用；需充值或另行批准改 provider）
- [ ] 開 `#tools-center/tone-rewrite` → 文案多角度轉寫 →「重新檢查」變 ready（需瀏覽器人手）
- [ ] 匯出 CSV，Excel 開啟無亂碼、欄位正確（需瀏覽器人手）
- [ ] 測試 429／timeout／bad_json 畫面（需模擬，未做）

## 回滾

1. 前端 revert：移除 `CopyStudioTool` 與側欄 label，恢復 `ToneRewriteTool`。
2. Function：`supabase functions delete ad-creative-writer`。
3. 無資料表、無 migration，不需要資料回滾。

---

## 已知限制

1. **目前生成可能失敗**：Grok 欠費、Gemini `gemini-2.5-flash` 已停用；依指示不改 provider 主備，需充值或另行批准改 provider。
2. 瀏覽器手動 smoke（360px、hover、剪貼簿、CSV Excel）未做；需人手在 `#tools-center/tone-rewrite` 開一次。
3. 本機沒有 `SUPABASE_DB_PASSWORD`，未做 `pg_dump`；DB 依賴 Supabase 既有 physical backup（最新 2026-11-26 01:24:10 UTC）。本次 DB 零改動。
4. 沒有歷史紀錄／localStorage；重新整理即清空。
5. Warning 不是法律／合規審查；數字、療效、評價仍需人手核實。
