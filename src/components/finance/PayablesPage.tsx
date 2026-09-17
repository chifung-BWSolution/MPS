import { useMemo, useState } from 'react';
import { useFinanceExpenses } from '@/hooks/useFinanceLedgers';
import {
  DEFAULT_LEDGER_SORT_DIR,
  DEFAULT_PAYABLE_SORT_KEY,
  expenseStatusLabel,
  filterPayables,
  formatFinanceMoney,
  nextLedgerSort,
  sortPayables,
  summarizePayables,
  type FinanceExpenseRow,
  type FinanceLedgerSortDir,
  type PayableSortKey,
} from '@/lib/financeLedgers';
import {
  EXPENSE_PAYMENT_STATUS_LABELS,
  EXPENSE_PAYMENT_STATUSES,
  formatExpenseDate,
} from '@/lib/quotationExpenses';
import { formatLocalIsoDate } from '@/lib/quotationIncomes';
import { cn } from '@/lib/utils';
import {
  FinanceFilterSelect,
  FinancePageFrame,
  FinanceProjectLink,
  FinanceSearchInput,
  FinanceSortableTh,
  FinanceStatCard,
  financeHeaderClass,
} from '@/components/finance/FinanceListChrome';

function PayableHeaders({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: PayableSortKey;
  sortDir: FinanceLedgerSortDir;
  onSort: (key: PayableSortKey) => void;
}) {
  return (
    <tr className="border-b border-border bg-muted/30">
      <FinanceSortableTh label="到期日" sortKey="dueDate" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="項目" sortKey="projectName" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="供應商類型" sortKey="typeLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="供應商" sortKey="supplierLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="應付" sortKey="billedAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="實付" sortKey="paymentAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="未付" sortKey="outstanding" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="狀態" sortKey="paymentStatus" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="備註" sortKey="remarks" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
    </tr>
  );
}

function PayableList({ records }: { records: FinanceExpenseRow[] }) {
  const asOf = formatLocalIsoDate(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<PayableSortKey>(DEFAULT_PAYABLE_SORT_KEY);
  const [sortDir, setSortDir] = useState<FinanceLedgerSortDir>(DEFAULT_LEDGER_SORT_DIR);

  const filtered = useMemo(
    () =>
      filterPayables(records, {
        search: searchQuery,
        status: statusFilter,
        overdue: overdueOnly,
        asOf,
      }),
    [records, searchQuery, statusFilter, overdueOnly, asOf],
  );
  const sorted = useMemo(
    () => sortPayables(filtered, sortKey, sortDir, asOf),
    [filtered, sortKey, sortDir, asOf],
  );
  const stats = useMemo(() => summarizePayables(records, asOf), [records, asOf]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <FinanceStatCard label="未付筆數" value={stats.count} />
        <FinanceStatCard label="應付合計" value={formatFinanceMoney(stats.billed)} />
        <FinanceStatCard label="實付合計" value={formatFinanceMoney(stats.paid)} />
        <FinanceStatCard label="未付合計" value={formatFinanceMoney(stats.outstanding)} accent="text-rose-600" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <FinanceSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜尋項目、供應商、備註..."
        />
        <FinanceFilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="付款狀態">
          <option value="all">全部狀態</option>
          {EXPENSE_PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {EXPENSE_PAYMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </FinanceFilterSelect>
        <label className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="rounded border-border"
          />
          只看已逾期（{stats.overdue}）
        </label>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <PayableHeaders
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={(key) => {
                  const next = nextLedgerSort(sortKey, sortDir, key);
                  setSortKey(next.key);
                  setSortDir(next.dir);
                }}
              />
            </thead>
            <tbody>
              {sorted.map((record) => (
                <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">
                    {formatExpenseDate(record.dueDate)}
                  </td>
                  <td className="px-4 py-3">
                    <FinanceProjectLink
                      name={record.projectName}
                      quotationClientProjectId={record.quotationClientProjectId}
                      projectStatus={record.projectStatus}
                      websiteId={record.websiteId}
                    />
                  </td>
                  <td className="px-4 py-3 text-[13px]">{record.typeLabel}</td>
                  <td className="px-4 py-3 text-[13px]">{record.supplierLabel}</td>
                  <td className="px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap">
                    {formatFinanceMoney(record.billedAmount)}
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">
                    {formatFinanceMoney(record.paymentAmount)}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap text-rose-700">
                    {formatFinanceMoney(record.outstanding)}
                  </td>
                  <td className="px-4 py-3 text-[13px]">{expenseStatusLabel(record.paymentStatus)}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-[220px] truncate">
                    {record.remarks || '—'}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className={cn(financeHeaderClass, 'py-8 text-center font-normal normal-case tracking-normal')}>
                    沒有找到符合條件的應付未付紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PayablesPage() {
  const { expenses, loading, error, lastSyncedAt } = useFinanceExpenses();

  return (
    <FinancePageFrame
      title="應付未付"
      description="列出 expenses 表中未付金額大於 0 的紀錄（應付 − 實付 − 壞帳）。"
      lastSyncedAt={lastSyncedAt}
      error={error}
      loading={loading}
    >
      <PayableList records={expenses} />
    </FinancePageFrame>
  );
}
