# 社媒自動化 · 去重（事件聚簇 + 一事件一稿）

> 2026-11-26 上線。對應 migration `20261127170000_content_social_dedupe.sql`、
> `content-social`／`content-sources` 兩支 Edge Function、前端文案微調。
> 這份文件說明：為什麼會有重複、現在用什麼判斷「同一件事」、門檻怎麼來的、
> 已生成的重複怎麼清、出問題怎麼回滾。

## 1. 問題與根因

上線後看板出現大量重複：

| 現象 | 數量（清理前） |
|---|---|
| 社媒稿 | 172 篇，但只對應 86 個熱點事件 |
| 導流目標 | 516 條，但同一事件同一帳號最多收到 2 條 |
| 完全相同標題的稿件組 | 15 組 |

根因不是抓取，而是**生成端按「品牌組」複製**：

- `generateForEvent` 舊邏輯是「每個品牌組產一篇」：`Beauty100 生活組` 與
  `Beauty100 美妝組` 各呼叫一次 Grok，兩個組的帳號還有重疊（IG／FB 同時在兩組），
  所以同一則新聞產生兩篇幾乎一樣的稿，同一帳號還收到兩份文案。
- 事件層其實已有去重（`dedupeKey`＋simhash＋Grok 判斷），但只在**抓取／匯入**時跑；
  手動貼上、CSV 匯入只比 URL／標題 simhash，換個標題寫法就進來了。
- 抓取端聚簇只拿「最像的 1 個候選」比標題，沒有用摘要，也沒有 AIHOT 的「寫入前覆核」。

## 2. 三層防線（現在的規則）

```
① 抓取層  content-sources
   RSS → URL/simhash 去重 → 「標題＋摘要」召回前 3 個候選
        → 分數 ≥0.66 直接掛到既有事件
        → 0.32–0.66 問模型（四種關係＋信心度）
        → 信心 <0.9 再覆核一次（第二次獨立判斷）
        → 重複報導掛進 content_hot_items，不新增事件

② 產稿前  content-social（auto_tick / create_event / generate_now / import_events）
   對最近 14 天仍有效的熱點做同一套召回＋判斷
        → 是同一件事：併進既有事件（搬稿、掛報導、加熱度、標 duplicate_of）
        → 不是：照常產稿

③ 產稿時  content-social
   一個事件只產「一篇」長文，品牌組只是收件名單
        → content_social_posts.event_id 唯一索引（DB 最後防線）
        → 同一帳號（同時在多組）只收一條導流：(post_id, account_id) 唯一
```

`content_social_posts.content_fingerprint` 會保存「標題＋正文」的 simhash，
作為稽核與日後回填用；**它不會單獨用來刪稿**——模板 fallback 的正文結構固定，
不同事件也可能很像，單靠正文指紋刪稿會誤殺。

## 3. 「同一件事」怎麼判斷（借用 AIHOT 的做法）

參考 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT) 的聚簇流程，移植了三個關鍵設計：

1. **召回用「標題＋摘要」，而且取前 3 個候選**
   只比標題會漏（同一件事不同媒體措辭差很遠），只取最佳候選會錯
   （最佳候選不對就漏掉真配對）。
2. **四種關係＋信心度，而不是 Yes/No**
   `SAME_OCCURRENCE`（同一次發生）／`SAME_STORY`（直接進展）／
   `UNRELATED`（不同事）／`ROUNDUP`（綜合稿）。
   AIHOT 實測二元問法會拒絕掉近一半真配對；只有前兩種、且信心 ≥0.75 才算同一件事。
3. **寫入前覆核**
   召回分數不夠高時，模型第一次說「同一件事」後，再獨立判斷一次；
   兩次都同意才合併（AIHOT 的 `GROUP_REVIEW_MODEL` 步驟）。

### 分數與門檻（用本專案真實資料校準）

分數 = `0.7 × 標題相似 + 0.3 × 摘要相似`，兩者都是
「重疊係數（交集÷較小集合）與 Jaccard（交集÷聯集）的平均」。
只用重疊係數會被短標題騙：`保濕精華實測` 對上一條含「保濕精華」的長清單標題
會拿 0.60，混合後降到 0.27。

| 實例 | 分數 | 判定 |
|---|---:|---|
| Sephora 75 折 ↔ 4 折（同一促銷改了折扣） | 0.90 | 直接合併 |
| Coupang 黑五 ↔ Coupang 攜手國際美妝（同一活動） | 0.70 | 直接合併 |
| 《Just Makeup》第 2 季 ↔ Just Makeup 2 生存戰（同一節目） | 0.43 | 模型判斷 |
| 保濕精華實測 ↔ iHerb 雙11 清單（同品類不同事） | 0.27 | 不同事 |
| 換季潔面 ↔ 抗老眼霜（完全不同） | 0.00 | 不同事 |

門檻：`EVENT_DUPLICATE = 0.66`、`EVENT_REVIEW = 0.32`，定義在
`src/lib/contentSocialCluster.ts`。改門檻前請先跑
`node scripts/content-selftest.mjs`（有一組用真實資料寫成的回歸測試）。

