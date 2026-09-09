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

async function fetchAllQuotationProjectActuals(): Promise<Record<string, QuotationProjectActuals>> {
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

async function fetchOneQuotationProjectActuals(
  quotationClientProjectId: string,
): Promise<Record<string, QuotationProjectActuals>> {
  const [incomesRes, linksRes] = await Promise.all([
    supabase
      .from(INCOMES_TABLE)
      .select('quotation_client_project_id, billed_amount')
      .eq('quotation_client_project_id', quotationClientProjectId),
    supabase
      .from(PROJECTS_TABLE)
      .select('id, related_id')
      .eq('related_type', 'quotation_client')
      .eq('related_id', quotationClientProjectId),
  ]);

  if (incomesRes.error) throw new Error(incomesRes.error.message);
  if (linksRes.error) throw new Error(linksRes.error.message);

  const links = linksRes.data ?? [];
  const linkIds = links.map((link) => link.id).filter(Boolean);
  if (linkIds.length === 0) {
    return buildProjectActuals(incomesRes.data ?? [], links, []);
  }

  const expensesRes = await supabase
    .from(EXPENSES_TABLE)
    .select('related_id, billed_amount')
    .eq('related_type', EXPENSE_RELATED_TYPE_PROJECT)
    .in('related_id', linkIds);

  if (expensesRes.error) throw new Error(expensesRes.error.message);

  return buildProjectActuals(incomesRes.data ?? [], links, expensesRes.data ?? []);
}

async function fetchQuotationProjectActuals(
  quotationClientProjectId?: string,
): Promise<Record<string, QuotationProjectActuals>> {
  return quotationClientProjectId
    ? fetchOneQuotationProjectActuals(quotationClientProjectId)
    : fetchAllQuotationProjectActuals();
}

function useQuotationProjectActualsState(quotationClientProjectId?: string, enabled = true) {
  const [actuals, setActuals] = useState<Record<string, QuotationProjectActuals>>({});
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setActuals({});
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchQuotationProjectActuals(quotationClientProjectId)
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
  }, [quotationClientProjectId, enabled]);

  return { actuals, loading, error };
}

export function useQuotationProjectActuals() {
  return useQuotationProjectActualsState(undefined, true);
}

/** Load actual income / expense / GP for one quotation client project. */
export function useQuotationProjectActualsFor(quotationClientProjectId: string | undefined) {
  return useQuotationProjectActualsState(quotationClientProjectId, Boolean(quotationClientProjectId));
}
