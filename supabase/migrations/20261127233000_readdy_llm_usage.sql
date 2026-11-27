-- Readdy -> Framer LLM call usage tracking (append-only)

CREATE TABLE IF NOT EXISTS public.readdy_llm_usage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid REFERENCES public.framer_sync_jobs(id) ON DELETE SET NULL,
  project_name   text NOT NULL DEFAULT '',
  page_path      text NOT NULL DEFAULT '',
  provider       text NOT NULL DEFAULT '',
  model          text NOT NULL DEFAULT '',
  use_case       text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'ok',
  tokens_in      integer NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out     integer NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost_usd       numeric(12,6) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.readdy_llm_usage IS
  'Readdy → Framer 各階段 LLM 呼叫用量（append-only），供用量追蹤與成本核對。';

CREATE INDEX IF NOT EXISTS readdy_llm_usage_created_idx
  ON public.readdy_llm_usage (created_at DESC);

CREATE INDEX IF NOT EXISTS readdy_llm_usage_job_idx
  ON public.readdy_llm_usage (job_id);

ALTER TABLE public.readdy_llm_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'readdy_llm_usage'
      AND policyname = 'readdy_llm_usage_select_authenticated'
  ) THEN
    CREATE POLICY readdy_llm_usage_select_authenticated
      ON public.readdy_llm_usage FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

REVOKE ALL ON public.readdy_llm_usage FROM anon, authenticated;
GRANT SELECT ON public.readdy_llm_usage TO authenticated;
GRANT ALL ON public.readdy_llm_usage TO service_role;
