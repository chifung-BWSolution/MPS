# Google Search Console (GSC) 連接指南

完成下列步驟後，MPS 才能同步真實的關鍵字／平均排名資料到網站詳情的 SEO 關鍵字 Tab。

> **你需要做的事（人工）在下方 checklist。** 程式碼、warehouse、Edge Function 已在 repo。沒有 `GOOGLE_GSC_REFRESH_TOKEN`，同步會失敗。

**重用現有 Google Ads / GA4 的 OAuth 連線**（同一個 GCP 專案、同一個 OAuth Client ID / Secret）。Ads 或 GA4 現有的 refresh token **不能直接拿來打 GSC**（scope 不同）。請用同一個 Client，另外用 [OAuth Playground](https://developers.google.com/oauthplayground/) 簽出一組 **Search Console readonly** refresh token。

建議用 **`chifung.login@gmail.com`**（與 GA4 相同的主帳號）來授權，並把該帳號加進每個 GSC property。

`unauthorized_client` 幾乎都是：refresh token 不是這個 OAuth client 簽出的（常見於 Playground 用了 Google 自己的 client，而不是你 GCP 專案的 App）。GSC 會先試 `GOOGLE_GSC_REFRESH_TOKEN`，失敗則改用**已能打 GA4 的 refresh token**。OAuth 會過，但 GA4 授權通常只有 `analytics.readonly`，Search Console API 仍可能 403。要補 GSC scope，請用 `scripts/get-gsc-refresh-token.py`（Ads client + 本機 loopback），不要用 Playground 預設 credentials。

---

## 你需要準備

- Google 帳號：`chifung.login@gmail.com`（對所有客戶 GSC property 至少 Restricted）
- 現有 **Google Ads** OAuth Client ID / Secret（Supabase secrets：`GOOGLE_ADS_CLIENT_ID`、`GOOGLE_ADS_CLIENT_SECRET`）
- 能改該 OAuth client 的 **Authorized redirect URIs**（Playground 需要；GA4 若已加過可跳過）
- 能設定 Supabase Edge Function secrets 的權限（專案 `kwcevjcmdjadhrygjyfp`）

---

## Checklist

### 1. 在 Ads 同一個 GCP 專案啟用 Search Console API

- [ ] 開啟 [Google Cloud Console](https://console.cloud.google.com/) → 選擇 **Google Ads API 正在用的專案**
- [ ] **APIs & Services → Library** → 啟用 **Google Search Console API**

不必新建 OAuth client。GSC 預設讀 `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET`（若有 `GOOGLE_GA4_CLIENT_*` 則先用那組）。

### 2. 讓 OAuth Playground 能用這個 Ads client

若 GA4 已經加過 Playground redirect，可跳過。

- [ ] **APIs & Services → Credentials** → 打開 Ads 用的 OAuth client
- [ ] **Authorized redirect URIs** 加上：

`https://developers.google.com/oauthplayground`

- [ ] 儲存。若 Ads client 是 Desktop 型、不能加 redirect：用 GA4 已建的 **Web** client（`GOOGLE_GA4_CLIENT_*`）
- [ ] Consent screen 若仍是 Testing：把 `chifung.login@gmail.com` 加進 **Test users**

### 3. 確認 GSC 權限

- [ ] [Google Search Console](https://search.google.com/search-console) → 每個要同步的 property
- [ ] **設定 → 使用者和權限 → 新增使用者**
- [ ] `chifung.login@gmail.com`，權限 **受限制** 即可（完整也可以）
- [ ] 沒有授權的 property，`sites.list` 看不到，同步會跳過

### 4. 在 MPS 一鍵授權（建議）

1. 到 Google Cloud Console → 與 GA4 同一個 OAuth client。若是 **Desktop** client，另建一個 **Web** client，把 ID/Secret 設成 `GOOGLE_GSC_CLIENT_ID` / `GOOGLE_GSC_CLIENT_SECRET`。
2. **Authorized redirect URIs** 加入：

`https://kwcevjcmdjadhrygjyfp.supabase.co/functions/v1/gsc-oauth`

3. MPS **行銷管理 → 廣告數據同步 → Google Search Console**（或網站詳情 SEO 關鍵字的「授權 GSC」）
4. 按 **一鍵授權 Search Console** → 用 `chifung.login@gmail.com` 登入並同意
5. 可用「顯示 refresh token」查看；token 會寫進 `google_oauth_tokens`（`provider = gsc`）

本機 script 仍可用（不要用 Playground 預設 client）：

Ads / GA4 的 OAuth client 多半是 **Desktop**。OAuth Playground 的 redirect 是 Google 自己的 URI，Desktop client 無法真正掛上去，所以 Playground 簽出的 token 屬於 **Playground App**，拿來打你的 Client ID 就會 `unauthorized_client`。GA4 當時能過，是因為 token 是用**同一個 Ads client** 簽的。

請用與 GA4 相同的本機 loopback 方式補上 Search Console scope（`chifung.login@gmail.com`）：

```powershell
$env:GOOGLE_ADS_CLIENT_ID = '與 GA4 同一個 client id'
$env:GOOGLE_ADS_CLIENT_SECRET = '與 GA4 同一個 client secret'
python scripts/get-gsc-refresh-token.py
```

- [ ] 瀏覽器登入 **`chifung.login@gmail.com`**，同意「檢視 Search Console 資料」
- [ ] 把印出的 refresh token 設成 `GOOGLE_GSC_REFRESH_TOKEN`

Script 會帶 `include_granted_scopes=true`，在現有 Ads/GA4 授權上**加** `webmasters.readonly`，不是另開一個 Playground App。

若堅持用 Playground：齒輪必須勾 **Use your own OAuth credentials**，而且該 client 必須是 **Web** 型並已加入 `https://developers.google.com/oauthplayground`。Desktop Ads client 走 Playground 一定會簽給 Google 的 App。

### 5. 寫入 Supabase secret

只需新寫 **GSC refresh token**。Client ID / Secret 沿用 Ads（或已有的 GA4 Web client）。**不要**再設一組不同的 `GOOGLE_GSC_CLIENT_SECRET`。

```bash
npx supabase secrets set --project-ref kwcevjcmdjadhrygjyfp \
  GOOGLE_GSC_REFRESH_TOKEN='從 Playground 複製的 refresh token'
```

若曾設錯過 `GOOGLE_GSC_CLIENT_ID` / `GOOGLE_GSC_CLIENT_SECRET`，先清掉以免蓋過 Ads client：

```bash
npx supabase secrets unset --project-ref kwcevjcmdjadhrygjyfp \
  GOOGLE_GSC_CLIENT_ID GOOGLE_GSC_CLIENT_SECRET
```

| Secret | 值 |
|--------|-----|
| `GOOGLE_ADS_CLIENT_ID` | **已有**，GSC 預設重用 |
| `GOOGLE_ADS_CLIENT_SECRET` | **已有**，GSC 預設重用 |
| `GOOGLE_GSC_REFRESH_TOKEN` | 步驟 4 的 Search Console readonly refresh token |
| `GOOGLE_GSC_CLIENT_ID` | 可選；只在不重用 Ads/GA4 client 時設 |
| `GOOGLE_GSC_CLIENT_SECRET` | 可選；必須與上面那個 client 成對 |

- [ ] `GOOGLE_GSC_REFRESH_TOKEN` 已寫入（不要放進 `.env` commit）
- [ ] 改 secrets **不必**重佈署 function

第一次成功同步後，token 會寫進 `google_oauth_tokens`（`provider = gsc`）。之後 Google 若旋轉 refresh token，Edge Function 會自動覆寫這列。

### 6. 煙霧測試

- [ ] MPS 網站詳情 → **SEO 關鍵字** → **同步 GSC**
- [ ] 確認 `gsc_sites` 有列出你有權限的 properties
- [ ] 確認已對應到 `webandsystem_list` 的網站開始有 `gsc_query_daily_metrics` 列

### 7. 網站對應（domain mapping）

1. `webandsystem_list.gsc_site_url`（完整 GSC siteUrl，例如 `sc-domain:example.com` 或 `https://www.example.com/`）
2. 否則 hostname ↔ `domain_url`

對不上就填 `gsc_site_url`。

### 8. 第一次同步預期

- GSC 資料通常有 **2–3 天延遲**
- 增量同步預設約最近 **28 天**（結束日為 3 天前，取 finalized 列）
- 「排名」顯示的是 **GSC 平均排名（average position）**
- 視窗內 impressions ≥ 10 的 query 會寫入 `seo_keywords`

---

## Refresh token 如何維持有效

| 情況 | 怎麼做 |
|------|--------|
| 第一次 | Playground 換 token → 設 `GOOGLE_GSC_REFRESH_TOKEN` |
| 日常同步 | Function 用 refresh token 換 access token（與 Google Ads / GA4 同一套 OAuth token endpoint） |
| Google 回傳新的 `refresh_token` | 自動寫入 `google_oauth_tokens`，下次優先用這組 |
| `unauthorized_client` | Token 與 client 不成對。用 Ads/GA4 同一個 client 重做步驟 4–5；清掉錯誤的 `GOOGLE_GSC_CLIENT_*` |
| Secret 過期／撤銷 | 重做步驟 4–5，再設一次 `GOOGLE_GSC_REFRESH_TOKEN` |

Consent screen 若一直停在 **Testing**，Google 可能在約 7 天後讓 refresh token 失效。長期使用請把 Ads 那個 GCP 專案的 consent screen 改成 **In production**。

---

## 開發端已做（你不必做）

- DB：`gsc_*`、`seo_keywords`、`webandsystem_list.gsc_site_url`
- Edge Function：`sync-gsc`
- 前端網站詳情 SEO 關鍵字 Tab「同步 GSC」

完成 Checklist **1–5** 後按「同步 GSC」跑第一次正式同步。
