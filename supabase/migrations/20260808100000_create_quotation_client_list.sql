-- Client list for 客戶報價 module (quotation_client_list)

CREATE TABLE IF NOT EXISTS public.quotation_client_list (
  id text PRIMARY KEY,
  company_name_zh text NOT NULL,
  company_name_en text,
  brand_id text,
  brand_code text,
  brand_name text,
  contact_person text NOT NULL DEFAULT '',
  phone text,
  whatsapp text,
  email text,
  address text,
  inquiry_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('active', 'inactive', 'prospect')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotation_client_list_status_idx
  ON public.quotation_client_list (status);

CREATE INDEX IF NOT EXISTS quotation_client_list_company_zh_idx
  ON public.quotation_client_list (company_name_zh);

COMMENT ON TABLE public.quotation_client_list IS
  'Customer master list for 客戶報價; seeded from Pitching and editable via 客戶列表';

ALTER TABLE public.quotation_client_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated on quotation_client_list"
  ON public.quotation_client_list FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated on quotation_client_list"
  ON public.quotation_client_list FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated on quotation_client_list"
  ON public.quotation_client_list FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated on quotation_client_list"
  ON public.quotation_client_list FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on quotation_client_list"
  ON public.quotation_client_list FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on quotation_client_list"
  ON public.quotation_client_list FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on quotation_client_list"
  ON public.quotation_client_list FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on quotation_client_list"
  ON public.quotation_client_list FOR DELETE TO anon USING (true);

-- Backfill distinct clients from Pitching (quotation_client_project)
INSERT INTO public.quotation_client_list (
  id,
  company_name_zh,
  company_name_en,
  contact_person,
  inquiry_date,
  status,
  notes,
  created_at,
  updated_at
)
SELECT DISTINCT ON (COALESCE(NULLIF(TRIM(p.client_id), ''), NULLIF(TRIM(p.client_name), ''), p.id))
  COALESCE(NULLIF(TRIM(p.client_id), ''), 'pitch_' || SUBSTRING(MD5(COALESCE(p.client_name, p.id)) FROM 1 FOR 12)),
  COALESCE(NULLIF(TRIM(p.company_name_zh), ''), NULLIF(TRIM(p.client_name), ''), NULLIF(TRIM(p.display_name), ''), '—'),
  NULLIF(TRIM(p.company_name_en), ''),
  COALESCE(NULLIF(TRIM(p.client_name), ''), '—'),
  p.inquiry_date,
  CASE p.status
    WHEN 'confirmed' THEN 'active'
    WHEN 'closed' THEN 'inactive'
    ELSE 'prospect'
  END,
  p.notes,
  p.created_at,
  p.updated_at
FROM public.quotation_client_project p
WHERE COALESCE(NULLIF(TRIM(p.client_name), ''), NULLIF(TRIM(p.display_name), '')) IS NOT NULL
ORDER BY COALESCE(NULLIF(TRIM(p.client_id), ''), NULLIF(TRIM(p.client_name), ''), p.id), p.inquiry_date DESC
ON CONFLICT (id) DO NOTHING;
