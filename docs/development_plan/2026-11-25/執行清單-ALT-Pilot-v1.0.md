# 執行清單｜ALT Pilot（網站圖片 ALT 生成與自動填入）

| 項目 | 內容 |
|---|---|
| 版本 | v1.1 |
| 日期 | 2026-11-25 |
| 對應計劃書 | `docs/development_plan/2026-11-25/PRD-ALT-Pilot-網站圖片ALT生成與自動填入-v1.0.md` |
| 上線手冊 | `docs/development_plan/2026-11-25/上線手冊-ALT-Pilot-v1.0.md` |
| 專案根目錄 | `D:\Project\MPS` |
| 本次範圍 | **本機 MVP；不 push、不部署、不改既有表** |
| 圖例 | ☑ 完成／△ 已寫未驗證／☐ 未做 |

> 本機沒有 Supabase（54321/54322 不通）與 Docker，因此 migration 未執行、Edge Function 未部署、沒有真實頁面 E2E。純函式測試、TypeScript（新檔）與 Vite build 已跑。

---

## P0｜前置檢查

| | ID | 任務 | 指令／位置 | 狀態／備註 |
|---|---|---|---|---|
| ☐ | P0-01 | Node／依賴可用 | `node -v; npm ci` | Node v26.13.1；npm.ps1 受執行策略限制，改用 `node_modules\.bin\*.cmd` |
| ☐ | P0-02 | Supabase CLI 已連結 | `npx supabase migration list --linked` | 未執行（不碰線上） |
| ☐ | P0-03 | 備份與乾跑 | `npx supabase db push --linked --dry-run` | 未執行（本機 MVP 禁止推送） |
| ☐ | P0-04 | 驗證 AI 金鑰 | Gemini／xAI 最小請求 | 未執行（沒有本機 secrets） |
| ☐ | P0-05 | Framer 圖片可抓 | 3 個站各 1 張 `framerusercontent.com` | 未執行（需要網絡與站點） |
| ☐ | P0-06 | baseline | 人工為 1 頁 10 張寫 ALT | 未執行 |
| ☐ | P0-07 | `seo_keywords` 可讀 | authenticated 查 1 站 | 未執行 |
| ☐ | P0-08 | `alt_*` 不存在 | `select to_regclass(...)` | 未執行（沒有本機 DB） |

**⛔ P0-02～P0-08 未過，不得進入正式環境。**

---

## M0｜文件

| | ID | 任務 | 主要檔案 | 狀態 |
|---|---|---|---|---|
| ☑ | M0-01 | 計劃書 | `docs/development_plan/2026-11-25/PRD-ALT-Pilot-網站圖片ALT生成與自動填入-v1.0.md` | 已寫入（v1.1 內容） |
| ☑ | M0-02 | 執行清單 | 本文件 | 已寫入 |
| ☑ | M0-03 | Tools-Center 規格 | `docs/05-Page-Specifications/Tools-Center.md` | 已加 `/alt-pilot` 子路由、流程、Edge Function、資料表、元件 |
| ☑ | M0-04 | 決策記錄 | PRD §2 | 五輪決策已記錄 |

---

## M1｜資料層

| | ID | 任務 | 主要檔案 | 狀態／備註 |
|---|---|---|---|---|
| ☑ | M1-01 | Migration：4 張表＋預設列 | `supabase/migrations/20261125183000_alt_pilot.sql` | 已寫；**未執行** |
| ☑ | M1-02 | RLS（DELETE 只 service_role） | 同上 | 已寫；未在 DB 驗證 |
| ☑ | M1-03 | Function 設定 | `supabase/config.toml` | 已加 `[functions.alt-pilot] verify_jwt=false` |
| ☑ | M1-04 | 型別 | `src/lib/altTypes.ts` | 已寫 |
| ☑ | M1-05 | API 封裝 | `src/lib/altApi.ts` | 已寫 |
| ☑ | M1-06 | 安全審查（靜態） | `scripts/alt-sql-audit.mjs`、migration | `node scripts/alt-sql-audit.mjs` → passed；4 表／8 policy／4 RLS／3 trigger／0 destructive statement |
| ☐ | M1-07 | 推送 migration | `npx supabase db push --linked` | 未執行（本機 MVP 禁止推線上） |
| ☐ | M1-08 | 權限回歸 | SQL console | 未執行 |

---

## M2｜純函式與測試

| | ID | 任務 | 主要檔案 | 狀態／備註 |
|---|---|---|---|---|
| ☑ | M2-01 | HTML 解析 | `src/lib/altPageParser.ts` | 已寫；fixture 測試通過 |
| ☑ | M2-02 | Prompt 組裝 | `src/lib/altPrompt.ts` | 已寫；JSON 解析測試通過 |
| ☑ | M2-03 | 品質規則 | `src/lib/altQuality.ts` | 已寫；8 硬＋6 軟 |
| ☑ | M2-04 | CSV／JSON／TSV | `src/lib/altCsv.ts` | 已寫；BOM／escape 測試通過 |
| ☑ | M2-05 | 單元測試 | `scripts/run-alt-pilot-test.ts` | `node scripts/run-alt-pilot-test.ts` → passed |
| ☑ | M2-06 | Fixture | `scripts/fixtures/alt-page-*.html` | Framer／WordPress 各一 |

---

## M3｜Edge Function

