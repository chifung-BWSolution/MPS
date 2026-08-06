-- ============================================================
-- Drop user_report_templates
-- Custom "常用匯報項目" pins are unused; recommendations now come
-- only from day_report_entries history keyed by related_id.
-- ============================================================

DROP POLICY IF EXISTS "Allow read for authenticated users" ON public.user_report_templates;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.user_report_templates;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.user_report_templates;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.user_report_templates;

DROP INDEX IF EXISTS public.user_report_templates_owner_idx;

DROP TABLE IF EXISTS public.user_report_templates;
