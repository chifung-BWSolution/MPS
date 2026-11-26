# PRD｜熱點雷達（工具中心 · SEO 雷達下方）

| 項目 | 內容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-11-26 |
| 專案根目錄 | `D:\Project\MPS` |
| 入口 | 工具中心 → 熱點雷達（`#tools-center/hotspot-radar`） |
| 對應執行清單 | `docs/development_plan/2026-11-26/執行清單-熱點雷達-v1.0.md` |
| 狀態 | 程式已實作並通過本機自測（70 項）／`tsc` 0 錯／`vite build` exit 0；**migration、Edge Function、cron 尚未部署**（見 §16） |

---

## 1. 背景與目標

### 1.1 問題

拍片與廣告片的選題、hook、剪法、投放素材，目前只能靠同事在 IG 上「一個個搜、一個個帳號翻」，過程無法累積，換人就要重來；競品在跑什麼廣告也沒有系統性記錄。

### 1.2 現況（已核實，不是假設）

| 現有資產 | 與本需求的關係 |
|---|---|
| 工具中心「SEO 雷達」（`#tools-center/seo-radar`） | 抓的是**網站關鍵詞**，與 IG 內容無關；但它是本專案唯一完整、可照抄的施工樣板 |
| 社媒自動化營運內「熱點雷達」分頁（`Zone: social`、`page: radar`） | 手動貼熱點／CSV 匯入 RSS → 自動產稿；**沒有抓取、沒有互動數據**，與「對標影片／廣告」是兩件事（撞名處理見 §4.2） |
| `vchannel_accounts`、`kol_profile.instagram_account` | 有大量 IG handle，但只有帳號資料，沒有貼文熱度 |
| Meta OAuth（`META_APP_ID`）+ `contentVault` 憑證保險庫 | 走官方 IG API 的基礎設施已在，但**本期不用**（決策見 §2 第 1 輪） |
| `content-sources`（RSS 抓取） | 只有 RSS，抓不到 IG／廣告 |

### 1.3 目標

在工具中心新增一個獨立頁：**把「對標帳號的近期貼文」、「Hashtag 的熱門貼文」、「競品正在跑的 Meta 廣告」抓進同一個熱門池**，用「絕對互動量」與「帳號內相對熱度」雙軌排序，同事只需瀏覽 → 收藏 → 標記（待參考／已用／不用）。

### 1.4 成功標準

1. 側邊欄「工具中心 → 熱點雷達」位於 **SEO 雷達正下方**；`#tools-center/hotspot-radar` 直達、重整不掉頁。
2. 建立 3 類監測目標（1 個帳號、1 個 hashtag、1 個廣告關鍵字）後按「立即抓取」，90 秒內回應；同一則內容被多個目標抓到只留 1 列。
3. 每張卡片同時顯示 **互動總量（讚＋留言）** 與 **相對熱度倍數**（例 `3.2× 中位數`），五種排序可切換且順序可預期。
4. 收藏後可標「待參考／已用／不用」＋備註；重整、換人登入都仍在（團隊共享）。
5. 未設第三方金鑰／金鑰失效／額度不足時，頁面顯示可讀原因與設定指引，**不寫半截資料、不白屏、不影響工具中心其他入口**。
6. 本月花費 ≥ 上限 80% 顯示黃色提示；≥ 上限即硬停（`budget_blocked`），每日自動抓取同步停用。
7. 非 writer 角色看不到可用按鈕；繞過前端直接打 API 回 `403`。
8. 資料表未建立時顯示「功能尚未啟用」＋推 migration 指引。
9. `npm run hotspot:test` 全綠；`vite build` exit 0；新增／修改的前端檔案在 `tsc --noEmit` 下 0 錯誤。

---

## 2. 五輪需求對齊（決策記錄）

| 輪次 | 決策 | 落地方式 | 代價／影響 |
|---|---|---|---|
| 1 | **只用第三方抓取 API（IG＋廣告）**，不走官方 IG Graph API | 新增 provider adapter 層（`providers/`），預設 Apify；金鑰只存 Supabase secrets | 需月費、有斷供風險 → §12 寫降級；換供應商只改一層 |
| 2 | **帳號＋Hashtag＋廣告三種都要** | `hotspot_targets.kind ∈ ('account','hashtag','ad_keyword')`，三種共用同一個 `hotspot_items` 池與同一分數 | 目標管理需要一個設定面板（§8.5） |
| 3 | **絕對互動量 ＋ 帳號內相對熱度（×中位數）** | 兩數值都落庫、都可排序；預設「綜合」＝相對熱度分層後比互動量（**絕對量門檻已於 2026-11-26 移除**） | 需要抓每個帳號的近期貼文才能算中位數 → 帳號類目標每次抓 12 則 |
| 4 | **只做瀏覽／排序 ＋ 收藏標記** | `hotspot_favorites` 三狀態＋備註；**不做** LLM 腳本、不推排期、不做匯出 | 範圍最小、最快可上；後續擴充不需改表 |
| 5 | **沿用 SEO 雷達權限＋每日一次＋月費上限硬停** | `view` 全員 / `write` writer 角色 / `manage_settings` 管理層；pg_cron 每日；`monthly_budget_usd` 超額即擋 | 管理層需偶爾調預算；預設值見 §10 |

> 第 5 輪你選的是「月費上限硬停」這一機制，未指定金額。本文件把預設上限訂為 **US$40**（理由見 §10.3：若訂 US$30，預設負載的 84% 會長期貼著 80% 警戒線，屬設計缺陷）。

---

## 3. 範圍與非目標

### 3.1 做

- 菜單與路由（`AppContext` 插入一列、`ToolsCenterModule` 早退分支）。
- 頁面：來源分頁、篩選列、五種排序、卡片 grid、靈感庫、目標管理、預算橫幅、五態。
- 5 張新表＋索引＋RLS＋預設設定列。
- 1 支 Edge Function（8 actions）＋ provider adapter（apify／mock）。
- 每日 cron＋開關 RPC（`SECURITY DEFINER`，只授 `service_role`）。
- 前後端共用純函式與常數（含排序、預算、mapper）。
- 自測腳本、回滾腳本、本 PRD、執行清單。
- 順手改名：社媒分頁「熱點雷達」→「內容熱點」（2 個字串，見 §4.2）。

### 3.2 不做

- 官方 IG Graph API（Hashtag Search／Business Discovery）、Meta App Review。
- AI／LLM 生成分鏡或腳本（沿用者為 `content-worker`，本期不接）。
- 推入「影片製作」任務或拍攝排期。
- CSV／Excel 匯出。
- 抓取留言內容、抓取粉絲增長曲線、廣告 reach／spend 預估。
- 影片檔鏡像或截圖存檔（只存連結與縮圖 URL）。
- 改動「社媒自動化營運」任何邏輯（只改 2 個顯示字串）。
- 既有 `seo-radar`、`content-*`、`users`、`brand_list` 等任何表結構改動。

---

## 4. 資訊架構

### 4.1 菜單

```
工具中心
├── 社媒自動化營運        （內部 radar 分頁改名「內容熱點」）
├── Readdy → Framer 轉換
├── SEO 雷達
├── 熱點雷達              ← 本功能，id = hotspot-radar
├── AI跨平台一稿多發
├── AI 關鍵字生成器
└── …（其餘不變）
```

插入位置：`src/context/AppContext.tsx` 的 `tools-center.subMenus`，在 `{ id: 'seo-radar', label: 'SEO 雷達' }` 之後、`{ id: 'crosspost', … }` 之前。
路由分派：`src/components/tools-center/ToolsCenterModule.tsx`，比照 `seo-radar` 的早退寫法（該檔第 25–27 行）＋ `getTitle()` 加一個 case。

### 4.2 撞名處理（必須做，否則兩個「熱點雷達」）

| 檔案 | 現在 | 改為 | 理由 |
|---|---|---|---|
| `src/lib/contentNavigation.ts:67` | `label: '熱點雷達'` | `label: '內容熱點'` | 該頁是「手動貼熱點／RSS → 產稿」，不是對標抓取 |
| `src/components/tools-center/content/social/SocialSubNav.tsx:21` | `{ page: 'radar', label: '熱點雷達', … }` | `label: '內容熱點'` | 與上列同一頁的 tab 標籤 |

已核實：`scripts/` 內沒有任何自測斷言這兩個字串，改動不會弄壞既有測試。 `page: 'radar'` 的路由 key **不改**（只改顯示字串），避免影響 deep link。

### 4.3 新舊入口差異（給使用者看的說明）

| | 內容熱點（舊，社媒區） | 熱點雷達（新，工具中心） |
|---|---|---|
| 資料 | 人手貼標題／CSV／RSS | 自動抓 IG 帳號、Hashtag、Meta 廣告 |
| 熱度 | 無（人工判斷） | 互動量＋帳號內相對熱度＋廣告投放天數 |
| 產出 | 自動產社群文案 | 收藏成靈感庫（不產稿） |
| 抓取成本 | 0 | 第三方 API 按量計費（有月上限） |

---

## 5. 資料模型

全部是**新增**：5 張表、0 個既有物件被改、0 筆既有資料被動。`hotspot_settings` 會插入 1 列預設值（`on conflict do nothing`，可重跑）。

