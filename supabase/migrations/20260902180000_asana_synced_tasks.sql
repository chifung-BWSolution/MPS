-- Staging table for Asana tasks. Sync writes here; users import into quotation_client_project.

CREATE TABLE IF NOT EXISTS public.asana_synced_tasks (
  asana_task_gid       text PRIMARY KEY,
  asana_project_gid    text,
  asana_project_name   text,
  asana_section_name   text,
  display_name         text NOT NULL,
  client_name          text,
  inquiry_date         date NOT NULL,
  description          text,
  project_types        text[] NOT NULL DEFAULT '{}',
  assigned_pm          text,
  assigned_pm_name     text NOT NULL DEFAULT '',
  mapped_status        text NOT NULL DEFAULT 'initial'
    CHECK (mapped_status IN ('initial', 'following_up', 'confirmed', 'closed')),
  asana_link           text,
  synced_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asana_synced_tasks_inquiry_date_idx
  ON public.asana_synced_tasks (inquiry_date DESC);
CREATE INDEX IF NOT EXISTS asana_synced_tasks_project_idx
  ON public.asana_synced_tasks (asana_project_gid);
CREATE INDEX IF NOT EXISTS asana_synced_tasks_synced_at_idx
  ON public.asana_synced_tasks (synced_at DESC);

ALTER TABLE public.asana_synced_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on asana_synced_tasks"
  ON public.asana_synced_tasks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on asana_synced_tasks"
  ON public.asana_synced_tasks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on asana_synced_tasks"
  ON public.asana_synced_tasks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on asana_synced_tasks"
  ON public.asana_synced_tasks FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asana_synced_tasks TO anon, authenticated;
GRANT ALL ON public.asana_synced_tasks TO service_role;

COMMENT ON TABLE public.asana_synced_tasks IS
  'Asana task snapshot for the 待匯入 list. Not a quotation_client_project until the user imports via the form.';

INSERT INTO public.asana_synced_tasks (
  asana_task_gid,
  asana_project_gid,
  asana_project_name,
  asana_section_name,
  display_name,
  client_name,
  inquiry_date,
  description,
  project_types,
  assigned_pm,
  assigned_pm_name,
  mapped_status,
  asana_link,
  synced_at,
  created_at,
  updated_at
)
SELECT
  q.asana_task_gid,
  q.asana_project_gid,
  q.asana_project_name,
  q.asana_section_name,
  q.display_name,
  q.client_name,
  q.inquiry_date,
  q.description,
  COALESCE(q.project_types, '{}'),
  q.assigned_pm,
  COALESCE(q.assigned_pm_name, ''),
  CASE
    WHEN q.status IN ('initial', 'following_up', 'confirmed', 'closed') THEN q.status
    ELSE 'initial'
  END,
  q.asana_link,
  q.synced_at,
  q.created_at,
  q.updated_at
FROM public.quotation_client_project q
WHERE q.asana_task_gid IS NOT NULL
  AND btrim(q.asana_task_gid) <> ''
ON CONFLICT (asana_task_gid) DO NOTHING;
