-- Credit-card recurring expense templates + daily paid-row generator.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  related_type text NOT NULL DEFAULT 'project'
    CHECK (related_type IN ('project')),
  related_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE RESTRICT,
  supplier_types_id uuid NOT NULL
    REFERENCES public.supplier_types(id) ON DELETE RESTRICT,
  supplier_id text NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  credit_card_id uuid NOT NULL
    REFERENCES public.credit_cards(id) ON DELETE RESTRICT,
  billed_amount numeric(14, 2) NOT NULL
    CHECK (billed_amount >= 0),
  remarks text,
  frequency text NOT NULL
    CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  anchor_date date NOT NULL,
  next_occurrence_date date NOT NULL,
  automation_run_count integer NOT NULL DEFAULT 0
    CHECK (automation_run_count >= 0),
  last_generated_at timestamptz,
  last_generated_due_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_expenses_related_idx
  ON public.recurring_expenses (related_type, related_id, status, next_occurrence_date);

CREATE INDEX IF NOT EXISTS recurring_expenses_due_idx
  ON public.recurring_expenses (status, next_occurrence_date);

CREATE INDEX IF NOT EXISTS recurring_expenses_credit_card_id_idx
  ON public.recurring_expenses (credit_card_id);

COMMENT ON TABLE public.recurring_expenses IS
  'Open-ended credit-card expense schedules. Cron inserts paid expenses rows.';

COMMENT ON COLUMN public.recurring_expenses.automation_run_count IS
  'Times the generate function successfully inserted an expense. Manual first row is not counted.';

COMMENT ON COLUMN public.recurring_expenses.next_occurrence_date IS
  'Next due date the daily job will create. Advanced on save so the first row is not duplicated.';

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_expense_id uuid;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_recurring_expense_id_fkey;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_recurring_expense_id_fkey
  FOREIGN KEY (recurring_expense_id) REFERENCES public.recurring_expenses(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurring_due_date_uidx
  ON public.expenses (recurring_expense_id, due_date)
  WHERE recurring_expense_id IS NOT NULL;

COMMENT ON COLUMN public.expenses.recurring_expense_id IS
  'When set, this paid row was created from a recurring_expenses schedule.';

CREATE OR REPLACE FUNCTION private.next_recurring_due_date(
  p_frequency text,
  p_from date,
  p_anchor date
) RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_months integer;
  v_target date;
  v_last date;
  v_day integer;
BEGIN
  IF p_frequency = 'weekly' THEN
    RETURN p_from + 7;
  END IF;

  v_months := CASE p_frequency
    WHEN 'monthly' THEN 1
    WHEN 'quarterly' THEN 3
    WHEN 'yearly' THEN 12
    ELSE NULL
  END;
  IF v_months IS NULL THEN
    RAISE EXCEPTION 'unsupported recurring frequency: %', p_frequency;
  END IF;

  v_target := (date_trunc('month', p_from)::date + make_interval(months => v_months));
  v_last := (date_trunc('month', v_target)::date + interval '1 month - 1 day')::date;
  v_day := LEAST(EXTRACT(DAY FROM p_anchor)::integer, EXTRACT(DAY FROM v_last)::integer);
  RETURN make_date(
    EXTRACT(YEAR FROM v_target)::integer,
    EXTRACT(MONTH FROM v_target)::integer,
    v_day
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.generate_due_recurring_expenses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  rec record;
  v_today date;
  v_due date;
  v_next date;
  v_installment integer;
  v_inserted uuid;
  v_count integer := 0;
BEGIN
  v_today := timezone('Asia/Hong_Kong', now())::date;

  FOR rec IN
    SELECT *
    FROM public.recurring_expenses
    WHERE status = 'active'
      AND next_occurrence_date <= v_today
    FOR UPDATE
  LOOP
    v_due := rec.next_occurrence_date;

    WHILE v_due <= v_today LOOP
      SELECT COALESCE(MAX(e.installment_number), 0) + 1
      INTO v_installment
      FROM public.expenses e
      WHERE e.related_type = rec.related_type
        AND e.related_id = rec.related_id
        AND e.supplier_types_id = rec.supplier_types_id
        AND e.supplier_id = rec.supplier_id;

      INSERT INTO public.expenses (
        related_type,
        related_id,
        supplier_types_id,
        supplier_id,
        installment_number,
        billed_amount,
        due_date,
        payment_amount,
        payment_date,
        payment_method,
        credit_card_id,
        payment_status,
        bad_debt,
        remarks,
        recurring_expense_id,
        created_at,
        updated_at
      ) VALUES (
        rec.related_type,
        rec.related_id,
        rec.supplier_types_id,
        rec.supplier_id,
        v_installment,
        rec.billed_amount,
        v_due,
        rec.billed_amount,
        v_due,
        'Credit Card',
        rec.credit_card_id,
        'Paid',
        0,
        rec.remarks,
        rec.id,
        now(),
        now()
      )
      ON CONFLICT (recurring_expense_id, due_date) WHERE recurring_expense_id IS NOT NULL
      DO NOTHING
      RETURNING id INTO v_inserted;

      IF v_inserted IS NOT NULL THEN
        v_count := v_count + 1;
        UPDATE public.recurring_expenses
        SET
          automation_run_count = automation_run_count + 1,
          last_generated_at = now(),
          last_generated_due_date = v_due,
          updated_at = now()
        WHERE id = rec.id;
      END IF;

      v_next := private.next_recurring_due_date(rec.frequency, v_due, rec.anchor_date);
      UPDATE public.recurring_expenses
      SET
        next_occurrence_date = v_next,
        updated_at = now()
      WHERE id = rec.id;

      v_due := v_next;
      v_inserted := NULL;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.next_recurring_due_date(text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.generate_due_recurring_expenses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.next_recurring_due_date(text, date, date) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION private.generate_due_recurring_expenses() TO postgres, service_role;

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "Allow select on recurring_expenses"
  ON public.recurring_expenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "Allow insert on recurring_expenses"
  ON public.recurring_expenses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "Allow update on recurring_expenses"
  ON public.recurring_expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "Allow delete on recurring_expenses"
  ON public.recurring_expenses FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;
GRANT ALL ON public.recurring_expenses TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'recurring-expenses-daily'
  ) THEN
    PERFORM cron.schedule(
      'recurring-expenses-daily',
      '5 16 * * *',
      $cmd$SELECT private.generate_due_recurring_expenses()$cmd$
    );
  END IF;
END
$$;
