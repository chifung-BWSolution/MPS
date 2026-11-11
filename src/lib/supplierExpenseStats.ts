import { roundMoney } from '@/lib/currency';

export type SupplierExpenseStatRow = {
  supplier_id: string | null;
  related_id: string | null;
  billed_amount: number | string | null;
};

export type SupplierExpenseStats = {
  projectCount: number;
  cooperationAmount: number;
};

function toMoneyAmount(value: number | string | null | undefined): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Unique related projects and billed_amount total for each supplier. */
export function aggregateSupplierExpenseStats(
  rows: SupplierExpenseStatRow[],
): Map<string, SupplierExpenseStats> {
  const projects = new Map<string, Set<string>>();
  const amounts = new Map<string, number>();

  for (const row of rows) {
    const supplierId = row.supplier_id?.trim();
    if (!supplierId) continue;

    amounts.set(supplierId, roundMoney((amounts.get(supplierId) ?? 0) + toMoneyAmount(row.billed_amount)));

    const projectId = row.related_id?.trim();
    if (!projectId) continue;
    const seen = projects.get(supplierId) ?? new Set<string>();
    seen.add(projectId);
    projects.set(supplierId, seen);
  }

  const stats = new Map<string, SupplierExpenseStats>();
  for (const supplierId of amounts.keys()) {
    stats.set(supplierId, {
      projectCount: projects.get(supplierId)?.size ?? 0,
      cooperationAmount: amounts.get(supplierId) ?? 0,
    });
  }
  return stats;
}
