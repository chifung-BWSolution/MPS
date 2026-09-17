import { useMemo, useState } from 'react';
import { useFinanceExpenses } from '@/hooks/useFinanceLedgers';
import {
  DEFAULT_DUE_SOON_SORT_KEY,
  DEFAULT_DUE_SOON_WINDOW,
  DEFAULT_LEDGER_SORT_DIR,
  DUE_SOON_WINDOW_LABELS,
  DUE_SOON_WINDOWS,
  daysUntilDue,
  expenseStatusLabel,
  filterDueSoonExpenses,
  formatFinanceMoney,
  formatRemainingDays,
  nextLedgerSort,
  remainingDaysClass,
  sortDueSoonExpenses,
  summarizeDueSoonExpenses,
  type DueSoonSortKey,
  type DueSoonWindow,
  type FinanceExpenseRow,
  type FinanceLedgerSortDir,
} from '@/lib/financeLedgers';
import { formatExpenseDate } from '@/lib/quotationExpenses';
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

function DueSoonHeaders({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: DueSoonSortKey;
  sortDir: FinanceLedgerSortDir;
  onSort: (key: DueSoonSortKey) => void;
}) {
  return (
    <tr className="border-b border-border bg-muted/30">
      <FinanceSortableTh label="到期日" sortKey="dueDate" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="剩餘日數" sortKey="remainingDays" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
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

function DueSoonList({ records }: { records: FinanceExpenseRow[] }) {
  const asOf = formatLocalIsoDate(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [window, setWindow] = useState<DueSoonWindow>(DEFAULT_DUE_SOON_WINDOW);
  const [sortKey, setSortKey] = useState<DueSoonSortKey>(DEFAULT_DUE_SOON_SORT_KEY);
  const [sortDir, setSortDir] = useState<FinanceLedgerSortDir>(DEFAULT_LEDGER_SORT_DIR);

  const filtered = useMemo(
    () => filterDueSoonExpenses(records, { search: searchQuery, window, asOf }),
    [records, searchQuery, window, asOf],
  );
  const sorted = useMemo(
    () => sortDueSoonExpenses(filtered, sortKey, sortDir, asOf),
    [filtered, sortKey, sortDir, asOf],
  );
  const stats = useMemo(() => summarizeDueSoonExpenses(records, asOf), [records, asOf]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <FinanceStatCard label="已逾期" value={stats.overdue} accent="text-rose-600" />
        <FinanceStatCard label="7 日內到期" value={stats.dueIn7} accent="text-amber-600" />
        <FinanceStatCard label="30 日內到期" value={stats.dueIn30} accent="text-teal-600" />
        <FinanceStatCard label="30 日內未付合計" value={formatFinanceMoney(stats.outstandingTotal)} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <FinanceSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜尋項目、供應商、備註..."
        />
        <FinanceFilterSelect
          value={window}
          onChange={(value) => setWindow(value as DueSoonWindow)}
          ariaLabel="到期範圍"
        >
          {DUE_SOON_WINDOWS.map((item) => (
            <option key={item} value={item}>
              {DUE_SOON_WINDOW_LABELS[item]}
            </option>
          ))}
        </FinanceFilterSelect>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <DueSoonHeaders
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
              {sorted.map((record) => {
                const days = daysUntilDue(record.dueDate, asOf);
                return (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">
                      {formatExpenseDate(record.dueDate)}
                    </td>
                    <td className={cn('px-4 py-3 text-[13px] tabular-nums', remainingDaysClass(days))}>
                      {formatRemainingDays(days)}
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
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className={cn(financeHeaderClass, 'py-8 text-center font-normal normal-case tracking-normal')}>
                    沒有找到符合條件的即將到期支出
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

export function DueSoonExpensesPage() {
  const { expenses, loading, error, lastSyncedAt } = useFinanceExpenses();

  return (
    <FinancePageFrame
      title="即將到期支出"
      description="列出 expenses 表中仍未付、且到期日已過或即將到期的紀錄，預設顯示 30 日內（含逾期）。"
      lastSyncedAt={lastSyncedAt}
      error={error}
      loading={loading}
    >
      <DueSoonList records={expenses} />
    </FinancePageFrame>
  );
}
