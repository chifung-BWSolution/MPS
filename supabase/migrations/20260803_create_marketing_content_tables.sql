-- ============================================================
-- Marketing content tables: EDM, paid ads, SEO keywords/upgrades,
-- graphic designs (previously demo/DataStore-only)
-- ============================================================

-- 1) EDM campaigns
CREATE TABLE IF NOT EXISTS public.edm_campaigns (
  id                   text PRIMARY KEY,
  website_profile_id   text NOT NULL,
  campaign_type        text NOT NULL DEFAULT 'email'
                       CHECK (campaign_type IN ('email', 'sms')),
  subject              text NOT NULL DEFAULT '',
  template_name        text,
  recipient_type       text,
  recipient_count      integer DEFAULT 0,
  send_date            date,
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  hours_spent          numeric,
  open_rate            numeric,
  click_rate           numeric,
  report_date          date,
  asana_link           text,
  output_link          text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS edm_campaigns_website_idx
  ON public.edm_campaigns (website_profile_id);
CREATE INDEX IF NOT EXISTS edm_campaigns_send_date_idx
  ON public.edm_campaigns (send_date);
CREATE INDEX IF NOT EXISTS edm_campaigns_status_idx
  ON public.edm_campaigns (status);

ALTER TABLE public.edm_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on edm_campaigns"
  ON public.edm_campaigns FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on edm_campaigns"
  ON public.edm_campaigns FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on edm_campaigns"
  ON public.edm_campaigns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on edm_campaigns"
  ON public.edm_campaigns FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.edm_campaigns TO anon, authenticated;

-- 2) Paid ads
CREATE TABLE IF NOT EXISTS public.paid_ads (
  id                   text PRIMARY KEY,
  website_profile_id   text,
  project_id           text,
  campaign_name        text NOT NULL DEFAULT '',
  platform             text NOT NULL DEFAULT 'google_ads',
  ad_type              text NOT NULL DEFAULT 'search',
  budget               numeric NOT NULL DEFAULT 0,
  actual_spend         numeric NOT NULL DEFAULT 0,
  currency             text NOT NULL DEFAULT 'HKD',
  start_date           date,
  end_date             date,
  status               text NOT NULL DEFAULT 'planning'
                       CHECK (status IN ('planning', 'active', 'paused', 'completed')),
  target_audience      text,
  impressions          integer,
  clicks               integer,
  conversions          integer,
  cpc                  numeric,
  ctr                  numeric,
  roas                 numeric,
  credit_card_id       text,
  report_date          date,
  man_hours            numeric,
  asana_link           text,
  output_link          text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paid_ads_website_idx
  ON public.paid_ads (website_profile_id);
CREATE INDEX IF NOT EXISTS paid_ads_start_date_idx
  ON public.paid_ads (start_date);
CREATE INDEX IF NOT EXISTS paid_ads_status_idx
  ON public.paid_ads (status);

ALTER TABLE public.paid_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on paid_ads"
  ON public.paid_ads FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on paid_ads"
  ON public.paid_ads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on paid_ads"
  ON public.paid_ads FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on paid_ads"
  ON public.paid_ads FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paid_ads TO anon, authenticated;

-- 3) SEO keywords
CREATE TABLE IF NOT EXISTS public.seo_keywords (
  id                   text PRIMARY KEY,
  website_profile_id   text NOT NULL,
  keyword              text NOT NULL DEFAULT '',
  level                text NOT NULL DEFAULT 'level_1'
                       CHECK (level IN ('level_1', 'level_2', 'level_3')),
  search_volume        integer,
  current_ranking      integer,
  target_ranking       integer,
  target_page          text,
  difficulty_score     integer,
  assigned_article_id  text,
  status               text NOT NULL DEFAULT 'monitoring'
                       CHECK (status IN ('monitoring', 'optimizing', 'achieved', 'paused')),
  ai_generated         boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seo_keywords_website_idx
  ON public.seo_keywords (website_profile_id);
CREATE INDEX IF NOT EXISTS seo_keywords_status_idx
  ON public.seo_keywords (status);

ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on seo_keywords"
  ON public.seo_keywords FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on seo_keywords"
  ON public.seo_keywords FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on seo_keywords"
  ON public.seo_keywords FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on seo_keywords"
  ON public.seo_keywords FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_keywords TO anon, authenticated;

-- 4) SEO upgrades
CREATE TABLE IF NOT EXISTS public.seo_upgrades (
  id                   text PRIMARY KEY,
  website_profile_id   text,
  website_name         text,
  company              text,
  brand                text,
  upgrade_type         text NOT NULL DEFAULT 'other',
  supplier             text,
  cost                 numeric NOT NULL DEFAULT 0,
  currency             text NOT NULL DEFAULT 'HKD',
  start_date           date,
  end_date             date,
  staff                text,
  hours_spent          numeric,
  ranking_before       jsonb,
  ranking_after        jsonb,
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'completed', 'cancelled')),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seo_upgrades_website_idx
  ON public.seo_upgrades (website_profile_id);
CREATE INDEX IF NOT EXISTS seo_upgrades_status_idx
  ON public.seo_upgrades (status);

ALTER TABLE public.seo_upgrades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on seo_upgrades"
  ON public.seo_upgrades FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on seo_upgrades"
  ON public.seo_upgrades FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on seo_upgrades"
  ON public.seo_upgrades FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on seo_upgrades"
  ON public.seo_upgrades FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_upgrades TO anon, authenticated;

-- 5) Graphic designs
CREATE TABLE IF NOT EXISTS public.graphic_designs (
  id                   text PRIMARY KEY,
  title                text NOT NULL DEFAULT '',
  website_profile_id   text,
  website_name         text,
  company              text,
  brand                text,
  design_type          text NOT NULL DEFAULT 'other',
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'in_progress', 'review', 'approved', 'published')),
  designer             text,
  created_date         date,
  dimensions           text,
  platform             text,
  man_hours            numeric NOT NULL DEFAULT 0,
  project_type         text,
  project_name         text,
  notes                text,
  report_date          date,
  asana_link           text,
  output_link          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS graphic_designs_website_idx
  ON public.graphic_designs (website_profile_id);
CREATE INDEX IF NOT EXISTS graphic_designs_status_idx
  ON public.graphic_designs (status);

ALTER TABLE public.graphic_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on graphic_designs"
  ON public.graphic_designs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on graphic_designs"
  ON public.graphic_designs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on graphic_designs"
  ON public.graphic_designs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on graphic_designs"
  ON public.graphic_designs FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.graphic_designs TO anon, authenticated;
