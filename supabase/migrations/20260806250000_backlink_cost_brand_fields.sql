-- Split backlink cost into USD/HKD columns and add brand field.

ALTER TABLE public.backlink_purchases
  ADD COLUMN IF NOT EXISTS cost_usd numeric,
  ADD COLUMN IF NOT EXISTS cost_hkd numeric,
  ADD COLUMN IF NOT EXISTS brand text;

ALTER TABLE public.backlink_purchases
  DROP CONSTRAINT IF EXISTS backlink_purchases_brand_check;

ALTER TABLE public.backlink_purchases
  ADD CONSTRAINT backlink_purchases_brand_check
  CHECK (brand IS NULL OR brand IN ('BW', 'FC', 'BSC', 'Wine'));

-- Migrate legacy cost + currency into dual columns (USD/HKD rate 7.8, round up conversions).
UPDATE public.backlink_purchases
SET
  cost_hkd = CASE
    WHEN cost_hkd IS NOT NULL THEN cost_hkd
    WHEN currency = 'HKD' THEN cost
    WHEN currency = 'USD' THEN CEIL(cost * 7.8)
    ELSE CEIL(cost * 7.8)
  END,
  cost_usd = CASE
    WHEN cost_usd IS NOT NULL THEN cost_usd
    WHEN currency = 'USD' THEN cost
    WHEN currency = 'HKD' THEN CEIL(cost / 7.8)
    ELSE CEIL(cost / 7.8)
  END
WHERE cost_usd IS NULL OR cost_hkd IS NULL;

ALTER TABLE public.backlink_purchases
  ALTER COLUMN cost_usd SET DEFAULT 0,
  ALTER COLUMN cost_hkd SET DEFAULT 0;

UPDATE public.backlink_purchases
SET cost_usd = COALESCE(cost_usd, 0),
    cost_hkd = COALESCE(cost_hkd, 0)
WHERE cost_usd IS NULL OR cost_hkd IS NULL;

ALTER TABLE public.backlink_purchases
  ALTER COLUMN cost_usd SET NOT NULL,
  ALTER COLUMN cost_hkd SET NOT NULL;

CREATE INDEX IF NOT EXISTS backlink_purchases_brand_idx
  ON public.backlink_purchases (brand);
