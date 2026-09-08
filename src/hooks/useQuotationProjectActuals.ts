import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { INCOMES_TABLE } from '@/lib/quotationIncomes';
import { EXPENSES_TABLE, EXPENSE_RELATED_TYPE_PROJECT } from '@/lib/quotationExpenses';
import {
  buildProjectActuals,
  type QuotationProjectActuals,
} from '@/lib/quotationListMoney';
import { isAbortError } from '@/lib/queryCache';

const PROJECTS_TABLE = 'projects';

async function fetchQuotationProjectActuals(): Promise<Record<string, QuotationProjectActuals>> {
  const [incomesRes, linksRes, expensesRes] = await Promise.all([
    supabase.from(INCOMES_TABLE).select('quotation_client_project_id, billed_amount'),
    supabase.from(PROJECTS_TABLE).select('id, related_id').eq('related_type', 'quotation_client'),
    supabase
      .from(EXPENSES_TABLE)
      .select('related_id, billed_amount')
      .eq('related_type', EXPENSE_RELATED_TYPE_PROJECT),
  ]);

  if (incomesRes.error) throw new Error(incomesRes.error.message);
  if (linksRes.error) throw new Error(linksRes.error.message);
  if (expensesRes.error) throw new Error(expensesRes.error.message);

  return buildProjectActuals(
    incomesRes.data ?? [],
    linksRes.data ?? [],
    expensesRes.data ?? [],
  );
}

export function useQuotationProjectActuals() {
  const [actuals, setActuals] = useState<Record<string, QuotationProjectActuals>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchQuotationProjectActuals()
      .then((next) => {
        if (cancelled) return;
        setActuals(next);
        setError(null);
      })
      .catch((err) => {
        if (cancelled || isAbortError(err)) return;
        setError(err instanceof Error ? err.message : String(err));
        setActuals({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { actuals, loading, error };
}