### 5.1 `public.hotspot_targets`（監測目標）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` |  |
| `kind` | text NOT NULL CHECK `('account','hashtag','ad_keyword')` | 三種來源 |
| `platform` | text NOT NULL DEFAULT `'instagram'` CHECK `('instagram','facebook')` | 廣告用 `facebook`（Meta Ad Library） |
| `value` | text NOT NULL | 顯示用原值（`@handle`、`#tag`、關鍵字） |
| `value_normalized` | text NOT NULL | 去 `@`／`#`、trim、壓縮空白、小寫；**唯一鍵用這欄** |
| `label` | text | 顯示名，NULL 時 UI 用 `value` |
| `brand_id` | uuid REFERENCES `brand_list(id)` ON DELETE SET NULL | 可選，供品牌篩選 |
| `active` | boolean NOT NULL DEFAULT true | 停用的目標不進 cron 候選 |
| `notes` | text |  |
| `last_fetched_at` | timestamptz | 最近一次成功抓取 |
| `last_error` | text | 最近一次錯誤（成功時清空） |
| `created_by` | uuid REFERENCES `users(id)` ON DELETE SET NULL |  |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() |  |
| **UNIQUE** | `(kind, platform, value_normalized)` | 用**普通欄位**而非 `lower(value)` 表達式：Postgres 的 UNIQUE **約束**不接受表達式，且 PostgREST `upsert(onConflict:)` 只認欄位名 |

### 5.2 `public.hotspot_items`（熱門內容池）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK |  |
| `platform` | text NOT NULL CHECK `('instagram','facebook')` |  |
| `source_kind` | text NOT NULL CHECK `('account','hashtag','ad_keyword')` | 首次發現它的來源類型 |
| `target_id` | uuid REFERENCES `hotspot_targets(id)` ON DELETE SET NULL | 首次發現它的目標 |
| `external_id` | text NOT NULL | IG shortcode／廣告 archive id |
| `url` | text NOT NULL | 原帖／廣告連結 |
| `media_type` | text NOT NULL DEFAULT `'unknown'` CHECK `('reel','video','image','carousel','ad','unknown')` |  |
| `caption` | text |  |
| `thumbnail_url` | text | 可能過期，UI 需有佔位 |
| `author_handle` / `author_name` | text |  |
| `author_followers` | integer | 抓不到就 NULL（不參與熱度計算） |
| `posted_at` | timestamptz | **可為 NULL**；NULL 不進中位數樣本、排序排最後 |
| `likes` / `comments` | integer NOT NULL DEFAULT 0 CHECK ≥ 0 |  |
| `plays` | integer CHECK (`IS NULL OR ≥ 0`) | 抓不到就 NULL；只顯示、不進相對熱度 |
| `engagement` | integer NOT NULL DEFAULT 0 CHECK ≥ 0 | **讚＋留言**（落庫時算好） |
| `account_median_engagement` | numeric(12,2) | 抓取當下該帳號近 30 天中位數；非帳號類為 NULL |
| `relative_heat` | numeric(8,2) CHECK (`IS NULL OR ≥ 0`) | `engagement ÷ median`；median 為 NULL／0 或樣本不足 → NULL |
| `sample_size` | integer NOT NULL DEFAULT 0 | 算中位數時用了幾則 |
| `low_sample` | boolean NOT NULL DEFAULT false | 樣本 < 5 則 → true（UI 顯示「樣本不足」） |
| `ad_started_at` | date | 僅廣告 |
| `ad_active_days` | integer CHECK (`IS NULL OR ≥ 0`) | 僅廣告：已投放天數 |
| `ad_status` | text | 僅廣告：`active`／`inactive`／`unknown` |
| `first_seen_at` / `last_seen_at` | timestamptz NOT NULL DEFAULT now() |  |
| `captured_at` | timestamptz NOT NULL DEFAULT now() | 本次抓取時間 |
| `raw` | jsonb | 供應商原始 payload（除錯用，不給前端讀） |
| **UNIQUE** | `(platform, external_id)` | upsert 目標；同一則內容多來源只留 1 列 |

### 5.3 `public.hotspot_favorites`（團隊共享的判斷）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK |  |
| `item_id` | uuid NOT NULL REFERENCES `hotspot_items(id)` ON DELETE CASCADE，**UNIQUE** | 一則內容只有一筆收藏狀態 |
| `status` | text NOT NULL DEFAULT `'saved'` CHECK `('saved','used','dropped')` | 待參考／已用／不用 |
| `note` | text CHECK (`IS NULL OR char_length(note) ≤ 500`) | 例：「開頭 3 秒 hook 可抄」 |
| `created_by` | uuid REFERENCES `users(id)` ON DELETE SET NULL | 只作稽核，不代表私有 |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() |  |

### 5.4 `public.hotspot_runs`（抓取紀錄與花費）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid PK |  |
| `trigger` | text NOT NULL DEFAULT `'manual'` CHECK `('manual','cron')` | 與 `seo_radar_runs` 同欄名 |
| `status` | text NOT NULL DEFAULT `'running'` CHECK `('running','success','error')` |  |
| `targets_fetched` / `items_new` / `items_upserted` / `api_calls` | integer NOT NULL DEFAULT 0 |  |
| `cost_usd` | numeric(10,4) NOT NULL DEFAULT 0 CHECK ≥ 0 | 本次實際花費＝回傳筆數 × 單價 |
| `error_message` | text |  |
| `meta` | jsonb | `{ provider, duration_ms, targets_remaining, trimmed }` |
| `started_at` / `finished_at` | timestamptz |  |

### 5.5 `public.hotspot_settings`（單列）

| 欄位 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `id` | text PK DEFAULT `'default'` CHECK (`id = 'default'`) | `'default'` | 單列 |
| `auto_daily` | boolean NOT NULL | true | 每日自動抓取是否啟用（cron 執行前會再讀一次） |
| `monthly_budget_usd` | numeric(10,2) NOT NULL CHECK ≥ 0 | 40 | 月費硬上限 |
| `min_engagement` | integer NOT NULL CHECK ≥ 0 | 300 | 自然內容的入池門檻 |
| `items_per_target` | integer NOT NULL CHECK (1–50) | 20 | 每個目標每次最多取幾筆 |
| `updated_by` | uuid REFERENCES `users(id)` ON DELETE SET NULL |  |  |
| `updated_at` | timestamptz NOT NULL DEFAULT now() |  |  |

### 5.6 DDL 草稿（三支 migration，未套用）

> 檔名固定，日期時間戳沿用專案格式（`YYYYMMDDHHMMSS`）。**推送前必須先跑 §5.9 的型別驗證。**

**① `supabase/migrations/20261126150000_hotspot_radar.sql`**

```sql
-- ============================================================
-- 熱點雷達：5 張表 + 索引 + 只讀 RLS
-- 純新增：不改任何既有表／policy／grant；不刪任何資料
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hotspot_targets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL CHECK (kind IN ('account', 'hashtag', 'ad_keyword')),
  platform          text NOT NULL DEFAULT 'instagram'
                    CHECK (platform IN ('instagram', 'facebook')),
  value             text NOT NULL,
  value_normalized  text NOT NULL,
  label             text,
  -- 注意：brand_list.id 在 20260807 之後是 uuid；若 production 仍是 text，此欄必須改 text，
  -- 否則 FK 建不起來（42804）。推送前以 §5.9 查詢確認。
  brand_id          uuid REFERENCES public.brand_list(id) ON DELETE SET NULL,
  active            boolean NOT NULL DEFAULT true,
  notes             text,
  last_fetched_at   timestamptz,
  last_error        text,
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotspot_targets_unique_value UNIQUE (kind, platform, value_normalized)
);

CREATE INDEX IF NOT EXISTS hotspot_targets_active_idx
  ON public.hotspot_targets (active, kind);

CREATE TABLE IF NOT EXISTS public.hotspot_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform                    text NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  source_kind                 text NOT NULL
                              CHECK (source_kind IN ('account', 'hashtag', 'ad_keyword')),
  target_id                   uuid REFERENCES public.hotspot_targets(id) ON DELETE SET NULL,
  external_id                 text NOT NULL,
  url                         text NOT NULL,
  media_type                  text NOT NULL DEFAULT 'unknown'
                              CHECK (media_type IN ('reel', 'video', 'image', 'carousel', 'ad', 'unknown')),
  caption                     text,
  thumbnail_url               text,
  author_handle               text,
  author_name                 text,
  author_followers            integer CHECK (author_followers IS NULL OR author_followers >= 0),
  posted_at                   timestamptz,
  likes                       integer NOT NULL DEFAULT 0 CHECK (likes >= 0),
  comments                    integer NOT NULL DEFAULT 0 CHECK (comments >= 0),
  plays                       integer CHECK (plays IS NULL OR plays >= 0),
  engagement                  integer NOT NULL DEFAULT 0 CHECK (engagement >= 0),
  account_median_engagement   numeric(12, 2),
  relative_heat               numeric(8, 2) CHECK (relative_heat IS NULL OR relative_heat >= 0),
  sample_size                 integer NOT NULL DEFAULT 0,
  low_sample                  boolean NOT NULL DEFAULT false,
  ad_started_at               date,
  ad_active_days              integer CHECK (ad_active_days IS NULL OR ad_active_days >= 0),
  ad_status                   text,
  first_seen_at               timestamptz NOT NULL DEFAULT now(),
  last_seen_at                timestamptz NOT NULL DEFAULT now(),
  captured_at                 timestamptz NOT NULL DEFAULT now(),
  raw                         jsonb,
  CONSTRAINT hotspot_items_unique_external UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS hotspot_items_kind_engagement_idx
  ON public.hotspot_items (source_kind, engagement DESC);
CREATE INDEX IF NOT EXISTS hotspot_items_relative_heat_idx
  ON public.hotspot_items (relative_heat DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS hotspot_items_posted_idx
  ON public.hotspot_items (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS hotspot_items_target_idx
  ON public.hotspot_items (target_id);
CREATE INDEX IF NOT EXISTS hotspot_items_last_seen_idx
  ON public.hotspot_items (last_seen_at);

CREATE TABLE IF NOT EXISTS public.hotspot_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.hotspot_items(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'used', 'dropped')),
  note        text,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotspot_favorites_unique_item UNIQUE (item_id),
  CONSTRAINT hotspot_favorites_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS hotspot_favorites_status_idx
  ON public.hotspot_favorites (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.hotspot_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger         text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'cron')),
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'success', 'error')),
  targets_fetched integer NOT NULL DEFAULT 0,
  items_new       integer NOT NULL DEFAULT 0,
  items_upserted  integer NOT NULL DEFAULT 0,
  api_calls       integer NOT NULL DEFAULT 0,
  cost_usd        numeric(10, 4) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  error_message   text,
  meta            jsonb,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS hotspot_runs_started_idx
  ON public.hotspot_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.hotspot_settings (
  id                  text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  auto_daily          boolean NOT NULL DEFAULT true,
  monthly_budget_usd  numeric(10, 2) NOT NULL DEFAULT 40 CHECK (monthly_budget_usd >= 0),
  min_engagement      integer NOT NULL DEFAULT 300 CHECK (min_engagement >= 0),
  items_per_target    integer NOT NULL DEFAULT 20 CHECK (items_per_target BETWEEN 1 AND 50),
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hotspot_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- RLS：5 張表只開 SELECT（只給 authenticated，不給 anon）
-- 不建任何寫入 policy → 寫入只能經 Edge Function（service_role）
-- ------------------------------------------------------------
ALTER TABLE public.hotspot_targets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_settings  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hotspot_targets_read"
  ON public.hotspot_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotspot_items_read"
  ON public.hotspot_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotspot_favorites_read"
  ON public.hotspot_favorites FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotspot_runs_read"
  ON public.hotspot_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotspot_settings_read"
  ON public.hotspot_settings FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.hotspot_targets   TO authenticated;
GRANT SELECT ON public.hotspot_items     TO authenticated;
GRANT SELECT ON public.hotspot_favorites TO authenticated;
GRANT SELECT ON public.hotspot_runs      TO authenticated;
GRANT SELECT ON public.hotspot_settings  TO authenticated;
GRANT ALL    ON public.hotspot_targets   TO service_role;
GRANT ALL    ON public.hotspot_items     TO service_role;
GRANT ALL    ON public.hotspot_favorites TO service_role;
GRANT ALL    ON public.hotspot_runs      TO service_role;
GRANT ALL    ON public.hotspot_settings  TO service_role;
```

