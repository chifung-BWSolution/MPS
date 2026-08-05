# Facebook / Meta Ads 連接指南

完成後，MPS 可在 `#marketing/facebook-ads` 檢視多 Business 的 Campaign 成效，並在 `#marketing/facebook-ads-sync` 做歷史回填。

## 架構

- 前端讀 **Supabase warehouse**（`facebook_ads_*` 表），不直接打 Meta API
- Edge Functions 用 `META_CREDENTIALS_JSON`（**任意 N 組** App + access token）同步資料
- 增量同步會 **upsert 現有帳戶**，並 **刪除目前憑證清單已不再回傳的帳戶**
- Meta Insights 約只保留近 **37 個月**

## META_CREDENTIALS_JSON

在 Supabase Edge secrets 設定一個 JSON **陣列**（**不要**把 token 寫進 git）。每多一個 Business / App，就多加一個物件即可。

```json
[
  {
    "id": "branding-works",
    "name": "Branding Works",
    "app_id": "<app-id>",
    "app_secret": "<app-secret>",
    "access_token": "<token>",
    "api_version": "v25.0"
  },
  {
    "id": "winepassions",
    "name": "winepassions",
    "app_id": "<app-id>",
    "app_secret": "<app-secret>",
    "access_token": "<token>",
    "api_version": "v25.0"
  },
  {
    "id": "food-channels-catering",
    "name": "Food Channels Catering",
    "app_id": "<app-id>",
    "app_secret": "<app-secret>",
    "access_token": "<token>",
    "api_version": "v25.0"
  },
  {
    "id": "attitude-beauty",
    "name": "Attitude Beauty",
    "app_id": "<app-id>",
    "app_secret": "<app-secret>",
    "access_token": "<token>",
    "api_version": "v25.0"
  }
]
```

欄位別名也可用：`accessToken` / `appId` / `appSecret` / `apiVersion` / `businessKey`。

設定方式：

```bash
npx supabase secrets set --project-ref kwcevjcmdjadhrygjyfp META_CREDENTIALS_JSON='[...]'
```

改完 secrets **不必重佈署 function**（執行時讀 env）；若改了程式碼才需 `functions deploy`。

## Edge Functions

| Slug | 用途 |
|------|------|
| `supabase-functions-sync-facebook-ads` | 最近 7 日增量 + 帳戶 prune |
| `supabase-functions-facebook-ads-backfill-step` | 歷史回填（`start` / `pause` / `resume` / `cancel` / `step`） |

部署：

```bash
npx supabase functions deploy supabase-functions-sync-facebook-ads --project-ref kwcevjcmdjadhrygjyfp
npx supabase functions deploy supabase-functions-facebook-ads-backfill-step --project-ref kwcevjcmdjadhrygjyfp
```

## 前端路由

| Hash | 說明 |
|------|------|
| `/#marketing/facebook-ads` | Campaign 報表（日期區間、Business/帳戶篩選） |
| `/#marketing/facebook-ads-sync` | 完整歷史回填控制台 |

Business 篩選與 KPI 由 warehouse 動態產生，**不需改前端**即可支援新增憑證。

## 驗證 checklist

1. Token 可呼叫 `GET /me/adaccounts`
2. Migration `facebook_ads_warehouse` 已套用
3. Secrets 已設定 `META_CREDENTIALS_JSON`（目前 4 組）
4. Functions 已部署
5. 在報表頁按 **Refresh recent (7d)**，應看到 4 Business / 對應帳戶數
6. 舊憑證留下的帳戶會在增量同步時被自動移除
