import { useMemo, useState } from 'react';
import { useFinanceIncomes } from '@/hooks/useFinanceLedgers';
import {
  DEFAULT_LEDGER_SORT_DIR,
  DEFAULT_RECEIVABLE_SORT_KEY,
  filterReceivables,
  formatFinanceMoney,
  incomeStatusLabel,
  nextLedgerSort,
  sortReceivables,
  summarizeReceivables,
  type FinanceIncomeRow,
  type FinanceLedgerSortDir,
  type ReceivableSortKey,
} from '@/lib/financeLedgers';
import {
  formatIncomeDate,
  formatLocalIsoDate,
  INCOME_PAYMENT_STATUS_LABELS,
  INCOME_PAYMENT_STATUSES,
} from '@/lib/quotationIncomes';
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

function ReceivableHeaders({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: ReceivableSortKey;
  sortDir: FinanceLedgerSortDir;
  onSort: (key: ReceivableSortKey) => void;
}) {
  return (
    <tr className="border-b border-border bg-muted/30">
      <FinanceSortableTh label="到期日" sortKey="dueDate" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="項目" sortKey="projectName" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="客戶" sortKey="clientName" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="類型" sortKey="typeLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="期數" sortKey="installmentNumber" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="應收" sortKey="billedAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="實收" sortKey="paymentAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="未收" sortKey="outstanding" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="狀態" sortKey="paymentStatus" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="備註" sortKey="remarks" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
    </tr>
  );
}

function ReceivableList({ records }: { records: FinanceIncomeRow[] }) {
  const asOf = formatLocalIsoDate(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortKey, setSortKey] = useState<ReceivableSortKey>(DEFAULT_RECEIVABLE_SORT_KEY);
  const [sortDir, setSortDir] = useState<FinanceLedgerSortDir>(DEFAULT_LEDGER_SORT_DIR);

  const filtered = useMemo(
    () =>
      filterReceivables(records, {
        search: searchQuery,
        status: statusFilter,
        overdue: overdueOnly,
        asOf,
      }),
    [records, searchQuery, statusFilter, overdueOnly, asOf],
  );
  const sorted = useMemo(() => sortReceivables(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const stats = useMemo(() => summarizeReceivables(records, asOf), [records, asOf]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <FinanceStatCard label="未收筆數" value={stats.count} />
        <FinanceStatCard label="應收合計" value={formatFinanceMoney(stats.billed)} />
        <FinanceStatCard label="實收合計" value={formatFinanceMoney(stats.received)} />
        <FinanceStatCard label="未收合計" value={formatFinanceMoney(stats.outstanding)} accent="text-rose-600" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <FinanceSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜尋項目、客戶、類型、備註..."
        />
        <FinanceFilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="收款狀態">
          <option value="all">全部狀態</option>
          {INCOME_PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {INCOME_PAYMENT_STATUS_LABELS[status]}
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
              <ReceivableHeaders
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
                    {formatIncomeDate(record.dueDate)}
                  </td>
                  <td className="px-4 py-3">
                    <FinanceProjectLink
                      name={record.projectName}
                      quotationClientProjectId={record.quotationClientProjectId}
                      projectStatus={record.projectStatus}
                    />
                  </td>
                  <td className="px-4 py-3 text-[13px]">{record.clientName || '—'}</td>
                  <td className="px-4 py-3 text-[13px]">{record.typeLabel}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums">{record.installmentNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap">
                    {formatFinanceMoney(record.billedAmount)}
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">
                    {formatFinanceMoney(record.paymentAmount)}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap text-rose-700">
                    {formatFinanceMoney(record.outstanding)}
                  </td>
                  <td className="px-4 py-3 text-[13px]">{incomeStatusLabel(record.paymentStatus)}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-[220px] truncate">
                    {record.remarks || '—'}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className={cn(financeHeaderClass, 'py-8 text-center font-normal normal-case tracking-normal')}>
                    沒有找到符合條件的應收未收紀錄
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

export function ReceivablesPage() {
  const { incomes, loading, error, lastSyncedAt } = useFinanceIncomes();

  return (
    <FinancePageFrame
      title="應收未收"
      description="列出 incomes 表中未收金額大於 0 的紀錄（應收 − 實收 − 壞帳）。"
      lastSyncedAt={lastSyncedAt}
      error={error}
      loading={loading}
    >
      <ReceivableList records={incomes} />
    </FinancePageFrame>
  );
}
