-- Pitching records warehouse + Asana sync configuration

CREATE TABLE IF NOT EXISTS public.pitching_records (
  id                   text PRIMARY KEY,
  asana_task_gid       text UNIQUE,
  asana_project_gid    text,
  asana_project_name   text,
  asana_section_name   text,
  pitching_code        text,
  client_id            text,
  client_name          text,
  display_name         text NOT NULL,
  inquiry_date         date NOT NULL,
  description          text,
  project_types        text[] NOT NULL DEFAULT '{}',
  assigned_pm          text,
  assigned_pm_name     text NOT NULL DEFAULT '',
  status               text NOT NULL DEFAULT 'initial'
    CHECK (status IN ('initial', 'following_up', 'confirmed', 'closed')),
  asana_link           text,
  notes                text,
  synced_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pitching_records_inquiry_date_idx
  ON public.pitching_records (inquiry_date DESC);
CREATE INDEX IF NOT EXISTS pitching_records_status_idx
  ON public.pitching_records (status);
CREATE INDEX IF NOT EXISTS pitching_records_asana_project_idx
  ON public.pitching_records (asana_project_gid);

ALTER TABLE public.pitching_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on pitching_records"
  ON public.pitching_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on pitching_records"
  ON public.pitching_records FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on pitching_records"
  ON public.pitching_records FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on pitching_records"
  ON public.pitching_records FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pitching_records TO anon, authenticated;
GRANT ALL ON public.pitching_records TO service_role;

CREATE TABLE IF NOT EXISTS public.asana_pitching_projects (
  project_gid        text PRIMARY KEY,
  project_name       text NOT NULL DEFAULT '',
  workspace_gid      text,
  project_types      text[] NOT NULL DEFAULT '{}',
  enabled            boolean NOT NULL DEFAULT true,
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asana_pitching_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on asana_pitching_projects"
  ON public.asana_pitching_projects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on asana_pitching_projects"
  ON public.asana_pitching_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on asana_pitching_projects"
  ON public.asana_pitching_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_pitching_projects TO anon, authenticated;
GRANT ALL ON public.asana_pitching_projects TO service_role;

-- Seed known pitching projects (workspace 6649488167653 from existing Asana URLs in repo)
INSERT INTO public.asana_pitching_projects (project_gid, project_name, workspace_gid, project_types, enabled)
VALUES
  ('1209549009281325', 'BWT Active 1 開始緊密跟進中', '6649488167653', ARRAY['bwt_web', 'bwt_system'], true),
  ('1201898424971757', 'BWL Active 1 準備報價單', '6649488167653', ARRAY['bwl_event'], true),
  ('1211890558234957', 'BWT Active 1', '6649488167653', ARRAY['bwt_web', 'bwt_system'], true),
  ('1211890558196535', 'BWL Active', '6649488167653', ARRAY['bwl_event'], true)
ON CONFLICT (project_gid) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.asana_pitching_sync_runs (
  id               text PRIMARY KEY,
  status           text NOT NULL DEFAULT 'running',
  tasks_fetched    integer NOT NULL DEFAULT 0,
  records_upserted integer NOT NULL DEFAULT 0,
  projects_synced  integer NOT NULL DEFAULT 0,
  error_message    text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  duration_ms      integer
);

ALTER TABLE public.asana_pitching_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on asana_pitching_sync_runs"
  ON public.asana_pitching_sync_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on asana_pitching_sync_runs"
  ON public.asana_pitching_sync_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on asana_pitching_sync_runs"
  ON public.asana_pitching_sync_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_pitching_sync_runs TO anon, authenticated;
GRANT ALL ON public.asana_pitching_sync_runs TO service_role;
