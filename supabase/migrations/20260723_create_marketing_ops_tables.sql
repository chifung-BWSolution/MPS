-- ============================================================
-- Marketing ops persistence: social posts, web page suppliers,
-- backlink purchases, Google Business registrations
-- ============================================================

-- 1) Web page suppliers (backlink purchasable sites)
CREATE TABLE IF NOT EXISTS public.web_page_suppliers (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  platform     text NOT NULL DEFAULT '',
  url          text NOT NULL,
  cost         numeric NOT NULL DEFAULT 0,
  currency     text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'HKD')),
  rating       numeric NOT NULL DEFAULT 3,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_page_suppliers_name_idx
  ON public.web_page_suppliers (name);

ALTER TABLE public.web_page_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on web_page_suppliers"
  ON public.web_page_suppliers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on web_page_suppliers"
  ON public.web_page_suppliers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on web_page_suppliers"
  ON public.web_page_suppliers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on web_page_suppliers"
  ON public.web_page_suppliers FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_page_suppliers TO anon, authenticated;

-- 2) Social posts
CREATE TABLE IF NOT EXISTS public.social_posts (
  id                   text PRIMARY KEY,
  website_profile_id   text NOT NULL,
  platform             text NOT NULL,
  platforms            jsonb,
  topic                text,
  post_type            text NOT NULL DEFAULT 'image',
  content              text NOT NULL DEFAULT '',
  media_urls           jsonb,
  scheduled_date       date,
  published_date       date,
  publish_time         text,
  status               text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  engagement_data      jsonb,
  author_id            text,
  hours_spent          numeric,
  post_url             text,
  tags                 jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_website_idx
  ON public.social_posts (website_profile_id);
CREATE INDEX IF NOT EXISTS social_posts_published_date_idx
  ON public.social_posts (published_date);
CREATE INDEX IF NOT EXISTS social_posts_scheduled_date_idx
  ON public.social_posts (scheduled_date);
CREATE INDEX IF NOT EXISTS social_posts_status_idx
  ON public.social_posts (status);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on social_posts"
  ON public.social_posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on social_posts"
  ON public.social_posts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on social_posts"
  ON public.social_posts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on social_posts"
  ON public.social_posts FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO anon, authenticated;

-- 3) Backlink purchases
CREATE TABLE IF NOT EXISTS public.backlink_purchases (
  id                   text PRIMARY KEY,
  website_profile_id   text,
  web_supplier_id      text NOT NULL REFERENCES public.web_page_suppliers(id) ON DELETE RESTRICT,
  cost                 numeric NOT NULL DEFAULT 0,
  currency             text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'HKD')),
  purchase_date        date NOT NULL,
  quantity             integer NOT NULL DEFAULT 1,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backlink_purchases_date_idx
  ON public.backlink_purchases (purchase_date);
CREATE INDEX IF NOT EXISTS backlink_purchases_website_idx
  ON public.backlink_purchases (website_profile_id);
CREATE INDEX IF NOT EXISTS backlink_purchases_supplier_idx
  ON public.backlink_purchases (web_supplier_id);

ALTER TABLE public.backlink_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on backlink_purchases"
  ON public.backlink_purchases FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on backlink_purchases"
  ON public.backlink_purchases FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on backlink_purchases"
  ON public.backlink_purchases FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on backlink_purchases"
  ON public.backlink_purchases FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backlink_purchases TO anon, authenticated;

-- 4) Google Business registrations
CREATE TABLE IF NOT EXISTS public.google_business_registrations (
  id                   text PRIMARY KEY,
  website_profile_id   text,
  url                  text NOT NULL,
  registered_at        date NOT NULL,
  content              text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_business_registrations_date_idx
  ON public.google_business_registrations (registered_at);
CREATE INDEX IF NOT EXISTS google_business_registrations_website_idx
  ON public.google_business_registrations (website_profile_id);

ALTER TABLE public.google_business_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on google_business_registrations"
  ON public.google_business_registrations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on google_business_registrations"
  ON public.google_business_registrations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on google_business_registrations"
  ON public.google_business_registrations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on google_business_registrations"
  ON public.google_business_registrations FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_business_registrations TO anon, authenticated;
