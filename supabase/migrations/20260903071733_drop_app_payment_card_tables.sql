-- Unused leftovers: never referenced by the app, migrations, or generated types.
-- Live credit-card management uses public.credit_cards (Settings → 信用卡管理).
-- Only self-wiring was an audit trigger + private helper functions + RLS on these tables.

DROP TRIGGER IF EXISTS app_payment_card_audit_trigger ON public.app_payment_card;

DROP TABLE IF EXISTS public.app_payment_card_audit;
DROP TABLE IF EXISTS public.app_payment_card;

DROP FUNCTION IF EXISTS private.audit_app_payment_card();
DROP FUNCTION IF EXISTS private.is_payment_card_manager();

NOTIFY pgrst, 'reload schema';