**② `supabase/migrations/20261126151000_hotspot_radar_daily_cron.sql`**

```sql
-- ============================================================
-- 熱點雷達：每日自動抓取（pg_cron + pg_net）
--   jobname : hotspot-radar-daily
--   schedule: 45 23 * * *  UTC（排在 seo-radar-daily 23:15 之後）
--   target  : /functions/v1/hotspot-radar
--   body    : {}  → 函數在 service_role 且無 action 時視為 cron_scan
--
-- 授權沿用既有 functions HTTP cron（service_role bearer 不寫進本檔）。
-- 安全網：找不到來源 job／URL 替換失敗 → 不建立，只 RAISE NOTICE。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hotspot-radar-daily') THEN
    RAISE NOTICE 'hotspot-radar-daily already scheduled — skipped';
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname IN (
    'seo-radar-daily',
    'gsc-incremental-daily',
    'google-ads-incremental-daily',
    'ga4-incremental-daily',
    'facebook-ads-incremental-daily'
  )
    AND command ILIKE '%net.http_post%'
    AND command ILIKE '%/functions/v1/%'
  ORDER BY CASE jobname
    WHEN 'seo-radar-daily' THEN 1
    WHEN 'gsc-incremental-daily' THEN 2
    WHEN 'google-ads-incremental-daily' THEN 3
    WHEN 'ga4-incremental-daily' THEN 4
    ELSE 5
  END
  LIMIT 1;

  IF src_cmd IS NULL THEN
    RAISE NOTICE
      'hotspot-radar-daily not created — no existing functions HTTP cron to clone auth from';
    RETURN;
  END IF;

  new_cmd := regexp_replace(src_cmd, 'functions/v1/[^'']+', 'functions/v1/hotspot-radar');

  IF new_cmd NOT LIKE '%/functions/v1/hotspot-radar%' THEN
    RAISE NOTICE 'hotspot-radar-daily not created — URL rewrite failed; source command=%',
      left(src_cmd, 200);
    RETURN;
  END IF;

  PERFORM cron.schedule('hotspot-radar-daily', '45 23 * * *', new_cmd);

  RAISE NOTICE 'hotspot-radar-daily scheduled: %', left(new_cmd, 300);
END
$$;
```

**③ `supabase/migrations/20261126152000_hotspot_radar_controls.sql`**

```sql
-- ============================================================
-- 熱點雷達：每日抓取開關（給 Edge Function 呼叫）
-- cron schema 沒暴露給 PostgREST → 用 SECURITY DEFINER 函數包起來，
-- 只授 service_role；前端一律經 Edge Function。
-- 只操作 jobname = 'hotspot-radar-daily'，不碰其他 job。
-- ============================================================

CREATE OR REPLACE FUNCTION public.hotspot_radar_daily_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
              'enabled',  j.active,
              'schedule', j.schedule,
              'jobname',  j.jobname
            )
       FROM cron.job j
      WHERE j.jobname = 'hotspot-radar-daily'
      LIMIT 1),
    jsonb_build_object('enabled', false, 'schedule', NULL, 'jobname', NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.hotspot_radar_set_daily(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_jobid  bigint;
  v_active boolean;
BEGIN
  SELECT j.jobid, j.active
    INTO v_jobid, v_active
    FROM cron.job j
   WHERE j.jobname = 'hotspot-radar-daily'
   LIMIT 1;

  IF v_jobid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_missing');
  END IF;

  IF v_active IS DISTINCT FROM p_enabled THEN
    PERFORM cron.alter_job(job_id := v_jobid, active := p_enabled);
  END IF;

  RETURN public.hotspot_radar_daily_status();
END;
$$;

REVOKE ALL ON FUNCTION public.hotspot_radar_daily_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hotspot_radar_set_daily(boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hotspot_radar_daily_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.hotspot_radar_set_daily(boolean) TO service_role;
```

### 5.7 索引清單

| 表 | 索引 | 用途 |
|---|---|---|
| targets | `(active, kind)` | cron 取候選 |
| items | `(source_kind, engagement DESC)` | 「絕對互動」排序、來源分頁 |
| items | `(relative_heat DESC NULLS LAST)` | 「相對熱度」排序 |
| items | `(posted_at DESC NULLS LAST)` | 「最新」排序 |
| items | `(target_id)` | 算中位數、刪目標後清理 |
| items | `(last_seen_at)` | 120 天保留清理 |
| favorites | `(status, updated_at DESC)` | 靈感庫分頁 |
| runs | `(started_at DESC)` | 本月花費、最近一次抓取 |

### 5.8 RLS 與授權

- 5 張表全部 `ENABLE ROW LEVEL SECURITY`，**只建 `FOR SELECT TO authenticated USING (true)`**，共 5 條 policy。
- **不建** INSERT／UPDATE／DELETE policy → 非 service_role 一定寫不進去。
- **不給 anon**：`seo_radar` 兩表給 anon 是沿用舊表慣例；本功能的收藏備註與月費屬內部資料，且頁面在 `AuthGuard` 之後，anon 讀不到也不影響。
- 不動任何既有表、policy、grant。
- 注意（與 `seo_radar` 同一個已知事實）：Supabase 預設權限會給 `authenticated` 表級 INSERT/UPDATE/DELETE，真正攔阻寫入的是 RLS（無寫入 policy）。文件不可寫成「只有 SELECT 權限」。

### 5.9 FK 型別前置驗證（推送前必做）

repo 的 migration 與 production 可能不一致（`seo_keywords.id` 就發生過：repo 寫 uuid、production 是 text，導致 42804 整個 migration 失敗）。推送前先查：

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('brand_list', 'users')
  and column_name = 'id';
```

- `brand_list.id = uuid` → 用 §5.6 的 `brand_id uuid`。
- `brand_list.id = text` → `brand_id` 改 `text`，其餘不變。
- `users.id` 必須是 uuid（`content_social_oauth_states` 已這樣引用）；若是 text，`created_by`／`updated_by` 同步改 text。

---

## 6. 後端

### 6.1 Edge Function `hotspot-radar`

- 路徑：`supabase/functions/hotspot-radar/index.ts`；`supabase/config.toml` 追加 `[functions.hotspot-radar]` + `verify_jwt = false`（函數自行驗 JWT，cron 才能呼叫）。
- 契約沿用 `content-*`：`{ ok: true, data }` / `{ ok: false, code, error }`；入口先 `requireActor()`，每次寫入前重算權限，不信任前端。

| action | 輸入 | 權限 | 回傳 |
|---|---|---|---|
| `scan` | `{ target_ids?: string[] }` | `write` | `{ run, targets_fetched, targets_remaining, items_new, items_upserted, cost_usd, warnings[] }` |
| `scan_all` | 無 | `write` | 同上（依 `last_fetched_at` 最舊優先，≤40 目標、90 秒預算） |
| `test_target` | `{ kind, value }` | `write` | `{ valid, normalized, preview_count, cost_usd, run_id }`（1 次 API 呼叫，上限 5 筆；`cost_usd` 已入帳） |
| `favorite` | `{ item_id, status, note? }` | `write` | `{ favorite }` |
| `unfavorite` | `{ item_id }` | `write` | `{ removed: true }` |
| `settings` | 無 | `view` | `{ settings, usage: { month_spend_usd, month_items, budget_pct }, daily }` |
| `update_settings` | `{ auto_daily?, monthly_budget_usd?, min_engagement?, items_per_target? }` | **`manage_settings`** | `{ settings, usage, daily }` |
| `set_daily` | `{ enabled: boolean }` | **`manage_settings`** | `{ daily }`（經 RPC `hotspot_radar_set_daily`） |
| `create_target` | `{ kind, value, label?, brand_id?, notes?, active? }` | **`manage_settings`** | `{ target }` |
| `update_target` | `{ id, label?, brand_id?, notes?, active? }`（`kind`／`value` 不可改） | **`manage_settings`** | `{ target }` |
| `delete_target` | `{ id }` | **`manage_settings`** | `{ deleted: true, id }`（已抓到的內容保留，`target_id` 變 NULL） |
| `cron_scan` | 無 `action` + service_role | service_role | 同 `scan_all`，並執行 120 天保留清理 |

`readAction` 規則比照 `seo-radar`：service_role 且無 `action` → `cron_scan`；其餘 → `400 unknown_action`。

`test_target` 的花費必須入帳：預覽**不寫 `hotspot_items`**，但要寫一筆 `hotspot_runs`（`trigger='manual'`、`status='success'`、`targets_fetched=0`、`meta.kind='test'`、`cost_usd` 按實際回傳筆數），並與 `scan` 共用同一個預算守門。否則任何人都可以反覆「驗證」把額度花光而帳面查不到（月費上限形同虛設）。

### 6.2 Provider adapter

```
supabase/functions/hotspot-radar/
├── index.ts                 入口、驗權、預算守門、錯誤碼
├── targets.ts               讀目標、cron 候選排序、更新 last_fetched_at/last_error
├── persist.ts              差集算 items_new、median/relative_heat、upsert、保留清理
└── providers/
    ├── types.ts             HotspotProvider 介面 + HotspotItemDraft
    ├── apify.ts             Apify run-sync-get-dataset-items（帳號／hashtag／廣告三個 actor）
    ├── mock.ts              無網路固定樣本（本機／自測用）
    └── index.ts             resolveProvider()：HOTSPOT_PROVIDER = apify   mock
