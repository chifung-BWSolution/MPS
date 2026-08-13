-- Drop denormalized company_name / brand_name from projects.
-- UI resolves labels via company_list_id → company_list and brand_list_id → brand_list.

DROP TRIGGER IF EXISTS trg_sync_projects_quotation_client ON public.quotation_client_project;
DROP TRIGGER IF EXISTS trg_sync_projects_webandsystem ON public.webandsystem_list;
DROP TRIGGER IF EXISTS trg_sync_projects_vchannel ON public.vchannels;

DROP FUNCTION IF EXISTS public.upsert_project_row(
  text, text, text, text, boolean, uuid, uuid, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.upsert_project_row(
  p_related_type text,
  p_related_id text,
  p_name text,
  p_status text,
  p_is_active boolean,
  p_company_list_id uuid,
  p_brand_list_id uuid,
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
    company_list_id, brand_list_id, client_name,
    meta, updated_at
  ) VALUES (
    p_related_id, p_related_type, COALESCE(NULLIF(btrim(p_name), ''), p_related_id),
    COALESCE(p_status, ''), COALESCE(p_is_active, true),
    p_company_list_id, p_brand_list_id, p_client_name,
    COALESCE(p_meta, '{}'::jsonb), now()
  )
  ON CONFLICT (related_type, related_id) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    is_active = EXCLUDED.is_active,
    company_list_id = EXCLUDED.company_list_id,
    brand_list_id = EXCLUDED.brand_list_id,
    client_name = EXCLUDED.client_name,
    meta = EXCLUDED.meta,
    updated_at = now();
END;
$$;

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

CREATE OR REPLACE FUNCTION public.trg_sync_projects_from_vchannel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_list_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_project_row('vchannel', OLD.id::text);
    RETURN OLD;
  END IF;

  SELECT b.company_id
  INTO v_company_list_id
  FROM public.brand_list b
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

CREATE TRIGGER trg_sync_projects_quotation_client
AFTER INSERT OR UPDATE OR DELETE ON public.quotation_client_project
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_projects_from_quotation_client();

CREATE TRIGGER trg_sync_projects_webandsystem
AFTER INSERT OR UPDATE OR DELETE ON public.webandsystem_list
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_projects_from_webandsystem();

CREATE TRIGGER trg_sync_projects_vchannel
AFTER INSERT OR UPDATE OR DELETE ON public.vchannels
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_projects_from_vchannel();

ALTER TABLE public.projects DROP COLUMN IF EXISTS company_name;
ALTER TABLE public.projects DROP COLUMN IF EXISTS brand_name;
