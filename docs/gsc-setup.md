# Google Search Console (GSC) 連接指南

完成下列步驟後，MPS 才能同步真實的關鍵字／平均排名資料到 `#marketing/seo`。

> **你需要做的事（人工）在下方 checklist。** 程式碼與 Edge Function 由開發端負責；沒有 refresh token 與 property 授權，同步會是空的。

---

## 你需要準備

- 一個 Google 帳號（建議用公司 SEO／行銷共用帳號），之後會把它加進**每個客戶**的 Search Console property
- 能登入 [Google Cloud Console](https://console.cloud.google.com/) 的權限
- 能設定 Supabase Edge Function secrets 的權限（專案 `kwcevjcmdjadhrygjyfp`）

可重用現有 **Google Ads** 同一個 GCP 專案與 OAuth client（若已有），只要另外啟用 Search Console API，並用 **含 GSC scope** 的方式重新取得一組 refresh token。

---

## Checklist

### 1. 啟用 Search Console API

- [ ] 開啟 [Google Cloud Console](https://console.cloud.google.com/) → 選擇 Ads 用的同一個專案（或新建）
- [ ] **APIs & Services → Library** → 搜尋 **Google Search Console API** → **Enable**

### 2. OAuth Client

- [ ] **APIs & Services → Credentials → Create credentials → OAuth client ID**
- [ ] Application type 建議：**Desktop app**（方便本機一次換 token）
- [ ] 記下 `Client ID`、`Client Secret`
- [ ] 若 OAuth consent screen 仍是 Testing：把要用的 Google 帳號加進 **Test users**

### 3. 取得 Refresh Token（含 GSC scope）

在本機執行（需已安裝 Python 3 + `requests`）：

```bash
# 從 repo 根目錄
export GOOGLE_GSC_CLIENT_ID='你的-client-id.apps.googleusercontent.com'
export GOOGLE_GSC_CLIENT_SECRET='你的-client-secret'
python3 scripts/get-gsc-refresh-token.py
```

- [ ] 瀏覽器登入目標 Google 帳號並同意 **「檢視 Search Console 資料」**（readonly）
- [ ] 把終端機印出的 **refresh_token** 存好（不要 commit 進 git）

Scope 使用：

`https://www.googleapis.com/auth/webmasters.readonly`

### 4. 把該 Google 帳號加進每個 GSC property

對每個要追蹤的網站：

- [ ] 開啟 [Google Search Console](https://search.google.com/search-console)
- [ ] 選擇 property（Domain 或 URL-prefix 皆可）
- [ ] **設定 → 使用者和權限 → 新增使用者**
- [ ] 輸入上述 Google 帳號 email
- [ ] 權限選 **完整** 或 **受限制**（受限制即可讀 Search Analytics）

沒有加進 property 的網站，API 的 `sites.list` 看不到，同步會跳過。

### 5. 設定 Supabase Edge secrets

在 Supabase Dashboard → **Edge Functions → Secrets**（或 CLI）設定：

| Secret | 值 |
|--------|-----|
| `GOOGLE_GSC_CLIENT_ID` | OAuth Client ID |
| `GOOGLE_GSC_CLIENT_SECRET` | OAuth Client Secret |
| `GOOGLE_GSC_REFRESH_TOKEN` | 步驟 3 取得的 refresh token |

- [ ] 三個 secret 都已寫入（不要放進 `.env` commit）

### 6. 煙霧測試

部署 GSC sync function 後：

- [ ] 在 MPS `#marketing/seo` 按 **同步 GSC**，或呼叫 Edge Function `sync-gsc`
- [ ] 確認 `gsc_sites` 有列出你有權限的 properties
- [ ] 確認已對應到 `webandsystem_list` 的網站開始有 `gsc_query_daily_metrics` 列

### 7. 網站對應（domain mapping）

系統會用 hostname 把 GSC `siteUrl` 對到 `webandsystem_list.domain_url`。

- [ ] 檢查對不上的網站：在 `webandsystem_list` 填 `gsc_site_url`（完整 GSC siteUrl，例如 `sc-domain:example.com` 或 `https://www.example.com/`）
- [ ] 若要合併 Ads 關鍵字，一併填 `google_ads_customer_id`

### 8. 第一次同步預期

- GSC 資料通常有 **2–3 天延遲**
- 增量同步預設約最近 **28 天**
- 「排名」顯示的是 **GSC 平均排名（average position）**，不是第三方 SERP 工具的絕對名次

---

## 開發端會做的事（你不必做）

- DB migration（`gsc_*`、`seo_keywords`、`seo_upgrades`…）
- Edge Function：`sync-gsc`（及後續 Ads keyword sync）
- 前端 `#marketing/seo` / `#marketing/seo-upgrade` 改讀真實資料並清掉 demo

完成 Checklist **1–5** 後跟開發說一聲，即可跑第一次正式同步。