```

```ts
export interface HotspotItemDraft {
  platform: 'instagram'   'facebook';
  source_kind: 'account'   'hashtag'   'ad_keyword';
  external_id: string;
  url: string;
  media_type: 'reel'   'video'   'image'   'carousel'   'ad'   'unknown';
  caption: string   null;
  thumbnail_url: string   null;
  author_handle: string   null;
  author_name: string   null;
  author_followers: number   null;
  posted_at: string   null;          // ISO 8601；抓不到就 null
  likes: number;
  comments: number;
  plays: number   null;
  ad_started_at: string   null;      // YYYY-MM-DD
  ad_active_days: number   null;
  ad_status: 'active'   'inactive'   'unknown'   null;
  raw: Record<string, unknown>;
}

export interface HotspotProvider {
  readonly name: string;
  fetchAccount(handle: string, limit: number): Promise<HotspotItemDraft[]>;
  fetchHashtag(tag: string, limit: number): Promise<HotspotItemDraft[]>;
  fetchAds(keyword: string, limit: number): Promise<HotspotItemDraft[]>;
  /** 每 1,000 筆的美元單價；IG 與廣告單價差約 2.5 倍，必須按類型分開 */
  unitPricePer1000(kind: 'account'   'hashtag'   'ad_keyword'): number;
}
```

- actor id、token、單價全部走 env：`HOTSPOT_PROVIDER`、`HOTSPOT_APIFY_TOKEN`、`HOTSPOT_APIFY_ACTOR_ACCOUNT`、`HOTSPOT_APIFY_ACTOR_HASHTAG`、`HOTSPOT_APIFY_ACTOR_ADS`、`HOTSPOT_UNIT_PRICE_USD_PER_1000`（IG 預設單價）、`HOTSPOT_UNIT_PRICE_ADS_USD_PER_1000`（廣告單價，未設時沿用前者）。單價按類型分開是必要的：IG 約 1.75、廣告約 0.70，用同一個數字估算會讓廣告目標被高估 2.5 倍。
- **不得把某個 actor 的 input schema 寫死在 `index.ts`**：actor 的欄位差異只存在 `apify.ts` 內，換 actor 只改那一支。
- `mock.ts` 用固定樣本（含 1 個帳號 × 6 則、1 個 hashtag × 5 則、1 個廣告 × 3 則），讓自測與本機開發完全不需要網路。

### 6.3 抓取流程（順序不可調換）

1. `requireActor()` → 驗 action 與權限。
2. 讀 `hotspot_settings`（缺列則用出廠預設，不寫入）。
3. 讀本月花費：`sum(cost_usd) from hotspot_runs where started_at >= 本月起點（Asia/Hong_Kong）`。
4. **預算守門**：`spent >= budget` → `402 budget_blocked`，**不發任何外部請求**；否則依 §6.4 逐個目標累加成本，超出預算就停（回 `budget_trimmed` warning）。
5. **併發鎖**：10 分鐘內有 `status='running'` 的 run → `409 scan_in_progress`（與 `seo-radar` 同規則：崩潰留下的 running 不會永久鎖住）。
6. 逐目標 `try/catch`：單一目標失敗只記 `target_failed:<value>` warning 並寫 `last_error`，不中斷整批；每個目標最多 1 次 API 呼叫。
7. 正規化＋去重 → 算中位數與相對熱度（§6.6）→ 差集算 `items_new`（§6.5）→ upsert。
8. 寫 run（`status`／`cost_usd`／`api_calls`／`meta`）→ 更新 `last_fetched_at` → 回傳。

### 6.4 預算估算與裁剪

```
unit(k)   = provider.unitPricePer1000(k) / 1000               // 每筆美元（依來源類型，IG 與廣告不同價）
items(k)  = min(settings.items_per_target, KIND_DEFAULT[k])   // 帳號 12 / hashtag 20 / 廣告 20
cost(k)   = items(k) × unit(k)
spent     = 本月 sum(hotspot_runs.cost_usd)
budget    = settings.monthly_budget_usd

spent >= budget  → 402 budget_blocked（不發任何外部請求）

否則：依 cron 排序逐個累加 cost(kind)，
      加下一個會超過 budget 就停 → 得到「本次可抓的目標清單」
      清單少於原候選 → warning 'budget_trimmed'（附 trimmed 數量）
```

- 為何逐個累加而非一次除法：三類目標的 `items(k)` 不同（12／20／20），用單一 `items_per_target` 算會**高估帳號類成本**、把還能抓的目標白白裁掉。
- 邊界：清單為空（連最便宜的一個都放不下）→ 402，不要發 0 個目標的空 run。
- 估算只是上限；實際 `cost_usd` 以回傳筆數為準（§6.5），估算與實際的差額不補不回。

### 6.5 寫入、去重與「不覆寫使用者判斷」

- 去重鍵：`(platform, external_id)`；同一則內容先被帳號抓到、後被 hashtag 抓到 → 只更新互動數與 `last_seen_at`，**`source_kind`／`target_id` 保持首次值**。
- `items_new` 計算：寫入前把候選 `external_id` 以 200 個一批查 `select external_id from hotspot_items where platform = ? and external_id in (...)`，差集即新增數。**不要**用 PostgREST upsert 的回傳推測（它不區分 insert/update）。
- upsert payload **不得包含** `first_seen_at`、`captured_at`（保留首次值）；也不得包含任何 favorites 欄位。
- `hotspot_favorites` 永不被抓取流程寫入或刪除。

### 6.6 中位數與相對熱度（可稽核，不是黑盒）

```
樣本來源：同 target_id、source_kind='account'、posted_at 非 NULL、
         posted_at >= now() - 30 days，取最近 50 則
＋ 本批抓回來的那幾則（同 external_id 覆蓋既有值）
median   = computeMedian(samples.map(engagement))
sample   = samples.length

sample < 5        → relative_heat = NULL，low_sample = true
median <= 0       → relative_heat = NULL，low_sample = false
其他              → relative_heat = round(engagement / median, 2)
```

**為什麼要把「本批」算進樣本**：只用資料庫既有列的話，第一次抓一個新帳號時基線不存在，所有 `relative_heat` 都會是 NULL，使用者會以為爆款偵測壞了。把本批算進去，第一次就有合理基線（帳號類每次抓 12 則，已超過最低樣本 5）。

- 中位數在**寫入前**算一次，同一批帳號貼文共用同一個 `account_median_engagement`（避免邊寫邊算導致同批不同基準）。
- 非帳號類（hashtag／廣告）：`account_median_engagement`、`relative_heat` 一律 NULL，`sample_size = 0`。

### 6.7 廣告的特殊處理（否則廣告會整批消失）

Meta 廣告庫抓不到讚／留言 → `engagement` 恆為 0。若沿用「互動 ≥ 300」的入池門檻，**廣告會被全部過濾掉**。因此：

| 項目 | 自然內容（account／hashtag） | 廣告（ad_keyword） |
|---|---|---|
| 熱度主訊號 | `engagement`＋`relative_heat` | `ad_active_days`（投放越久＝越經得起市場考驗） |
| 入池門檻 | `engagement >= min_engagement` | 不看互動；以「投放 ≥ 7 天」為預設視圖條件 |
| 「爆款」標記 | `relative_heat >= 2.0` | `ad_active_days >= 21` |
| 預設排序 | 綜合 | 綜合（廣告在「其他」層內改以 `ad_active_days` 排） |

> 若某 actor 能回傳廣告的按讚／留言數，照常寫入 `engagement`，兩套訊號並存；`isHotItem()` 對廣告仍以投放天數為準，避免同一個池裡兩種口徑互相比較。

### 6.8 cron 與開關

| 項目 | 值 |
|---|---|
| jobname | `hotspot-radar-daily` |
| schedule | `45 23 * * *` UTC（`seo-radar-daily` 23:15 之後） |
| 觸發 | `net.http_post` 到 `/functions/v1/hotspot-radar`，body `{}`，service_role bearer（克隆自既有 job） |
| 開關 | `hotspot_radar_set_daily(enabled)` → `cron.alter_job(active => …)`，不刪 job |
| 執行前檢查 | 讀 `settings.auto_daily`，false 則記一筆 `status='success'`、`meta.skipped='auto_daily_off'` 的 run 並結束（讓使用者看得到「今天沒抓是因為關了」） |

### 6.9 錯誤碼

| code | HTTP | 觸發條件 | 前端呈現 |
|---|---|---|---|
| `invalid_request` | 400 | 參數格式錯、目標數 > 40、`note` > 500 字 | 表單紅字 |
| `unknown_action` | 400 | action 不在清單 | 開發期可見 |
| `forbidden` | 403 | 角色不足 | toast + 按鈕禁用 |
| `budget_blocked` | 402 | 本月花費 ≥ 上限 | 紅色橫幅「本月已達上限，已停止抓取」 |
| `scan_in_progress` | 409 | 10 分鐘內有 running run | toast「上一次抓取還在跑」 |
| `provider_not_configured` | 503 | 缺 token／actor id | 黃色橫幅＋secrets 設定指引 |
| `provider_auth_failed` | 502 | 供應商 401／403 | 同上，附供應商訊息 |
| `provider_rate_limited` | 429 | 供應商 429 | toast「供應商限流，請稍後再試」 |
| `schema_missing` | 500 | 42P01／PGRST205 | 「功能尚未啟用」 |
| `internal_error` | 500 | 其他 | 可重試錯誤畫面 |

### 6.10 保留與清理

每日 cron 末尾執行（只刪非收藏、且從未被收藏過的列）：

```sql
delete from public.hotspot_items i
 where i.last_seen_at < now() - interval '120 days'
   and not exists (select 1 from public.hotspot_favorites f where f.item_id = i.id);
