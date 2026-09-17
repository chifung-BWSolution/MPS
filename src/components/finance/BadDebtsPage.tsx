import { useMemo, useState } from 'react';
import { useFinanceLedgers } from '@/hooks/useFinanceLedgers';
import {
  BAD_DEBT_KIND_LABELS,
  DEFAULT_BAD_DEBT_SORT_DIR,
  DEFAULT_BAD_DEBT_SORT_KEY,
  filterBadDebts,
  formatFinanceMoney,
  nextLedgerSort,
  sortBadDebts,
  summarizeBadDebts,
  toBadDebtRows,
  type BadDebtKindFilter,
  type BadDebtSortKey,
  type FinanceBadDebtRow,
  type FinanceLedgerSortDir,
} from '@/lib/financeLedgers';
import { formatIncomeDate } from '@/lib/quotationIncomes';
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

const KIND_STYLES = {
  income: 'bg-amber-50 text-amber-800',
  expense: 'bg-sky-50 text-sky-800',
} as const;

function BadDebtHeaders({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: BadDebtSortKey;
  sortDir: FinanceLedgerSortDir;
  onSort: (key: BadDebtSortKey) => void;
}) {
  return (
    <tr className="border-b border-border bg-muted/30">
      <FinanceSortableTh label="來源" sortKey="kind" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="到期日" sortKey="dueDate" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="項目" sortKey="projectName" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="對象" sortKey="partyLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="類型" sortKey="typeLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="應收/應付" sortKey="billedAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="壞帳" sortKey="badDebt" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="未收/未付" sortKey="outstanding" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="備註" sortKey="remarks" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
    </tr>
  );
}

function BadDebtList({ records }: { records: FinanceBadDebtRow[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<BadDebtKindFilter>('all');
  const [sortKey, setSortKey] = useState<BadDebtSortKey>(DEFAULT_BAD_DEBT_SORT_KEY);
  const [sortDir, setSortDir] = useState<FinanceLedgerSortDir>(DEFAULT_BAD_DEBT_SORT_DIR);

  const filtered = useMemo(
    () => filterBadDebts(records, { search: searchQuery, kind: kindFilter }),
    [records, searchQuery, kindFilter],
  );
  const sorted = useMemo(() => sortBadDebts(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const stats = useMemo(() => summarizeBadDebts(records), [records]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <FinanceStatCard label="壞帳筆數" value={stats.count} />
        <FinanceStatCard label="收入壞帳" value={formatFinanceMoney(stats.income)} accent="text-amber-700" />
        <FinanceStatCard label="支出壞帳" value={formatFinanceMoney(stats.expense)} accent="text-sky-700" />
        <FinanceStatCard label="壞帳合計" value={formatFinanceMoney(stats.total)} accent="text-rose-600" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <FinanceSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜尋項目、對象、類型、備註..."
        />
        <FinanceFilterSelect
          value={kindFilter}
          onChange={(value) => setKindFilter(value as BadDebtKindFilter)}
          ariaLabel="壞帳來源"
        >
          <option value="all">全部來源</option>
          <option value="income">收入</option>
          <option value="expense">支出</option>
        </FinanceFilterSelect>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <BadDebtHeaders
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
                <tr key={`${record.kind}-${record.id}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-sm',
                        KIND_STYLES[record.kind],
                      )}
                    >
                      {BAD_DEBT_KIND_LABELS[record.kind]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">
                    {formatIncomeDate(record.dueDate)}
                  </td>
                  <td className="px-4 py-3">
                    <FinanceProjectLink
                      name={record.projectName}
                      quotationClientProjectId={record.quotationClientProjectId}
                      projectStatus={record.projectStatus}
                      websiteId={record.websiteId}
                    />
                  </td>
                  <td className="px-4 py-3 text-[13px]">{record.partyLabel}</td>
                  <td className="px-4 py-3 text-[13px]">{record.typeLabel}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">
                    {formatFinanceMoney(record.billedAmount)}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap text-rose-700">
                    {formatFinanceMoney(record.badDebt)}
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">
                    {formatFinanceMoney(record.outstanding)}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-[220px] truncate">
                    {record.remarks || '—'}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className={cn(financeHeaderClass, 'py-8 text-center font-normal normal-case tracking-normal')}>
                    沒有找到符合條件的壞帳紀錄
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

export function BadDebtsPage() {
  const { incomes, expenses, loading, error, lastSyncedAt } = useFinanceLedgers();
  const records = useMemo(() => toBadDebtRows(incomes, expenses), [incomes, expenses]);

  return (
    <FinancePageFrame
      title="壞帳列表"
      description="列出 incomes 與 expenses 表中壞帳金額大於 0 的紀錄。"
      lastSyncedAt={lastSyncedAt}
      error={error}
      loading={loading}
    >
      <BadDebtList records={records} />
    </FinancePageFrame>
  );
}
