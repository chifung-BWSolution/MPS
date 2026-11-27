-- Set mps.ai_usage_backfill_before to the timestamp captured before the Edge Function rollout.
-- Keep the same cutoff on retries. Source IDs make the operation safe to repeat.
WITH cutoff AS (
  SELECT current_setting('mps.ai_usage_backfill_before')::timestamptz AS before
), historical AS (
  SELECT
    'alt-pilot' AS feature, use_case AS operation, provider, model,
    tokens_in, tokens_out, cost_usd, created_at,
    1 AS call_count, 'alt_llm_usage' AS legacy_source, id AS legacy_id
  FROM public.alt_llm_usage, cutoff
  WHERE created_at < cutoff.before
  UNION ALL
  SELECT
    'content-automation', use_case,
    CASE
      WHEN use_case = 'generate_article' OR model LIKE 'gemini%' THEN 'gemini'
      WHEN use_case IN ('social', 'social_dedupe') OR model LIKE 'grok%' THEN 'grok'
      ELSE 'unknown'
    END,
    model, tokens_in, tokens_out, cost_usd, created_at,
    CASE WHEN use_case IN ('social', 'social_dedupe') THEN 1 END,
    'content_llm_usage', id
  FROM public.content_llm_usage, cutoff
  WHERE created_at < cutoff.before
  UNION ALL
  SELECT
    'readdy-framer', use_case, provider, model, tokens_in, tokens_out, cost_usd, created_at,
    1, 'readdy_llm_usage', id
  FROM public.readdy_llm_usage, cutoff
  WHERE created_at < cutoff.before
), inserted AS (
  INSERT INTO public.ai_call_usage (
    feature, operation, provider, model, status, tokens_in, tokens_out, estimated_cost_usd,
    created_at, call_count, legacy_source, legacy_id
  )
  SELECT
    feature, operation, provider, model, 'legacy',
    CASE WHEN tokens_in >= 0 THEN tokens_in END,
    CASE WHEN tokens_out >= 0 THEN tokens_out END,
    CASE WHEN cost_usd > 0 THEN cost_usd END,
    created_at, call_count, legacy_source, legacy_id
  FROM historical
  ON CONFLICT (legacy_source, legacy_id) DO NOTHING
  RETURNING legacy_source
)
SELECT legacy_source, count(*) AS inserted FROM inserted GROUP BY legacy_source ORDER BY legacy_source;
