# PRD（計劃書）｜語氣校對改寫器（第一批：港式）

| 項目 | 內容 |
|---|---|
| 版本 | v1.4 |
| 日期 | 2026-11-26 |
| 狀態 | **已實作，文件為實作後定稿** |
| 落點 | 工具中心 → 語氣校對改寫器（`#tools-center/tone-rewrite`） |
| 專案根目錄 | `D:\Project\MPS` |
| 對應執行清單 | `D:\Project\MPS\docs\development_plan\2026-11-25\執行清單-語氣校對改寫器-港式-v1.0.md` |
| 資料庫影響 | **無**：0 migration、0 SQL、0 RLS、0 cron、0 Edge Function |
| 執行邊界 | **本地 MVP**；不 commit／不 push；不執行 `db push`／`functions deploy`／`secrets set` |
| 新依賴 | 無（只用 repo 已有的 React、Radix Tabs、lucide-react、sonner、Tailwind） |

> 本文件只覆蓋「港式語氣改寫器」。英文商務語氣改寫器、AI 深化模式列在 §15 後續，不屬於 v1.0 範圍。

---

## 1. 背景與問題

MPS 工具中心現有 AI 子項多為前端假資料（`setTimeout`），沒有真正的文字改寫服務；而日常文案來源混雜：

- 內地稿：質量、信息、視頻、空調、自行車、充電寶、咨詢、回復……
- 台灣稿：軟體、網路、行銷、計程車、行動電話……
- 粵語口語稿：嘅、哋、喺、咗、冇、睇、瞓、佢、咩……
- 客戶原文：可能已是繁體，但用詞與香港市場習慣不同。

人工逐字改寫與核對成本高，而且容易漏改。B100-Manager 的「設定 → 寫作要求」已有一套現成 prompt（Beauty100／IG／FB），可以直接改寫成通用版本重用。

## 2. 目標與成功標準

**目標**：在 `工具中心 → AI 圖片說明生成` 正下方加入「語氣校對改寫器」，第一版只做港式：

1. 貼入原文／草稿，一鍵輸出「香港書面語版」與「IG／FB／小紅書口語版」。
2. 自動標示所有被替換的非港式詞彙，並列成可勾選的核對清單。
3. 提供由 B100 寫作要求改寫而成的 prompt，可複製到外部 AI。

**成功標準**

| # | 標準 | 驗證方式 |
|---|---|---|
| S1 | 側欄順序為 `… AI 圖片說明生成 → 語氣校對改寫器 → Prompt 資料庫 …` | 靜態測試＋手動開頁 |
| S2 | 一次點擊即時產生兩個版本（5,000 字內 < 200ms） | 純函式測試＋手動 |
| S3 | IG／FB／小紅書三個分頁各自可複製，hashtag 數符合平台規則 | 單元測試＋SSR |
| S4 | 每個替換詞在輸出有顏色標示，表格有原詞／書面語／口語／類別／次數／上下文 | SSR＋手動 |
| S5 | 空白、無替換、超長、純英文、簡體、粵語草稿都有明確處理，不拋錯 | 單元測試 |
| S6 | 不新增網路請求、資料表、Edge Function、npm 依賴；草稿不出瀏覽器 | 程式碼審查＋建置 |

## 3. 範圍

### 3.1 本次包含

- 港式語氣改寫器（`tone-rewrite` 子路由）。
- 香港書面語版 + IG／FB／小紅書口語版。
- 簡→繁（無歧義字）＋非港式用詞＋粵語口語→書面語；反向書面語→粵語口語。
- 替換標示、替換表、已核對狀態、篩選、全部標記。
- 語氣提醒（反 AI 味、宣傳腔、浮誇、簡體殘留）。
- B100 改寫 prompt 面板與複製。
- 英文商務版入口（disabled／toast「敬請期待」，無 badge）。

### 3.2 本次不包含

- 英文商務語氣改寫器的實際功能。
- Gemini／Edge Function／API key／資料表／RLS／cron。
- 自動發佈到 IG／FB／小紅書、排程、歷史紀錄、持久化。
- 全文文法重寫、粵拼、完整繁簡轉換器。

## 4. 關鍵決策

