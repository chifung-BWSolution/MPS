# 內容自動化 · 站點接入 SOP（M5-01，50 站分批）

> 目標：每站 **< 30 分鐘**完成接入，且每站都能通過連線測試。
> 工具：`#tools-center/social-automation?zone=seo&page=sites` → 「＋ 接入新站」（5 步精靈）。

## 1. 前置資料（缺一項就先不要開工）

| # | 資料 | 用途 |
|---|---|---|
| 1 | 站點網域（含 https） | 連線測試、canonical |
| 2 | 站點語言（zh-HK／en 等） | SEO 預設、文章語言 |
| 3 | 至少一個欄目名稱＋slug＋external_id | 文章歸屬與內容包 |
| 4 | 站點負責人（姓名／email） | 內容包交付與回填 |
| 5 | 品牌語氣（3 個形容詞）、禁用詞、字數下限、是否允許 AI 圖 | 生成 brief 與 QA |
| 6 | 品牌素材位置（logo／封面）或先用 SVG 圖卡 | 配圖 |
| 7 | 站點時區與期望發佈時間 | cadence |

用 CSV 收集（可貼進試算表）：

```csv
site,domain,locale,section_name,section_slug,external_id,owner_email,tone,banned_words,words_min,allowed_ai_images,timezone,publish_time
BWA,https://example.com,zh-HK,文章,insights,news,owner@example.com,"專業、務實",最;保證,800,false,Asia/Hong_Kong,10:00
```

## 2. 每站 30 分鐘流程

1. **選站**（3 分鐘）：精靈第 1 步從 `webandsystem_list` 搜尋；已接入的會標記。
2. **欄目**（5 分鐘）：名稱／slug／external_id／型別（article/post/page）；slug 必須站內唯一。
3. **語言與品牌語氣**（5 分鐘）：locale、tone、audience、CTA、禁用詞、事實邊界。
4. **cadence 與模式**（5 分鐘）：
   - 頻率：daily／every_2_days／twice_weekly／weekly／custom
   - 發佈時間（站點時區）、lead time 48h、review cutoff 4h、單日上限
   - 模式：v1 一律 `manual`
5. **連線測試**（5–10 分鐘）：精靈會逐項跑「設定完整 → 網域可達 → sitemap → 憑證」；失敗可回上一步且資料保留。
6. **收尾**（2 分鐘）：到站點詳情確認 health=ok、`daily_article_limit` 仍為 0（等全站鋪開再開）。

## 3. 分批節奏

- 每批 **5 站**，完成後跑一次驗收表；有問題的站記入例外清單，不要邊修邊開下一批。
- 每批之間觀察 1 天：生成成功率、待審量、內容包回填率。
- 50 站分 10 批；第 1 批建議選 A1/A2 重點站，先驗證語氣與品質。

## 4. 每批驗收表

| 檢查 | 通過標準 |
|---|---|
| 連線測試 | health=ok（或只有 sitemap warning） |
| 欄目 | 至少 1 個，slug 正確 |
| 關鍵字 | 每站 ≥ 10 個 `pipeline_status='backlog'` |
| 排程 | 未來 14 天 slots 數量與 cadence 相符 |
| 內容包 | 可下載 zip，內含 article.html/md/meta.json/README/images |
| 回填 | 貼上測試文章後可回填 URL → `manual_done` |
| 日報 | 該站出現在當日分站明細 |

## 5. 常見失敗

| 現象 | 處理 |
|---|---|
| 網域 HEAD 失敗 | 確認 https、DNS、WAF 是否擋 HEAD；必要時先用 GET |
| sitemap 404 | 非阻擋；health=degraded，可稍後補 |
| 欄目 slug 重複 | 改 slug（同站唯一） |
| 憑證無法解密 | `CONTENT_VAULT_KEY` 未設或已輪換；重存憑證 |
| 沒有 GSC 機會詞 | 先到「網站 → GSC」同步，或改 CSV 匯入 |
| 生成 0 篇 | 檢查 `daily_article_limit`（出廠 0）、關鍵字是否 backlog、站點 health |

## 6. 工具

```powershell
cd D:\Project\MPS
node scripts/content-remote-audit.mjs      # 遠端物件／migration 對齊
node scripts/content-deploy-verify.mjs     # 部署後驗證
```

關鍵字 CSV 範本：`public/templates/content-keywords-template.csv`。
