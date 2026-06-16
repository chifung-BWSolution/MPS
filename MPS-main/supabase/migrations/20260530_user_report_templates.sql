-- ============================================================
-- user_report_templates
-- Per-user "常用匯報項目" pinned by users on 提交匯報.
-- Each row stores a full work-entry snapshot (category, related
-- project, multi-line title, hours, outcome, AI tools…) keyed by
-- the user's email so it follows them across devices.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_report_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner identity. We key by email (lowercased) rather than auth.uid()
  -- because not every authenticated session in this app carries a real
  -- Supabase auth user — the dev-bypass / super-admin failsafe paths
  -- bootstrap a synthetic profile that has no JWT email claim. The
  -- app filters reads/writes by this column on the client.
  owner_email text NOT NULL,
  label       text NOT NULL,
  entry       jsonb NOT NULL,              -- full snapshot of the work entry
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_report_templates_owner_idx
  ON public.user_report_templates (owner_email, created_at DESC);

-- Mirrors the policy shape used for confirmed_artist / rejected_artist:
-- RLS on, any authenticated user may read/write, app filters by owner.
ALTER TABLE public.user_report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.user_report_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated users"
  ON public.user_report_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users"
  ON public.user_report_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated users"
  ON public.user_report_templates FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_report_templates TO authenticated;
GRANT ALL ON public.user_report_templates TO service_role;
