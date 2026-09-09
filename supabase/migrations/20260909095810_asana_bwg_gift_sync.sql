-- BWG 禮品 Asana board → asana_synced_tasks (same path as BWL/BWT).
-- Project: https://app.asana.com/1/6649488167653/project/1210520368067621
-- All sections, all years (including completed), default status initial.
-- Manual sync and the daily cron both call sync-asana-pitching with {}
-- and iterate every enabled asana_pitching_projects row.

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.asana_pitching_projects'::regclass
      AND con.contype = 'c'
      AND att.attname = 'sync_date_mode'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.asana_pitching_projects DROP CONSTRAINT %I',
      cname
    );
  END LOOP;
END
$$;

ALTER TABLE public.asana_pitching_projects
  ADD CONSTRAINT asana_pitching_projects_sync_date_mode_check
  CHECK (
    sync_date_mode IS NULL
    OR sync_date_mode IN (
      'created_exact',
      'created_from',
      'active_deal',
      'all',
      'pipeline'
    )
  );

INSERT INTO public.asana_pitching_projects (
  project_gid,
  project_name,
  workspace_gid,
  project_types,
  sync_year,
  sync_year_from,
  sync_date_mode,
  sync_section_name,
  sync_project_types_only,
  sync_default_status,
  status_field_name,
  enabled
)
VALUES (
  '1210520368067621',
  'BWG 禮品',
  '6649488167653',
  ARRAY['bwg_gift'],
  NULL,
  NULL,
  'all',
  NULL,
  true,
  'initial',
  '狀態',
  true
)
ON CONFLICT (project_gid) DO UPDATE SET
  project_name = EXCLUDED.project_name,
  workspace_gid = EXCLUDED.workspace_gid,
  project_types = EXCLUDED.project_types,
  sync_year = EXCLUDED.sync_year,
  sync_year_from = EXCLUDED.sync_year_from,
  sync_date_mode = EXCLUDED.sync_date_mode,
  sync_section_name = EXCLUDED.sync_section_name,
  sync_project_types_only = EXCLUDED.sync_project_types_only,
  sync_default_status = EXCLUDED.sync_default_status,
  status_field_name = EXCLUDED.status_field_name,
  enabled = true,
  updated_at = now();

-- Daily HTTP cron: clone Authorization from an existing functions cron
-- so the service_role bearer is never written into this file.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'asana-pitching-daily'
  ) THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname IN (
    'google-ads-incremental-daily',
    'ga4-incremental-daily',
    'facebook-ads-incremental-daily'
  )
    AND command ILIKE '%net.http_post%'
    AND command ILIKE '%/functions/v1/%'
  ORDER BY CASE jobname
    WHEN 'google-ads-incremental-daily' THEN 1
    WHEN 'ga4-incremental-daily' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF src_cmd IS NULL THEN
    RAISE NOTICE
      'asana-pitching-daily not created — no existing functions HTTP cron to clone auth from';
    RETURN;
  END IF;

  new_cmd := regexp_replace(
    src_cmd,
    'functions/v1/[^'']+',
    'functions/v1/sync-asana-pitching'
  );

  PERFORM cron.schedule(
    'asana-pitching-daily',
    '0 21 * * *',
    new_cmd
  );
END
$$;
