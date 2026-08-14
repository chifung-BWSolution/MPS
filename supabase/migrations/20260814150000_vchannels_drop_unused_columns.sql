-- Drop unused vchannels columns: device_type, video_count, case_count.
-- Update the projects sync trigger first so it no longer reads NEW.device_type.

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
      'importance', NEW.importance
    )
  );
  RETURN NEW;
END;
$$;

UPDATE public.projects
SET meta = meta - 'device_type'
WHERE related_type = 'vchannel'
  AND meta ? 'device_type';

ALTER TABLE public.vchannels
  DROP COLUMN IF EXISTS device_type,
  DROP COLUMN IF EXISTS video_count,
  DROP COLUMN IF EXISTS case_count;