| ID | 決策 | 理由 | 代價 |
|---|---|---|---|
| D1 | **純前端規則引擎，不接 Gemini** | 免部署、免 key、免額度；草稿不外傳；即時、可預測；MPS 沒有現成改寫服務 | 品質受詞表限制，未收錄的詞不會自動換 |
| D2 | **兩個版本一次輸出，三個平台分頁** | 符合「一鍵」；IG／FB／小紅書格式差異大，分頁最貼近實際發佈 | 三個版本共用同一段口語內容，平台差異只在開頭／CTA／hashtag |
| D3 | **B100 prompt 改寫成通用版本，不照搬 Beauty100 品牌** | 工具是 MPS 通用插件；保留痛點標題、摘要、hashtag 數、結尾問題、不虛構療效等規則 | 與 B100 原文不完全逐字相同，已在檔頭註明來源 |
| D4 | **零資料庫變更** | 這個工具不需要保存草稿或結果；避免與進行中的內容自動化工作流互相影響 | 重新整理後要重新貼入 |
| D5 | **Prompt 卡只限管理層角色（`canAccessSettings`）** | 與「系統設定」權限一致；避免所有同事看到內部規則 | 前端隱藏不是安全邊界；prompt 仍在 JS bundle；`chief_editor` 不在此範圍 |

### D1 的額度判斷（為何不把 Gemini 當硬依賴）

- MPS 只保存 `GEMINI_API_KEY`（Supabase secret），repo 無法得知是免費層還是付費層；PRD 假設免費層，但實際 RPD 依帳號而變。
- 以每次改寫約 6–7k tokens 估算：15 RPM／1,500 RPD 的免費層對內部小工具足夠；5 RPM／20–250 RPD 的降額層只夠 1–3 人。
- `gemini-2.5-flash` 已有遷移公告（外部資料，請以官方為準），把新工具綁在它上面要再驗一次。
- 因此 v1.0 用本地規則；要 AI 時再另加 function，回傳同一結果形狀即可（見 §15）。

## 5. 用戶流程

```
① 工具中心 → 語氣校對改寫器
② 貼入原文／草稿（或按「載入示例」）
③ 選擇輸出平台（IG／FB／小紅書，預設全選）
④ 按「一鍵改寫」（或 Ctrl／Cmd + Enter）
⑤ 左：香港書面語版；右：社群口語版（三個分頁）
⑥ 下方：替換詞彙表（逐項勾「已核對」）＋語氣提醒
⑦ 底部：改寫規則與 Prompt（可複製到外部 AI）
```

## 6. 功能規格

### 6.1 輸入

| 項目 | 規格 |
|---|---|
| 元件 | `Textarea`（`src/components/ui/textarea.tsx`） |
| 上限 | 20,000 字（`maxLength`；引擎另有截斷保護） |
| 字數顯示 | `input.length`，超過 90% 變 amber |
| 快捷 | Ctrl／Cmd + Enter 執行（中文輸入法組字中不觸發） |
| 平台選擇 | IG／FB／小紅書 chip，`aria-pressed`；至少保留一個 |
| 其他 | 清空、載入示例；隱私提示「全部在瀏覽器處理，草稿不會上傳」 |

### 6.2 香港書面語版

- 繁體、香港標準用詞、正式語氣。
- 轉換順序：正規化 → 簡→繁（無歧義字）→ 非港式用詞 → 粵語口語→書面語 → 保護詞。
- 標示：簡體字琥珀、非港式用詞／粵語轉書面 teal。
- 顯示：字數、替換總次數、複製；stale 時停用複製。
- 若無替換：顯示「未發現非港式詞彙」；若只有簡體字轉換，顯示「簡體字已轉繁體，未發現其他非港式詞彙」。

### 6.3 社群口語版

| 平台 | 結構 | 上限 | hashtag |
|---|---|---|---|
| Instagram | 首行 hook（首句 ≤60 字）→ 其餘內文 → CTA「你哋又點睇？留言講低你嘅想法 👇」 | 2,200 | 5–12（實際取 8） |
| Facebook | 首句第一個分句作標題（≤40 字）→ 其餘內容 → 「適合同關注〔主題〕嘅香港讀者睇。」→ CTA | 63,206（UI 預覽上限 5,000） | 0–3（實際取 3） |
| 小紅書 | 主題 emoji + 標題（≤20 字）→ 最多 5 個 `・` bullet → CTA「記得收藏，之後一定用得上 📌」 | 1,000 | 6–10（實際取 8） |

