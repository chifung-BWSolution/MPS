# 執行清單｜AI跨平台一稿多發（工具中心插件 v1.0）

- 日期：2026-11-25
- 範圍：**本地 MVP ＋ `crosspost-writer` 已部署 ＋ crosspost migration 已套用**（其他 3 支 Framer migration 未推；未用 `db push`）
- 配套：`PRD-AI跨平台一稿多發-v1.0.md`（同目錄）

狀態圖例：`[x]` 完成｜`[ ]` 未做／待部署｜`[~]` 有結果但屬既有問題

---

## M0｜前置與文件

- [x] `docs/development_plan/2026-11-25/PRD-AI跨平台一稿多發-v1.0.md`
- [x] `docs/development_plan/2026-11-25/執行清單-AI跨平台一稿多發-v1.0.md`（本檔）
- [x] 遷移檔名 `20261125120000` 不與未提交的 `20261126*` 衝突（檔名層面）
- [x] Grok：實際出稿成功（`grok-4.5`），證明 `XAI_API_KEY`／`GROK_API_KEY` 已設
- [ ] Gemini key：未實測（Grok 正常時不會走到後備）
- [ ] 確認 xAI 方案與額度（仍未核對）

---

## M1｜共用規則層（完成）

- [x] `src/lib/crosspost.ts`：平台規則、型別、驗證、prompt、容錯解析、Markdown、剪貼簿文字
- [x] `scripts/run-crosspost-lib-test.ts`：29 個測試
- [x] `node scripts/run-crosspost-lib-test.ts` → **29 passed**

覆蓋：平台上限／Hashtag 規則、code point 計數（中文／emoji）、brief 驗證、標題截斷、UUID 檢查、Hashtag 正規化與截斷、超標判定、prompt 內容、五種解析情境（圍欄／雜訊／根陣列／別名／缺版／非法 JSON）、重試合併（補齊缺版、incoming 優先）、輸出文字、migration／rollback 靜態檢查。

---

## M2｜資料庫（已套用，只 crosspost 一支）

- [x] `supabase/migrations/20261125120000_create_crosspost_copy.sql`
  - 兩張新表、3 個顯式索引（另 3 個 PK/UNIQUE）、RLS、8 條 policy、grant／revoke、註解
  - 只 `CREATE TABLE IF NOT EXISTS`＋`DROP POLICY IF EXISTS`；無 `ALTER`／`DROP` 既有表、無 DML、無 cron
- [x] `scripts/rollback-crosspost-copy.sql`（手動回滾，**不放 migrations**）
- [x] SQL 自審（靜態）：無 `DROP TABLE`／`TRUNCATE`／`DELETE FROM`／`cron.schedule`；`DROP POLICY` 只限兩張新表
- [x] 外鍵型別核對：`brand_list.id`、`users.id` 均為 uuid
- [x] **套用 migration**：以 Management API 在單一 transaction 執行（`begin … commit`），**不是 `db push`**
- [x] 套用後驗證：2 表、8 policy、6 索引、RLS 開啟、`anon` SELECT=false、`authenticated`=true、`language` default `'zh-HK'`
- [x] 結構 smoke：insert set＋variants → rollback，無殘留資料
- [x] migration history 已記錄 `20261125120000`（未來 `db push` 不會重跑）
- [ ] 其他 3 支 Framer migration 仍 pending（另案審查）
- [ ] cascade 刪除／FK SET NULL 實測（可選，需真資料）

---

## M3｜Edge Function（已部署）

- [x] `supabase/functions/crosspost-writer/index.ts`
  - Grok → Gemini；總預算 110 秒、單次 50 秒；429／逾時／JSON 壞的處理；缺版時同供應商重試 1 次
  - 回應固定 `{ ok, data }`／`{ ok:false, code, error }`
  - log 只記 provider／model／latency／字數
- [x] `verify_jwt`：`config.toml` 加 `[functions.crosspost-writer] verify_jwt = false`；函式內用 `/auth/v1/user` 驗 session（ES256），anon key 放行 dev-bypass
- [x] `supabase functions deploy crosspost-writer`（2026-11-25 成功）
- [x] 實測 Grok：POST 回 200、5 版齊全、`grok-4.5`、29.4 秒
- [x] 實測未授權 token：401 `unauthorized`
- [ ] 實測 Gemini 後備／雙失敗（需暫時改錯 Grok key）

---

## M4｜前端（完成）

