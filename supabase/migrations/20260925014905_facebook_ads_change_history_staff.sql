-- Responsible colleague for a Meta change-history row.
-- Stores the activity ↔ staff relation only. No change-history payload.
-- A row exists only when a staff member is assigned (staff_id is NOT NULL).

CREATE TABLE IF NOT EXISTS public.facebook_ads_change_history_staff (
  activity_key text PRIMARY KEY,
  staff_id     uuid NOT NULL REFERENCES public.staffs(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facebook_ads_change_history_staff_staff_id_idx
  ON public.facebook_ads_change_history_staff (staff_id);

COMMENT ON TABLE public.facebook_ads_change_history_staff IS
  'Staff assigned to a Facebook Ads change-history row. activity_key is the stable Meta activity id. Change details are not stored. Delete the row when no staff is assigned.';

ALTER TABLE public.facebook_ads_change_history_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on facebook_ads_change_history_staff"
  ON public.facebook_ads_change_history_staff FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on facebook_ads_change_history_staff"
  ON public.facebook_ads_change_history_staff FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on facebook_ads_change_history_staff"
  ON public.facebook_ads_change_history_staff FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on facebook_ads_change_history_staff"
  ON public.facebook_ads_change_history_staff FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_ads_change_history_staff TO anon, authenticated;
GRANT ALL ON public.facebook_ads_change_history_staff TO service_role;
