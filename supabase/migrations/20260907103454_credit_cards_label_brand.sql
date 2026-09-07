-- Add display label + brand FK so payment-card imports can keep company and brand separate.
-- CSV company_code is an operating unit, not always company_list.company_code:
--   BWF  : BWD , BWF
--   BWE  : BWA , BWE
--   Wine : WP  , Wine
--   BW   : BWA , BWA
--   ASX  : BSC , BSC
--   FC   : FC  , FCC
--   BWA  : BWA , BWA
--   BWL  : BWL , BWL

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand_list_id uuid
    REFERENCES public.brand_list(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS credit_cards_brand_list_id_idx
  ON public.credit_cards (brand_list_id);

COMMENT ON COLUMN public.credit_cards.label IS
  'Human-readable card nickname (e.g. Franco''s card - BWF).';

COMMENT ON COLUMN public.credit_cards.brand_list_id IS
  'Operating brand (brand_list.id). Independent of company_list_id.';

-- Replace the one manually entered 8428 card with the imported BWA Shopify row.
DELETE FROM public.credit_cards
WHERE last_four = '8428';

INSERT INTO public.credit_cards (
  id,
  label,
  company_list_id,
  brand_list_id,
  last_four,
  bank,
  purpose,
  holder,
  custodian_id,
  expiry,
  is_active,
  notes,
  created_at,
  updated_at
)
SELECT
  src.id,
  src.label,
  c.uuid,
  b.id,
  src.last_four,
  src.bank,
  src.purpose,
  src.holder,
  CASE src.custodian_name
    WHEN 'Yoko' THEN (SELECT s.id FROM public.staffs s WHERE s.display_name ILIKE 'Yoko%' ORDER BY s.display_name LIMIT 1)
    WHEN 'Franco' THEN (SELECT s.id FROM public.staffs s WHERE s.display_name ILIKE 'Franco%' ORDER BY s.display_name LIMIT 1)
    ELSE NULL
  END,
  src.expiry,
  src.is_active,
  src.notes,
  src.created_at,
  src.updated_at
FROM (
  VALUES
    (
      '107fde33-2f25-402d-807c-85f6a6799db6'::uuid,
      'FCD - Franco''s card 1898',
      'FC', 'FCC', '1898', 'HSBC',
      'OB Shopify + Google + FB', 'Franco', 'Yoko', '2028-01', false,
      'Reported lost; replaced by **** 7934 on 2025-08-21',
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      '25e743f2-0bd6-4e0e-818c-a60abb476e6d'::uuid,
      'Franco''s card - BWF old',
      'BWD', 'BWF', '4268', 'HSBC',
      'BWF Furniture Ads', 'Franco', 'Franco', '2026-01', false,
      'Renewed',
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      '2ccfa674-60b8-4583-a574-d03a8cbaefd0'::uuid,
      'Angel''s card -  FC',
      'FC', 'FCC', '6128', 'HSBC',
      'Printing + Shipping + Office Supplies + Taobao + Stock', 'Angel', 'Yoko', '2027-08', true,
      NULL,
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:59:07.29+00'::timestamptz
    ),
    (
      '2db88ef1-c7ce-43c8-86db-c70120cfb8d6'::uuid,
      'Franco''s card - BWF',
      'BWD', 'BWF', '4268', 'HSBC',
      'BWF Furniture Ads', 'Franco', 'Yoko', '2033-01', true,
      'Renew CVS & expiry date; kept by Yoko',
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      '33266658-4380-4cb4-92f8-8da138165a44'::uuid,
      'Angel''s card',
      'WP', 'Wine', '4081', 'HSBC',
      'OB Shopify + Google + FB + Printing + Shipping + Taobao + Stock', 'Angel', 'Yoko', '2032-06', true,
      'NEW',
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      '43a4c649-47f9-459f-8471-b1509492a5d8'::uuid,
      'Franco''s card - BWA Google',
      'BWA', 'BWA', '6375', 'HSBC',
      'OB Google', 'Franco', 'Franco', '2029-05', true,
      NULL,
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      '7194807e-fc52-42f0-a16c-100c5c849b63'::uuid,
      'Franco''s card - BW 8183',
      'BWA', 'BWA', '8183', 'HSBC',
      'Till Nov 2024 - cancelled', 'Franco', 'Franco', '2024-09', false,
      NULL,
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      '7cf4e097-960b-498e-a1fc-a26c02096aa5'::uuid,
      'BW - Franco''s card',
      'BWA', 'BWA', '8894', 'HSBC',
      'PC + Mobile + Taobao', 'Franco', 'Franco', '2024-03', false,
      'Expired',
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      '7fd87a19-b65b-41a2-ab39-e06a8922fc79'::uuid,
      'Franco''s card - BW 2390',
      'BWA', 'BWA', '2390', 'HSBC',
      'OB Shopify + FB', 'Franco', 'Yoko', '2029-05', false,
      'Reported lost; replaced by **** 8428 on 2025-01-16',
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      '8397ed58-94f5-4841-b4b8-6737625252d8'::uuid,
      'FCD - Franco''s card',
      'FC', 'FCC', '7934', 'HSBC',
      'OB Shopify + Google + FB', 'Franco', 'Yoko', '2032-03', true,
      NULL,
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      'af1c0f9b-0e64-41f4-abf1-ed2b245b23f9'::uuid,
      'Franco''s card - BWE',
      'BWA', 'BWE', '7186', 'HSBC',
      'Green Power', 'Franco', 'Franco', '2030-10', true,
      NULL,
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      'd01187ca-877d-4bd6-8855-00374321c086'::uuid,
      'Angel''s card 1527',
      'WP', 'Wine', '1527', 'HSBC',
      'OB Shopify + Google + FB + Printing + Shipping + Taobao + Stock', 'Angel', 'Yoko', '2031-06', false,
      'Reported lost; replaced by **** 4081 on 2026-01-06',
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      'e46ff467-ac7a-4191-8681-faa9e8c4d50f'::uuid,
      'Franco''s card - BWA Shopify',
      'BWA', 'BWA', '8428', 'HSBC',
      'OB Shopify + FB', 'Franco', 'Yoko', '2029-05', true,
      NULL,
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      'e49d77ad-5e78-4e43-b7f9-6e42616fee38'::uuid,
      'Franco''s card - ASX',
      'BSC', 'BSC', '9902', 'HSBC',
      'Victoria Beauty', 'Franco', 'Yoko', '2032-08', true,
      'Was BW Gift & Travel; changed to BSC Victoria on 2025-11-28',
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    ),
    (
      'fa242ab3-93d2-4cb7-8663-87dbc0045123'::uuid,
      'Franco''s card - BWL',
      'BWL', 'BWL', '1992', 'Standard Chartered',
      'HK Web Design + BW Gift', 'Franco', 'Franco', '2029-07', true,
      NULL,
      '2026-08-12 08:37:16.192146+00'::timestamptz,
      '2026-08-12 08:37:16.192146+00'::timestamptz
    )
) AS src (
  id, label, company_code, brand_code, last_four, bank,
  purpose, holder, custodian_name, expiry, is_active,
  notes, created_at, updated_at
)
JOIN public.company_list c ON c.company_code = src.company_code
JOIN public.brand_list b ON b.brand_code = src.brand_code
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  company_list_id = EXCLUDED.company_list_id,
  brand_list_id = EXCLUDED.brand_list_id,
  last_four = EXCLUDED.last_four,
  bank = EXCLUDED.bank,
  purpose = EXCLUDED.purpose,
  holder = EXCLUDED.holder,
  custodian_id = EXCLUDED.custodian_id,
  expiry = EXCLUDED.expiry,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  updated_at = EXCLUDED.updated_at;

ALTER TABLE public.credit_cards
  ALTER COLUMN brand_list_id SET NOT NULL;

NOTIFY pgrst, 'reload schema';
