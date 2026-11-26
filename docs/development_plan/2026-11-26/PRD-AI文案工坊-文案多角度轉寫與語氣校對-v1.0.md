# PRD（計劃書）｜AI文案工坊 — 文案多角度轉寫 × 語氣校對

| 項目 | 內容 |
|---|---|
| 版本 | v1.4 |
| 日期 | 2026-11-26 |
| 狀態 | **已實作、已部署 `ad-creative-writer`（最新 version 9，provider 已回退原設定）；真實生成待 Grok 充值；未 commit／未 push** |
| 落點 | 工具中心 → AI文案工坊（`#tools-center/tone-rewrite`；側欄位於 ALT Pilot 前） |
| 專案根目錄 | `D:\Project\MPS` |
| 對應執行清單 | `D:\Project\MPS\docs\development_plan\2026-11-26\執行清單-AI文案工坊-文案多角度轉寫與語氣校對-v1.0.md` |
| 資料庫影響 | **無**：0 migration、0 SQL、0 RLS、0 cron |
| 新依賴 | **無**（CSV 用 Blob 下載，不新增 npm 套件） |
| 執行邊界 | **本地 MVP ＋ function 已部署**；未 commit／未 push；**未執行** `secrets set`／`db push` |

> 本文件覆蓋「AI文案工坊」整個插件：文案多角度轉寫（新增）＋語氣校對改寫（沿用）。
> 語氣工具的原始 PRD 在 `docs/development_plan/2026-11-25/PRD-語氣校對改寫器-港式-v1.0.md`；本文件不覆蓋英文商務語氣改寫器。

---

## 1. 背景與問題

MPS 工具中心原本的「語氣校對改寫器」只解決文字層：把內地稿、台灣稿、粵語稿改成香港書面語／社群口語。實際投廣告時還有一層重複工作：

- 同一個產品／活動，換一個切角（痛點、省時、限時優惠、專業背書）就要重寫一次標題、主文與 CTA。
- 每次都要同時準備 A/B 版本，還要逐條檢查 Meta、Google RSA、小紅書的字數限制。
- 現有工具中心沒有文案多角度轉寫／A/B 矩陣模組；`crosspost-writer` 只做跨平台一稿多發，不回傳多切角矩陣。

因此本次把「文案多角度轉寫」與「語氣校對改寫」收進同一個插件入口，做成兩個子功能，並沿用「社媒自動化營運 → 社媒營運／網站內容自動化」的雙區切換體驗。

---

## 2. 目標與成功標準

**目標**：在 `工具中心 → AI文案工坊` 內提供兩個子功能：

1. **文案多角度轉寫**：輸入產品賣點、優惠條件、投放目標，由 AI 產出 3–5 個切角；每個切角有 A/B 兩版完整文案與 3 個 CTA；可控制長度、改字、複製、匯出 CSV。
2. **語氣校對改寫**：沿用現有港式改寫器，不改行為。

| # | 標準 | 驗證方式 | 實際結果 |
|---|---|---|---|
| S1 | 側欄與頁面標題顯示「AI文案工坊」，側欄位於 ALT Pilot 前；路由仍為 `#tools-center/tone-rewrite`，不白屏 | 靜態測試＋手動開頁 | 靜態測試通過；路由未改、順序已改 |
| S2 | 頁面有「文案多角度轉寫／語氣校對改寫」兩個 tab（前者在前、預設選中）；按鈕寬度貼合文字，無固定隱形數字槽位 | SSR＋CSS 靜態檢查 | SSR 通過；`FeatureTabs` `w-fit`、badge 條件渲染 |
| S3 | 社媒自動化的「社媒營運／網站內容自動化」改用同一個 `FeatureTabs`，active／inactive／badge 視覺不回歸 | SSR＋手動 | 靜態＋SSR 通過；未做瀏覽器手動 |
| S4 | 語氣子功能行為不變；既有 21 組 HK 測試全過（只更新 1 個靜態斷言） | `node scripts/run-hk-rewrite-test.ts` | `hk cantonese rewrite: ok` |
| S5 | 文案多角度轉寫表單必填驗證；3–5 個切角；每個切角 A/B 完整文案＋3 CTA；A/B 只差開頭鉤子 | 契約測試＋部署後實測 | 契約測試通過；目前生成待 Grok 充值（provider 已回退） |
| S6 | 標題／主文／CTA 不超過所選上限；可逐格改字；CSV 用改後內容 | 單元測試＋UI | 契約測試＋SSR 通過；UI 已實作 |
| S7 | 服務未部署／未設 key／額度／逾時／格式錯誤都有明確畫面，**不生成假文案** | UI 狀態測試＋靜態 | UI 已實作；錯誤路徑以 banner 呈現，並顯示 server detail |
| S8 | 零 DB／migration、零新 npm 依賴；新檔案 tsc 零錯；production build 通過 | 指令驗證 | 全部通過 |
| S9 | 部署後以真實 brief 生成 3–5 切角，A/B、長度正確；CSV 待瀏覽器手動 | 部署後 smoke＋瀏覽器 | **目前未通過**：依指示回退 provider；Grok 欠費、Gemini 2.5 已停用，需充值或另行批准改 provider |

---

## 3. 範圍

### 3.1 本次包含

- 插件顯示名稱改為「AI文案工坊」，側欄移到 ALT Pilot 前；兩個子功能 tab（文案多角度轉寫在前、預設選中）；兩面板保持 mounted，切換不丢輸入。
- 共用 `FeatureTabs`：新工具＋社媒自動化都使用；寬度貼字、可橫向捲動、badge 只在有值時出現。
- 新文案多角度轉寫面板：完整表單、AI 生成、A/B 卡片、矩陣表、逐格編輯、複製、CSV。
- 新 Edge Function `ad-creative-writer`：Grok／Gemini、JSON 契約、重試、錯誤碼。
- 共用純函式層 `adCreative.ts`：型別、切角庫、平台限制、prompt、解析、修剪、警告、CSV rows。
- 契約測試／靜態測試／SSR smoke；PRD 與執行清單。
- `config.toml` 加入 function entry。

