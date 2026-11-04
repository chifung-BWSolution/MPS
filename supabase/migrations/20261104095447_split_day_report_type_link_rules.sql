-- Split day_report_type link rules into a mode and a list of project types.
-- Drops associated_modules (website_system / marketing / video_production / talent).

ALTER TABLE public.day_report_type
  ADD COLUMN IF NOT EXISTS link_mode text,
  ADD COLUMN IF NOT EXISTS link_types text[] NOT NULL DEFAULT '{}';

UPDATE public.day_report_type
SET
  link_mode = CASE relation_type
    WHEN 'webandsystem' THEN 'required'
    WHEN 'quotation_client' THEN 'required'
    WHEN 'vchannel' THEN 'required'
    WHEN 'project_website' THEN 'required'
    WHEN 'internal_project' THEN 'required'
    WHEN 'optional' THEN 'optional'
    ELSE 'none'
  END,
  link_types = CASE relation_type
    WHEN 'webandsystem' THEN ARRAY['webandsystem']::text[]
    WHEN 'quotation_client' THEN ARRAY['quotation_client']::text[]
    WHEN 'vchannel' THEN ARRAY['vchannel']::text[]
    WHEN 'project_website' THEN ARRAY['webandsystem']::text[]
    WHEN 'internal_project' THEN ARRAY['webandsystem']::text[]
    WHEN 'optional' THEN ARRAY['webandsystem', 'quotation_client', 'vchannel']::text[]
    ELSE ARRAY[]::text[]
  END,
  updated_at = now()
WHERE link_mode IS NULL;

ALTER TABLE public.day_report_type
  ALTER COLUMN link_mode SET DEFAULT 'none',
  ALTER COLUMN link_mode SET NOT NULL;

ALTER TABLE public.day_report_type
  DROP CONSTRAINT IF EXISTS day_report_type_link_mode_check,
  DROP CONSTRAINT IF EXISTS day_report_type_link_types_check,
  DROP CONSTRAINT IF EXISTS day_report_type_link_rule_check;

ALTER TABLE public.day_report_type
  ADD CONSTRAINT day_report_type_link_mode_check
    CHECK (link_mode IN ('required', 'optional', 'none')),
  ADD CONSTRAINT day_report_type_link_types_check
    CHECK (link_types <@ ARRAY['webandsystem', 'quotation_client', 'vchannel']::text[]),
  ADD CONSTRAINT day_report_type_link_rule_check
    CHECK (
      (link_mode = 'none' AND cardinality(link_types) = 0)
      OR (link_mode IN ('required', 'optional') AND cardinality(link_types) > 0)
    );

ALTER TABLE public.day_report_type
  DROP COLUMN IF EXISTS relation_type,
  DROP COLUMN IF EXISTS associated_modules;
