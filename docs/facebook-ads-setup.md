# Facebook / Meta Ads 連接指南

完成後，MPS 可在 `#marketing/facebook-ads` 檢視多 Business 的 Campaign 成效，並在 `#marketing/facebook-ads-sync` 做歷史回填。

## 架構

- 前端讀 **Supabase warehouse**（`facebook_ads_*` 表），不直接打 Meta API
- Edge Functions 用 `META_CREDENTIALS_JSON`（多組 App + access token）同步資料
- Meta Insights 約只保留近 **37 個月**

## 已支援的 Business 憑證槽位

在 Supabase Edge secrets 設定一個 JSON 陣列（**不要**把 token 寫進 git）：

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
    "id": "food-and-wine",
    "name": "Food and Wine",
    "app_id": "<app-id>",
    "app_secret": "<app-secret>",
    "access_token": "<token>",
    "api_version": "v23.0"
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

設定方式（本機已 `supabase link` 且有 access token）：

```bash
npx supabase secrets set --project-ref kwcevjcmdjadhrygjyfp META_CREDENTIALS_JSON='[...]'
```

## Edge Functions

| Slug | 用途 |
|------|------|
| `supabase-functions-sync-facebook-ads` | 最近 7 日增量 |
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

## 驗證 checklist

1. Token 可呼叫 `GET /me/adaccounts`
2. Migration `facebook_ads_warehouse` 已套用
3. Secrets 已設定 `META_CREDENTIALS_JSON`
4. Functions 已部署
5. 在「Facebook Ads 同步」開始歷史回填，或在報表頁按 **Refresh recent (7d)**
6. 帳戶篩選應出現 Branding Works / Food and Wine / Attitude Beauty 下的 ad accounts
