-- Authenticated helper so the app can persist recurring_expenses even if
-- PostgREST has not yet cached the new table.

CREATE OR REPLACE FUNCTION private.insert_recurring_expense(
  p_related_id uuid,
  p_supplier_types_id uuid,
  p_supplier_id text,
  p_credit_card_id uuid,
  p_billed_amount numeric,
  p_remarks text,
  p_frequency text,
  p_anchor_date date,
  p_next_occurrence_date date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.recurring_expenses (
    related_type,
    related_id,
    supplier_types_id,
    supplier_id,
    credit_card_id,
    billed_amount,
    remarks,
    frequency,
    anchor_date,
    next_occurrence_date,
    automation_run_count,
    status
  ) VALUES (
    'project',
    p_related_id,
    p_supplier_types_id,
    p_supplier_id,
    p_credit_card_id,
    p_billed_amount,
    p_remarks,
    p_frequency,
    p_anchor_date,
    p_next_occurrence_date,
    0,
    'active'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_recurring_expense(
  p_related_id uuid,
  p_supplier_types_id uuid,
  p_supplier_id text,
  p_credit_card_id uuid,
  p_billed_amount numeric,
  p_remarks text,
  p_frequency text,
  p_anchor_date date,
  p_next_occurrence_date date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN private.insert_recurring_expense(
    p_related_id,
    p_supplier_types_id,
    p_supplier_id,
    p_credit_card_id,
    p_billed_amount,
    p_remarks,
    p_frequency,
    p_anchor_date,
    p_next_occurrence_date
  );
END;
$$;

REVOKE ALL ON FUNCTION private.insert_recurring_expense(
  uuid, uuid, text, uuid, numeric, text, text, date, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.insert_recurring_expense(
  uuid, uuid, text, uuid, numeric, text, text, date, date
) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.create_recurring_expense(
  uuid, uuid, text, uuid, numeric, text, text, date, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_recurring_expense(
  uuid, uuid, text, uuid, numeric, text, text, date, date
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