### 3.2 本次不包含

- 本地規則生成 fallback、離線生成。
- 英文商務語氣改寫器（維持「敬請期待」）。
- 資料庫、歷史紀錄、RLS、cron。
- 廣告平台批量上傳格式（Google Ads Editor／Meta Bulk）、圖片創意、排程、自動投放。
- 修改 `crosspost-writer` 或內容自動化模組。
- 自動翻譯、多語系、品牌詞表、成效預測。

---

## 4. 五個關鍵決策

| ID | 決策 | 理由 | 代價 |
|---|---|---|---|
| D1 | 插件名 **AI文案工坊**；路由 id 保留 `tone-rewrite` | 顯示名稱符合兩個子功能；舊連結、側欄測試不用改 | URL 仍叫 tone-rewrite，對工程師略有落差 |
| D2 | **只做 AI**：新增 `ad-creative-writer`，不做本地模板 fallback | 文案自然度優先；沿用既有 Grok／Gemini secrets | 未部署／未設 key 時工具不可用，需要清楚的 missing 畫面 |
| D3 | 每個切角 **A/B 兩版完整文案＋3 CTA**；A/B 只改開頭鉤子 | 符合單一變數測試；矩陣是「切角 × A/B」 | AI 要嚴格遵守 A/B 規則，parser 要驗證 |
| D4 | 平台預設＋自訂上限；可逐格改字；CSV | 實際投放要跟平台限制；改字與匯出是日常 | 多一層 edits 狀態與 stale 判斷 |
| D5 | 兩組切換器都改用共用 **`FeatureTabs`** | 一次解決「寬度跟文字自適應」與兩處樣式不一致 | 動到 `ContentZoneTabs`，需回歸社媒畫面 |

---

## 5. 資訊架構

```
#tools-center/tone-rewrite
└─ ToolsCenterModule（h1 AI文案工坊 + 副標）
   └─ CopyStudioTool
      ├─ FeatureTabs
      │  ├─ 文案多角度轉寫（Megaphone）
      │  └─ 語氣校對改寫（Languages）
      ├─ ad panel（mounted；inactive hidden；預設顯示）
      │  └─ AdCreativePanel
      │     ├─ AdServiceBanner
      │     ├─ AdBriefForm
      │     ├─ AdErrorBanner
      │     ├─ AdAngleCard × 3–5
      │     ├─ AdMatrixTable
      │     └─ 隱私／免責提示
      └─ tone panel（mounted；inactive hidden）
         └─ ToneRewriteTool（既有港式／英文商務切換 + HkRewritePanel）
```

- 兩個 panel 都用 `hidden` 屬性切換，**不 unmount**，所以切 tab 不會清空表單、結果或已改字內容。
- tab 狀態只存在 component state；重新整理後回到「文案多角度轉寫」tab（不做 URL tab、不做 localStorage）。
- 文案多角度轉寫 panel 預設顯示，首次進入即探測生成服務。

---

## 6. 共用切換元件 `FeatureTabs`

### 6.1 API

```ts
interface FeatureTabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  badge?: number;       // >0 才顯示
  dot?: boolean;        // 社媒分區的小圓點
  title?: string;
}

interface FeatureTabsProps<T extends string> {
  items: ReadonlyArray<FeatureTabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}
```

### 6.2 寬度規則

- 外框：`inline-flex w-fit max-w-full flex-nowrap items-center gap-1 overflow-x-auto ... p-1`。
- 按鈕：`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-[13px] font-semibold`。
- **移除** 原本 `ContentZoneTabs` 的固定 `h-5 w-6 invisible` 數字槽位；badge 只在 `badge > 0` 時渲染，使用 `min-w-[18px] px-1.5 tabular-nums`。
- 接受 count 由 0→1 時按鈕有一次性輕微位移；換來的是「文字多寬、按鈕多寬」。
- 手機：外框 `max-w-full overflow-x-auto`，按鈕不換行；不撐滿父層。
- active：深藍 `#0d1a2d` 底＋白字；icon active 用 teal-300；inactive slate-500 hover slate-50。

### 6.3 `ContentZoneTabs` 重構

- 公開 props 不變（`zone`、`onChange`、`counts`、`className`）。
- 內部改為 `<FeatureTabs>`，把 `ZONE_LABEL`／`ZONE_DESCRIPTION`／`counts` 映射成 items。
- 保留 `role="tablist"`、`role="tab"`、`aria-selected`、`title`。
- 視覺與 badge 顏色沿用：active badge `bg-white/15 text-white`、inactive `bg-amber-50 text-amber-700`。

### 6.4 語氣子功能內的港式／英文商務切換

- 維持原樣（已經是 auto width、teal active）；本次不改顏色與行為。
- 英文商務仍是 `aria-disabled`＋toast「敬請期待」；保留既有 `fit-content` toast。

---

## 7. 語氣子功能（沿用）

- 直接使用現有 `ToneRewriteTool` 與 `hk/*` 元件；不改規則引擎、不改 Prompt 權限、不改文案。
- 唯一變動：`CopyButton` 移到 `tools-center/shared/CopyButton.tsx`，HK 子功能改 import 路徑；舊路徑保留相容 re-export。
- 既有 HK 測試只更新 **1 個靜態斷言**：`ToolsCenterModule` 改為 render `CopyStudioTool`（語氣子元件仍存在、其餘測試不動）。

