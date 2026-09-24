-- Daily campaign budget (account currency, stored in micros).
-- Google: campaign_budget.amount_micros. Meta: campaign daily_budget, or the
-- sum of ad set daily budgets when the campaign itself has none.

ALTER TABLE public.google_ads_campaigns
  ADD COLUMN IF NOT EXISTS daily_budget_micros bigint;

ALTER TABLE public.facebook_ads_campaigns
  ADD COLUMN IF NOT EXISTS daily_budget_micros bigint;