| | ID | 任務 | 主要檔案 | 狀態／備註 |
|---|---|---|---|---|
| ☑ | M3-01 | 骨架＋驗身分＋CORS | `supabase/functions/alt-pilot/index.ts` | 已寫；未部署 |
| ☑ | M3-02 | URL allowlist／SSRF | `guard.ts`、`index.ts` | 已寫；未實測 |
| ☑ | M3-03 | `analyze` | `index.ts` | 已寫；未實測 |
| ☑ | M3-04 | 圖片下載＋Gemini vision | `guard.ts`、`providers.ts` | 已寫；未實測 |
| ☑ | M3-05 | Grok 主／Gemini 備援 | `providers.ts` | 已寫；契約測試覆蓋 Grok 主、Grok 429→Gemini、Gemini 429→Grok |
| ☑ | M3-06 | 配額＋用量 | `index.ts` | 已寫；未實測 |
| ☑ | M3-07 | `generate`／`regenerate`／`verify` | `index.ts` | 已寫；未實測 |
| ☑ | M3-08 | 契約測試 | `scripts/run-alt-pilot-contract-test.ts` | `node scripts/run-alt-pilot-contract-test.ts` → passed（mock fetch／provider，不連網） |

---

## M4｜前端

| | ID | 任務 | 主要檔案 | 狀態／備註 |
|---|---|---|---|---|
| ☑ | M4-01 | 側欄＋分派 | `AppContext.tsx`、`ToolsCenterModule.tsx` | 已加；保留 concurrent 子項 |
| ☑ | M4-02 | 外殼＋sticky header | `AltPilotPage.tsx`、`AltPilotHeader.tsx` | 已寫 |
| ☑ | M4-03 | 分析表單＋URL 驗證 | `PageAnalyzeForm.tsx` | 已寫 |
| ☑ | M4-04 | 頁面摘要 | `PageSummaryCard.tsx` | 已寫 |
| ☑ | M4-05 | 圖片表＋選取＋行內編輯 | `AltImageTable.tsx`、`AltSuggestionRow.tsx` | 已寫 |
| ☑ | M4-06 | 詳情抽屜 | `AltDetailDrawer.tsx` | 已寫 |
| ☑ | M4-07 | 批准／略過／批次 | 同上 | 已寫；未實測 |
| ☑ | M4-08 | 匯出／複製 | `AltExportBar.tsx`、`altCsv.ts` | 已寫 |
| ☑ | M4-09 | 歷史與深連結 | `AltRunHistory.tsx`、`AltPilotPage.tsx` | 已寫 |
| ☑ | M4-10 | Framer 引導＋驗證 | `FramerPasteGuide.tsx` | 已寫 |
| ☑ | M4-11 | Prompt 資料庫入口 | `PromptLibrary.tsx` | 已加入口卡 |
| ☑ | M4-12 | 空狀態／錯誤／配額／schema | `AltEmptyState.tsx`、`AltPilotPage.tsx` | 已寫 |
| ☑ | M4-13 | 本機示範預覽 | `AltPilotDemoPage.tsx`、`altDemoData.ts`、`App.tsx` | schema 未建立時可按「預覽介面（示範資料）」；`?demo=1` 可直接開；`VITE_ALT_PILOT_DEMO=1` build 時多 `/alt-pilot-demo` 免登入路由；不寫 DB、不呼叫 LLM |

---

## M5｜驗收

| | ID | 任務 | 指令／位置 | 狀態／備註 |
|---|---|---|---|---|
| ☑ | M5-01 | 型別 | `npx tsc --noEmit` | 新檔 0 錯誤；專案其他既有檔案有既存錯誤 |
| ☑ | M5-02 | 建置 | `vite build` | 成功（4390 modules） |
| ☑ | M5-03 | 自動測試 | `node scripts/run-alt-pilot-test.ts`；`node scripts/run-alt-pilot-contract-test.ts` | 兩支都 passed |
| ☐ | M5-04 | 真實 E2E | 3 個代表頁 | 未執行（無本機 Supabase／secrets） |
| ☐ | M5-05 | 盲測 | 30 張 | 未執行 |
| ☐ | M5-06 | 回歸 | 工具中心其他子項、Prompt 資料庫 | 只做 build 級驗證 |
| ☐ | M5-07 | 成本核對 | `alt_llm_usage` | 未執行 |
| ☐ | M5-08 | 文件與 PR | PRD／清單／Tools-Center | PRD／清單完成；PR 未開 |

---

## 安全檢查（靜態）

| 檢查 | 結果 |
|---|---|
| migration 含 `DROP TABLE`／`DROP COLUMN` | 否 |
| migration 含 `DELETE`／`TRUNCATE` | 否 |
| migration 含無 WHERE 的 `UPDATE` | 否（只有 `insert ... on conflict`） |
| migration 含 `ALTER COLUMN TYPE` | 否 |
| 修改／刪除既有 RLS policy | 否（只新增新表 policy） |
| 改動 pg_cron | 否 |
| 既有表被 cascade 刪除 | 否（FK `on delete set null`） |
| anon 可讀新表 | 已 `REVOKE ALL ... FROM anon`＋RLS 無 anon policy |
| authenticated 可 DELETE 審計歷史 | 否（DELETE 只 service_role） |

---

## 尚未完成／下一步

1. 在**本機或 staging** 執行 migration，跑 `to_regclass`、`db push --dry-run`、推送後權限回歸。
2. 部署 `alt-pilot` Edge Function，設 `GEMINI_API_KEY`／`XAI_API_KEY`，跑 3 個真實頁的 analyze／generate／verify。
3. 做 30 張盲測，調整 prompt 與品質門檻。
4. 驗證 Framer 貼上後 `verify` 能比對到新 alt。
5. 補 `scripts/run-alt-pilot-contract-test.ts`（mock provider／fetch）。
6. 更新 `docs/05-Page-Specifications/Tools-Center.md`。

> **禁止**：未經批准不要 `supabase db push`、不要部署 function、不要 `git push`。本次只在本機留下可審閱的 MVP。
