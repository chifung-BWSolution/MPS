-- Day reports can store a pending Asana task gid in related_id.
-- Importing that task into quotation_client_project moves those hours onto the
-- client project's projects.id, and later writes cannot stay on the gid.

ALTER TABLE public.day_report_type
  DROP CONSTRAINT IF EXISTS day_report_type_link_types_check;

ALTER TABLE public.day_report_type
  ADD CONSTRAINT day_report_type_link_types_check
    CHECK (link_types <@ ARRAY['webandsystem', 'quotation_client', 'vchannel', 'asana_task']::text[]);

UPDATE public.day_report_type
SET
  link_types = link_types || ARRAY['asana_task']::text[],
  updated_at = now()
WHERE link_mode IN ('required', 'optional')
  AND NOT ('asana_task' = ANY (link_types));

-- Mirrors src/lib/asanaTaskLink.ts parseAsanaTaskGidFromLink.
CREATE OR REPLACE FUNCTION public.parse_asana_task_gid(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  value text := btrim(COALESCE(raw, ''));
  path text;
  query text;
  parts text[];
  i int;
  n int;
  token text;
  last_digits text;
BEGIN
  IF value = '' THEN
    RETURN NULL;
  END IF;

  IF value ~ '^[0-9]{6,}$' THEN
    RETURN value;
  END IF;

  IF value !~* '^https?://' THEN
    last_digits := NULL;
    FOR token IN
      SELECT m[1]
      FROM regexp_matches(value, '([0-9]{6,})', 'g') AS m
    LOOP
      last_digits := token;
    END LOOP;
    RETURN last_digits;
  END IF;

  path := substring(value from '^https?://[^/?#]+([^?#]*)');
  query := COALESCE(substring(value from '[?]([^#]*)'), '');
  path := regexp_replace(COALESCE(path, ''), '/+$', '');

  SELECT coalesce(array_agg(u.part ORDER BY u.ord), ARRAY[]::text[])
  INTO parts
  FROM unnest(string_to_array(path, '/')) WITH ORDINALITY AS u(part, ord)
  WHERE u.part <> '';

  n := coalesce(cardinality(parts), 0);

  FOR i IN REVERSE 1..n LOOP
    IF parts[i] = 'task' AND i < n AND parts[i + 1] ~ '^[0-9]+$' THEN
      RETURN parts[i + 1];
    END IF;
  END LOOP;

  FOR i IN REVERSE 1..n LOOP
    IF parts[i] = 'list' AND i < n AND parts[i + 1] ~ '^[0-9]+$' THEN
      RETURN parts[i + 1];
    END IF;
  END LOOP;

  IF n >= 3 AND parts[1] = '0' AND parts[n] ~ '^[0-9]+$' THEN
    RETURN parts[n];
  END IF;

  token := substring(query from '(?:^|&)task=([0-9]+)(?:&|$)');
  IF token IS NULL OR token = '' THEN
    token := substring(query from '(?:^|&)focus=([0-9]+)(?:&|$)');
  END IF;
  IF token IS NOT NULL AND token <> '' THEN
    RETURN token;
  END IF;

  last_digits := NULL;
  FOR token IN
    SELECT m[1]
    FROM regexp_matches(path, '([0-9]{6,})', 'g') AS m
  LOOP
    last_digits := token;
  END LOOP;
  RETURN last_digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.quotation_client_id_for_asana_gid(p_gid text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id
  FROM public.quotation_client_project q
  WHERE btrim(COALESCE(q.asana_task_gid, '')) = btrim(COALESCE(p_gid, ''))
     OR (
       NULLIF(btrim(COALESCE(q.asana_link, '')), '') IS NOT NULL
       AND public.parse_asana_task_gid(q.asana_link) = btrim(COALESCE(p_gid, ''))
     )
  ORDER BY (btrim(COALESCE(q.asana_task_gid, '')) = btrim(COALESCE(p_gid, ''))) DESC,
           q.created_at ASC NULLS LAST,
           q.id ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.migrate_day_report_hours_for_asana_task(p_quotation_client_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gid text;
  v_hub_id uuid;
  v_hub_name text;
BEGIN
  SELECT COALESCE(
    NULLIF(btrim(asana_task_gid), ''),
    public.parse_asana_task_gid(asana_link)
  )
  INTO v_gid
  FROM public.quotation_client_project
  WHERE id = p_quotation_client_id;

  IF v_gid IS NULL OR v_gid !~ '^[0-9]{6,}$' THEN
    RETURN;
  END IF;

  SELECT p.id, p.name
  INTO v_hub_id, v_hub_name
  FROM public.projects p
  WHERE p.related_type = 'quotation_client'
    AND p.related_id = p_quotation_client_id;

  IF v_hub_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.day_report_entries
  SET
    related_id = v_hub_id::text,
    related_name = v_hub_name
  WHERE related_id = v_gid
    AND related_id IS DISTINCT FROM v_hub_id::text;
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
  v_types jsonb;
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

  SELECT COALESCE(to_jsonb(ARRAY[t.code]), '[]'::jsonb)
  INTO v_types
  FROM public.quotation_project_types t
  WHERE t.id = NEW.project_types;

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
      'project_types', COALESCE(v_types, '[]'::jsonb),
      'assigned_pm_name', NEW.assigned_pm_name,
      'asana_link', NEW.asana_link
    )
  );

  PERFORM public.migrate_day_report_hours_for_asana_task(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_retarget_day_report_asana_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gid text;
  v_qcp_id text;
  v_hub_id uuid;
  v_hub_name text;
BEGIN
  v_gid := btrim(COALESCE(NEW.related_id, ''));
  IF v_gid !~ '^[0-9]{6,}$' THEN
    RETURN NEW;
  END IF;

  v_qcp_id := public.quotation_client_id_for_asana_gid(v_gid);
  IF v_qcp_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id, p.name
  INTO v_hub_id, v_hub_name
  FROM public.projects p
  WHERE p.related_type = 'quotation_client'
    AND p.related_id = v_qcp_id;

  IF v_hub_id IS NULL THEN
    RAISE EXCEPTION 'Asana 項目已成為客戶項目，但找不到 projects 紀錄';
  END IF;

  NEW.related_id := v_hub_id::text;
  NEW.related_name := v_hub_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_retarget_day_report_asana_task ON public.day_report_entries;
CREATE TRIGGER trg_retarget_day_report_asana_task
BEFORE INSERT OR UPDATE ON public.day_report_entries
FOR EACH ROW
EXECUTE FUNCTION public.trg_retarget_day_report_asana_task();

REVOKE ALL ON FUNCTION public.parse_asana_task_gid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quotation_client_id_for_asana_gid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migrate_day_report_hours_for_asana_task(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_retarget_day_report_asana_task() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.parse_asana_task_gid(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quotation_client_id_for_asana_gid(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_retarget_day_report_asana_task() TO anon, authenticated, service_role;

SELECT public.migrate_day_report_hours_for_asana_task(q.id)
FROM public.quotation_client_project q
WHERE NULLIF(btrim(COALESCE(q.asana_task_gid, '')), '') IS NOT NULL
   OR NULLIF(btrim(COALESCE(q.asana_link, '')), '') IS NOT NULL;
