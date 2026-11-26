# 內容自動化 · 營運操作手冊（M5-05）

> 對象：日常操作者（文案、行銷、總編輯）與值班管理層。
> 工具入口：`#tools-center/social-automation`（社媒）與 `?zone=seo`（網站內容）。

## 1. 每日 5 分鐘

1. 開「今日工作」看頂部指標：待審、待發佈、今日已發、失敗。
2. 有 amber／rose 告警橫幅 → 依下方對應章節處理。
3. 「熱點雷達」確認新抓到的熱點有被產稿；`pending` 太多時不用手動追，系統每 2 分鐘處理 1 個。
4. 「進度看板」把 `待審` 清到 0；`待發佈` 的批次下載內容包交付。

## 2. 每週

- 看「每日日報」的生成／待審／已發／失敗趨勢（`zone=seo → 日報`）。
- 看「用量」：Grok token 與篇數；若接近免費額度，把每日上限調低。
- 抽查 3 篇 AI 稿：品牌語氣、事實邊界、禁用詞（`evaluateSeoQa` 會標記硬檢查）。

## 3. 常見情境

| 情境 | 怎麼做 |
|---|---|
| 稿件需修改 | 工作室「退回修改」並寫原因；狀態轉 `changes_requested`，下一輪編輯可見 |
| 待審超過 48 小時 | 日報／告警會列「待審逾期」；優先清，避免 `publish_at - cutoff` 被 hold |
| 已排程但未批准（逾期） | 系統會轉 `held` 且**永不自動發**；到排程表重新排期或取消 |
| 內容包已產生、尚未貼上 | 回執頁「待回填」列出；貼上後回填 live URL → `manual_done` |
| 發布失敗 | 回執頁「失敗」可重試；連續失敗看憑證與站點健康 |
| 站點憑證失效 | 告警 `credential_invalid`；到站點詳情重存憑證並測試連線 |
| 熱點來源連續失敗 | 告警 `source_failing`；檢查 `content_sources.last_error`，必要時停用該來源 |
| Grok 超時／JSON 不合法 | 系統自動退回模板（稿件標「模板草稿」）；可在設定頁把模型換成 `grok-4.3` 以外的備援 |
| 額度用盡 | 生成 job 順延到次日 00:05、slot `held`；調高上限或等隔日 |

## 5. 自動營運總開關

「社媒營運」右上角有一個 **自動營運** 開關（只有 management 可切換）：

- **運行中**：每小時抓 RSS、每 2 分鐘自動產稿。
- **已暫停**：停止抓取與 cron 自動產稿；**手動「立即生成」仍可用**，方便你先處理積壓或調整品牌語氣。
- 狀態存在 `content_settings.feature_flags.social_autopilot`；重新整理或換裝置都會保留。

使用時機：大量促銷文湧入、品牌語氣要調整、或不想再增加 AI 成本時，先暫停，處理完再開。

## 6. Grok 成本

- 用量頁（`zone=seo → 用量`）的「社媒生成（Grok）」會列出呼叫次數、tokens 與估算成本。
- 估算價：Grok 4 系列 **US$3 / 1M input、US$15 / 1M output**（`src/lib/contentFormat.ts` 的 `LLM_PRICING`）；實際以 xAI 帳單為準。
- 每次生成寫入 `content_llm_usage`（`use_case=social`），可依日期／模型查。

## 7. 角色與權限

| 動作 | copywriter／marketing／PM | chief_editor | management |
|---|---|---|---|
| 檢視／複製文案 | ✓ | ✓ | ✓ |
| 生成／編輯／送審 | ✓ | ✓ | ✓ |
| 批准／駁回／排期 | ✗ | ✓ | ✓ |
| 站點接入／憑證／全域設定 | ✗ | ✗ | ✓ |

後端每個 action 都會重算角色；前端只負責隱藏按鈕。

## 8. 緊急停用（由輕到重）

1. **停止生成**：設定頁把 `daily_article_limit` 設 0、`digest_enabled` 關閉。
2. **停用排程**：`select cron.unschedule('content-social-tick');`（其餘 cron 同名處理）。
3. **隱藏入口**：移除 `AppContext` 的 `social-automation` 子項後重新部署前端（資料不動）。
4. **完整移除**：見 `docs/content-automation-deployment.md` 的回滾章節；先備份。

## 9. 每日自動流程（不用人手）

```
每小時 :15  content-sources    抓 RSS → 去重／聚簇 → 寫 open 熱點
每 2 分鐘   content-social     新熱點 → 先去重（同一件事併進既有事件）→ 產「1 長文 + 每帳號導流」
每 2 分鐘   content-worker     SEO 站的排程／生成／發布
每日 00:10  content-planner    產生未來 30 天 slot
每日 09:00  content-digest     寄日報（可改時間）
每日 02:00  content-health     站點健康與內鏈刷新
```

**同一件事只會有一篇稿**：品牌組只是「誰會收到」的名單，不是「產幾篇」。
貼上重複新聞時系統會併進既有事件（不會新增事件），CSV 匯入會計入 `skipped`。
發現歷史重複可跑 `content-social?action=dedupe_cleanup`（預設只回報告）；
詳見 [content-dedupe.md](content-dedupe.md)。

## 10. 相關文件

- 部署與回滾：[content-automation-deployment.md](content-automation-deployment.md)
- 站點接入：[content-site-onboarding-sop.md](content-site-onboarding-sop.md)
- 故障排查：[content-troubleshooting.md](content-troubleshooting.md)
- cron 設定：[content-cron-setup.md](content-cron-setup.md)