---

## 8. 文案多角度轉寫子功能

### 8.1 使用者流程

```
① 工具中心 → AI文案工坊 → 文案多角度轉寫
② 填產品／服務名稱、賣點、優惠條件、投放目標
③ 選平台（Meta／Google RSA／小紅書）與 3–5 個切角
④ 按「生成文案矩陣」（Ctrl／Cmd + Enter）
⑤ AI 回傳 3–5 個切角；每個切角顯示 A/B 兩版＋3 個 CTA
⑥ 可直接改字、看字數、複製單條／整組／全部
⑦ 查看矩陣表；匯出 CSV
```

### 8.2 輸入欄位

| 欄位 | 必填 | 上限 | 預設／說明 |
|---|---|---|---|
| 產品／服務名稱 | 是 | 80 字 | 原樣保留，不讓 AI 改写 |
| 主要賣點 | 是 | 600 字 | textarea；按換行／`；`／`。` 拆成 1–6 點，去重 |
| 優惠條件 | 否 | 200 字 | 價格、折扣、期限、名額；沒有就不生成優惠切角 |
| 投放目標 | 是 | enum | `轉換購買`／`名單查詢`／`網站流量`／`品牌曝光`；預設轉換購買 |
| 目標受眾 | 否 | 120 字 | 例：25–45 歲香港在職女性 |
| 投放平台 | 是 | enum | `Meta（FB／IG）`／`Google RSA`／`小紅書`；預設 Meta |
| 語氣 | 否 | enum | `專業可信`／`親切溫暖`／`急迫促銷`／`高級簡約`；預設專業可信 |
| 切角 | 是 | 3–5 個 | 由 6 個切角庫勾選；預設 4 個 |
| 標題上限 | 是 | 8–80 | 平台預設；可勾「自訂上限」 |
| 主文上限 | 是 | 40–2000 | 平台預設；可勾「自訂上限」 |
| CTA 上限 | 是 | 4–30 | 預設 12；可勾「自訂上限」 |

- 表單分兩張卡：「產品與優惠」＋「投放設定」。
- 快捷：載入示例、清空、Ctrl／Cmd+Enter。
- 隱私提示：`生成會把產品資料送到 AI 供應商（Grok／Gemini）；請勿輸入客戶個資、未公開報價或機密。本工具不寫入資料庫。`

### 8.3 切角庫（6 選 3–5）

| id | 標籤 | 適用時機 | 必要資料 |
|---|---|---|---|
| `pain` | 痛點切入 | 受眾有明確困擾／顧慮 | 賣點 |
| `time` | 省時效率 | 流程、時間、步驟可量化 | 賣點（有數字更好） |
| `offer` | 限時優惠 | 有價格、折扣、期限、名額 | 優惠條件（沒有就停用） |
| `proof` | 專業背書 | 有年資、認證、客戶數、獎項 | 相關資料；**不得編造** |
| `social` | 口碑見證 | 有評價、推薦、案例 | 相關資料；**不得編造** |
| `contrast` | 對比煥新 | 舊方法 vs 新方法 | 賣點；不貶低對手 |

- 預設選 `pain`、`time`、`proof`、`social`（沒有優惠時）；有優惠時可加 `offer`。
- 少於 3 個不能生成；多於 5 個 blocked＋toast「最多 5 個切角」。
- 切角 chip 有 `title` 說明；`offer` 在沒有優惠時 disabled，tooltip「先填優惠條件」。
- `proof`／`social` 保持可選，但提示「只會用你提供的資料，不會編造數字」。

### 8.4 平台預設與長度

| 平台 | 標題上限 | 主文上限 | CTA 上限 | 備註 |
|---|---|---|---|---|
| Meta（FB／IG） | 40 | 125 | 12 | 主文超過 125 字會被「查看更多」截斷 |
| Google RSA | 30 | 90 | 12 | RSA 標題 30／說明 90 字元 |
| 小紅書 | 20 | 1000 | 12 | 標題 20 字內 |

- 切換平台會重設為該平台預設，並關閉「自訂上限」。
- 勾「自訂上限」後可改三個數字；高於平台建議時顯示 amber 提示「自訂上限高於平台建議，實際投放可能被截斷」。
- 數字以 **code point** 計（中文、emoji 都算 1）。

### 8.5 生成結果

- 結果 header：`已生成 4 個切角 · 8 組 A/B 文案 · Meta（FB／IG） · Grok · 12.4 秒`。
- 每個切角一張卡：
  - 標題列：切角 label＋`why`（為何用這個切角）＋`測試變數` pill。
  - 內容：左右兩欄 `A 版`／`B 版`；每版有「鉤子類型」、短標題、主文、CTA。
  - 每欄位右側有字數 `12 / 40 字`；超標轉 rose。
  - 每欄位可編輯（input／textarea）；有改動顯示「已改」與「還原」。
  - 底部「CTA 變體」3 個 chip，可逐個複製。
  - 卡片右上「複製整個切角」。
- 矩陣表：
  - 欄位：切角／版本／短標題／主文／CTA／字數／測試變數／操作。
  - 主文 cell `line-clamp-2`＋`title` 顯示全文；表格可橫向捲動、sticky header。
  - 每列「複製」；表頭「複製整張矩陣」（TSV）／「匯出 CSV」。
- 空狀態：不顯示假文案；顯示「尚未生成」與三個提示。
- 生成中：skeleton 卡片＋`AI 正在寫 4 個切角…通常 15–40 秒`＋「取消」（AbortController）。
- 重新生成：保留上一次結果直到新結果回來；成功後清空改字與 warnings。
- stale：brief 改動後顯示 `設定已改，請重新生成；目前結果仍可查看，但不能複製／匯出`；複製／CSV disabled。

