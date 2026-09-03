-- Supplier types lookup + expand suppliers into a shared vendor record.

CREATE TABLE IF NOT EXISTS public.supplier_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categories   text NOT NULL CHECK (categories IN ('網站', '活動', '影片')),
  display_name text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (categories, display_name)
);

CREATE INDEX IF NOT EXISTS supplier_types_categories_idx
  ON public.supplier_types (categories);

ALTER TABLE public.supplier_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on supplier_types"
  ON public.supplier_types FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on supplier_types"
  ON public.supplier_types FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on supplier_types"
  ON public.supplier_types FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on supplier_types"
  ON public.supplier_types FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_types TO anon, authenticated;

INSERT INTO public.supplier_types (categories, display_name, is_active)
VALUES
  ('網站', '網站插件', true),
  ('網站', '網站工具', true)
ON CONFLICT (categories, display_name) DO NOTHING;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplier_types_id uuid REFERENCES public.supplier_types(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS remarks text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS suppliers_supplier_types_id_idx
  ON public.suppliers (supplier_types_id);
