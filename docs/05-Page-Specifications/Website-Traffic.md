# Page Specification — Website Traffic (網站流量)

## Route: `#website/traffic`

### 概述
以 GA4 每日指標彙總各網站流量，版面與 Google Ads Campaign 詳情相同：KPI、趨勢圖、渠道 donut、星期分布、每日表，以及即時細項。

### Sub-routes
| Path | Description |
|------|-------------|
| `#website/traffic` | Property / 網站列表 |
| `#website/traffic?property={propertyId}&preset=30d&from=&to=` | 單一網站流量詳情 |

網站詳情 Tab「網站流量」可跳到對應 property 的詳情頁。

### 列表
- 篩選：日期區間、搜尋、GA4 帳戶、關聯網站
- 欄位：網站、Property、帳戶、Users、Sessions、Pageviews、Bounce、Engagement、Avg duration
- 操作：重新載入、同步 GA4（最近 90 日）
- 點擊列開啟詳情

### 詳情（對齊 Ads Campaign 詳情）
- KPI（含前期比較與 sparkline）：Users、Sessions、Pageviews、Bounce rate、Engagement、Avg duration
- Performance over time：Users / Sessions / Pageviews
- Channel mix donut：`sessionDefaultChannelGroup`
- Day of week、Daily metrics
- 即時細項（上限 92 日）：Top pages、Devices、Countries、Sources

### 數據源
| 區塊 | 來源 |
|------|------|
| 列表／KPI／趨勢／每日 | `ga4_property_daily_metrics` + `ga4_property_metrics_range` |
| Channel donut | `ga4_channel_daily_metrics` |
| Property 對應 | `ga4_properties` ↔ `webandsystem_list` |
| 細項 | Edge Function `supabase-functions-ga4-breakdowns`（即時 Data API） |
| 同步 | Edge Function `sync-ga4` |

設定步驟見 [docs/ga4-setup.md](../ga4-setup.md)：重用 **Google Ads** OAuth client，用 [OAuth Playground](https://developers.google.com/oauthplayground/) 取得 Analytics readonly refresh token。旋轉後的 token 存在 `google_oauth_tokens`。
