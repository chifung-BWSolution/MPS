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

## Daily cron

Production `pg_cron` job (same pattern as Google Ads):

| | |
|--|--|
| **jobname** | `facebook-ads-incremental-daily` |
| **schedule** | `15 22 * * *` (22:15 UTC daily; Google Ads is `0 22 * * *`) |
| **action** | `net.http_post` → `supabase-functions-sync-facebook-ads` |

Google Ads: `google-ads-incremental-daily` @ `0 22 * * *`.

To recreate (SQL editor / `supabase db query`), clone the Bearer from the Google job — **do not commit the service role key**:

```sql
DO $$
DECLARE
  google_cmd text;
  bearer text;
BEGIN
  SELECT command INTO google_cmd
  FROM cron.job
  WHERE jobname = 'google-ads-incremental-daily'
  LIMIT 1;

  bearer := substring(google_cmd from '''Authorization'', ''Bearer ([^'']+)''');
  IF bearer IS NULL THEN
    RAISE EXCEPTION 'Could not extract bearer from google-ads cron';
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'facebook-ads-incremental-daily';

  PERFORM cron.schedule(
    'facebook-ads-incremental-daily',
    '15 22 * * *',
    format(
      $cron$SELECT net.http_post(
    url := 'https://kwcevjcmdjadhrygjyfp.supabase.co/functions/v1/supabase-functions-sync-facebook-ads',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
    body := '{}'::jsonb
  ) AS request_id;$cron$,
      bearer
    )
  );
END
$$;
```

Check jobs (redacted):

```sql
select jobname, schedule, active
from cron.job
where jobname like '%ads-incremental%';
```

## Edge Functions

| Slug | 用途 |
|------|------|
| `supabase-functions-sync-facebook-ads` | 最近 7 日增量 + 帳戶 prune（手動 + 每日 cron） |
| `supabase-functions-facebook-ads-backfill-step` | 歷史回填（`start` / `pause` / `resume` / `cancel` / `step`） |
| `supabase-functions-sync-ads-website-links` | 網站列表「同步廣告網域」：**僅 Google** 目的地 URL 發現與連結 |

部署：

```bash
npx supabase functions deploy supabase-functions-sync-facebook-ads --project-ref kwcevjcmdjadhrygjyfp
npx supabase functions deploy supabase-functions-facebook-ads-backfill-step --project-ref kwcevjcmdjadhrygjyfp
npx supabase functions deploy supabase-functions-sync-ads-website-links --project-ref kwcevjcmdjadhrygjyfp
npx supabase functions deploy supabase-functions-sync-google-ads --project-ref kwcevjcmdjadhrygjyfp
npx supabase functions deploy supabase-functions-google-ads-backfill-step --project-ref kwcevjcmdjadhrygjyfp
```

Also apply:
- `20260806200000_ads_website_junctions.sql`（`google_ads_campaign_websites`、`ads_discovered_domains`）
- `20260810040000_facebook_ads_campaign_brand.sql`（drop FB↔vchannel；`facebook_ads_campaigns.brand_list_id`）

## Campaign ↔ 品牌（手動）

- `facebook_ads_campaigns.brand_list_id` → `brand_list.id`（uuid，可空）
- 在 `/#marketing/facebook-ads` 點「品牌」欄開啟 dialog 手動設定；Ads sync **不會**覆寫此欄位

## 網站自動連結（Google only）

- Google：**Campaign ↔ 網站**（`google_ads_campaign_websites`），來源為 Final URL / landing page
- 未對應網域寫入 `ads_discovered_domains`；在 `/#website/list` 按「同步廣告網域」可提示建立網站後自動重連

## 前端路由

| Hash | 說明 |
|------|------|
| `/#marketing/facebook-ads` | Campaign 報表；手動設定品牌 |
| `/#marketing/facebook-ads-sync` | 完整歷史回填控制台 |
| `/#website/list` | 網站列表：Google 廣告狀態欄、同步廣告網域、未連結網域建立提示 |

Business 篩選與 KPI 由 warehouse 動態產生，**不需改前端**即可支援新增憑證。

## 驗證 checklist

1. Token 可呼叫 `GET /me/adaccounts`
2. Migration `facebook_ads_warehouse` 已套用
3. Secrets 已設定 `META_CREDENTIALS_JSON`（目前 4 組）
4. Functions 已部署
5. 在報表頁按 **Refresh recent (7d)**，應看到 4 Business / 對應帳戶數
6. 舊憑證留下的帳戶會在增量同步時被自動移除