- 口語版在書面語版的基礎上再套「書面語→粵語口語」規則。
- hashtag 由主題關鍵字（美容、餐廳、旅遊、健身、穿搭、樓市、科技、親子、寵物、咖啡）＋預設標籤組成，不含 Beauty100 等品牌名。
- 超限以 `…` 截短並顯示「已按平台上限截短」；截斷會同步丟棄超範圍標記。
- 連結／email 會保留完整，不會被 `?`／`:` 切斷；若標題本身就是連結，標題改用主題名，連結留在內文。

### 6.4 替換標示與核對

- 輸出用 `<mark>` 標示，`title` 顯示「原詞 → 新詞（類別）」。
- 三種顏色：琥珀＝簡體字、teal＝非港式用詞、玫瑰＝口語改寫。
- 替換表欄位：已核對／原詞／香港書面語／口語版／類別／次數／上下文（最多 2 段，前後 8 字）。
- 可勾選、只看未核對、全部標為已核對；顯示 `已核對 x / y`。
- 簡體字轉換不進替換表（只在輸出標示），避免表格被幾十個單字淹沒。

### 6.5 語氣提醒

移植 B100 `voice.ts` 的反 AI 味規則：

- 宣傳腔：賦能、閉環、顛覆、天花板、神器、乾貨滿滿、狠狠、絕絕子、沉浸式、種草無數、全網瘋傳、yyds。
- AI 過渡：值得注意的是、不可否認、毋庸置疑、眾所周知、總而言之、綜上所述、首先讓我們、讓我們一起、隨著時代、在當今、不得不說。
- 浮誇：徹底改變、革命性、前所未有、史無前例、顛覆性、極致體驗、完美解決。
- AI 句式：「不是 X，而是 Y」、解鎖／之旅／重新定義、首先…其次、句長太均勻。
- 簡體殘留：`发复尽几钟历` 等幾乎不會在繁體出現的字，只提醒不自動轉。
- 純英文：提示「此工具針對中文草稿；英文版敬請期待」。
- 最多 8 條；只針對文字風格，不代表事實／療效／法律審查。

### 6.6 Prompt 面板

- `<details>` 收合，標題「改寫規則與 Prompt」。
- **可見性：只有 `canAccessSettings(systemUser.role)` 為 true 的角色看到**（`management`／`system_dev`／`admin` 等）；`staff`、`chief_editor` 及其餘角色看不到。其餘兩張主卡（香港書面語版、社群口語版）所有人可見。
- 可見文案保持通用，不提及 B100／Beauty100；來源只保留在開發註解與本文件。
- 註明來源：`D:\Project\B100-Manager\src\lib\content.ts:618-627` 的 `DEFAULT_PROMPTS`。
- 顯示系統 prompt；可複製純 prompt 或 prompt＋原文。
- 文案說明：本工具用同一套規則在瀏覽器即時處理；要更自然的全文改寫，可貼到 ChatGPT／Gemini。

### 6.7 工具切換與英文商務版

- 頂部 segmented：`港式語氣改寫器`（啟用）／`英文商務語氣改寫器`（`aria-disabled`，點了 toast「敬請期待」；**不加 badge**）。
- toast「敬請期待」使用 `fit-content` 寬度（`maxWidth: calc(100vw - 2rem)`），不再固定 356px；只影響這一個 toast，不改全域 Toaster。
- 英文版只需在 `ToneRewriteTool` 加一個可選 tab，換成對應 panel；路由與側欄不用再改。

## 7. 規則引擎規格

### 7.1 對外 API

