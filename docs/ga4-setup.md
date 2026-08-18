# Google Analytics 4 (GA4) 連接指南

完成下列步驟後，MPS 才能把各網站的 GA4 流量同步到「網站+系統 → 網站流量」，並開啟與 Google Ads Campaign 詳情相同風格的報表頁。

> **你需要做的事（人工）在下方 checklist。** 程式碼、warehouse、Edge Function 由開發端負責；沒有 refresh token，同步會失敗。

建議用 **`chifung.login@gmail.com`**（已有全部 GA4 網站權限）來授權。可重用現有 **Google Ads / GSC** 同一個 GCP 專案與 OAuth client，只要另外啟用 Analytics API，並用 **含 Analytics readonly scope** 的方式重新取得一組 refresh token。

---

## 你需要準備

- Google 帳號：`chifung.login@gmail.com`（或同等、對所有客戶 GA4 property 有「檢視者」以上權限的帳號）
- 能登入 [Google Cloud Console](https://console.cloud.google.com/) 的權限
- 能設定 Supabase Edge Function secrets 的權限（專案 `kwcevjcmdjadhrygjyfp`）

---

## Checklist

### 1. 啟用 Analytics API

- [ ] 開啟 [Google Cloud Console](https://console.cloud.google.com/) → 選擇 Ads / GSC 用的同一個專案
- [ ] **APIs & Services → Library** → 啟用這兩個：
  - **Google Analytics Data API**（報表數字）
  - **Google Analytics Admin API**（列出帳號／property／data stream）

### 2. OAuth Client

- [ ] 重用 Ads／GSC 的 **Desktop** OAuth client（記下 `Client ID`、`Client Secret`）
- [ ] 或 **APIs & Services → Credentials → Create credentials → OAuth client ID** → Application type：**Desktop app**
- [ ] 若 OAuth consent screen 仍是 Testing：把 `chifung.login@gmail.com` 加進 **Test users**

### 3. 確認 GA4 權限

對每個要出報表的網站：

- [ ] 開啟 [Google Analytics](https://analytics.google.com/)
- [ ] Admin → **Property access management**
- [ ] 確認 `chifung.login@gmail.com` 至少是 **Viewer**
- [ ] 沒有加進 property 的網站，Admin API 的 `accountSummaries` 看不到，同步會跳過

### 4. 取得 Refresh Token（Analytics readonly）

在本機執行（需已安裝 Python 3 + `requests`）：

```bash
# 從 repo 根目錄；可重用 GSC 的 client
export GOOGLE_GA4_CLIENT_ID='你的-client-id.apps.googleusercontent.com'
export GOOGLE_GA4_CLIENT_SECRET='你的-client-secret'
python3 scripts/get-ga4-refresh-token.py
```

- [ ] 瀏覽器登入 **`chifung.login@gmail.com`**（不要用個人帳號）
- [ ] 同意 **「查看您的 Google Analytics 資料」**（readonly）
- [ ] 把終端機印出的 **refresh_token** 存好（不要 commit 進 git）

Scope：

`https://www.googleapis.com/auth/analytics.readonly`

若沒有 refresh_token：到 [Google 帳號權限](https://myaccount.google.com/permissions) 撤銷該 OAuth app 後重跑（必須 `prompt=consent`）。

### 5. 設定 Supabase Edge secrets

```bash
npx supabase secrets set --project-ref kwcevjcmdjadhrygjyfp \
  GOOGLE_GA4_CLIENT_ID='....apps.googleusercontent.com' \
  GOOGLE_GA4_CLIENT_SECRET='....' \
  GOOGLE_GA4_REFRESH_TOKEN='....'
```

或在 Dashboard → **Edge Functions → Secrets** 寫入同一組。

| Secret | 值 |
|--------|-----|
| `GOOGLE_GA4_CLIENT_ID` | OAuth Client ID（可與 GSC 相同） |
| `GOOGLE_GA4_CLIENT_SECRET` | OAuth Client Secret |
| `GOOGLE_GA4_REFRESH_TOKEN` | 步驟 4 取得的 refresh token |

- [ ] 三個 secret 都已寫入（不要放進 `.env` commit）
- [ ] 改 secrets **不必**重佈署 function；改程式碼才需 deploy

### 6. 煙霧測試

- [ ] 在 MPS **網站+系統 → 網站流量** 按 **同步 GA4**
- [ ] 確認列表出現你有權限的 properties
- [ ] 已對到 `webandsystem_list` 的網站可以點進詳情（KPI／趨勢圖／渠道 donut／星期／每日表）
- [ ] 詳情頁細項（頁面／裝置／國家／來源）來自即時 Data API

### 7. 網站對應（property mapping）

系統會依序對應：

1. `webandsystem_list.ga4_property_id`（完整數字 ID，例如 `123456789`）
2. GA4 web stream 的 default URI／網域 ↔ `domain_url`
3. property 顯示名稱與網站名稱／網域

- [ ] 對不上的網站：在 `webandsystem_list` 填 `ga4_property_id`
- [ ] 一個網站只應對一個 GA4 property（多 stream 仍屬同一 property）

### 8. 第一次同步預期

- GA4 標準報表通常有 **24–48 小時**延遲；增量預設拉最近 **90 日**、結束日為昨天
- Users / Sessions / Pageviews / Engagement / Bounce / Duration / Conversions 會寫入 warehouse
- 渠道（`sessionDefaultChannelGroup`）一併入倉，供 donut
- 頁面／裝置／國家／來源**不落倉庫**，詳情頁即時拉取（上限 92 日）

---

## 開發端會做的事（你不必做）

- DB migration（`ga4_*`、`webandsystem_list.ga4_property_id`）
- Edge Function：`sync-ga4`、`supabase-functions-ga4-breakdowns`
- 前端 `#website/traffic` 列表 + 詳情（對齊 Google Ads Campaign 詳情版面）

完成 Checklist **1–5** 後跟開發說一聲，即可跑第一次正式同步。

## Daily cron（可選）

Production 可仿 Google Ads，每天增量一次：

| | |
|--|--|
| **jobname** | `ga4-incremental-daily` |
| **schedule** | `30 22 * * *`（22:30 UTC；Ads 是 `0 22`） |
| **action** | `net.http_post` → `…/functions/v1/sync-ga4` |

Bearer 請從現有 Ads／GSC cron 複製，**不要把 service role key commit 進 git**。
