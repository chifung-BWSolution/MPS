-- ============================================================
-- Master projects table + sync from source modules
-- + drop company_project_details
-- + remap day_report_entries.related_id → projects.id
-- + remap day_report_type.relation_type
-- ============================================================

-- ------------------------------------------------------------
-- 1) projects master table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  related_id        text NOT NULL,
  related_type      text NOT NULL
                    CHECK (related_type IN ('quotation_client', 'webandsystem', 'vchannel')),
  name              text NOT NULL,
  status            text NOT NULL DEFAULT '',
  is_active         boolean NOT NULL DEFAULT true,
  company_list_id   uuid REFERENCES public.company_list(uuid) ON DELETE SET NULL,
  brand_list_id     uuid REFERENCES public.brand_list(id) ON DELETE SET NULL,
  company_name      text,
  brand_name        text,
  client_name       text,
  meta              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (related_type, related_id)
);

CREATE INDEX IF NOT EXISTS projects_related_type_idx
  ON public.projects (related_type);
CREATE INDEX IF NOT EXISTS projects_is_active_idx
  ON public.projects (is_active);
CREATE INDEX IF NOT EXISTS projects_name_idx
  ON public.projects (name);
CREATE INDEX IF NOT EXISTS projects_updated_idx
  ON public.projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_brand_list_id_idx
  ON public.projects (brand_list_id);