```ts
export const HK_REWRITE_MAX_INPUT = 20_000;

export interface HkMark {
  start: number; end: number; text: string;
  kind: 'shape' | 'written' | 'colloquial';
  ruleId: string; title: string;
}
export interface HkReplacement {
  ruleId: string; from: string; written: string; colloquial?: string;
  category: HkTermCategory; count: number; contexts: string[];
}
export interface HkSocialVariant {
  platform: SocialPlatform; label: string; text: string; marks: HkMark[];
  charCount: number; limit: number; hashtags: string[]; truncated: boolean;
}
export interface HkRewriteResult {
  input: string; platforms: SocialPlatform[]; inputTruncated: boolean;
  writtenText: string; writtenMarks: HkMark[];
  replacements: HkReplacement[];
  social: HkSocialVariant[];
  colloquialCount: number;
  issues: string[];
  stats: { chars: number; replacements: number; reviewedTarget: number };
}

export function rewriteHkDraft(
  input: string,
  options?: { platforms?: SocialPlatform[] },
): HkRewriteResult;

export function buildHkRewritePrompt(input: string, platform?: SocialPlatform): string;
```

### 7.2 處理順序

1. **截斷**：超過 `HK_REWRITE_MAX_INPUT` 截斷並標記 `inputTruncated`。
2. **正規化**：統一換行、去行尾空白、連續空行收成一個、去掉中文字之間多餘空格、中文標點前後空格、相鄰中文的 ASCII 標點改全形（`,`／`;`／`:`／`?`／`!`／`()`）；URL、email、`#hashtag`、`@mention` 區段跳過。句子切分時 URL／email 會用佔位符保護，避免被 `?`／`:` 切斷。
3. **一次過套用書面語規則**：把 shape（單字簡→繁）、vocab、formalize、protect 合併成 longest-first 的 regex alternation；單次掃描、輸出與標記一次完成；替換結果不再重掃（避免連鎖誤換）。
4. **語氣檢查**：`lintHkCopy(writtenText)`＋簡體殘留提示＋純英文提示；最多 8 條。
5. **組口語版**：以書面語版為底，按平台規則組 hook／title／內文／CTA／bullet，再套一次 `HK_COLLOQUIAL_RULES`（含 protect）。
6. **長度與截斷**：先扣 hashtag 長度再截內文，截斷處加 `…`，同步丟棄超範圍標記；最後 append hashtag。
7. **統計**：字數、替換總次數、`colloquialCount`（口語版去重後的規則數）。

### 7.3 規則型別

```
HkTermCategory = '簡體字' | '內地用語' | '台灣用語' | '粵語口語' | '港式用詞'
HkTermRule {
  id, from: string[], written, colloquial?, category, note?, protect?
}
```

- `protect: true` 是 no-op 保護詞：命中後只消耗字元，不輸出標記、不進替換表；用來阻止短字規則拆字（關係、目的、的士、存在、了解、剎那……）。
- `from` 可放多個變體；引擎會再用簡→繁表反向生成簡體變體，令「质量」也能命中「質量→質素」。

### 7.4 詞表規模（v1.0 實際）

| 類別 | 數量 | 例子 |
|---|---|---|
| 簡→繁單字 | 約 300 | 質、語、氣、網、頁、設、計、營、銷、視、頻、軟、數、據、優…… |
| 香港書面語用詞 | 約 90 | 質量→質素、信息→資訊、視頻→影片、空調→冷氣機、自行車→單車、出租車→的士、行動電話→手機、行銷→營銷、諮詢→諮詢、回复→回覆…… |
| 粵語口語→書面語 | 約 130 | 嘅→的、哋→們、喺→在、咗→了、冇→沒有、睇→看、佢→他、咩→什麼、唔係→不是、點解→為什麼…… |
| 書面語→粵語口語 | 約 160 | 的→嘅、是→係、們→哋、了→咗、沒有→冇、什麼→咩、但是→但係、我們→我哋、很→好…… |
| 保護詞 | 約 50 | 關係、係數、目的、的士、存在、了解、其他、剎那、質量守恆…… |
| 平台 | 3 | IG／FB／小紅書 |
| 主題 hashtag | 10 | 美容、餐廳、旅遊、健身、穿搭、樓市、科技、親子、寵物、咖啡 |

> 詞表是種子版本，每條有 `id` 與 `note`，可獨立增刪；不需要改引擎。

### 7.5 變體與衝突

- 由 `SIMPLIFIED_TO_TRADITIONAL` 建反向表，為多字詞規則自動加簡體變體。
- 一繁對多簡（歧義）不自動生成；由 `from` 明確列出（头发、后面、里面、发展、干净……）。
- 變體衝突以「保護詞優先、先定義者優先」處理；正常應為 0 衝突，測試會斷言 `HK_RULE_CONFLICTS` 為空。