```

- 只保留一套規則（不另設「每目標 60 則」上限），避免兩套規則打架誤刪。
- 收藏列因 `ON DELETE CASCADE` 不會被留下孤兒；但清理條件已排除收藏，正常情況下不會觸發 cascade。

---

## 7. 純函式與常數（`src/lib/hotspotRadar.ts`）

> 前後端共用：**不得** import React／supabase／瀏覽器 API／`@/` alias（Deno 不認），與 `src/lib/seoRadar.ts` 同一紀律。

| 常數 | 值 | 用途 |
|---|---|---|
| `HOTSPOT_MAX_TARGETS_PER_RUN` | 40 | 單次 run 目標上限 |
| `HOTSPOT_TIME_BUDGET_MS` | 90 000 | 函數牆鐘預算 |
| `HOTSPOT_ACCOUNT_ITEMS` | 12 | 帳號類預設筆數 |
| `HOTSPOT_TAG_ITEMS` | 20 | Hashtag 類預設筆數 |
| `HOTSPOT_AD_ITEMS` | 20 | 廣告類預設筆數 |
| `HOTSPOT_MEDIAN_WINDOW_DAYS` | 30 | 中位數回看窗 |
| `HOTSPOT_MEDIAN_MIN_SAMPLE` | 5 | 少於此數不計相對熱度 |
| `HOTSPOT_MONTHLY_BUDGET_USD` | 40 | 出廠月上限 |
| `HOTSPOT_MIN_ENGAGEMENT` | 300 | 出廠入池門檻 |
| `HOTSPOT_RETENTION_DAYS` | 120 | 非收藏項目保留天數 |
| `HOTSPOT_RELATIVE_HEAT_MIN` | 2.0 | 「爆款」標記門檻 |
| `HOTSPOT_AD_LONG_RUNNING_DAYS` | 21 | 廣告「長投爆款」門檻 |

| 函式 | 行為 |
|---|---|
| `normalizeHandle(raw)` | 去 `@`、去 URL 前綴（重用 `src/lib/instagram.ts` 的 `parseInstagramAccounts` 取第一個） |
| `normalizeHashtag(raw)` | 去 `#`、trim、壓縮空白、保留大小寫（顯示用）；另回 `value_normalized` 小寫 |
| `normalizeAdKeyword(raw)` | trim、壓縮空白、長度 2–80 |
| `computeMedian(values)` | 空陣列回 0；偶數取中間兩數平均；忽略 NaN |
| `engagementOf(likes, comments)` | `max(0, likes) + max(0, comments)`，非有限數當 0 |
| `computeRelativeHeat(engagement, median, sample)` | §6.6 規則；回 `{ relative_heat, low_sample }` |
| `isHotItem(item, minEngagement)` | 自然內容：`engagement >= minEngagement`；廣告：`ad_active_days >= 21` |
| `estimateCostUsd(itemCount, unitPricePer1000)` | `count × unit / 1000`，回 4 位小數；`unitPricePer1000` 由呼叫端按目標類型傳入（不是全局常數） |
| `itemsForKind(kind, settings)` | `min(settings.items_per_target, 帳號 12／hashtag 20／廣告 20)`；預算估算與實際抓取**共用同一支**，避免兩處各寫一份而對不上 |
| `monthSpend(runs, now)` | 只加總 HK 當月起的 `cost_usd` |
| `budgetState(spent, budget)` | `ok`（<80%）／`warn`（80–99%）／`block`（≥100%） |
| `mapProviderItem(raw, kind)` | 容錯欄位：`likes｜like_count｜likesCount`、`comments｜comment_count｜commentsCount`、`plays｜videoPlayCount｜play_count`、時間 `timestamp｜takenAt｜createTime`（含秒級 unix） |
| `compareBySort(a, b, sort)` | §7.2 |

### 7.1 排序定義（五種，順序可預期）

```
綜合（預設）
  1) layer(relative_heat)：≥3.0 → 0；≥2.0 → 1；≥1.5 → 2；其他（含 NULL）→ 3
  2) 廣告在 layer 3 內改以 ad_active_days desc 比較，其餘 engagement desc
  3) posted_at desc（NULL 最後）

絕對互動：engagement desc → posted_at desc（NULL 最後）
相對熱度：relative_heat desc（NULL 最後）→ engagement desc
最新：posted_at desc（NULL 最後）→ engagement desc
廣告投放天數：ad_active_days desc（NULL 最後）→ engagement desc
```

- 所有比較器都必須是**全序**（最後一級用 `id` 字串比較），避免同分時 UI 亂跳。

### 7.2 入池 vs 顯示（兩個不同概念，不可混用）

- **入池**：抓回來的全部寫庫（保留原始數據）。
- **顯示**：**已移除互動門檻**（2026-11-26 使用者要求）→ 所有入池內容預設都顯示，不再因讚數不足隱藏；「只看爆款」改為相對熱度 ≥2×（廣告：投放 ≥21 天）。
- `hotspot_settings.min_engagement` 欄位仍保留（相容舊資料），但**已不再用作任何過濾或顯示條件**。

---

## 8. 前端

### 8.1 頁面結構

```
熱點雷達                          [立即抓取] [⏸ 每日自動抓取]  本月 US$7.20 / 40
對標 IG 熱門內容：帳號 20 · Hashtag 10 · 廣告 5；已抓 1,240 則，可收藏成靈感庫。
⚠ 本月已用 82%，接近上限會自動停抓。

[全部 1240] [對標帳號 480] [Hashtag 560] [廣告 200] [⭐ 靈感庫 18]
平台[Instagram] 時間[30 天] 媒體[全部] □只看爆款 □只看未收藏   排序[綜合]

┌ 縮圖 ┬ @brand_hk · 3.2× 中位數 · 🔥爆款 · Reel · 2 天前
│ 9:16 │ 開頭三秒 hook：…（caption 截斷 2 行）
│      └ ❤ 1,840  💬 96   [⭐ 收藏] [✓ 已用] [✕ 不用] [開原帖 ↗]
```

### 8.2 篩選與排序

| 控件 | 選項 | 預設 |
|---|---|---|
| 來源分頁 | 全部／對標帳號／Hashtag／廣告／靈感庫 | 全部 |
| 平台 | Instagram／Facebook | Instagram |
| 時間窗 | 7／30／90 天（以 `posted_at` 為準，NULL 併入 30 天內） | 30 天 |
| 媒體 | 全部／Reel／影片／圖文／輪播／廣告 | 全部 |
| 最低互動 | 數字輸入（預填 `min_engagement`） | 300 |
| 只看爆款 | 勾選（`relative_heat ≥ 2.0` 或廣告 `ad_active_days ≥ 21`） | 不勾 |
| 只看未收藏 | 勾選 | 不勾 |
| 排序 | 綜合／絕對互動／相對熱度／最新／廣告投放天數 | 綜合 |

### 8.3 卡片

- 縮圖 9:16（`object-cover`），載入失敗顯示灰底＋媒體類型圖示（不顯示破圖）。
- 第一行：`@handle`（可點開原帖）＋ `{relative_heat}× 中位數`（NULL 顯示「樣本不足」）＋ `🔥爆款`（條件見 §6.7）。
- 第二行：媒體類型 pill ＋ 相對時間（`formatRelative` 風格，照 `SeoRadarTool.tsx` 的實作）。
- 第三行：`❤ {likes}  💬 {comments}`；有 `plays` 時加 `▶ {plays}`。
- 第四行：三個狀態按鈕（收藏／已用／不用，已選中高亮）＋「開原帖」。
- 廣告卡片改顯示 `投放 {ad_active_days} 天 · {ad_status}`，不顯示讚／留言（避免 0 造成誤解）。

### 8.4 靈感庫

- 來源分頁切到「靈感庫」→ 只列有 favorites 列的 items，按 `favorites.updated_at desc`。
- 可切狀態（待參考／已用／不用）；卡片上直接改狀態與備註（`favorite` action，帶 `note`）。
- 空狀態文案：「還沒有收藏。在列表按 ⭐ 收藏，這裡會出現你的對標清單。」

### 8.5 目標管理（只有 `manage_settings` 可開）

