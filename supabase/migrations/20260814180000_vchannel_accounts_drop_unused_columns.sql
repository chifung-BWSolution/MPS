-- Drop unused vchannel_accounts columns.
ALTER TABLE public.vchannel_accounts
  DROP COLUMN IF EXISTS channel_intro,
  DROP COLUMN IF EXISTS account_password,
  DROP COLUMN IF EXISTS operator_code,
  DROP COLUMN IF EXISTS sort_order;