### 7.6 簡體字策略

- 只自動轉換**無歧義**單字；`发／后／里／干／台／面／只／云／松／制／钟／历／系／复／尽／几／卷／布／征／志／采／托／谷／周／游／划／着` 不進單字表。
- 歧義字用多字詞規則處理：頭髮、後面、裡面、發展、乾淨、麵條、一隻、雲端……
- 仍有殘留時，語氣提醒會列出 `发复尽几钟历` 等字，請人手確認；不亂轉。

## 8. Prompt 規格

### 8.1 來源

`D:\Project\B100-Manager\src\lib\content.ts:618-627`：

- `prompt_beauty100`：痛點疑問式標題、60–100 字摘要答案先行、H2、5 點清單、短段落、不虛構療效／名人療程／醫學聲稱、講明邊類人啱試／要停／防曬。
- `prompt_instagram`：首行鉤子一句講完痛點、hashtag 5–12、結尾一條問題。
- `prompt_facebook`：資訊性、講清楚邊類人啱睇、hashtag 0–3。
- `prompt_threads`：口語短文、結尾問題（本工具暫不輸出 Threads）。

### 8.2 通用化改動

- 移除 Beauty100 品牌名，改成香港市場通用文案編輯。
- 保留痛點標題、摘要、短段落、5 點清單、hashtag 數、結尾問題、不虛構療效。
- 新增小紅書格式：標題 ≤20 字、分點、hashtag 6–10。
- 保留 JSON 輸出契約，方便日後接 AI：

```json
{
  "written": "香港書面語版全文",
  "social": {
    "instagram": "IG 口語版（含 hashtag）",
    "facebook": "FB 口語版（含 hashtag）",
    "xiaohongshu": "小紅書口語版（含 hashtag）"
  },
  "replacements": [
    { "from": "原詞", "to": "港式寫法", "category": "內地用語／台灣用語／粵語口語／港式用詞" }
  ]
}
```

## 9. 檔案與資料流

### 9.1 新增檔案

| 路徑 | 作用 |
|---|---|
| `src/lib/hkCantoneseRules.ts` | 詞表、簡→繁表、平台規則、主題 hashtag |
| `src/lib/hkCantonesePrompts.ts` | B100 改寫 prompt、`buildHkRewritePrompt` |
| `src/lib/hkCantoneseRewrite.ts` | 純函式引擎、型別、`rewriteHkDraft` |
| `src/components/tools-center/tone-rewrite/ToneRewriteTool.tsx` | 工具切換器 |
| `src/components/tools-center/tone-rewrite/hk/HkRewritePanel.tsx` | 主頁面與狀態 |
| `src/components/tools-center/tone-rewrite/hk/HighlightedText.tsx` | 標記渲染與圖例 |
| `src/components/tools-center/tone-rewrite/hk/ReplacementTable.tsx` | 替換表與核對 |
| `src/components/tools-center/tone-rewrite/hk/SocialPreview.tsx` | 三平台分頁 |
| `src/components/tools-center/tone-rewrite/hk/RewriteRulesPanel.tsx` | Prompt 收合面板 |
| `src/components/tools-center/tone-rewrite/hk/CopyButton.tsx` | 剪貼簿與 toast |
| `scripts/run-hk-rewrite-test.ts` | Node 自測 |

### 9.2 修改檔案（最小插入）

| 路徑 | 變更 |
|---|---|
| `src/context/AppContext.tsx` | `tools-center.subMenus` 在 `ai-caption` 後插入 `{ id: 'tone-rewrite', label: '語氣校對改寫器' }` |
| `src/components/tools-center/ToolsCenterModule.tsx` | import `ToneRewriteTool`；`getTitle()` 與 `renderContent()` 各加一個 `tone-rewrite` case |

### 9.3 資料流

```
Textarea → rewriteHkDraft(input, platforms)
        → { writtenText, writtenMarks, replacements, social[], issues[] }
        → 渲染／複製
```

- 全程同步、無 fetch、無 localStorage。
- 不上傳草稿、不呼叫 Supabase、不寫任何資料。