### 8.6 編輯、複製、CSV

- 改字 key：`${angleId}:${A|B}:${headline|body|cta}`；存 `Record<string,string>`。
- 新結果／重新生成時清空 edits；「全部還原」清除所有 edits。
- 複製：
  - 單欄位：只複製該欄位文字。
  - 整組：`【切角・A 版】標題… / 主文… / CTA…` 的可讀格式。
  - 全部：所有切角可讀文字 block（含產品、平台、目標、生成資訊）。
  - 矩陣 TSV：給試算表貼上；cell 內換行以空格取代。
- CSV：
  - UTF-8 BOM、CRLF；標題列為繁體中文。
  - 每列 = 切角 × A/B；欄位：`切角,切角說明,測試變數,版本,鉤子類型,短標題,主文,CTA,CTA 變體,標題字數,主文字數,平台,標題上限,主文上限,生成時間`。
  - 正確 quote（逗號／引號／換行）；公式注入防護（cell 首字 `= + - @ \t \r` 前加 `'`）。
  - 檔名：`ad-copy-matrix-{產品安全名}-{yyyyMMdd-HHmm}.csv`；產品名移除 `\/:*?"<>|`。
- 全部使用「改後內容」；stale 時 disabled。

### 8.7 服務狀態與錯誤

| 狀態 | 畫面 | 行為 |
|---|---|---|
| `checking` | 小 spinner＋「檢查生成服務…」 | 首次進入文案多角度轉寫 tab 時探測 |
| `missing`（404） | `生成服務尚未部署`＋3 步設定卡 | 生成 button disabled；可重新檢查 |
| `unknown`（網絡／CORS） | amber `未能確認生成服務狀態` | 仍允許嘗試生成 |
| `ready` | 無 banner | 正常 |
| `llm_not_configured`（503） | rose `系統未設定 AI，請聯絡管理員` | 可重試 |
| `rate_limited`（429） | rose `AI 額度暫時用盡，請 60 秒後再試` | 可重試 |
| `timeout`（504） | rose `生成逾時，請重試；可先減少切角數` | 可重試 |
| `bad_json` | rose `AI 回傳格式不符…` | 可重試 |
| `unauthorized`（401） | rose `登入已逾時，請重新整理` | — |
| `network_or_cors` | rose `無法連線到生成服務…` | 可重試 |

- 錯誤 banner 保留上一次成功結果（若有），不清空畫面。
- **任何錯誤都不生成假文案**。

### 8.8 隱私、權限與免責

- 文案多角度轉寫分頁明示資料會送 AI 供應商；不寫 DB、不存 localStorage。
- 所有已登入使用者可用；不套 `canAccessSettings`（語氣 Prompt 卡的既有權限不變）。
- 底部免責：`AI 只會用你提供的資料；數字、評價與療效仍需人手核實，並不保證投放成效。`

---

## 9. AI Edge Function 契約

### 9.1 端點與設定

| 項目 | 內容 |
|---|---|
| 路徑 | `supabase/functions/ad-creative-writer/index.ts` |
| URL | `POST /functions/v1/ad-creative-writer` |
| Auth | `verify_jwt = false`；函式內以 `/auth/v1/user` 驗 session；anon key 放行 dev-bypass（與 `crosspost-writer` 一致） |
| CORS | `OPTIONS` 200；`POST` only；GET 回 405（供探測用） |
| Secrets | 沿用 `XAI_API_KEY`／`GROK_API_KEY`、`GEMINI_API_KEY`；**不新增 secret** |
| Models | `GROK_MODEL` 預設 `grok-4.5`；`GEMINI_MODEL` 預設 `gemini-2.5-flash`（依指示回退原設定） |
| 預算 | 總 110 秒；單次上限 50 秒；retry 上限 25 秒；每 provider 最多 2 次 |
| 寫入 | **零 DB**；只 `console.log` 一筆 generate event |

### 9.2 Request

```json
{
  "brief": {
    "productName": "手工低糖月餅",
    "sellingPoints": "低糖配方\n手工烘焙\n獨立包裝",
    "offer": "9 月 20 日前訂購享 85 折",
    "audience": "25–45 歲香港在職女性",
    "goal": "conversion",
    "platform": "meta",
    "tone": "professional",
    "angleIds": ["pain", "time", "offer", "proof"],
    "limits": { "headline": 40, "body": 125, "cta": 12 },
    "variation": 0
  }
}
```

- `goal`：`conversion`／`lead`／`traffic`／`awareness`。
- `platform`：`meta`／`google`／`redbook`。
- `tone`：`professional`／`friendly`／`urgent`／`premium`。
- `angleIds`：3–5 個；`offer` 不可在沒有 `offer` 時出現。
- `limits`：server 會 clamp 到合法範圍。
- `variation`：每次「重新生成」+1，讓 AI 換句式。

### 9.3 Response

```json
{
  "ok": true,
  "data": {
    "angles": [
      {
        "id": "pain",
        "label": "痛點切入",
        "why": "針對送禮時怕太甜、怕失禮的顧慮。",
        "testVariable": "開頭鉤子：痛點問句（A） vs 結果描述（B）",
        "variants": {
          "A": { "hookType": "痛點問句", "headline": "送禮怕太甜？", "body": "……", "cta": "查看低糖禮盒" },
          "B": { "hookType": "結果描述", "headline": "少糖配方，送禮更安心", "body": "……", "cta": "查看低糖禮盒" }
        },
        "ctaVariants": ["查看低糖禮盒", "立即訂購", "輸入優惠碼"]
      }
    ],
    "provider": "grok",
    "model": "grok-4.20-0309-non-reasoning",
    "latencyMs": 18342,
    "generatedAt": "2026-11-26T08:00:00.000Z",
    "warnings": []
  }
}
```

