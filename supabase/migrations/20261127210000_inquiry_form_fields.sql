-- Custom fields for colleague-built inquiry forms, plus public submit by link.

CREATE TABLE IF NOT EXISTS public.inquiry_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.inquiry_forms (id) ON DELETE CASCADE,
  label text NOT NULL,
  field_type text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  placeholder text NOT NULL DEFAULT '',
  options text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inquiry_form_fields_label_not_blank CHECK (char_length(btrim(label)) > 0),
  CONSTRAINT inquiry_form_fields_type_check CHECK (
    field_type IN ('text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkboxes')
  )
);

CREATE INDEX IF NOT EXISTS inquiry_form_fields_form_id_idx
  ON public.inquiry_form_fields (form_id, sort_order);

CREATE TABLE IF NOT EXISTS public.inquiry_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.inquiry_forms (id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES public.inquiry_form_links (id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiry_form_submissions_form_id_idx
  ON public.inquiry_form_submissions (form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inquiry_form_submissions_link_id_idx
  ON public.inquiry_form_submissions (link_id);

ALTER TABLE public.inquiry_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on inquiry_form_fields" ON public.inquiry_form_fields;
DROP POLICY IF EXISTS "Allow insert on inquiry_form_fields" ON public.inquiry_form_fields;
DROP POLICY IF EXISTS "Allow update on inquiry_form_fields" ON public.inquiry_form_fields;
DROP POLICY IF EXISTS "Allow delete on inquiry_form_fields" ON public.inquiry_form_fields;
CREATE POLICY "Allow select on inquiry_form_fields"
  ON public.inquiry_form_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert on inquiry_form_fields"
  ON public.inquiry_form_fields FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update on inquiry_form_fields"
  ON public.inquiry_form_fields FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on inquiry_form_fields"
  ON public.inquiry_form_fields FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow select on inquiry_form_submissions" ON public.inquiry_form_submissions;
CREATE POLICY "Allow select on inquiry_form_submissions"
  ON public.inquiry_form_submissions FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiry_form_fields TO authenticated;
GRANT SELECT ON public.inquiry_form_submissions TO authenticated;
GRANT ALL ON public.inquiry_form_fields TO service_role;
GRANT ALL ON public.inquiry_form_submissions TO service_role;

CREATE OR REPLACE FUNCTION public.get_inquiry_link_public(p_link_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link public.inquiry_form_links%ROWTYPE;
  form public.inquiry_forms%ROWTYPE;
  site_name text;
  fields jsonb;
BEGIN
  SELECT * INTO link FROM public.inquiry_form_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO form FROM public.inquiry_forms WHERE id = link.form_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT website_name INTO site_name
  FROM public.webandsystem_list
  WHERE id = link.website_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'label', f.label,
    'fieldType', f.field_type,
    'required', f.required,
    'placeholder', f.placeholder,
    'options', to_jsonb(f.options)
  ) ORDER BY f.sort_order, f.created_at), '[]'::jsonb)
  INTO fields
  FROM public.inquiry_form_fields f
  WHERE f.form_id = form.id;

  RETURN jsonb_build_object(
    'linkId', link.id,
    'formName', form.name,
    'websiteName', COALESCE(site_name, ''),
    'fields', fields
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_inquiry_form(p_link_id uuid, p_answers jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link public.inquiry_form_links%ROWTYPE;
  field public.inquiry_form_fields%ROWTYPE;
  raw jsonb;
  value_text text;
  picked text[];
  snapshot jsonb := '[]'::jsonb;
  new_id uuid;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION '答案格式不正確';
  END IF;

  SELECT * INTO link FROM public.inquiry_form_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這條連結';
  END IF;

  FOR field IN
    SELECT * FROM public.inquiry_form_fields
    WHERE form_id = link.form_id
    ORDER BY sort_order, created_at
  LOOP
    raw := p_answers -> (field.id::text);
    IF field.field_type = 'checkboxes' THEN
      IF raw IS NULL OR jsonb_typeof(raw) = 'null' THEN
        raw := '[]'::jsonb;
      END IF;
      IF jsonb_typeof(raw) <> 'array' THEN
        RAISE EXCEPTION '答案格式不正確：%', field.label;
      END IF;
      picked := ARRAY(SELECT jsonb_array_elements_text(raw));
      IF field.required AND cardinality(picked) = 0 THEN
        RAISE EXCEPTION '請填寫：%', field.label;
      END IF;
      IF cardinality(picked) > 30 THEN
        RAISE EXCEPTION '選項太多：%', field.label;
      END IF;
      IF EXISTS (SELECT 1 FROM unnest(picked) AS item WHERE NOT (item = ANY(field.options))) THEN
        RAISE EXCEPTION '選項不在清單內：%', field.label;
      END IF;
      snapshot := snapshot || jsonb_build_array(jsonb_build_object(
        'fieldId', field.id,
        'label', field.label,
        'fieldType', field.field_type,
        'value', to_jsonb(picked)
      ));
    ELSE
      IF raw IS NULL OR jsonb_typeof(raw) = 'null' THEN
        value_text := '';
      ELSIF jsonb_typeof(raw) <> 'string' THEN
        RAISE EXCEPTION '答案格式不正確：%', field.label;
      ELSE
        value_text := trim(both FROM raw #>> '{}');
      END IF;
      IF char_length(value_text) > 4000 THEN
        RAISE EXCEPTION '內容太長：%', field.label;
      END IF;
      IF field.required AND value_text = '' THEN
        RAISE EXCEPTION '請填寫：%', field.label;
      END IF;
      IF value_text <> '' AND field.field_type = 'email'
        AND value_text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RAISE EXCEPTION '電郵格式不正確：%', field.label;
      END IF;
      IF value_text <> '' AND field.field_type = 'number'
        AND value_text !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION '請填數字：%', field.label;
      END IF;
      IF value_text <> '' AND field.field_type = 'date'
        AND value_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION '請填日期：%', field.label;
      END IF;
      IF value_text <> '' AND field.field_type IN ('select', 'radio')
        AND NOT (value_text = ANY(field.options)) THEN
        RAISE EXCEPTION '選項不在清單內：%', field.label;
      END IF;
      snapshot := snapshot || jsonb_build_array(jsonb_build_object(
        'fieldId', field.id,
        'label', field.label,
        'fieldType', field.field_type,
        'value', value_text
      ));
    END IF;
  END LOOP;

  IF snapshot = '[]'::jsonb THEN
    RAISE EXCEPTION '這份表格未有欄位';
  END IF;

  INSERT INTO public.inquiry_form_submissions (form_id, link_id, answers)
  VALUES (link.form_id, link.id, snapshot)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inquiry_link_public(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_inquiry_form(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inquiry_link_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_inquiry_form(uuid, jsonb) TO anon, authenticated;
