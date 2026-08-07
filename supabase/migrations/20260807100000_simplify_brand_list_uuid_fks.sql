-- ============================================================
-- Simplify brand_list to real brands (not websites), and add
-- UUID FK columns on webandsystem_list → brand_list / company_list.
-- Legacy text columns brand / company are kept for now (drop later).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Backup current brand_list (website-duplicated rows)
CREATE TABLE IF NOT EXISTS public.brand_list_legacy_20260807 AS
SELECT * FROM public.brand_list;

-- 2) Add stable UUID identity on company_list for UUID FKs
ALTER TABLE public.company_list
  ADD COLUMN IF NOT EXISTS uuid uuid;

UPDATE public.company_list
SET uuid = CASE company_code
  WHEN 'BSC'  THEN 'dacb20dc-2181-5138-982e-989a853acc12'::uuid
  WHEN 'BWA'  THEN '954961df-ae61-57c6-bdcc-09e92eddba42'::uuid
  WHEN 'BWD'  THEN '25709685-229e-5efa-80bb-a0da30269f59'::uuid
  WHEN 'BWL'  THEN '989d3785-675e-5698-a4bf-58b5ca169835'::uuid
  WHEN 'BWT'  THEN '83e26278-37a6-55f5-9524-352ad35f72c8'::uuid
  WHEN 'FC'   THEN 'b1a22b78-3e4b-56ac-bd83-3a3795cb6ae9'::uuid
  WHEN 'FCCM' THEN 'a00af9d1-11cd-532a-bd9d-6b7b24e681d4'::uuid
  WHEN 'WP'   THEN 'c2a51e7a-f50d-5ed3-b93f-42ee94b510c7'::uuid
  ELSE coalesce(uuid, gen_random_uuid())
END
WHERE uuid IS NULL;

ALTER TABLE public.company_list
  ALTER COLUMN uuid SET DEFAULT gen_random_uuid(),
  ALTER COLUMN uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_list_uuid_uidx
  ON public.company_list (uuid);

-- 3) Replace brand_list with simplified schema
DROP TABLE IF EXISTS public.brand_list CASCADE;

CREATE TABLE public.brand_list (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.company_list(uuid) ON DELETE RESTRICT,
  brand_code    text NOT NULL,
  display_name  text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  CONSTRAINT brand_list_brand_code_unique UNIQUE (brand_code)
);

CREATE INDEX IF NOT EXISTS brand_list_company_id_idx
  ON public.brand_list (company_id);

ALTER TABLE public.brand_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for authenticated users" ON public.brand_list;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.brand_list;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.brand_list;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.brand_list;
DROP POLICY IF EXISTS "Allow anon select on brand_list" ON public.brand_list;

CREATE POLICY "Allow read for authenticated users"
  ON public.brand_list FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated users"
  ON public.brand_list FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users"
  ON public.brand_list FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated users"
  ON public.brand_list FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow anon select on brand_list"
  ON public.brand_list FOR SELECT TO anon USING (true);

GRANT SELECT ON public.brand_list TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brand_list TO authenticated;

-- Seed canonical brands (display_name defaults to brand_code)
INSERT INTO public.brand_list (id, company_id, brand_code, display_name, is_active)
VALUES
  ('b056bcb8-67b5-592f-b265-711df4b657f1', 'dacb20dc-2181-5138-982e-989a853acc12', 'BSC',     'BSC',     true),
  ('0176f0cb-4064-502d-9138-a8b3869285c3', '989d3785-675e-5698-a4bf-58b5ca169835', 'BWG',     'BWG',     true),
  ('5f00ae87-869c-5bab-a5c9-fd6e4cecac64', '25709685-229e-5efa-80bb-a0da30269f59', 'BWC',     'BWC',     true),
  ('51a53fa6-39cb-5a22-981a-d36eb1fc27b2', '954961df-ae61-57c6-bdcc-09e92eddba42', 'OB',      'OB',      true),
  ('1bbb9536-cae7-54f0-a3ce-993711c2cf46', '989d3785-675e-5698-a4bf-58b5ca169835', 'BWL',     'BWL',     true),
  ('74c13191-55d0-5074-bc5e-65bbb3934dc9', '25709685-229e-5efa-80bb-a0da30269f59', 'BWD',     'BWD',     true),
  ('3b7d3552-6335-5f04-894b-bb00bf52d7e2', '25709685-229e-5efa-80bb-a0da30269f59', 'BWF',     'BWF',     true),
  ('fed21b87-cf60-51cd-881f-99c4014c72a4', '83e26278-37a6-55f5-9524-352ad35f72c8', 'BWT',     'BWT',     true),
  ('6cdba1ef-7edb-5452-896a-e421e078c745', '989d3785-675e-5698-a4bf-58b5ca169835', 'BWE',     'BWE',     true),
  ('f13c0169-6513-58be-bd6d-baa3fd813cc5', '954961df-ae61-57c6-bdcc-09e92eddba42', 'BWA',     'BWA',     true),
  ('f1f8a3a6-187f-58a9-8270-428df26c6666', 'b1a22b78-3e4b-56ac-bd83-3a3795cb6ae9', 'FCC',     'FCC',     true),
  ('8fbb1a4a-7571-5a53-ad1d-15db67b7be59', 'a00af9d1-11cd-532a-bd9d-6b7b24e681d4', 'FC Shop', 'FC Shop', true),
  ('3b345631-6870-5924-9eb7-347e28a27fa8', 'c2a51e7a-f50d-5ed3-b93f-42ee94b510c7', 'Wine',    'Wine',    true);

