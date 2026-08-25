-- Day report project search only lists projects.is_active = true.
-- Quotation/pitching rows were marked active only when status = 'confirmed',
-- so initial / following_up deals (e.g. BWT System 綜合醫療體檢中心) could not
-- be selected while logging hours. Keep closed deals hidden.

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
    (COALESCE(NEW.status, '') IS DISTINCT FROM 'closed'),
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

UPDATE public.projects p
SET
  is_active = (COALESCE(p.status, '') IS DISTINCT FROM 'closed'),
  updated_at = now()
WHERE p.related_type = 'quotation_client';
