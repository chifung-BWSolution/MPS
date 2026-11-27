CREATE TABLE public.ai_call_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feature text NOT NULL,
  operation text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'http_error', 'network_error', 'invalid_response', 'legacy')),
  http_status smallint CHECK (http_status BETWEEN 100 AND 599),
  tokens_in integer CHECK (tokens_in >= 0),
  tokens_out integer CHECK (tokens_out >= 0),
  estimated_cost_usd numeric(18, 8) CHECK (estimated_cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  call_count smallint DEFAULT 1 CHECK (call_count > 0),
  legacy_source text,
  legacy_id uuid,
  UNIQUE (legacy_source, legacy_id)
);

CREATE INDEX ai_call_usage_created_at_idx ON public.ai_call_usage (created_at DESC);

ALTER TABLE public.ai_call_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_call_usage FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE public.ai_call_usage TO service_role;

CREATE FUNCTION public.ai_usage_summary(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_tag text;
  period_start timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT lower(trim(u.role_tag)) INTO role_tag FROM public.resolve_users_for_auth() AS u;
  END IF;

  -- Match the System Settings role mapping in AuthContext.
  IF role_tag IS NULL
    OR role_tag ~ 'chief_editor|chief editor|editor-in-chief|editor in chief|總編輯|总编辑'
    OR NOT (role_tag IN ('management', 'system_dev') OR role_tag ~ 'admin|管理|系統開發')
  THEN
    RAISE EXCEPTION 'AI usage access denied' USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR p_days NOT IN (1, 7, 30) THEN
    RAISE EXCEPTION 'Unsupported AI usage period' USING ERRCODE = '22023';
  END IF;

  period_start := ((now() AT TIME ZONE 'Asia/Hong_Kong')::date - (p_days - 1))::timestamp
    AT TIME ZONE 'Asia/Hong_Kong';

  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(usage_row) ORDER BY calls DESC, feature, operation, provider, model), '[]'::jsonb)
    FROM (
      SELECT
        feature,
        operation,
        provider,
        model,
        coalesce(sum(call_count), 0) AS calls,
        count(*) FILTER (WHERE status IN ('http_error', 'network_error', 'invalid_response')) AS errors,
        count(*) FILTER (WHERE tokens_in IS NOT NULL OR tokens_out IS NOT NULL) AS records_with_tokens,
        count(estimated_cost_usd) AS records_with_cost,
        count(legacy_id) AS legacy_records,
        count(*) FILTER (WHERE call_count IS NULL) AS records_without_call_count,
        coalesce(sum(tokens_in), 0) AS tokens_in,
        coalesce(sum(tokens_out), 0) AS tokens_out,
        coalesce(sum(estimated_cost_usd), 0) AS estimated_cost_usd
      FROM public.ai_call_usage
      WHERE created_at >= period_start AND created_at <= now()
      GROUP BY feature, operation, provider, model
    ) AS usage_row
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_summary(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_summary(integer) TO authenticated;
