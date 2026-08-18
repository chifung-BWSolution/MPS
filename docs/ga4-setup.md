# Google Analytics 4 (GA4) 連接指南

完成下列步驟後，MPS 才能把各網站的 GA4 流量同步到「網站+系統 → 網站流量」。

> **你需要做的事（人工）在下方 checklist。** 程式碼、warehouse、Edge Function 已在 `main`。沒有 `GOOGLE_GA4_REFRESH_TOKEN`，同步會失敗。

**重用現有 Google Ads API 的 OAuth 連線**（同一個 GCP 專案、同一個 OAuth Client ID / Secret）。Ads 現有的 `GOOGLE_ADS_REFRESH_TOKEN` **不能直接拿來打 GA4**（scope 是 Ads，不是 Analytics）。請用同一個 Client，另外用 [OAuth Playground](https://developers.google.com/oauthplayground/) 簽出一組 **Analytics readonly** refresh token。

建議用 **`chifung.login@gmail.com`**（已有全部 GA4 網站權限）來授權。

---

## 你需要準備

- Google 帳號：`chifung.login@gmail.com`（對所有客戶 GA4 property 至少 Viewer）
- 現有 **Google Ads** OAuth Client ID / Secret（Supabase secrets：`GOOGLE_ADS_CLIENT_ID`、`GOOGLE_ADS_CLIENT_SECRET`）
- 能改該 OAuth client 的 **Authorized redirect URIs**（Playground 需要）
- 能設定 Supabase Edge Function secrets 的權限（專案 `kwcevjcmdjadhrygjyfp`）

---

## Checklist

### 1. 在 Ads 同一個 GCP 專案啟用 Analytics API

- [ ] 開啟 [Google Cloud Console](https://console.cloud.google.com/) → 選擇 **Google Ads API 正在用的專案**
- [ ] **APIs & Services → Library** → 啟用：
  - **Google Analytics Data API**
  - **Google Analytics Admin API**

不必新建 OAuth client。GA4 預設讀 `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET`。

### 2. 讓 OAuth Playground 能用這個 Ads client

Playground 的 redirect 必須加進 **同一個** Ads OAuth client：

- [ ] **APIs & Services → Credentials** → 打開 Ads 用的 OAuth client
- [ ] **Authorized redirect URIs** 加上：

`https://developers.google.com/oauthplayground`

- [ ] 儲存。若 Ads client 是 Desktop 型、不能加 redirect：在**同一專案**建一個 **Web** client，把上面的 URI 加上，Playground 用這組 ID/Secret；Edge Function 則把 `GOOGLE_GA4_CLIENT_ID` / `GOOGLE_GA4_CLIENT_SECRET` 設成這組 Web client（仍屬 Ads 同一個 GCP 專案）
- [ ] Consent screen 若仍是 Testing：把 `chifung.login@gmail.com` 加進 **Test users**

### 3. 確認 GA4 權限

- [ ] [Google Analytics](https://analytics.google.com/) → Admin → **Property access management**
- [ ] `chifung.login@gmail.com` 至少是 **Viewer**
- [ ] 沒有授權的 property，Admin API 看不到，同步會跳過

### 4. 用 OAuth Playground 取得 refresh token

1. 開啟 [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. 右上角齒輪 **OAuth 2.0 configuration**：
   - 勾選 **Use your own OAuth credentials**
   - **OAuth Client ID** / **OAuth Client Secret** = 步驟 2 的 Ads（或同專案 Web）client
3. 左欄 **Step 1 Select & authorize APIs**：
   - 不要用 Ads scope
   - 在輸入框貼上並勾選：

   `https://www.googleapis.com/auth/analytics.readonly`

4. **Authorize APIs** → 登入 **`chifung.login@gmail.com`** → 同意檢視 Analytics 資料
5. **Step 2** 按 **Exchange authorization code for tokens**
6. 複製 **Refresh token**（不要 commit）

若沒有 Refresh token：齒輪裡確認已用**自己的** credentials；或到 [Google 帳號權限](https://myaccount.google.com/permissions) 撤銷該 app 後重做 Step 1（需再同意一次）。

### 5. 寫入 Supabase secret

只需新寫 **GA4 refresh token**。Client ID / Secret 沿用 Ads（除非步驟 2 用了另建的 Web client）。

```bash
npx supabase secrets set --project-ref kwcevjcmdjadhrygjyfp \
  GOOGLE_GA4_REFRESH_TOKEN='從 Playground 複製的 refresh token'
```

若 Playground 用的是另建 Web client：

```bash
npx supabase secrets set --project-ref kwcevjcmdjadhrygjyfp \
  GOOGLE_GA4_CLIENT_ID='web-client-id.apps.googleusercontent.com' \
  GOOGLE_GA4_CLIENT_SECRET='web-client-secret' \
  GOOGLE_GA4_REFRESH_TOKEN='從 Playground 複製的 refresh token'
```

| Secret | 值 |
|--------|-----|
| `GOOGLE_ADS_CLIENT_ID` | **已有**，GA4 預設重用 |
| `GOOGLE_ADS_CLIENT_SECRET` | **已有**，GA4 預設重用 |
| `GOOGLE_GA4_REFRESH_TOKEN` | 步驟 4 的 Analytics readonly refresh token |
| `GOOGLE_GA4_CLIENT_ID` | 可選；只在不重用 Ads client 時設 |
| `GOOGLE_GA4_CLIENT_SECRET` | 可選；只在不重用 Ads client 時設 |

- [ ] `GOOGLE_GA4_REFRESH_TOKEN` 已寫入（不要放進 `.env` commit）
- [ ] 改 secrets **不必**重佈署 function

第一次成功同步後，token 會寫進 `google_oauth_tokens`（`provider = ga4`）。之後 Google 若旋轉 refresh token，Edge Function 會自動覆寫這列，**不必再跑 Playground**。

### 6. 煙霧測試

- [ ] MPS **網站+系統 → 網站流量** → **同步 GA4**
- [ ] 列表出現你有權限的 properties
- [ ] 已對到 `webandsystem_list` 的網站可開詳情
- [ ] 詳情細項（頁面／裝置／國家／來源）來自即時 Data API

### 7. 網站對應

1. `webandsystem_list.ga4_property_id`（例如 `123456789`）
2. GA4 web stream default URI／網域 ↔ `domain_url`
3. property 顯示名稱與網站名稱／網域

對不上就填 `ga4_property_id`。一個網站只對一個 property。

### 8. 第一次同步預期

- GA4 通常延遲 **24–48 小時**；增量預設最近 **90 日**、結束日為昨天
- Users / Sessions / Pageviews / Engagement / Bounce / Duration / Conversions 入倉
- 渠道入倉供 donut
- 頁面／裝置／國家／來源即時拉取（上限 92 日）

---

## Refresh token 如何維持有效

| 情況 | 怎麼做 |
|------|--------|
| 第一次 | Playground 換 token → 設 `GOOGLE_GA4_REFRESH_TOKEN` |
| 日常同步 / 詳情細項 | Function 用 refresh token 換 access token（與 Google Ads 同一套 OAuth token endpoint） |
| Google 回傳新的 `refresh_token` | 自動寫入 `google_oauth_tokens`，下次優先用這組 |
| Secret 過期／撤銷／Playground token 失效 | 重做步驟 4–5，再設一次 `GOOGLE_GA4_REFRESH_TOKEN` |

Consent screen 若一直停在 **Testing**，Google 可能在約 7 天後讓 refresh token 失效。長期使用請把 Ads 那個 GCP 專案的 consent screen 改成 **In production**。

---

## 開發端已做（你不必做）

- DB：`ga4_*`、`webandsystem_list.ga4_property_id`、`google_oauth_tokens`
- Edge Function：`sync-ga4`、`supabase-functions-ga4-breakdowns`（會旋轉並保存 refresh token）
- 前端 `#website/traffic`

完成 Checklist **1–5** 後在「網站流量」按同步即可。不必設每日 metrics cron：每次 `sync-ga4` / 細項 function 都會用 refresh token 換 access token（與 Google Ads 相同）。