## 10. 非功能需求

| 項目 | 要求 |
|---|---|
| 隱私 | 草稿只存在瀏覽器記憶體；UI 明示「草稿不會上傳」 |
| 效能 | 20,000 字內同步處理；5,000 字 < 200ms |
| 可用性 | 空白／無替換／超長／純英文／簡體／粵語草稿都有提示，不白屏 |
| 可及性 | 平台 chip `aria-pressed`、複製按鈕 `aria-label`、表格 `<caption className="sr-only">`、Textarea `aria-label` |
| 響應式 | 手機單欄；桌面 `xl:grid-cols-2` |
| 設計語言 | 白卡、teal `#0D9488`、深色字 `#0d1a2d`、`shadow-[0_2px_6px_rgba(0,20,40,0.05)]`、lucide 圖示 |
| 依賴 | 不新增 npm 套件 |
| 資料庫 | 零變更 |

## 11. 邊界情況

| 情況 | 處理 |
|---|---|
| 空白／只有空格 | 按鈕 disabled；函式回傳空結果不拋錯 |
| 沒有命中任何規則 | 顯示「未發現非港式詞彙」；仍輸出兩個版本 |
| 只有簡體字轉換 | 顯示「簡體字已轉繁體，未發現其他非港式詞彙」 |
| 簡體原文 | 單字表＋多字詞變體命中；替換表顯示原文寫法 |
| 歧義簡體字 | 不自動轉；列表提醒人手確認 |
| 粵語口語原文 | formalize 規則轉書面語；保護詞不被拆字 |
| 超長（>20,000 字） | UI `maxLength` 先擋；引擎另截斷並標記 |
| 純英文 | 不套中文規則，顯示英文版敬請期待提示 |
| 平台未選 | 按鈕 disabled；嘗試取消最後一個平台會 toast |
| 平台超限 | 按 UTF-16 長度保守截短、加 `…`、顯示提示 |
| 剪貼簿被封 | toast 指示手動選取 |
| 規則重疊 | longest-first、單次掃描；protect 阻止短字誤配 |
| 改完原文再複製 | stale 提示＋停用複製，避免貼錯版本 |
| 與內容自動化工作流並存 | 只做最小插入；不碰 `content/**`、`content*.ts`、`content-*` functions、`20261126*` migrations |

## 12. 測試與驗收

### 12.1 自動測試

`node scripts/run-hk-rewrite-test.ts`，覆蓋：

1. 空白輸入。
2. 簡體＋用詞（质量→質素、空调→冷氣機）。
3. 最長匹配（出租車→的士、自行車→單車、滑鼠不變）。
4. 保護詞（關係、目的、的士、剎那、質量守恆）。
5. 標記位置與文字一致。
6. 粵語→書面語、再→口語（我哋、冇咩、但係）。
7. 平台約束（IG 5–12、FB ≤3、小紅書 6–10、無 `{}`）。
8. 平台超長截斷。
9. 語氣檢查與乾淨文字。
10. Prompt 含痛點／口語／hashtag／小紅書／香港，且不含 B100。
11. 規則 id 唯一、`HK_RULE_CONFLICTS` 為空。
12. 靜態導覽（tone-rewrite 在 ai-caption 後、prompt-library 前）。
13. 超長輸入標記。
14. 書面語版 idempotent。
15. 常見內地商業用語＋歧義簡體字。
16. 粵語↔書面語往返。
17. 純英文提示。
18. 中文標點與空格正規化（URL 內逗號不改）。
19. 粵語禮貌語↔書面語（唔好意思、多謝、搭車、飲咖啡）。
20. 連結／email 不會被句子切斷或截斷。
21. Prompt 卡權限：`management`／`system_dev`／`admin` 可見；`staff`／`chief_editor` 不可見。

### 12.2 驗證指令

```powershell
cd D:\Project\MPS
node scripts/run-hk-rewrite-test.ts
node .\node_modules\typescript\bin\tsc --noEmit 2>&1 | Select-String "hkCantonese|tone-rewrite|ToneRewrite|run-hk-rewrite"
node .\node_modules\vite\bin\vite.js build
```

