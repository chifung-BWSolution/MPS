-- Persist Meta pixel/action families for the Conv. hover card.
-- Warehouse Conv. stays Insights `results` (Ads Manager 成果); this map is display-only.

ALTER TABLE public.facebook_ads_campaign_daily_metrics
  ADD COLUMN IF NOT EXISTS action_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP FUNCTION IF EXISTS public.facebook_ads_campaign_metrics_range(date, date);

CREATE FUNCTION public.facebook_ads_campaign_metrics_range(
  p_from date,
  p_to date
)
RETURNS TABLE (
  ad_account_id text,
  campaign_id text,
  impressions bigint,
  clicks bigint,
  spend_micros bigint,
  conversions numeric,
  action_breakdown jsonb
)
LANGUAGE sql
STABLE
AS $$
  WITH summed AS (
    SELECT
      m.ad_account_id,
      m.campaign_id,
      SUM(m.impressions)::bigint AS impressions,
      SUM(m.clicks)::bigint AS clicks,
      SUM(m.spend_micros)::bigint AS spend_micros,
      SUM(m.conversions) AS conversions
    FROM public.facebook_ads_campaign_daily_metrics m
    WHERE m.metric_date >= p_from
      AND m.metric_date <= p_to
    GROUP BY m.ad_account_id, m.campaign_id
  ),
  breakdowns AS (
    SELECT
      d.ad_account_id,
      d.campaign_id,
      jsonb_object_agg(d.key, d.total) AS action_breakdown
    FROM (
      SELECT
        m.ad_account_id,
        m.campaign_id,
        kv.key,
        SUM((kv.value)::numeric) AS total
      FROM public.facebook_ads_campaign_daily_metrics m
      CROSS JOIN LATERAL jsonb_each_text(COALESCE(m.action_breakdown, '{}'::jsonb)) AS kv(key, value)
      WHERE m.metric_date >= p_from
        AND m.metric_date <= p_to
      GROUP BY m.ad_account_id, m.campaign_id, kv.key
    ) d
    GROUP BY d.ad_account_id, d.campaign_id
  )
  SELECT
    s.ad_account_id,
    s.campaign_id,
    s.impressions,
    s.clicks,
    s.spend_micros,
    s.conversions,
    COALESCE(b.action_breakdown, '{}'::jsonb) AS action_breakdown
  FROM summed s
  LEFT JOIN breakdowns b
    ON b.ad_account_id = s.ad_account_id
   AND b.campaign_id = s.campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.facebook_ads_campaign_metrics_range(date, date)
  TO anon, authenticated, service_role;
