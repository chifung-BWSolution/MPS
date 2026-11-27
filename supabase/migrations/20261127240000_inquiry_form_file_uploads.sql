-- Private file uploads for custom inquiry form submissions.

ALTER TABLE public.inquiry_form_fields
  ADD COLUMN IF NOT EXISTS file_max_count integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS file_max_size_mb integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS file_accept text[] NOT NULL DEFAULT ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];

ALTER TABLE public.inquiry_form_fields
  DROP CONSTRAINT IF EXISTS inquiry_form_fields_type_check,
  ADD CONSTRAINT inquiry_form_fields_type_check CHECK (
    field_type IN (
      'text', 'textarea', 'email', 'phone', 'number', 'date',
      'website', 'address', 'select', 'radio', 'checkbox',
      'checkboxes', 'hidden', 'section', 'terms', 'file'
    )
  ),
  DROP CONSTRAINT IF EXISTS inquiry_form_fields_file_max_count_check,
  ADD CONSTRAINT inquiry_form_fields_file_max_count_check
    CHECK (file_max_count BETWEEN 1 AND 5),
  DROP CONSTRAINT IF EXISTS inquiry_form_fields_file_max_size_mb_check,
  ADD CONSTRAINT inquiry_form_fields_file_max_size_mb_check
    CHECK (file_max_size_mb BETWEEN 1 AND 20);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'inquiry-form-files',
  'inquiry-form-files',
  false,
  20971520,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated read inquiry form files" ON storage.objects;
CREATE POLICY "Authenticated read inquiry form files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'inquiry-form-files');

DROP POLICY IF EXISTS "Authenticated delete inquiry form files" ON storage.objects;

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
  entry_count bigint;
  availability text := 'available';
BEGIN
  SELECT * INTO link FROM public.inquiry_form_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO form FROM public.inquiry_forms WHERE id = link.form_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO entry_count
  FROM public.inquiry_form_submissions
  WHERE form_id = form.id;

  IF NOT form.published THEN
    availability := 'not_published';
  ELSIF form.opens_at IS NOT NULL AND now() < form.opens_at THEN
    availability := 'not_open';
  ELSIF form.closes_at IS NOT NULL AND now() >= form.closes_at THEN
    availability := 'closed';
  ELSIF form.max_entries IS NOT NULL AND entry_count >= form.max_entries THEN
    availability := 'full';
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
    'options', to_jsonb(f.options),
    'fileMaxCount', f.file_max_count,
    'fileMaxSizeMb', f.file_max_size_mb,
    'fileAccept', to_jsonb(f.file_accept)
  ) ORDER BY f.sort_order, f.created_at), '[]'::jsonb)
  INTO fields
  FROM public.inquiry_form_fields f
  WHERE f.form_id = form.id;

  RETURN jsonb_build_object(
    'linkId', link.id,
    'formName', form.name,
    'description', form.description,
    'websiteName', COALESCE(site_name, ''),
    'languageCode', form.language_code,
    'submitButtonText', form.submit_button_text,
    'labelAlignment', form.label_alignment,
    'submitAlignment', form.submit_alignment,
    'confirmationType', form.confirmation_type,
    'confirmationMessage', form.confirmation_message,
    'redirectUrl', form.redirect_url,
    'availability', availability,
    'fields', fields
  );
END;
$$;