## 4. 已生成的重複：清理結果

migration 會把同一事件的多篇稿收斂成一篇，規則是
（與 `src/lib/contentSocialDedupe.ts` 的 `pickCanonicalPost` 完全一致）：

1. 狀態越先進越優先（published > publishing > scheduled > approved > pending_review > draft > failed/cancelled）
2. `grok` 優先於 `template`（AI 稿比模板稿有價值）
3. 導流帳號多者優先（合併後不漏帳號）
4. 較早建立者優先（看板上原本就在的那張）
5. id 最小者優先（完全平手時的穩定排序）

搬移規則：先把重複稿的導流搬到保留稿（同帳號已存在就跳過；已發佈狀態優先保留），
再刪掉重複稿（`content_social_targets` 由 FK cascade 清掉）。

實際執行結果（2026-11-26）：

| 指標 | 清理前 | 清理後 |
|---|---:|---:|
| 社媒稿 | 172 | **86** |
| 導流目標 | 516 | **344**（86 事件 × 4 帳號，一帳號一份） |
| 同事件多稿的事件 | 86 | **0** |
| 有去重指紋的稿件 | 0 | 86 |

清理前的完整快照存在
`backups/content-social-posts-before-dedupe-20261126.json` 與
`backups/content-social-targets-before-dedupe-20261126.json`。

## 5. 日常維運

### 重跑清理（可重複執行、預設只回報告）

```powershell
# 1) 先看報告（不動資料）
$body = '{"apply":false}'
Invoke-RestMethod -Method Post `
  -Uri "$env:URL/functions/v1/content-social?action=dedupe_cleanup" `
  -Headers @{ Authorization = "Bearer $env:SRK"; "Content-Type" = "application/json" } `
  -Body $body

# 2) 報告沒問題才套用
$body = '{"apply":true,"max_checks":8}'
```

回應欄位：

- `eventMerges`：會合併／已合併的事件對（`keep`、`drop`、`score`、`reason`）
- `postMerges`：同事件多稿的收斂（`keep`、`drop`、`movedTargets`）
- `fingerprintsBackfilled`：補算指紋的稿件數（每次最多 200 篇，避免逾時）

### 為什麼不會再重複

- `content_social_posts.event_id` 唯一索引：同一事件插入第二篇會回 23505，
  函式會改成「只補導流」。
- `create_event` 貼上重複新聞：直接回既有事件（`duplicate_of`），不新增事件。
- `import_events` CSV：文字近似也算重複，計入 `skipped`，不報錯。
- `auto_tick`：每個 tick 最多問模型 2 次做去重判斷，用完就保守當新事件，下一輪再判。
- 後續進展（例如同一促銷改了折扣）會併入同一事件、只保留原本那一篇稿；
  需要更新文案時在審核工作室改稿即可，不會再生成第二篇。
- `generate_now` 對「已經有稿」的事件不會再拿去跟別的事件合併，
  避免把已批准／已排期的稿併走。

### 已知取捨

- 事件層合併後，保留事件的標題仍是最早那則；新報導的標題只記在
  `content_hot_items`。需要換標題時用工作室改稿（會重算指紋）。
- 同一事件若真的需要「兩個版本」（例如不同品牌組要有不同切入點），
  目前不支援自動分流；請用工作室的「複製文案／改稿」手動處理。
- 事件相似度只用文字（字符 bigram），沒有向量服務。跨語言（中／英）同一件事
  可能召回不到；目前來源以繁中為主，暫可接受。

## 6. 部署順序（重要）

1. migration `20261127170000_content_social_dedupe.sql`（含資料清理與唯一索引）
2. `content-social`、`content-sources` Edge Functions
3. 前端（文案與「全品牌組」顯示）

順序不能顛倒：先部署函式而 migration 未上，`duplicate_of`／`content_fingerprint`
會讓查詢退回舊路徑（有 fallback），但「一事件一稿」的唯一索引不存在，
重複還是可能發生。

指令：

```powershell
$env:SUPABASE_ACCESS_TOKEN = (Get-Content "$env:USERPROFILE\.supabase\access-token" -Raw).Trim()
node scripts/content-run-sql.mjs supabase/migrations/20261127170000_content_social_dedupe.sql
node node_modules/supabase/dist/supabase.js functions deploy content-social --project-ref kwcevjcmdjadhrygjyfp --use-api
node node_modules/supabase/dist/supabase.js functions deploy content-sources --project-ref kwcevjcmdjadhrygjyfp --use-api
```

## 7. 回滾

- 唯一索引與 `group_id` 清空是資料層改動；要回到舊行為，先
  `drop index content_social_posts_event_uidx`，再回退兩支函式版本。
- 已刪除的重複稿不會自動復原；需要時由備份 JSON 重建（先建 post，再建 targets）。
- 事件合併只會把重複事件標成 `status='ignored'`＋`duplicate_of`，原事件仍在，
  必要時 `update content_hot_events set status='open', duplicate_of=null where id=...` 即可復原。
