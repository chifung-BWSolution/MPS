-- ============================================================
-- Ads campaign tags (shared catalog + campaign join)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ads_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  color       text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ads_tags_name_lower_uidx
  ON public.ads_tags (lower(name));

CREATE INDEX IF NOT EXISTS ads_tags_is_active_idx
  ON public.ads_tags (is_active);

CREATE INDEX IF NOT EXISTS ads_tags_sort_order_idx
  ON public.ads_tags (sort_order, name);

ALTER TABLE public.ads_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on ads_tags" ON public.ads_tags;
CREATE POLICY "Allow select on ads_tags"
  ON public.ads_tags FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on ads_tags" ON public.ads_tags;
CREATE POLICY "Allow insert on ads_tags"
  ON public.ads_tags FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on ads_tags" ON public.ads_tags;
CREATE POLICY "Allow update on ads_tags"
  ON public.ads_tags FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on ads_tags" ON public.ads_tags;
CREATE POLICY "Allow delete on ads_tags"
  ON public.ads_tags FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_tags TO anon, authenticated;
GRANT ALL ON public.ads_tags TO service_role;

-- Join: one tag can apply to Google and/or Facebook campaigns
CREATE TABLE IF NOT EXISTS public.ads_campaign_tags (
  tag_id            uuid NOT NULL REFERENCES public.ads_tags(id) ON DELETE CASCADE,
  platform          text NOT NULL CHECK (platform IN ('google', 'facebook')),
  campaign_row_id   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, platform, campaign_row_id)
);

CREATE INDEX IF NOT EXISTS ads_campaign_tags_campaign_idx
  ON public.ads_campaign_tags (platform, campaign_row_id);

CREATE INDEX IF NOT EXISTS ads_campaign_tags_tag_idx
  ON public.ads_campaign_tags (tag_id);

ALTER TABLE public.ads_campaign_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on ads_campaign_tags" ON public.ads_campaign_tags;
CREATE POLICY "Allow select on ads_campaign_tags"
  ON public.ads_campaign_tags FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on ads_campaign_tags" ON public.ads_campaign_tags;
CREATE POLICY "Allow insert on ads_campaign_tags"
  ON public.ads_campaign_tags FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on ads_campaign_tags" ON public.ads_campaign_tags;
CREATE POLICY "Allow update on ads_campaign_tags"
  ON public.ads_campaign_tags FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on ads_campaign_tags" ON public.ads_campaign_tags;
CREATE POLICY "Allow delete on ads_campaign_tags"
  ON public.ads_campaign_tags FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_campaign_tags TO anon, authenticated;
GRANT ALL ON public.ads_campaign_tags TO service_role;