- [x] `src/lib/crosspostApi.ts`：生成 invoke、儲存（set → variants，失敗補償刪 set）、歷史查詢、刪除、`42P01` 判定
- [x] `src/hooks/useCrosspostSets.ts`：載入、refresh、remove、available 降級
- [x] `CrosspostModule.tsx`：生成／歷史切換、自動儲存、重試儲存、開啟／重用／刪除
- [x] `CrosspostComposer.tsx`：三個必填＋進階區、字數計數、平台規則 chips、快速範例、Ctrl／⌘+Enter
- [x] `CrosspostResultView.tsx`：供應商 badge、5 tabs、缺版提示、複製全部、下載 `.md`、重新生成
- [x] `PlatformVariantCard.tsx`：標題／預覽／正文／字數（>90% 琥珀、>100% 紅）／Hashtag chips
- [x] `CrosspostHistoryView.tsx`：搜尋、列表、開啟／重用／刪除（AlertDialog 確認）
- [x] `types.ts`、`clipboard.ts`
- [x] 入口接線：`AppContext.tsx`（`ai-title` 之後）、`ToolsCenterModule.tsx`（title＋render case）
- [ ] 瀏覽器端到端手動測試（需先部署 function／套 migration；本次不執行）

---

## M5｜文件與驗證（完成）

- [x] `docs/05-Page-Specifications/Tools-Center.md`：路由列、新章節（流程／規則表／API／資料表）、組件樹、Edge Functions、環境變數
- [x] `node scripts/run-crosspost-lib-test.ts` → 29 passed
- [x] `tsc --noEmit`：新檔案 **0 error**
- [x] `vite build` → 成功（19.09s）
- [x] Vite dev server 模組轉換：11 個相關模組 HTTP 200
- [x] SSR smoke：`PlatformVariantCard`／`CrosspostResultView`／`CrosspostComposer`／`CrosspostHistoryView` 全部可渲染
- [~] `npm run build`：Windows 下 `tsc ; vite build` 的 `;` 被 cmd 當參數（既有 script 問題）
- [~] `tsc --noEmit` 全專案：36 個既有錯誤，全部不在本功能檔案
- [~] `node scripts/run-frontend-table-guard.ts`：既有 false positive（`brand_list` 於 20260807 migration DROP 後同檔重建，guard 未列入 allowed）

---

## 驗收清單（本地可驗部分）

- [x] 側欄「AI跨平台一稿多發」緊接「AI 關鍵字生成器」上方（SEO 雷達之後）
- [x] 三個必填缺一 → 按鈕 disabled 並列出欠欄
- [x] 五平台規則表與計數邏輯（單元測試）
- [x] Hashtag 正規化：補 `#`、去重、截斷、eDM 為空
- [x] 解析容錯：圍欄／前後雜訊／根陣列／平台別名／缺版／非法 JSON
- [x] 超過上限只標紅、不裁剪（`evaluateVariant`）
- [x] 生成結果自動落庫；失敗保留結果＋「重試儲存」
- [x] 歷史：載入、搜尋、開啟、重用 brief、刪除確認
- [x] 組件可 SSR 渲染（無 undefined／無 hook 崩潰）
- [x] 下載 `.md`／複製全部（程式路徑與內容格式）
- [x] 未部署探測：部署前 GET 404 → 顯示 banner；部署後 GET 405 → 「重新檢查」後 banner 消失
- [x] anon 被拒：REST `GET /rest/v1/crosspost_sets` → 401 `permission denied`
- [ ] 生成後重整仍可見（待你瀏覽器實測）
- [x] Grok 實測（部署後 POST 200、5 版）
- [ ] Gemini 後備／雙失敗實測

---

## 指令紀錄

```bash
node scripts/run-crosspost-lib-test.ts
npx tsc --noEmit
.\node_modules\.bin\vite.cmd build
node scripts/.tmp-crosspost-ssr.mjs   # 臨時煙霧測試，跑完已刪
node scripts/run-frontend-table-guard.ts
```

---

## 下一步（需你批准才做）

1. 在 Supabase 後台確認 `XAI_API_KEY`／`GROK_API_KEY`、`GEMINI_API_KEY`。
2. 先處理未提交的 `20261126*` migrations，或只用 SQL Editor 套 `20261125120000_create_crosspost_copy.sql`。
3. `supabase functions deploy crosspost-writer`。
4. 開 `#tools-center/crosspost` 做一次端到端：生成 → 五版 → 重整 → 歷史 → 重用 → 刪除。
5. 若 Grok 延遲過高，設 `GROK_MODEL=grok-3-mini` 或改走 Gemini。