- 錯誤：`{ "ok": false, "code": "...", "error": "..." }`。
- `code`：`invalid_input`／`unauthorized`／`llm_not_configured`／`rate_limited`／`timeout`／`bad_json`／`llm_unavailable`。

### 9.4 Prompt 規則（`buildAdCreativePrompt`）

1. 角色：香港資深效果廣告文案主管；繁體中文（香港）；只輸出合法 JSON，不要 Markdown 圍欄／解釋。
2. **事實限制**：只可用 brief 提供的資料；不得自行補充數字、客戶名、獎項、認證、療效、推薦人數。
3. 沒有 `offer` 時：不得提優惠、折扣、限時、名額；沒有 proof／social 資料時：不得提年資、客戶數、評價、口碑。
4. 切角：若 `angleIds` 有值，必須且只輸出這些 id、順序一致；否則由 AI 選 3–5 個最適合的。
5. A/B 單一變數：主文核心（賣點、優惠、CTA）相同；只改標題＋開頭 1–2 句；A 用痛點／問句鉤子，B 用結果／數字鉤子（沒有數字時用結果描述）。
6. 每個切角必須有 `why`（≤40 字）、`testVariable`、`variants.A`、`variants.B`、`ctaVariants` 3 個。
7. 長度：標題 ≤ headline limit、主文 ≤ body limit、CTA ≤ cta limit；以 code point 計；標題／CTA 不換行；主文最多 2 段。
8. 平台：Meta 主文 125 字內會被截斷；Google RSA 標題 30／說明 90；小紅書標題 20。
9. 語氣：按 tone 調整用詞；不得貶低對手、不得虚假急迫、不得醫療療效。
10. 輸出 JSON schema 逐字列出；不要加 `hashtags`、`image prompt` 等未要求欄位。

### 9.5 解析、驗證、修剪（`parseAdCreativeResponse`）

