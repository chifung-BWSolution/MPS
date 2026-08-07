-- ============================================================
-- Add CFA / CFB / CF brands, assign remaining vchannels,
-- then drop legacy vchannels.brand_code.
-- Company: BWA (志豐 / Brand Story Asia) for all three.
-- ============================================================

-- 1) Seed brands (idempotent)
INSERT INTO public.brand_list (id, company_id, brand_code, display_name, is_active)
VALUES
  ('32915d65-1a44-588d-8368-d3eeb9f15803', '954961df-ae61-57c6-bdcc-09e92eddba42', 'CFA', 'CFA', true),
  ('a02f5d1c-3584-597d-834d-7fbbb09e7ca7', '954961df-ae61-57c6-bdcc-09e92eddba42', 'CFB', 'CFB', true),
  ('aefe9a23-6e4b-5ba1-98f1-16243ff3260c', '954961df-ae61-57c6-bdcc-09e92eddba42', 'CF',  'CF',  true)
ON CONFLICT (brand_code) DO UPDATE
SET
  company_id = EXCLUDED.company_id,
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active;

-- 2) Assign vchannels → brand_list
UPDATE public.vchannels
SET brand_list_id = '32915d65-1a44-588d-8368-d3eeb9f15803'::uuid
WHERE id = '3c17dc5e-c565-464d-be50-405d85b2ee6c'; -- CFA

UPDATE public.vchannels
SET brand_list_id = 'a02f5d1c-3584-597d-834d-7fbbb09e7ca7'::uuid
WHERE id = '449fccb1-a7ac-4940-bbb7-21fcc763bd05'; -- CFB

UPDATE public.vchannels
SET brand_list_id = 'aefe9a23-6e4b-5ba1-98f1-16243ff3260c'::uuid
WHERE id IN (
  '7a62ded5-66ec-4d7f-83d3-0fff111e0acc',
  '7af964da-771d-4793-94ff-2cb71f5106cc',
  '371b8f72-eda3-45c7-82bd-dd5bdf63ff84'
); -- CF

-- 3) Drop legacy text column
ALTER TABLE public.vchannels
  DROP COLUMN IF EXISTS brand_code;
