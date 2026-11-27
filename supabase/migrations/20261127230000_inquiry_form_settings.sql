-- Practical EmailMeForm-style settings for custom inquiry forms.

ALTER TABLE public.inquiry_forms
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS language_code text NOT NULL DEFAULT 'zh-Hant',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Hong_Kong',
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS submit_button_text text NOT NULL DEFAULT '送出',
  ADD COLUMN IF NOT EXISTS label_alignment text NOT NULL DEFAULT 'top',
  ADD COLUMN IF NOT EXISTS submit_alignment text NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS confirmation_type text NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS confirmation_message text NOT NULL DEFAULT '已收到，多謝你的資料。我們會盡快跟進。',
  ADD COLUMN IF NOT EXISTS redirect_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_entries integer,
  ADD COLUMN IF NOT EXISTS one_entry_per_ip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_recipients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notification_reply_to_field_id uuid,
  ADD COLUMN IF NOT EXISTS notification_subject text NOT NULL DEFAULT '新表格回覆 — {{form_name}}',
  ADD COLUMN IF NOT EXISTS notification_show_empty_fields boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_include_ip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_include_referrer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS autoresponder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autoresponder_recipient_field_id uuid,
  ADD COLUMN IF NOT EXISTS autoresponder_sender_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS autoresponder_reply_to text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS autoresponder_subject text NOT NULL DEFAULT '已收到你的 {{form_name}}',
  ADD COLUMN IF NOT EXISTS autoresponder_message text NOT NULL DEFAULT '多謝你的查詢，我們已收到資料，會盡快跟進。',
  ADD COLUMN IF NOT EXISTS autoresponder_include_copy boolean NOT NULL DEFAULT true;

ALTER TABLE public.inquiry_forms
  DROP CONSTRAINT IF EXISTS inquiry_forms_language_code_check,
  ADD CONSTRAINT inquiry_forms_language_code_check
    CHECK (language_code IN ('zh-Hant', 'en')),
  DROP CONSTRAINT IF EXISTS inquiry_forms_label_alignment_check,
  ADD CONSTRAINT inquiry_forms_label_alignment_check
    CHECK (label_alignment IN ('top', 'left', 'right')),
  DROP CONSTRAINT IF EXISTS inquiry_forms_submit_alignment_check,
  ADD CONSTRAINT inquiry_forms_submit_alignment_check
    CHECK (submit_alignment IN ('left', 'center', 'right')),
  DROP CONSTRAINT IF EXISTS inquiry_forms_confirmation_type_check,
  ADD CONSTRAINT inquiry_forms_confirmation_type_check
    CHECK (confirmation_type IN ('message', 'redirect')),
  DROP CONSTRAINT IF EXISTS inquiry_forms_max_entries_check,
  ADD CONSTRAINT inquiry_forms_max_entries_check
    CHECK (max_entries IS NULL OR max_entries > 0),
  DROP CONSTRAINT IF EXISTS inquiry_forms_schedule_check,
  ADD CONSTRAINT inquiry_forms_schedule_check
    CHECK (opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at);

ALTER TABLE public.inquiry_form_fields
  DROP CONSTRAINT IF EXISTS inquiry_form_fields_type_check,
  ADD CONSTRAINT inquiry_form_fields_type_check CHECK (
    field_type IN (
      'text', 'textarea', 'email', 'phone', 'number', 'date',
      'website', 'address', 'select', 'radio', 'checkbox',
      'checkboxes', 'hidden', 'section', 'terms'
    )
  );

ALTER TABLE public.inquiry_form_submissions
  ADD COLUMN IF NOT EXISTS visitor_ip_hash text,
  ADD COLUMN IF NOT EXISTS visitor_ip text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS notification_error text,
  ADD COLUMN IF NOT EXISTS autoresponder_error text;

CREATE INDEX IF NOT EXISTS inquiry_form_submissions_ip_rate_idx
  ON public.inquiry_form_submissions (form_id, visitor_ip_hash, created_at DESC)
  WHERE visitor_ip_hash IS NOT NULL;

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
    'options', to_jsonb(f.options)
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

-- Public submissions now go through the Edge Function so limits, anti-spam
-- checks, notification email and autoresponder all run in one path.
REVOKE ALL ON FUNCTION public.submit_inquiry_form(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_inquiry_form(uuid, jsonb) TO service_role;