- 列表：類型 pill、`value`、品牌、`last_fetched_at`、`last_error`（有錯標紅）、啟用開關、刪除。
- 新增：選類型 → 輸入 → 按「驗證」呼叫 `test_target` → 顯示 `normalized` 與 `preview_count`（有抓到才給存）。
- 重複新增（`kind + platform + value_normalized` 已存在）→ 友善提示「此目標已存在」，不要拋 23505 原始錯誤。
- 設定區：`auto_daily` 開關、月預算、每目標筆數、本月用量（`設定` action 回傳）；互動門檻已移除。

### 8.6 五種狀態（缺一不可）

| 狀態 | 呈現 |
|---|---|
| `missingSchema`（42P01／PGRST205） | 「功能尚未啟用」＋`npm run db:push` 指引，不白屏 |
| `provider_not_configured` | 黃色橫幅＋`supabase secrets set …` 指引；列表仍可看舊資料 |
| `budget_blocked` | 紅色橫幅「本月已達上限」，抓取按鈕 disabled |
| `loading` | 卡片骨架 ×6 |
| `empty` | 引導：「先加一個對標帳號，或按立即抓取」 |

### 8.7 檔案清單（實作階段才建）

| 檔案 | 職責 |
|---|---|
| `src/types/hotspotRadar.ts` | 型別（target／item／favorite／run／settings／API 回應） |
| `src/lib/hotspotRadar.ts` | 常數＋純函式（§7），前後端共用 |
| `src/hooks/useHotspotRadar.ts` | `useHotspotTargets()`、`useHotspotRadar()`（items、favorites、runs、settings、五態） |
| `src/components/tools-center/hotspot-radar/HotspotRadarTool.tsx` | 頁面外殼 |
| `…/HotspotCard.tsx` | 卡片（含收藏操作） |
| `…/HotspotFilterBar.tsx` | 分頁、篩選、排序 |
| `…/HotspotTargetsPanel.tsx` | 目標 CRUD |
| `…/HotspotSettingsDialog.tsx` | 預算／門檻／每日開關 |
| `…/HotspotBudgetBanner.tsx` | 80%／100% 橫幅 |
| `…/HotspotEmptyState.tsx` | 空狀態與錯誤狀態 |

### 8.8 設計語言

一律照 `docs/development_plan/2026-11-25/IMPLEMENTATION-CONTRACT.md` §2：底色 `#f5f8fc`、白卡、teal `#0d9488`、深字 `#0d1a2d`、邊框 `rgba(13,26,45,0.08)`、`shadow-card`；元件只用 `src/components/ui/*`；toast 用 `sonner`；圖示 `lucide-react` 13–16px。**不得新增 npm 依賴**。

---

## 9. 權限

| 能力 | 前端 | 後端 |
|---|---|---|
| 看列表／靈感庫／用量 | 任何已登入者 | RLS `SELECT TO authenticated` |
| 手動抓取、`test_target`、收藏／改標記 | `can(user,'write')` | `requireAction(actor,'write')` |
| 目標 CRUD、每日開關、預算與門檻 | `can(user,'manage_settings')` | `requireAction(actor,'manage_settings')` |
| cron | — | `requireServiceRole()`＋`settings.auto_daily` |

- writer 角色＝`management`／`system_dev`／`copywriter`／`marketing`／`project_manager`／`chief_editor`（沿用 `src/lib/contentPermissions.ts`，不新增角色）。`role_tag` 為 `super_admin`／`administrator` 者，已由 `resolveInternalRole()` 映射為 `management`，因此同樣可寫。
- `video_editor`／`designer`／`accountant`／`staff` 可看不可寫（與 `seo-radar` 一致）。

---

## 10. 成本模型

### 10.1 單價假設（M0 選型後以實際牌價覆蓋）

| 項目 | 假設 | 來源 |
|---|---|---|
| IG 貼文／Reels | US$1.75 / 1,000 筆 | Apify 類 actor 公開牌價區間（0.80–2.70） |
| Meta 廣告 | US$0.70 / 1,000 條 | 廣告庫 actor 公開牌價區間（0.40–1.00） |
| 換算方式 | 按類型分別計價（`unit(kind)`），不用單一混合值 | 兩者差約 2.5 倍，混合值會同時高估廣告、低估 IG |

### 10.2 預設負載試算

| 來源 | 數量 | 每次筆數 | 每日筆數 |
|---|---|---|---|
| 對標帳號 | 20 | 12 | 240 |
| Hashtag | 10 | 20 | 200 |
| 廣告關鍵字 | 5 | 20 | 100 |
| **合計** | 35 | — | **540** |

- 每日成本：帳號 240×1.75/1000＝**US$0.42**；Hashtag 200×1.75/1000＝**US$0.35**；廣告 100×0.70/1000＝**US$0.07**；合計 **US$0.84／日**。
- 每月：540 × 30 = **16,200 筆** → **≈ US$25.2**。
- 對 US$40 上限＝**63%**，保留 37% 緩衝給臨時加目標。

### 10.3 為何預設上限是 US$40 而不是 US$30

若上限 30，預設負載（US$25.2）已達 **84%** → 頁面會**長期停在黃色警戒**，使用者會學會忽略警告（告警疲勞），真正超支時反而看不到。40 讓預設用量落在 **63%**，80% 警戒線在 US$32（≈ 690 筆/日）才有意義。

### 10.4 三層護門

1. 抓取前：`spent >= budget` → 402，一個外部請求都不發。
2. 抓取前：依 §6.4 逐個目標累加成本，超出預算就從清單尾端裁掉（並回 warning），不會「最後一次抓爆」。
3. 抓取後：`cost_usd` 按實際回傳筆數寫入 run，帳單可逐筆對帳；80% 黃色、100% 紅色並回寫 `auto_daily=false`。

### 10.5 對帳方式

```sql
select date_trunc('day', started_at at time zone 'Asia/Hong_Kong') as day,
       sum(api_calls) as calls,
       sum(items_new) as new_items,
       sum(items_upserted) as upserted,
       round(sum(cost_usd), 4) as usd
from public.hotspot_runs
where started_at >= now() - interval '30 days'
group by 1 order by 1 desc;
```

與供應商後台的用量對照；差異 > 10% 視為單價設定錯誤（分別調 `HOTSPOT_UNIT_PRICE_USD_PER_1000`（IG）與 `HOTSPOT_UNIT_PRICE_ADS_USD_PER_1000`（廣告））。

---

## 11. 測試與驗收

### 11.1 自測腳本（`npm run hotspot:test`）

沿用 `scripts/run-seo-radar-test.ts` 的 `check()` 骨架（`node` 直接跑 `.ts`、無測試框架）。**實際 70 項，全綠**，分 8 組：

| 組 | 內容 | 項數 |
|---|---|---|
| 1 正規化 | `@IG`／`instagram.com/x/`／`#標籤`／全形空白／CJK hashtag／超長／空值／平台判定 | 10 |
| 2 中位數與相對熱度 | 奇偶數列、全 0、median 0、樣本 4（low_sample）、四捨五入、非帳號類 | 10 |
| 3 排序 | 五種排序各自順序、分層邊界、NULL 排最後、同分 id 決勝、不改原陣列 | 10 |
| 4 預算 | 0／79%／80%／100%／逐個目標裁剪／跨月重置／單價按類型／測試入帳 | 11 |
| 5 Mapper 容錯 | `likes｜like_count｜likesCount`、缺 plays、三種時間格式、廣告 archive id、缺 id | 8 |
| 6 入池與 payload | 自然／廣告門檻、payload 欄位齊全、不得含 `first_seen_at`／`captured_at`／收藏欄位 | 4 |
| 7 接線斷言（讀檔） | 菜單順序、早退、改名、`config.toml`、`package.json`、新檔齊全、純函式紀律、不直接 fetch、JWT 重算 | 10 |
| 8 DB 契約 | 5 表欄位數、payload ↔ migration、前端 `ITEM_COLUMNS` ↔ migration、無破壞性語句、cron、RPC、RLS | 7 |

### 11.2 手動驗收（部署後）

1. 加 1 帳號＋1 hashtag＋1 廣告關鍵字 → 立即抓取 → 三類都有卡片。
2. 同一則內容同時出現在帳號與 hashtag 分頁 → 只有 1 列（總數不重複計算）。
3. 卡片數值與原帖對得上（抽 1 則）。
4. 收藏 → 標「已用」＋備註 → 重整 → 換另一個帳號登入 → 仍在。
5. 把月預算改成 US$0.01 → 按抓取 → 402 紅色橫幅，且**沒有**新增 run 的 `cost_usd`。
6. 把 `auto_daily` 關掉 → 隔日 cron 產生 `meta.skipped='auto_daily_off'` 的 run（或手動觸發驗證）。
7. `designer` 帳號：按鈕 disabled；devtools 直接 POST → 403。
8. 資料表未建（在 staging 驗）：顯示「功能尚未啟用」，工具中心其他入口正常。
9. 供應商 token 清空 → `provider_not_configured` 橫幅，舊資料仍可看。
10. `殺掉` 中途請求（或製造 running run）→ 10 分鐘內再抓回 409，10 分鐘後可再抓。

### 11.3 推送後 DB 驗證 SQL

