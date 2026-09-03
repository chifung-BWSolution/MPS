-- Rename web_page_suppliers → suppliers, keep only identity + url.
-- Existing backlink_purchases.web_supplier_id FK follows the table rename.

ALTER TABLE public.web_page_suppliers RENAME TO suppliers;

ALTER TABLE public.suppliers RENAME COLUMN name TO display_name;

ALTER TABLE public.suppliers
  DROP COLUMN IF EXISTS platform,
  DROP COLUMN IF EXISTS cost,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS rating;

ALTER INDEX IF EXISTS public.web_page_suppliers_name_idx
  RENAME TO suppliers_display_name_idx;

ALTER POLICY "Allow select on web_page_suppliers" ON public.suppliers
  RENAME TO "Allow select on suppliers";
ALTER POLICY "Allow insert on web_page_suppliers" ON public.suppliers
  RENAME TO "Allow insert on suppliers";
ALTER POLICY "Allow update on web_page_suppliers" ON public.suppliers
  RENAME TO "Allow update on suppliers";
ALTER POLICY "Allow delete on web_page_suppliers" ON public.suppliers
  RENAME TO "Allow delete on suppliers";