- `tsc` 全專案有既有錯誤（營銷、財務、Readdy 等），只要求**新檔案零錯誤**（上面的 `Select-String` 應無輸出）。
- 若另一條內容自動化工作流仍在施工、缺少 `content/social/*` 模組（例如 `LibraryView`），全量 `vite build` 會被那些**既有未完成檔案**擋住；本次另用「只 stub 外部 `ContentAutomationCenter`」的隔離 build 驗證本功能，結果 `ISOLATED BUILD OK`。
- 手動驗證（可選）：`node ./node_modules/vite/bin/vite.js`，開 `http://localhost:5173/#tools-center/tone-rewrite`。
- **以上指令全部不連資料庫、不改任何資料。**

### 12.3 驗收清單

- [x] 側欄位置正確、路由可開、不白屏。
- [x] 示例可產生兩個版本與三個平台分頁。
- [x] 替換表有 `质量→質素`、`空调→冷氣機`、`自行车→單車`。
- [x] 標記、複製、已核對、篩選、全部標記可用。
- [x] Prompt 面板可複製。
- [x] 新測試全過、新檔案 tsc 零錯、隔離 production build 成功；全量 build 現況受另一條工作流缺少 `content/social/*` 影響（非本功能檔案）。
- [x] 整份 diff 沒有 `.sql`、migration、RLS、cron、Supabase client 變更。

## 13. 風險與緩解

| 風險 | 影響 | 緩解 |
|---|---|---|
| 詞表未收錄某些非港式詞 | 漏改 | 高亮＋清單讓人手核對；詞表可獨立增刪；先覆蓋常見商業／生活／社群詞 |
| 短字規則誤配（的／是／了／在／他） | 句子被改壞 | protect 規則＋長詞優先；只對安全的單字做轉換；測試鎖行為 |
| 簡→繁歧義 | 錯字 | 只轉無歧義字；歧義字用多詞規則；殘留只提醒不亂轉 |
| 口語版過度口語 | 品牌語氣不合 | 平台 CTA／hashtag 固定；口語轉換保守；可複製 prompt 用外部 AI 重寫 |
| 與內容自動化工作流衝突 | 合併衝突／整頁載入失敗 | 只改兩個共用檔的最小插入；不碰對方檔案；施工時注意對方未完成狀態 |
| 免費 Gemini 額度／模型遷移 | 若日後接 AI 會受影響 | v1.0 不依賴 Gemini；未來另加 function 並保留本地 fallback |

## 14. 發佈與回滾

- **本次只做本地 MVP，不部署、不推送線上。**
- 發佈（待批准）：純前端，隨 MPS 一般部署；無 migration、無 function deploy、無 secret。
- 回滾：revert 前端 commit（移除側欄項與 `tone-rewrite` 元件）即可；資料不受影響。
- 不需要「用一條新 migration 恢復」，因為沒有 migration。

## 15. 後續（非 v1.0）

| 優先 | 項目 | 說明 |
|---|---|---|
| P1 | 英文商務語氣改寫器 | 在 `ToneRewriteTool` 加 tab；獨立 panel 與詞表 |
| P2 | AI 深化模式 | 確認 `GEMINI_API_KEY` 所屬專案 RPD 足夠後，新增 `tone-rewrite` Edge Function，回傳同一 `HkRewriteResult`；本地規則保留 fallback |
| P3 | 自訂品牌詞表 | 讓每個品牌加入禁用詞／偏好詞；需要資料表或 localStorage（另立 PRD） |
| P4 | 歷史紀錄 | 需要資料表與 RLS；另立 PRD，不在本插件偷偷加 |

## 16. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| v1.0 | 2026-11-25 | 初版；港式語氣改寫器已實作並通過驗證 |
| v1.1 | 2026-11-26 | 移除未輸入時的空白狀態卡（圖1）；Prompt 介紹改為通用文案，不再提及 B100／Beauty100 |
| v1.2 | 2026-11-26 | 英文商務版入口 badge 由「第二批」改為「敬請期待」；移除 UI 與純英文提示中的「第二批」字樣 |
| v1.3 | 2026-11-26 | 移除英文入口的「敬請期待」藥丸；toast 只保留「敬請期待」 |
| v1.4 | 2026-11-26 | 「敬請期待」toast 改為 `fit-content` 自適應寬度，不再固定 356px |