-- 4) UUID FK columns on webandsystem_list (keep text brand/company for now)
ALTER TABLE public.webandsystem_list
  ADD COLUMN IF NOT EXISTS brand_list_id uuid REFERENCES public.brand_list(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_list_id uuid REFERENCES public.company_list(uuid) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS webandsystem_list_brand_list_id_idx
  ON public.webandsystem_list (brand_list_id);
CREATE INDEX IF NOT EXISTS webandsystem_list_company_list_id_idx
  ON public.webandsystem_list (company_list_id);

-- Map legacy brand text / official_url → new brand_list rows
-- (FC* site codes collapse into FCC; WP → Wine)
CREATE TEMP TABLE _brand_code_map (
  legacy_code text PRIMARY KEY,
  brand_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _brand_code_map (legacy_code, brand_code) VALUES
  ('BSC', 'BSC'),
  ('BWG', 'BWG'),
  ('BWC', 'BWC'),
  ('OB', 'OB'),
  ('BWL', 'BWL'),
  ('BWD', 'BWD'),
  ('BWF', 'BWF'),
  ('BWT', 'BWT'),
  ('BWE', 'BWE'),
  ('BWA', 'BWA'),
  ('FCC', 'FCC'),
  ('FC', 'FCC'),
  ('FCB', 'FCC'),
  ('FCD', 'FCC'),
  ('FCE', 'FCC'),
  ('FCK', 'FCC'),
  ('FCL', 'FCC'),
  ('FCP', 'FCC'),
  ('FC Shop', 'FC Shop'),
  ('WP', 'Wine'),
  ('Wine', 'Wine');

CREATE TEMP TABLE _resolved_website_brands (
  website_id text PRIMARY KEY,
  brand_code text NOT NULL
) ON COMMIT DROP;

-- primary: legacy text brand field
INSERT INTO _resolved_website_brands (website_id, brand_code)
SELECT ws.id, bm.brand_code
FROM public.webandsystem_list ws
JOIN _brand_code_map bm ON bm.legacy_code = ws.brand
ON CONFLICT (website_id) DO NOTHING;

-- secondary: match domain to old brand_list.official_url (ignore attitude-beauty.com)
INSERT INTO _resolved_website_brands (website_id, brand_code)
SELECT DISTINCT ON (ws.id)
  ws.id,
  bm.brand_code
FROM public.webandsystem_list ws
JOIN public.brand_list_legacy_20260807 legacy
  ON lower(regexp_replace(regexp_replace(coalesce(ws.domain_url, ''), '^https?://', '', 'i'), '^www\.', '', 'i'))
   = lower(regexp_replace(regexp_replace(coalesce(legacy.official_url, ''), '^https?://', '', 'i'), '^www\.', '', 'i'))
JOIN _brand_code_map bm ON bm.legacy_code = legacy.brand_code
WHERE coalesce(ws.domain_url, '') <> ''
  AND coalesce(legacy.official_url, '') <> ''
  AND lower(legacy.official_url) NOT LIKE '%attitude-beauty.com%'
ON CONFLICT (website_id) DO NOTHING;

UPDATE public.webandsystem_list ws
SET
  brand_list_id = b.id,
  company_list_id = coalesce(
    (SELECT c.uuid FROM public.company_list c WHERE c.company_code = ws.company LIMIT 1),
    b.company_id
  )
FROM _resolved_website_brands r
JOIN public.brand_list b ON b.brand_code = r.brand_code
WHERE ws.id = r.website_id;

-- Company-only backfill when brand could not be resolved but company text matches
UPDATE public.webandsystem_list ws
SET company_list_id = c.uuid
FROM public.company_list c
WHERE ws.company_list_id IS NULL
  AND ws.company IS NOT NULL
  AND ws.company = c.company_code;

-- If brand resolved but company blank, inherit brand's company
UPDATE public.webandsystem_list ws
SET company_list_id = b.company_id
FROM public.brand_list b
WHERE ws.company_list_id IS NULL
  AND ws.brand_list_id = b.id;

-- Internal systems with blank brand text → OB
UPDATE public.webandsystem_list ws
SET
  brand_list_id = '51a53fa6-39cb-5a22-981a-d36eb1fc27b2',
  brand = coalesce(nullif(ws.brand, ''), 'OB')
WHERE ws.brand_list_id IS NULL
  AND (
    ws.website_name ilike '%OTC2%'
    OR coalesce(ws.domain_url, '') ilike '%oneteam-connect%'
  );