CREATE INDEX IF NOT EXISTS projects_company_list_id_idx
  ON public.projects (company_list_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for authenticated on projects" ON public.projects;
CREATE POLICY "Allow read for authenticated on projects"
  ON public.projects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert for authenticated on projects" ON public.projects;
CREATE POLICY "Allow insert for authenticated on projects"
  ON public.projects FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update for authenticated on projects" ON public.projects;
CREATE POLICY "Allow update for authenticated on projects"
  ON public.projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete for authenticated on projects" ON public.projects;
CREATE POLICY "Allow delete for authenticated on projects"
  ON public.projects FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon select on projects" ON public.projects;
CREATE POLICY "Allow anon select on projects"
  ON public.projects FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow anon insert on projects" ON public.projects;
CREATE POLICY "Allow anon insert on projects"
  ON public.projects FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon update on projects" ON public.projects;
CREATE POLICY "Allow anon update on projects"
  ON public.projects FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon delete on projects" ON public.projects;
CREATE POLICY "Allow anon delete on projects"
  ON public.projects FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated, anon;
GRANT ALL ON public.projects TO service_role;

-- ------------------------------------------------------------
-- 2) Sync helpers + triggers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_project_row(
  p_related_type text,
  p_related_id text,
  p_name text,
  p_status text,
  p_is_active boolean,
  p_company_list_id uuid,
  p_brand_list_id uuid,
  p_company_name text,
  p_brand_name text,
  p_client_name text,
  p_meta jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.projects (
    related_id, related_type, name, status, is_active,
    company_list_id, brand_list_id, company_name, brand_name, client_name,
    meta, updated_at
  ) VALUES (
    p_related_id, p_related_type, COALESCE(NULLIF(btrim(p_name), ''), p_related_id),
    COALESCE(p_status, ''), COALESCE(p_is_active, true),
    p_company_list_id, p_brand_list_id, p_company_name, p_brand_name, p_client_name,
    COALESCE(p_meta, '{}'::jsonb), now()
  )
  ON CONFLICT (related_type, related_id) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    is_active = EXCLUDED.is_active,
    company_list_id = EXCLUDED.company_list_id,
    brand_list_id = EXCLUDED.brand_list_id,
    company_name = EXCLUDED.company_name,
    brand_name = EXCLUDED.brand_name,
    client_name = EXCLUDED.client_name,
    meta = EXCLUDED.meta,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_project_row(
  p_related_type text,
  p_related_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.projects
  WHERE related_type = p_related_type
    AND related_id = p_related_id;
END;
$$;

-- quotation_client_project → projects
CREATE OR REPLACE FUNCTION public.trg_sync_projects_from_quotation_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_project_row('quotation_client', OLD.id);
    RETURN OLD;
  END IF;

  v_name := COALESCE(
    NULLIF(btrim(NEW.display_name), ''),
    NULLIF(btrim(NEW.client_name), ''),
    NULLIF(btrim(NEW.pitching_code), ''),
    NEW.id
  );

  PERFORM public.upsert_project_row(
    'quotation_client',
    NEW.id,
    v_name,
    COALESCE(NEW.status, ''),
    (COALESCE(NEW.status, '') = 'confirmed'),
    NULL,
    NULL,
    COALESCE(NEW.company_name_zh, NEW.company_name_en),
    NULL,
    NEW.client_name,
    jsonb_build_object(
      'pitching_code', NEW.pitching_code,
      'project_types', COALESCE(to_jsonb(NEW.project_types), '[]'::jsonb),
      'assigned_pm_name', NEW.assigned_pm_name,
      'asana_link', NEW.asana_link
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_projects_quotation_client ON public.quotation_client_project;
CREATE TRIGGER trg_sync_projects_quotation_client
AFTER INSERT OR UPDATE OR DELETE ON public.quotation_client_project
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_projects_from_quotation_client();

-- webandsystem_list → projects
CREATE OR REPLACE FUNCTION public.trg_sync_projects_from_webandsystem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_project_row('webandsystem', OLD.id);
    RETURN OLD;
  END IF;

  PERFORM public.upsert_project_row(
    'webandsystem',
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.website_name), ''), NEW.id),
    COALESCE(NEW.status, ''),
    (COALESCE(NEW.status, '') IS DISTINCT FROM 'archived'),
    NEW.company_list_id,
    NEW.brand_list_id,
    NEW.company,
    NEW.brand,
    NULL,
    jsonb_build_object(
      'profile_type', NEW.profile_type,
      'project_category', NEW.project_category,
      'domain_url', NEW.domain_url,
      'level', NEW.level
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_projects_webandsystem ON public.webandsystem_list;
CREATE TRIGGER trg_sync_projects_webandsystem
AFTER INSERT OR UPDATE OR DELETE ON public.webandsystem_list
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_projects_from_webandsystem();

-- vchannels → projects
CREATE OR REPLACE FUNCTION public.trg_sync_projects_from_vchannel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_name text;
  v_company_name text;
  v_company_list_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_project_row('vchannel', OLD.id::text);
    RETURN OLD;
  END IF;

  SELECT b.display_name, b.company_id, c.company_name_zh
  INTO v_brand_name, v_company_list_id, v_company_name
  FROM public.brand_list b
  LEFT JOIN public.company_list c ON c.uuid = b.company_id
  WHERE b.id = NEW.brand_list_id;

  PERFORM public.upsert_project_row(
    'vchannel',
    NEW.id::text,
    COALESCE(
      NULLIF(btrim(NEW.internal_name), ''),
      NULLIF(btrim(NEW.public_name), ''),
      NULLIF(btrim(NEW.channel_code), ''),
      NEW.id::text
    ),
    COALESCE(NEW.status, ''),
    (COALESCE(NEW.status, '') = 'active'),
    v_company_list_id,
    NEW.brand_list_id,
    v_company_name,
    v_brand_name,
    NULL,
    jsonb_build_object(
      'channel_code', NEW.channel_code,
      'public_name', NEW.public_name,
      'importance', NEW.importance,
      'device_type', NEW.device_type
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_projects_vchannel ON public.vchannels;
CREATE TRIGGER trg_sync_projects_vchannel
AFTER INSERT OR UPDATE OR DELETE ON public.vchannels
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_projects_from_vchannel();

-- ------------------------------------------------------------
-- 3) Backfill projects from sources
-- ------------------------------------------------------------
INSERT INTO public.projects (
  related_id, related_type, name, status, is_active,
  company_list_id, brand_list_id, company_name, brand_name, client_name, meta
)
SELECT
  q.id,
  'quotation_client',
  COALESCE(NULLIF(btrim(q.display_name), ''), NULLIF(btrim(q.client_name), ''), NULLIF(btrim(q.pitching_code), ''), q.id),
  COALESCE(q.status, ''),
  (COALESCE(q.status, '') = 'confirmed'),
  NULL,
  NULL,
  COALESCE(q.company_name_zh, q.company_name_en),
  NULL,
  q.client_name,
  jsonb_build_object(
    'pitching_code', q.pitching_code,
    'project_types', COALESCE(to_jsonb(q.project_types), '[]'::jsonb),
    'assigned_pm_name', q.assigned_pm_name,
    'asana_link', q.asana_link
  )
FROM public.quotation_client_project q
ON CONFLICT (related_type, related_id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  company_name = EXCLUDED.company_name,
  client_name = EXCLUDED.client_name,
  meta = EXCLUDED.meta,
  updated_at = now();

INSERT INTO public.projects (
  related_id, related_type, name, status, is_active,
  company_list_id, brand_list_id, company_name, brand_name, client_name, meta
)
SELECT
  w.id,
  'webandsystem',
  COALESCE(NULLIF(btrim(w.website_name), ''), w.id),
  COALESCE(w.status, ''),
  (COALESCE(w.status, '') IS DISTINCT FROM 'archived'),
  w.company_list_id,
  w.brand_list_id,
  w.company,
  w.brand,
  NULL,
  jsonb_build_object(
    'profile_type', w.profile_type,
    'project_category', w.project_category,
    'domain_url', w.domain_url,
    'level', w.level
  )
FROM public.webandsystem_list w
ON CONFLICT (related_type, related_id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  company_list_id = EXCLUDED.company_list_id,
  brand_list_id = EXCLUDED.brand_list_id,
  company_name = EXCLUDED.company_name,
  brand_name = EXCLUDED.brand_name,
  meta = EXCLUDED.meta,
  updated_at = now();

INSERT INTO public.projects (
  related_id, related_type, name, status, is_active,
  company_list_id, brand_list_id, company_name, brand_name, client_name, meta
)
SELECT
  v.id::text,
  'vchannel',
  COALESCE(NULLIF(btrim(v.internal_name), ''), NULLIF(btrim(v.public_name), ''), NULLIF(btrim(v.channel_code), ''), v.id::text),
  COALESCE(v.status, ''),
  (COALESCE(v.status, '') = 'active'),
  b.company_id,
  v.brand_list_id,
  c.company_name_zh,
  b.display_name,
  NULL,
  jsonb_build_object(
    'channel_code', v.channel_code,
    'public_name', v.public_name,
    'importance', v.importance,
    'device_type', v.device_type
  )
FROM public.vchannels v
LEFT JOIN public.brand_list b ON b.id = v.brand_list_id
LEFT JOIN public.company_list c ON c.uuid = b.company_id
ON CONFLICT (related_type, related_id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active,
  company_list_id = EXCLUDED.company_list_id,
  brand_list_id = EXCLUDED.brand_list_id,
  company_name = EXCLUDED.company_name,
  brand_name = EXCLUDED.brand_name,
  meta = EXCLUDED.meta,
  updated_at = now();

-- ------------------------------------------------------------
-- 4) Remap day_report_entries.related_id → projects.id (webandsystem)
-- ------------------------------------------------------------
UPDATE public.day_report_entries e
SET
  related_id = p.id::text,
  related_name = COALESCE(p.name, e.related_name)
FROM public.projects p
WHERE p.related_type = 'webandsystem'
  AND p.related_id = e.related_id;

-- ------------------------------------------------------------
-- 5) Rewrite website hours trigger to resolve via projects
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_website_total_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_project_id text;
  website_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_project_id := OLD.related_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.related_id IS DISTINCT FROM NEW.related_id AND OLD.related_id IS NOT NULL THEN
      SELECT p.related_id INTO website_id
      FROM public.projects p
      WHERE p.id::text = OLD.related_id
        AND p.related_type = 'webandsystem';

      IF website_id IS NOT NULL THEN
        UPDATE public.webandsystem_list
        SET total_hours = (
          SELECT COALESCE(SUM(e.hours), 0)
          FROM public.day_report_entries e
          JOIN public.projects p2 ON p2.id::text = e.related_id
          WHERE p2.related_type = 'webandsystem'
            AND p2.related_id = website_id
        )
        WHERE id = website_id;
      END IF;
    END IF;
    target_project_id := NEW.related_id;
  ELSE
    target_project_id := NEW.related_id;
  END IF;

  IF target_project_id IS NOT NULL THEN
    SELECT p.related_id INTO website_id
    FROM public.projects p
    WHERE p.id::text = target_project_id
      AND p.related_type = 'webandsystem';

    IF website_id IS NOT NULL THEN
      UPDATE public.webandsystem_list
      SET total_hours = (
        SELECT COALESCE(SUM(e.hours), 0)
        FROM public.day_report_entries e
        JOIN public.projects p2 ON p2.id::text = e.related_id
        WHERE p2.related_type = 'webandsystem'
          AND p2.related_id = website_id
      )
      WHERE id = website_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_website_hours ON public.day_report_entries;
CREATE TRIGGER trg_sync_website_hours
AFTER INSERT OR UPDATE OR DELETE ON public.day_report_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_website_total_hours();

-- Recompute website hours after remap
UPDATE public.webandsystem_list ws
SET total_hours = (
  SELECT COALESCE(SUM(e.hours), 0)
  FROM public.day_report_entries e
  JOIN public.projects p ON p.id::text = e.related_id
  WHERE p.related_type = 'webandsystem'
    AND p.related_id = ws.id
);

-- ------------------------------------------------------------
-- 6) Drop company_project_details
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.company_project_details CASCADE;

-- ------------------------------------------------------------
-- 7) Remap day_report_type.relation_type
-- ------------------------------------------------------------
UPDATE public.day_report_type
SET relation_type = 'webandsystem',
    updated_at = now()
WHERE id IN (
  'website_design', 'website_dev', 'article_writing', 'edm', 'paid_ads',
  'seo', 'graphic_design'
)
   OR relation_type IN ('project_website', 'internal_project');

-- Re-apply specific overrides after the broad remap
UPDATE public.day_report_type
SET relation_type = 'vchannel', updated_at = now()
WHERE id IN ('video_shooting', 'video_editing', 'social_media');

UPDATE public.day_report_type
SET relation_type = 'quotation_client', updated_at = now()
WHERE id = 'client_meeting';

UPDATE public.day_report_type
SET relation_type = 'optional', updated_at = now()
WHERE id = 'internal_meeting';

UPDATE public.day_report_type
SET relation_type = 'none', updated_at = now()
WHERE id IN ('training', 'talent_interview')
   OR relation_type = 'none';

-- Fix any leftover project_website / internal_project values
UPDATE public.day_report_type
SET relation_type = 'webandsystem', updated_at = now()
WHERE relation_type IN ('project_website', 'internal_project');
