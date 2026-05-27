-- ============================================================
-- Company list (company_list)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_list (
  id                text PRIMARY KEY,
  company_code      text NOT NULL,
  company_name_zh   text NOT NULL,
  company_name_en   text NOT NULL,
  br_no             text NOT NULL DEFAULT '',
  bank_name         text NOT NULL DEFAULT '',
  bank_account      text NOT NULL DEFAULT '',
  address           text NOT NULL DEFAULT '',
  contact_person    text NOT NULL DEFAULT '',
  contact_phone     text NOT NULL DEFAULT '',
  contact_email     text NOT NULL DEFAULT '',
  logo_url          text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.company_list FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
  ON public.company_list FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.company_list FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
  ON public.company_list FOR DELETE TO authenticated USING (true);

-- Seed: 3 companies
INSERT INTO public.company_list
  (id, company_code, company_name_zh, company_name_en, br_no, bank_name, bank_account, address, contact_person, contact_phone, contact_email, is_active)
VALUES
  ('c1', 'BWD', '志豐企業有限公司',    'BWDesign Centre Limited',          '12345678-000-01-25-0', '恒生銀行',      '024-123-456789-001', '香港九龍觀塘開源道62號駱駝漆大廈3座10樓A室', '張偉明', '+852 2345 6789', 'info@bwdesign.hk',   true),
  ('c2', 'ZF',  '志豐國際貿易有限公司', 'ZhiFeng International Trading Ltd', '98765432-000-02-25-0', '中國銀行(香港)', '012-987-654321-002', '香港灣仔軒尼詩道288號8樓',                   '李志豐', '+852 2876 5432', 'info@zhifeng.hk',    true),
  ('c3', 'GLE', '綠色生活體驗有限公司', 'Green Living Experience Ltd',       '55667788-000-03-25-0', '匯豐銀行',      '004-555-888999-003', '香港中環皇后大道中99號15樓',                 '王美玲', '+852 2111 3333', 'contact@greenlife.hk', false)
ON CONFLICT (id) DO NOTHING;
