-- ============================================================
-- client_project: 客戶項目列表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_project (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  client_name         text,
  company_id          text,
  brand_id            text,
  project_type        text NOT NULL DEFAULT 'other',
  project_category    text NOT NULL DEFAULT 'client',
  status              text NOT NULL DEFAULT 'planning',   -- planning | active | on_hold | completed | cancelled
  progress            integer NOT NULL DEFAULT 0,
  assigned_pm         text,
  assigned_pm_id      text,
  brand               text,
  company             text,
  budget_total        numeric NOT NULL DEFAULT 0,
  budget_used         numeric NOT NULL DEFAULT 0,
  start_date          date,
  end_date            date,
  description         text,
  priority            text NOT NULL DEFAULT 'medium',     -- low | medium | high | urgent
  billing_model       text,                               -- one_time | recurring
  billing_frequency   text,                               -- monthly | quarterly | semi_annual | annual
  contract_start_date date,
  contract_duration   integer,
  service_items       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_project ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for authenticated users"
  ON public.client_project FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
  ON public.client_project FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.client_project FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
  ON public.client_project FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select"
  ON public.client_project FOR SELECT TO anon USING (true);

-- ============================================================
-- company_project: 內部項目列表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_project (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  client_name         text,
  company_id          text,
  brand_id            text,
  project_type        text NOT NULL DEFAULT 'other',
  project_category    text NOT NULL DEFAULT 'internal',
  status              text NOT NULL DEFAULT 'planning',   -- planning | active | on_hold | completed | cancelled
  progress            integer NOT NULL DEFAULT 0,
  assigned_pm         text,
  assigned_pm_id      text,
  brand               text,
  company             text,
  budget_total        numeric NOT NULL DEFAULT 0,
  budget_used         numeric NOT NULL DEFAULT 0,
  start_date          date,
  end_date            date,
  description         text,
  priority            text NOT NULL DEFAULT 'medium',     -- low | medium | high | urgent
  billing_model       text,
  billing_frequency   text,
  contract_start_date date,
  contract_duration   integer,
  service_items       jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_project ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for authenticated users"
  ON public.company_project FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
  ON public.company_project FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.company_project FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
  ON public.company_project FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select"
  ON public.company_project FOR SELECT TO anon USING (true);
