import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { EXPENSE_RELATED_TYPE_PROJECT, EXPENSES_TABLE } from '@/lib/quotationExpenses';
import {
  aggregateSupplierExpenseStats,
  type SupplierExpenseStatRow,
  type SupplierExpenseStats,
} from '@/lib/supplierExpenseStats';

const PAGE_SIZE = 1000;

async function fetchExpenseRows(): Promise<SupplierExpenseStatRow[]> {
  const rows: SupplierExpenseStatRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(EXPENSES_TABLE)
      .select('supplier_id, related_id, billed_amount')
      .eq('related_type', EXPENSE_RELATED_TYPE_PROJECT)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data as SupplierExpenseStatRow[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function useSupplierExpenseStats() {
  const [bySupplierId, setBySupplierId] = useState<Map<string, SupplierExpenseStats>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchExpenseRows()
      .then((rows) => {
        if (cancelled) return;
        setBySupplierId(aggregateSupplierExpenseStats(rows));
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setBySupplierId(new Map());
        setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { bySupplierId, ready };
}
