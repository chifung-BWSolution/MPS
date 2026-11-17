-- FCC 查詢：Gmail 標籤 FC查詢 → Asana task。負責人、協作者、專案在 MPS 設定。

CREATE TABLE IF NOT EXISTS public.asana_mail_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  gmail_address text NOT NULL,
  gmail_label_id text NOT NULL,
  gmail_label_name text NOT NULL,
  workspace_gid text NOT NULL,
  assignee_gid text NOT NULL DEFAULT '',
  collaborator_gids text[] NOT NULL DEFAULT '{}',
  lunch_project_gid text NOT NULL,
  lunch_title_prefix text NOT NULL DEFAULT 'FC Lunch Box',
  catering_project_gid text NOT NULL,
  catering_title_prefix text NOT NULL DEFAULT 'FC Catering',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asana_mail_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL,
  gmail_message_id text NOT NULL,
  subject text,
  received_on date,
  status text NOT NULL,
  route text,
  asana_task_gid text,
  asana_project_gid text,
  task_name text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_code, gmail_message_id)
);

ALTER TABLE public.asana_mail_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asana_mail_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on asana_mail_rules"
  ON public.asana_mail_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow update on asana_mail_rules"
  ON public.asana_mail_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow select on asana_mail_jobs"
  ON public.asana_mail_jobs FOR SELECT TO authenticated USING (true);

GRANT SELECT, UPDATE ON public.asana_mail_rules TO authenticated;
GRANT SELECT ON public.asana_mail_jobs TO authenticated;
GRANT ALL ON public.asana_mail_rules TO service_role;
GRANT ALL ON public.asana_mail_jobs TO service_role;

INSERT INTO public.asana_mail_rules (
  code,
  name,
  enabled,
  gmail_address,
  gmail_label_id,
  gmail_label_name,
  workspace_gid,
  assignee_gid,
  collaborator_gids,
  lunch_project_gid,
  lunch_title_prefix,
  catering_project_gid,
  catering_title_prefix
) VALUES (
  'fcc',
  'FCC asana',
  true,
  'foodchannels.plan@gmail.com',
  'Label_5805479229857944943',
  'FC查詢',
  '6649488167653',
  '1205638053409386',
  ARRAY['16171169053048', '803462487490302', '1208059633171044'],
  '1207429246803356',
  'FC Lunch Box',
  '1201740876638763',
  'FC Catering'
)
ON CONFLICT (code) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fcc-asana-mail') THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE command ILIKE '%net.http_post%'
    AND command ILIKE '%/functions/v1/%'
  ORDER BY jobid
  LIMIT 1;

  IF src_cmd IS NULL THEN
    RAISE NOTICE 'fcc-asana-mail not created — no existing functions HTTP cron to clone auth from';
    RETURN;
  END IF;

  new_cmd := regexp_replace(
    src_cmd,
    'functions/v1/[^'']+',
    'functions/v1/sync-fcc-asana-mail'
  );

  PERFORM cron.schedule(
    'fcc-asana-mail',
    '*/5 * * * *',
    new_cmd
  );
END
$$;