- 接受物件或字串；容忍 ```json 圍欄、前後雜訊；抓第一個 `{` 到最後一個 `}`。
- 切角 id 可用 id 或中文 label 對映；未知 id 丟棄；重複 id 去重。
- 少於 3 個有效切角 → 丟 `angles_insufficient`（函式 retry 一次；仍不足則回 `bad_json`）。
- 多於 5 個 → 取前 5 個＋warning。
- 每個 variant 必須有 headline／body／cta；缺 A 或 B → 該切角丟棄；丟到少於 3 個 → error。
- `fitText`：先按 code point 判斷；超標時在句號／問號／驚嘆號／分號處切；再退到逗號／頓號／空格；最後才硬切；加 `…` 且總長不超限；URL／email 視為原子，不切斷。
- CTA：去重、修剪；不足 3 個時用目標對應的通用 CTA 補齊＋warning。
- Warnings：
  - `N 個欄位已按上限縮短`
  - `文案含未在輸入出現的數字：…，請核對`
  - `文案含絕對化／療效字眼：…，請人手核對`
  - `A/B 標題相同，較難判斷測試變數`
  - `A/B 主文差異較大，較像兩版獨立文案`
  - `AI 未回傳指定切角：…`
  - `AI 未提供足夠 CTA，已補上通用選項`
- 不修改 AI 原文語意；只做安全修剪與標記。

### 9.6 供應商與錯誤碼

- Grok 優先（`XAI_API_KEY` 或 `GROK_API_KEY`，預設 `grok-4.5`）；失敗才 Gemini（`gemini-2.5-flash`）。
- 依使用者指示，**不改動主力／fallback**；Grok 欠費與 Gemini 2.5 停用需由帳戶／provider 設定解決。
- 每個 provider 最多 2 次：第一次正常 prompt；第二次針對「不是合法 JSON／切角不足／被截斷」加 correction prompt。
- 429 → `rate_limited`；Abort → `timeout`；JSON／schema → `bad_json`；其他 → `llm_unavailable`。
- 全部 provider 的 429 → 429；全部 timeout → 504；全部 bad_json → 502 `bad_json`；其餘 → 502 `llm_unavailable`。
- 不回傳 partial 假資料；若 3–5 個切角有效但部分指定切角缺，回 200＋warning。

---

## 10. 檔案與資料流

### 10.1 新增檔案

| 路徑 | 作用 |
|---|---|
| `src/lib/adCreative.ts` | 型別、切角庫、平台限制、normalize/validate、prompt、parse/trim、warnings、CSV rows；純 TS |
| `src/lib/adCreativeApi.ts` | 服務探測、`generateAdCreative`、錯誤映射；瀏覽器專用 |
| `src/components/tools-center/FeatureTabs.tsx` | 共用雙區／多區切換 |
| `src/components/tools-center/copy-studio/CopyStudioTool.tsx` | AI文案工坊外殼；兩 tab；面板 hidden 保持 mounted |
| `src/components/tools-center/copy-studio/ad/AdCreativePanel.tsx` | 文案多角度轉寫子功能 orchestrator |
| `src/components/tools-center/copy-studio/ad/AdBriefForm.tsx` | 輸入表單、切角 chip、平台／長度 |
| `src/components/tools-center/copy-studio/ad/AdAngleCard.tsx` | 單切角 A/B 卡、逐格編輯、複製 |
| `src/components/tools-center/copy-studio/ad/AdMatrixTable.tsx` | 矩陣表、列複製、整表複製／CSV |
| `src/components/tools-center/copy-studio/ad/AdServiceBanner.tsx` | 服務狀態／錯誤／設定步驟 |
| `src/components/tools-center/copy-studio/ad/useAdCreative.ts` | probe、generate、edits、stale、cancel |
| `src/components/tools-center/copy-studio/ad/adCopyExport.ts` | CSV 下載 |
| `src/components/tools-center/shared/CopyButton.tsx` | 從 `tone-rewrite/hk` 移出的共用複製按鈕（含 icon-only） |
| `supabase/functions/ad-creative-writer/index.ts` | 新 Edge Function |
| `scripts/run-ad-creative-test.ts` | 純函式＋靜態契約測試 |
| `docs/development_plan/2026-11-26/PRD-AI文案工坊-文案多角度轉寫與語氣校對-v1.0.md` | 本文件 |
| `docs/development_plan/2026-11-26/執行清單-AI文案工坊-文案多角度轉寫與語氣校對-v1.0.md` | 執行清單 |

### 10.2 修改檔案（最小插入）

| 路徑 | 變更 |
|---|---|
| `src/context/AppContext.tsx` | `tone-rewrite` 的 label 改為 `AI文案工坊` |
| `src/components/tools-center/ToolsCenterModule.tsx` | import `CopyStudioTool`；`getTitle` 改標題／副標；`renderContent` 改 render |
| `src/components/tools-center/content/shell/ContentZoneTabs.tsx` | 內部改用 `FeatureTabs`；公開 props 不變 |
| `src/components/tools-center/tone-rewrite/hk/{HkRewritePanel,SocialPreview,RewriteRulesPanel}.tsx` | `CopyButton` import 路徑改為 shared |
| `src/components/tools-center/tone-rewrite/hk/CopyButton.tsx` | 保留相容 re-export |
| `supabase/config.toml` | 加 `[functions.ad-creative-writer] verify_jwt = false` |
| `scripts/run-hk-rewrite-test.ts` | 1 個靜態斷言：`ToneRewriteTool` → `CopyStudioTool` |

- **不改** `package.json`、`src/lib/crosspost.ts`、`supabase/functions/crosspost-writer/**`、`content/**`、任何 migration／SQL。
- 工作區目前有大量未提交修改；施工只碰上面列出的檔案，不 revert 其他人的工作。

### 10.3 資料流

```
AdBriefForm
  → normalizeAdBrief / validateAdBrief（shared）
  → generateAdCreative（client API）
  → POST ad-creative-writer
  → Grok / Gemini（JSON）
  → parseAdCreativeResponse（shared，server 與 client 各一次）
  → AdCreativeResult
  → AdAngleCard / AdMatrixTable / edits
  → copy / TSV / CSV（純前端）
```

- 不呼叫 Supabase DB、不寫任何資料表、不新增 migration。

---

## 11. 非功能需求

| 項目 | 要求 | 實作 |
|---|---|---|
| 隱私 | 廣告資料會送 AI 供應商，UI 明示；不寫 DB／localStorage | 表單底部 privacy 提示；hook 不存 storage |
| 效能 | 表單即時驗證；生成顯示進度與可取消；110 秒總預算 | AbortController、generating card、provider deadline |
| 可用性 | 未部署／未設 key／額度／逾時／格式錯誤都有明確下一步，不白屏、不假文案 | 服務 banner、錯誤 banner、錯誤碼映射 |
| 可及性 | tab `role="tablist"`／`aria-selected`；按鈕 `aria-label`；表單 label；表格 caption | 已加；未做完整鍵盤箭頭導航 |
| 響應式 | 手機單欄；A/B 卡在 `lg` 兩欄；矩陣表橫向捲動；tab 不撐滿 | `grid-cols-1 lg:grid-cols-2`、`overflow-x-auto` |
| 設計語言 | 白卡、teal `#0D9488`、深藍 `#0d1a2d`、**生成界面卡片不使用外發光**、lucide、sonner | 已移除生成卡片的 `shadow-[...]` |
| 依賴 | 不新增 npm 套件 | 未改 package.json |
| 資料庫 | 零變更 | 無 migration／SQL |

---

## 12. 邊界情況

| 情況 | 處理 |
|---|---|
| 產品名／賣點空白 | 生成 disabled＋欄位紅字；shared `validateAdBrief` 回錯誤碼 |
| 賣點多行／重複 | 拆成最多 6 點、trim、去重；超過 600 字 UI 擋 |
| 沒填優惠但選了優惠切角 | chip disabled；已選則自動移除＋toast；少於 3 個自動補位 |
| 沒填 proof／social 資料 | 可選，但 prompt 禁止編造；warning 提醒 |
| 少於 3 個切角 | 生成 disabled＋`至少選 3 個切角` |
| 多於 5 個切角 | blocked＋toast `最多 5 個切角` |
| AI 回傳少於 3 個切角 | server retry 一次；仍不足回 `bad_json`；UI 顯示重試 |
| AI 回傳多於 5 個 | 取前 5 個＋warning |
| AI 回傳未知切角 id | 丟棄；若少於 3 個 → error |
| AI 欄位超長 | server `fitText` 修剪＋warning；UI 顯示「已縮短」 |
| 使用者手改超長 | UI 紅字警告，不 block；CSV／複製照用 |
| URL／email 被切 | `fitText` 視為原子；測試覆蓋 |
| 重新生成失敗 | 保留舊結果＋錯誤 banner；不清空 |
| brief 改動後未重生成 | stale banner；複製／CSV disabled |
| 切 tab | 兩 panel 保持 mounted；輸入／結果／改字不丢 |
| 服務未部署 | missing banner＋設定步驟；生成 disabled |
| 服務探測失敗但實際可用 | unknown 只警告，允許嘗試生成 |
| 剪貼簿被封 | toast 指示手動選取（沿用 CopyButton） |
| CSV 公式注入 | 首字 `= + - @` 前加 `'` |
| 產品名含檔名非法字元 | 移除 `\/:*?"<>|` |
| 手機 360px | tab 橫向捲動；表單單欄；矩陣表橫向捲動 |

---

## 13. 測試與驗收

### 13.1 自動測試

**`node scripts/run-ad-creative-test.ts` → `ad creative: ok`**

覆蓋 25 組（含子項）：

1. `normalizeAdBrief` 預設值。
2. 平台 limits／clamp。
3. 切角選擇 3–5、offer 缺失補位。
4. 空白／超長／limits 驗證。
5. Prompt 有 offer／無 offer／retry／variation。
6. 正常解析、圍欄、中文 label 對映。
7. 少於 3 個／缺 A/B／重複／多回切角。
8. `fitText`（中文、emoji、單行、URL）。
9. CTA 補齊與 warning。
10. 未核實數字／絕對化／A/B 同標題／主文差異 warning。
11. 超長欄位 `truncatedFields`。
12. `applyAdCopyOverrides`。
13. CSV／TSV／可讀文字／檔名。
14. Function 靜態契約（import shared、Deno.serve、validateSession、keys、無 DB）。
15. `config.toml` entry。
16. 側欄 label／`CopyStudioTool`／`FeatureTabs`／`ContentZoneTabs`。
17. Shared lib 不碰 window／document／Deno／fetch。

**`node scripts/run-hk-rewrite-test.ts` → `hk cantonese rewrite: ok`**

- 語氣引擎 21 組全過；只更新 1 個靜態斷言（ToolsCenterModule render `CopyStudioTool`）。

### 13.2 指令與實際結果

```powershell
cd D:\Project\MPS
node scripts/run-ad-creative-test.ts          # ad creative: ok
node scripts/run-hk-rewrite-test.ts           # hk cantonese rewrite: ok
node .\node_modules\typescript\bin\tsc --noEmit 2>&1 | Select-String "adCreative|copy-studio|FeatureTabs|ContentZoneTabs|CopyButton|ToolsCenterModule|AppContext|run-ad"
# → 無輸出（新／改檔案零錯誤；全專案仍有既有錯誤）
node .\node_modules\vite\bin\vite.js build    # → ✓ built in 12.18s
```

- `vite build` 在 PowerShell 因 Browserslist 警告回傳 exit 1，但輸出是 `✓ built`，不是建置失敗。
- SSR smoke（臨時腳本，跑完已刪）：`FeatureTabs`／`ContentZoneTabs`／`AdCreativePanel`／`AdAngleCard`／`AdMatrixTable` 全部 render，`ad ssr: ok 49691`。
- **部署**：`supabase functions deploy ad-creative-writer --project-ref kwcevjcmdjadhrygjyfp --use-api --no-verify-jwt` 成功；functions list 顯示 `ACTIVE`、最新 version 9、更新時間 `2026-11-26 10:36:49 UTC`（本地 18:36）。
- **GET 探測**：`GET /functions/v1/ad-creative-writer` → `405 {"ok":false,"code":"method_not_allowed"}`，符合預期。
- **生成狀態**：依使用者指示回退 provider 主備與模型；回退後**沒有再生成**。Grok 欠費、Gemini 2.5 已停用，預期仍會回 `llm_unavailable`，需充值或另行批准改 provider。
- **歷史紀錄**：修正期間曾用 `gemini-3.5-flash-lite` 成功生成 4 切角／7.8 秒，但該配置已按要求回退，只作診斷紀錄。
- **備份**：原始碼 zip＋working tree diff＋manifest 在 `D:\Project\MPS-backups\MPS-source-20261126-171924.zip`；DB 使用 Supabase 既有 physical backup（最新 `2026-11-26 01:24:10 UTC`），本機沒有 `SUPABASE_DB_PASSWORD`，未做 `pg_dump`；本操作 DB 零改動。

### 13.3 驗收清單

- [x] 側欄／h1 為「AI文案工坊」，側欄在 ALT Pilot 前；路由 `#tools-center/tone-rewrite` 不變。
- [x] 兩個 tab 可切；預設「文案多角度轉寫」；兩個 panel 保持 mounted；切 tab 不丢輸入。
- [x] 兩組切換器寬度貼字；社媒 badge 條件渲染；360px 可橫向捲動。
- [x] 語氣子功能行為與改動前一致；HK 測試全過。
- [x] 文案多角度轉寫表單驗證、切角 3–5、A/B＋3 CTA、長度、改字、複製、CSV 已實作。
- [x] 服務未部署／未設 key／錯誤狀態有 banner；不生成假文案。
- [x] 新契約測試全過；新檔案 tsc 零錯；build 成功。
- [x] 無 DB／migration／RLS／cron；無新 npm 依賴；未 commit／未 push。
- [ ] 部署 `ad-creative-writer` 後做真實生成 smoke（provider 已回退，待 Grok 充值或另行批准改 provider）。
- [ ] 瀏覽器手動 smoke（360px、tab hover、剪貼簿、CSV 下載）。

---

## 14. 部署與回滾

### 14.1 部署（已完成）

1. `supabase functions deploy ad-creative-writer --project-ref kwcevjcmdjadhrygjyfp --use-api --no-verify-jwt` 已成功。
2. Supabase secrets 已有 `XAI_API_KEY` 與 `GEMINI_API_KEY`（沿用 crosspost，沒有新增 secret）。
3. 驗證：`GET /functions/v1/ad-creative-writer` 回 405；**回退後未再生成**（Grok 欠費、Gemini 2.5 停用）。
4. 真實 smoke：**回退後未重新生成**；需 Grok 充值或另行批准改 provider。

- 本次**沒有** `secrets set`、**沒有** `db push`、**沒有** migration。
- 部署版本：最新 version 9，`2026-11-26 10:36:49 UTC`。

### 14.3 2026-11-26 故障診斷與回退（llm_unavailable）

**症狀**：使用者按「生成」後顯示 `AI 暫時無法使用，請重試。錯誤碼：llm_unavailable`。

**根因**：

1. Grok `grok-4.5` 在長 prompt 下 50 秒 timeout；且 Grok 帳戶欠費。
2. Gemini fallback 的預設 `gemini-2.5-flash` 已被官方停用，回 404。
3. 兩個 provider 都失敗，function 回 `llm_unavailable`；UI 原本又把 server detail 蓋成通用句。

**最後狀態（依使用者指示）**：

- **不改動主力／fallback**：已回退為 Grok 主力、Gemini fallback，模型 `grok-4.5`／`gemini-2.5-flash`，預算 110 秒。
- 保留 UI 顯示 server detail，方便下次直接看到是哪個 provider 出錯。
- 保留生成界面卡片無外發光。
- 回退後未再生成；Grok 欠費與 Gemini 2.5 停用需由帳戶／provider 設定解決。

### 14.2 回滾

- 前端 revert（移除側欄 label／`CopyStudioTool`／文案多角度轉寫 panel）即可恢復舊版語氣工具。
- Function 可 `supabase functions delete ad-creative-writer`；無資料表、無 migration，不需要資料回滾。
- 不回滾任何使用者資料（本工具不寫 DB）。

---

## 15. 風險與緩解

| 風險 | 影響 | 緩解 |
|---|---|---|
| 只做 AI，未部署時工具不可用 | 文案多角度轉寫 tab 只能看設定畫面 | missing banner＋部署步驟；部署 gate 寫清楚 |
| LLM JSON 不穩／欄位漂移 | 無法渲染 | 嚴格 parser、retry、provider fallback、契約測試 |
| AI 編造數字／療效 | 廣告合規風險 | prompt 禁止＋未核實數字／絕對化字眼 warning＋人手核實免責 |
| AI 超長 | 投放松散 | prompt 限長＋server `fitText`＋UI 字數／紅字 |
| 延遲／額度 | 等待或失敗 | 110 秒預算、Grok 主力→Gemini fallback、明確錯誤、可取消；Grok 欠費需充值 |
| 改 `ContentZoneTabs` 影響社媒 | 視覺／行為回歸 | 共用 `FeatureTabs`＋SSR／靜態測試；公開 props 不變 |
| 工作區有大量未提交修改 | 誤覆蓋 | 只改清單檔案；施工前後 `git diff --stat` 檢查 |
| 隱私 | 產品資料送 AI | 明示、不寫 DB、不記錄 brief；不輸入個資 |
| 舊 HK 測試靜態斷言 | 測試失敗 | 只更新 1 行元件名；其餘不動 |

---

## 16. 後續（非 v1.0）

| 優先 | 項目 | 說明 |
|---|---|---|
| P1 | 部署與真實 smoke | `supabase functions deploy ad-creative-writer`；用真實 brief 驗 3–5 切角 |
| P2 | 英文商務語氣改寫 | 在語氣子功能內加 tab／panel |
| P3 | 歷史紀錄 | 需資料表＋RLS；另立 PRD |
| P4 | 廣告平台批量格式 | Google Ads Editor／Meta Bulk CSV |
| P5 | 圖片創意／素材建議 | 與 ALT Pilot／平面設計模組整合 |
| P6 | 本地 fallback | 若 AI 不可用，提供規則草稿（本次明確不做） |
| P7 | 品牌詞表／禁用詞 | 需資料表或 localStorage；另立 PRD |

---

## 17. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| v1.0 | 2026-11-26 | 初版：文案工坊、共用 FeatureTabs、文案多角度轉寫（原廣告切角矩陣）、`ad-creative-writer`、契約測試完成 |
| v1.1 | 2026-11-26 | 部署 `ad-creative-writer`（version 1）；完成真實生成 smoke（4 切角、A/B、3 CTA、0 warnings）；補備份紀錄 |
| v1.2 | 2026-11-26 | 插件改名「AI文案工坊」、側欄移到 ALT Pilot 前；子功能改名「文案多角度轉寫」、移到「語氣校對改寫」前並設為預設 tab |
| v1.3 | 2026-11-26 | 診斷 `llm_unavailable`：Grok 50 秒 timeout、Gemini 2.5 停用、3.8 高需求；曾以 Gemini 3.5 Flash Lite 驗證 7.8 秒 |
| v1.4 | 2026-11-26 | 依使用者指示**回退 provider 主備與模型**（Grok 主力、Gemini fallback、原本 timeout）；只保留 UI detail 與移除卡片外發光；回退後未再生成 |

---

## 18. 已知限制

1. **目前生成可能失敗**：Grok 帳戶欠費，Gemini `gemini-2.5-flash` 已被官方停用；依指示不改 provider 主備，需充值或另行批准改 provider 後才能穩定生成。
2. 瀏覽器手動測試（360px、tab hover、剪貼簿、CSV 下載）未執行；以 SSR／build／靜態測試＋function smoke 代替。
3. 本機沒有 Deno／Docker，無法在本地 type-check／執行 Edge Function；function 的可靠性依賴 shared lib 測試＋靜態契約＋部署後 smoke。
4. 沒有歷史紀錄、沒有 localStorage；重新整理即清空。
5. A/B 主文相似度、未核實數字、絕對化字眼只是 warning，不是法律／合規審查。
6. 平台上限是「建議／常見上限」，不是各廣告平台官方 API 的硬性驗證。
7. 本機沒有 `SUPABASE_DB_PASSWORD`，未做 `pg_dump`；DB 依賴 Supabase 既有 physical backup（最新 2026-11-26 01:24:10 UTC）。本操作 DB 零改動。