```sql
-- 1) 5 張表都在
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('hotspot_targets','hotspot_items','hotspot_favorites',
                      'hotspot_runs','hotspot_settings')
 order by 1;

-- 2) RLS 全開
select relname, relrowsecurity from pg_class
 where relnamespace = 'public'::regnamespace
   and relname like 'hotspot_%';

-- 3) 恰 5 條 policy，全部 SELECT
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename like 'hotspot_%';

-- 4) 兩個唯一鍵存在
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid in ('public.hotspot_targets'::regclass, 'public.hotspot_items'::regclass)
   and contype = 'u';

-- 5) 設定列恰 1 筆、預設值正確
select id, auto_daily, monthly_budget_usd, min_engagement, items_per_target
  from public.hotspot_settings;

-- 6) cron job 與 URL
select jobname, schedule, active,
       (command like '%/functions/v1/hotspot-radar%') as url_ok
  from cron.job where jobname = 'hotspot-radar-daily';

-- 7) anon 必須讀不到（RLS 只給 authenticated）
-- 以 anon key 執行：select count(*) from public.hotspot_items;
-- 期望：0 列（不是錯誤）
```

---

## 12. 風險與降級

| 風險 | 影響 | 對策 |
|---|---|---|
| 第三方斷供／改 schema／加價 | 抓不到新資料 | provider 隔離＋mapper 容錯；失敗只記 warning，舊資料照看；換供應商只改 `providers/` |
| 抓公開 IG 內容的 ToS 爭議 | 法務風險 | 只存連結／縮圖 URL／公開互動數；不存影片檔、不轉載；文件寫明來源合規由供應商承擔 |
| 縮圖 URL 過期 | 卡片破圖 | 灰底佔位＋類型圖示；本期不鏡像 |
| 429 限流 | 該次抓取失敗 | run 記 `error`、不計花費、保留舊資料；UI 提示稍後再試 |
| 資料膨脹 | 查詢變慢 | 只保留 120 天非收藏項目；索引見 §5.7 |
| 預算失控 | 帳單意外 | 三層護門（§10.4）＋管理層限定 |
| 同則內容多來源 | 重複卡片 | `UNIQUE(platform, external_id)`＋只更新互動數 |
| 相對熱度誤導 | 「1 則貼文＝10×」 | 樣本 <5 → NULL＋`low_sample`；UI 顯示「樣本不足」 |
| 廣告全被過濾 | 功能等於沒做 | 廣告不吃互動門檻（§6.7） |
| 表未建／金鑰未設 | 白屏或無反應 | 「功能尚未啟用」／設定指引；不影響其他入口 |
| 撞名混淆 | 使用者走錯頁 | 舊分頁改名「內容熱點」（§4.2） |

---

## 13. 回滾

1. 前端：revert `AppContext.tsx`、`ToolsCenterModule.tsx`、`contentNavigation.ts`、`SocialSubNav.tsx`、`config.toml`、`package.json`；刪除 §8.7 的 10 個新檔與 `src/lib types/hotspotRadar.ts`。
2. 函數：`npx supabase functions delete hotspot-radar`。
3. DB（依 FK 順序）：

```sql
select cron.unschedule('hotspot-radar-daily');
drop function if exists public.hotspot_radar_set_daily(boolean);
drop function if exists public.hotspot_radar_daily_status();
drop table if exists public.hotspot_favorites;
drop table if exists public.hotspot_items;
drop table if exists public.hotspot_targets;
drop table if exists public.hotspot_runs;
drop table if exists public.hotspot_settings;

delete from supabase_migrations.schema_migrations
 where version in ('20261126150000','20261126151000','20261126152000');
```

> 最後一條必須做，否則日後 `db push` 會跳過這三支，重建時會缺表。
> 回滾會**永久刪除**已收藏的靈感庫（本期沒有匯出功能）；如需保留，先 `copy (select * from public.hotspot_favorites) to stdout` 存檔。

---

## 14. 已知陷阱與防呆（實作前必讀）

| # | 陷阱 | 症狀 | 對策 |
|---|---|---|---|
| 1 | `UNIQUE (kind, platform, lower(value))` | migration 語法錯誤；PostgREST upsert 找不到衝突目標 | 用 `value_normalized` 欄位＋普通 UNIQUE（§5.1） |
| 2 | 廣告套用互動門檻 | 廣告分頁永遠空白 | 廣告用投放天數訊號（§6.7） |
| 3 | 相對熱度樣本太少 | 新帳號 1 則貼文算出 10× 假爆款 | 樣本 <5 → NULL（§6.6） |
| 4 | 只用 `spent >= budget` 擋 | 最後一次抓取超支 | 先估算再裁剪（§6.4） |
| 5 | 用 upsert 回傳推測新增數 | `items_new` 永遠等於總數 | 寫入前查差集（§6.5） |
| 6 | 兩套保留規則 | 誤刪剛收藏的內容 | 只留 120 天＋排除收藏（§6.10） |
| 7 | `brand_list.id` 型別假設 | FK 建不起來（42804），整支 migration 失敗 | 推送前跑 §5.9 |
| 8 | `supabase/config.toml` 編碼 | CLI 靜默跳過 `[functions.*]`，`verify_jwt` 變 true → 使用者 session 被 gateway 擋 | 該檔已是 UTF-8；只**追加**區塊，不整檔改寫（曾因 GBK 出過事故） |
| 9 | 以為 `tsc` 會檢查 Edge Function | 型別錯誤到部署才爆 | `tsconfig.json` 只 include `src`；函數只做 esbuild 語法檢查＋`deno check`（若環境有 Deno） |
| 10 | `posted_at` 為 NULL | 中位數被 0 值污染、排序亂 | NULL 不進樣本、排序排最後（§7.1） |
| 11 | 「本月」用 UTC 切 | 每月 1 日早上算錯花費 | 以 `Asia/Hong_Kong` 月初為界（§6.3） |
| 12 | 刪目標連帶清空歷史 | 對標記錄消失 | `target_id` 用 `ON DELETE SET NULL`，items 保留 |

---

## 15. 假設與交接

### 15.1 假設（實作前如被推翻，需同步改本文件）

1. 供應商選 **Apify**；實際 actor（IG 帳號／IG hashtag／Meta 廣告庫）於 M0 定案後把 id 寫進部署設定，不寫死在程式。
2. 收藏是**團隊共享**（整個工具中心一份靈感庫），`created_by` 只作稽核。
3. 舊社媒分頁改名「內容熱點」，只改 2 個顯示字串，`page` key 不動。
4. 不鏡像影片、不存影片檔，只存連結與縮圖 URL。
5. 「互動」＝讚＋留言；播放數只顯示、不進相對熱度（Reels 與圖文不可比）。
6. cron `45 23 * * *` UTC，排在 SEO 雷達 23:15 之後。
7. `brand_list.id`／`users.id` 在 production 皆為 uuid（§5.9 會實際驗證）。

### 15.2 交接步驟

1. 讀本文件 §14（陷阱）與執行清單 M0（前置檢查）。
2. 依執行清單 M1 → M2 → M3 → M4 施工，每段過 Gate 才進下一段。
3. 部署順序：migration → function → cron → 前端；任何一步失敗先回滾該步，不要跳步。
4. 交付時回報：`hotspot:test` 項數、`vite build` 結果、DB 驗證 SQL 的 7 段輸出、供應商實際單價與首月花費。

---

## 16. 實作紀錄（2026-11-26）

### 16.1 已完成（本機）

| 項目 | 結果 |
|---|---|
| 新增檔案 | 21 個（前端 10／後端 7／migration 3／腳本 1） |
| 修改既有檔案 | 6 個（`AppContext`、`ToolsCenterModule`、`contentNavigation`、`SocialSubNav`、`config.toml`、`package.json`） |
| 自測 | `node scripts/run-hotspot-radar-test.ts` → **70 項全綠** |
| 型別 | `tsc --noEmit` 對本功能 **0 錯**（倉庫既有 55 個錯誤與本功能無關） |
| 建置 | `vite build` **exit 0**（4,442 modules／12.11s） |
| Edge Function 語法 | esbuild transform 7 個檔案全部通過（本機無 Deno，未跑 `deno check`） |
| SSR 渲染煙霧 | `HotspotRadarTool` 渲染 **8/8**：爆款標記、樣本不足、廣告投放天數、靈感庫備註、非 writer tooltip、`missingSchema` 停用態 |

### 16.2 未完成（需要真實環境）

| 項目 | 原因 |
|---|---|
| 套用 3 支 migration＋推送後驗證 | `.env` 只有 anon key，沒有 service role／Management API 憑證 |
| 部署 `hotspot-radar` Edge Function | 需 Supabase CLI 登入 |
| cron 建立與開關實測 | 依賴上述兩步 |
| 真實抓取（Apify） | 需 M0-03 選型＋`HOTSPOT_APIFY_TOKEN` |
| 瀏覽器點擊實測 | 依 `AGENTS.md`，未經明確要求不做 GUI 驗證；已用 SSR 煙霧代替 |

### 16.3 實作期修正的設計缺陷（文件已同步）

| # | 缺陷 | 修法 |
|---|---|---|
| 1 | `test_target` 不建 run → 可繞過月費上限 | 必須寫 run 並計入 `cost_usd`（§6.1） |
| 2 | 預算用單一 `items_per_target` 估算 → 高估帳號成本 | `itemsForKind()` 逐個目標累加裁剪（§6.4） |
| 3 | `unitPricePer1000()` 不分類型 → 廣告被高估 2.5 倍 | 改為 `unitPricePer1000(kind)`（§6.2） |
| 4 | 首次抓新帳號無基線 → `relative_heat` 全 NULL | 中位數樣本納入本批（§6.6） |
| 5 | `settings` 動作誤掛 `write` → designer 看不到用量 | 改為 `view`（§6.1） |
| 6 | Mapper 漏 `comments_count` 別名 | 補齊 snake／camel 別名（§6.2 表格對應函式） |
| 7 | 無時區日期字串按本機時區解析（+8 vs UTC 不一致） | 無時區一律當 UTC（§6.2 映射） |

### 16.4 Bug 審計與修正（同日第二輪，部署後）

部署後另做一輪針對性審計（競態、輸入信任邊界、前端狀態機），找到 6 個問題並修正；修正後函數重新部署為 **v3**。

| # | 嚴重度 | 問題 | 影響 | 修正 |
|---|---|---|---|---|
| 1 | **高（安全）** | 供應商 payload 的 `url` 未驗證 scheme | 抓回 `javascript:`／`data:` 網址會直接進 `<a href>` → 點擊可執行腳本（XSS） | 新增 `safeExternalUrl()` 白名單只允許 http(s)；不合格一律退回由 `external_id` 組出的原帖網址（§6.2） |
| 2 | 中 | 手動指定目標的 `scan` 用「全部啟用目標數」算 `targets_remaining` | 回傳的剩餘數永遠偏大（例：10 個全抓完仍回 20） | 新增 `computeTargetsRemaining({scope})`，selected／all 分開算（§7） |
| 3 | 中（競態） | 收藏是「先查再插」，兩人同時收藏同一則會撞唯一鍵 | 使用者看到 `409 target_exists`「這個目標已經存在」的錯誤文案，操作失敗 | insert 撞 `23505` 時改走 update 重試；錯誤文案按表名區分（favorites → `favorite_conflict`）（§6.1） |
| 4 | 低（競態） | 前端 `refresh()` 無序號保護 | 慢的舊請求回來會覆蓋新資料（選 A 站看到 B 站資料的同類問題） | 加 `refreshSeqRef`，回應序號不是最新就丟棄（§8） |
| 5 | 低（UX） | 空狀態判斷用 `targets.length === 0` | 所有目標被刪、但池裡仍有內容時，頁面顯示「先新增目標」把內容藏起來 | 改為 `targets.length === 0 && items.length === 0`（§8.6） |
| 6 | 低（文案） | 任何 `23505` 都回「目標已存在」 | 撞的是收藏表時文案錯誤 | 按表名映射：targets→`target_exists`、favorites→`favorite_conflict`、其他→`conflict` |

**未修正、已列為已知限制**（見執行清單「Bug 審計」一節）：並發 scan 的 TOCTOU 窗口、provider 單次 timeout 與時間預算的邊界、前端只讀最新 500 則、廣告投放天數的 UTC 日界 ±1 天。

---

## 17. 部署紀錄（2026-11-26，production）

詳細證據表見執行清單「部署紀錄」一節；這裡只記結論。

| 層 | 狀態 |
|---|---|
| 備份 | ✅ `backups\pre-hotspot-radar-2026-11-26T08-50-23-614Z\`（既有 schema 309.7 KB＋物件/列數基準；本機無 DB 密碼，非全量 dump） |
| 3 支 migration | ✅ 經 Management API 逐支套用；`schema_migrations` 已補 3 筆版本記錄 |
| 推送後驗證 | ✅ 5 表／RLS／5 條 SELECT policy／3 個唯一鍵／設定列／欄位數 68／anon 被拒（401 42501） |
| Edge Function | ✅ **v5／ACTIVE／`verify_jwt=false`**（`--use-api` 免 Docker；v1 首部署、v3 修 bug、v5 加入示範模式） |
| cron | ✅ `hotspot-radar-daily` @ `45 23 * * *`、`active=true`、URL 正確、service_role 授權已驗證 |
| 端到端 | ✅ 關閉態觸發 → 200＋`cron/success`；示範模式觸發 → 200／9 目標／45 則／`cost_usd=0` |
| 既有資料影響 | ✅ 零：約束集合 425↔425 零差異、索引指紋一致、既有 21 個 cron job 命令 hash 不變 |
| 目前設定 | `HOTSPOT_PROVIDER=ig_rss`（免費 IG RSS，只支援帳號類）；**6 個真實帳號已接入並實測**：sephorahk／hkwatsons／be_hk／_jessica.see_／yandyhk／ukilaw，抓到 **72 則真實貼文**（4 則 24 小時內、45 則 7 日內、全部有縮圖；無讚／留言）。Hashtag／廣告目標會被跳過並提示「來源尚未接入」。`auto_daily=false`（手動抓取正常） |
| 尚未完成 | 真實抓取需要 Apify actor 選型與 secrets（並把 `HOTSPOT_PROVIDER` 改回 `apify`）；前端發佈；瀏覽器驗收（M3-12）；實際單價重算（M0-07） |

### 17.1 完成真實抓取的 3 步

```
① 選 3 個 actor（M0-03）→ supabase secrets set HOTSPOT_PROVIDER=apify \
     HOTSPOT_APIFY_TOKEN=… HOTSPOT_APIFY_ACTOR_ACCOUNT=… \
     HOTSPOT_APIFY_ACTOR_HASHTAG=… HOTSPOT_APIFY_ACTOR_ADS=…
② 前端「設定」開啟每日自動抓取（或 update hotspot_settings set auto_daily=true）
③ 以真實登入 session 按「立即抓取」→ 驗證 hotspot_items 有資料、相對熱度與廣告天數正確
```

### 17.2 從示範模式切回真實抓取

1. 設定 Apify secrets，並把 `HOTSPOT_PROVIDER` 改為 `apify`（覆蓋現值）：
   `supabase secrets set HOTSPOT_PROVIDER=apify HOTSPOT_APIFY_TOKEN=… HOTSPOT_APIFY_ACTOR_ACCOUNT=… HOTSPOT_APIFY_ACTOR_HASHTAG=… HOTSPOT_APIFY_ACTOR_ADS=…`
2. （可選）清除示範資料：
   ```sql
   delete from public.hotspot_favorites
    where item_id in (select id from public.hotspot_items where raw->>'provider' = 'mock');
   delete from public.hotspot_items where raw->>'provider' = 'mock';
   delete from public.hotspot_targets where notes = '示範預設，可刪';
   ```
3. 重新載入頁面 → 按「立即抓取」，確認卡片內容來自真實抓取（「示範」標記會消失）。
---

## 18. 變更紀錄（2026-11-26 晚）：接入 IG RSS ＋ 移除互動門檻

### 18.1 接入免費 IG RSS provider（帳號類）

- `HOTSPOT_PROVIDER=ig_rss`；新檔 `supabase/functions/hotspot-radar/providers/ig-rss.ts`。
- 來源：`${HOTSPOT_IG_RSS_BASE:-https://rsshub.liumingye.cn}/instagram/user/{handle}`。
- 只支援 **account** 類目標；hashtag／廣告目標會被跳過並回 `unsupported_source:*` warning（不中斷整批）。
- 實測：6 個真實帳號（`sephorahk`／`hkwatsons`／`be_hk`／`_jessica.see_`／`yandyhk`／`ukilaw`）→ **72 則真實貼文**；最新為當日；24 小時內 4 則、7 日內 45 則；72/72 有縮圖；花費 US$0。
- 欄位：作者、文案、貼文連結、發佈時間、縮圖；**沒有讚／留言**（`raw.engagement_available=false`）。

### 18.2 移除互動門檻（使用者要求）

| 位置 | 變更 |
|---|---|
| 篩選列 | 移除「互動 ≥ [300] 讚＋留言」輸入與「顯示全部（不限門檻）」勾選 |
| 預設視圖 | 不再用 `engagement >= min_engagement` 過濾；所有入池內容預設顯示（含 engagement=0 的 RSS 來源） |
| 設定對話框 | 移除「入池門檻（互動）」欄位；只留月費上限、每目標筆數 |
| 「只看爆款」 | 改為：自然內容 `relative_heat >= 2.0`；廣告 `ad_active_days >= 21`（原本誤用互動門檻） |
| DB／API | `hotspot_settings.min_engagement` 保留（相容），但不再參與任何判斷；後端 `update_settings` 仍接受此欄位 |
| 卡片 | 無互動數據的來源顯示「互動數據未提供（RSS 來源）」，不再顯示 0 讚 0 留言 |

驗證：`hotspot:test` **71 項全綠**、`tsc` 本功能 0 錯、`vite build` exit 0、SSR 5/5（確認篩選列再無門檻、engagement=0 的內容仍顯示）。

### 18.3 官方 IG Hashtag Search 限制澄清（給後續 OAuth 路線）

- 限制是「**30 個不同 hashtag／滾動 7 天（每個 IG 商業或創作者帳號）**」，**不是 30 條內容**。
- 查詢同一 hashtag 在 7 天內不重複計數、也不重置計時。
- 每個 hashtag 可抓多條：`recent_media` 可分頁；`top_media` 目前無硬上限，但 **2027-02-16 起每次查詢最多 200 條**。
- 需要 App Review 與相應權限；`GET /{ig-hashtag-id}/recent_media` 與 `top_media` 都計入 30 個配額。
---

## 19. 變更紀錄（2026-11-26 晚）：免費模式 UI 精簡

使用者決定先用免費渠道（IG RSS），不再需要付費／預算相關 UI，故移除：

| 移除項目 | 說明 |
|---|---|
| 標題列的「設定」按鈕 | 連同 `HotspotSettingsDialog` 浮窗一併刪除（月費上限、每目標筆數、每日自動抓取開關不再由此設定） |
| `HotspotBudgetBanner` 預算 Banner | 整個元件刪除 |
| 「上次抓取 X（有備註）／本月 US$0.00 / US$40.00」狀態列 | 與預算、抓取備註相關，整段移除 |
| `HotspotSettingsDialog.tsx`、`HotspotBudgetBanner.tsx` | 檔案刪除；測試清單同步移除 |

保留：

- 「監測目標」、「每日自動抓取」（標題列按鈕）、「立即抓取」
- 後端 `settings`／`usage`／預算上限 API 不變（未使用，日後若要恢復付費 UI 可直接重用）
- `hotspot_settings.min_engagement` 等欄位仍保留

驗證：自測 71 項、`tsc` 0 錯、`vite build` exit 0、SSR 8/8（確認無「設定」按鈕、無 US$ 狀態列，監測目標／立即抓取／每日自動抓取仍在、內容照常渲染）。
