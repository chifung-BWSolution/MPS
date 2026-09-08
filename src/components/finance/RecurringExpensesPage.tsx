import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import {
  RECURRING_EXPENSE_FREQUENCIES,
  RECURRING_EXPENSE_FREQUENCY_LABELS,
  RECURRING_EXPENSE_STATUS_LABELS,
  formatExpenseDate,
  formatExpenseMoney,
  type RecurringExpenseStatus,
} from '@/lib/quotationExpenses';
import {
  DEFAULT_RECURRING_EXPENSE_SORT_DIR,
  DEFAULT_RECURRING_EXPENSE_SORT_KEY,
  filterRecurringExpenses,
  nextRecurringExpenseSort,
  sortRecurringExpenseRows,
  summarizeRecurringExpenses,
  type RecurringExpenseListRow,
  type RecurringExpenseSortDir,
  type RecurringExpenseSortKey,
} from '@/lib/recurringExpensesList';

const headerClass =
  'text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3';

const STATUS_STYLES: Record<RecurringExpenseStatus, string> = {
  active: 'bg-teal-50 text-teal-700',
  paused: 'bg-slate-100 text-slate-600',
};

function RecurringExpenseSortableTh({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKey: RecurringExpenseSortKey;
  activeKey: RecurringExpenseSortKey;
  sortDir: RecurringExpenseSortDir;
  onSort: (key: RecurringExpenseSortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th className={headerClass} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        aria-label={`依${label}排序`}
      >
        <span>{label}</span>
        <Icon size={12} className={cn(active ? 'text-teal-600' : 'opacity-40')} />
      </button>
    </th>
  );
}

function RecurringExpenseTableHeaders({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: RecurringExpenseSortKey;
  sortDir: RecurringExpenseSortDir;
  onSort: (key: RecurringExpenseSortKey) => void;
}) {
  return (
    <tr className="border-b border-border bg-muted/30">
      <RecurringExpenseSortableTh
        label="下次扣款日"
        sortKey="nextOccurrenceDate"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="項目"
        sortKey="projectName"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="供應商類型"
        sortKey="typeLabel"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="供應商"
        sortKey="supplierLabel"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="信用卡"
        sortKey="creditCardLabel"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="每期金額"
        sortKey="billedAmount"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="週期"
        sortKey="frequency"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="狀態"
        sortKey="status"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="已執行"
        sortKey="automationRunCount"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <RecurringExpenseSortableTh
        label="備註"
        sortKey="remarks"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
    </tr>
  );
}

function RecurringExpenseList({ records }: { records: RecurringExpenseListRow[] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<RecurringExpenseSortKey>(DEFAULT_RECURRING_EXPENSE_SORT_KEY);
  const [sortDir, setSortDir] = useState<RecurringExpenseSortDir>(DEFAULT_RECURRING_EXPENSE_SORT_DIR);

  const filtered = useMemo(
    () =>
      filterRecurringExpenses(records, {
        search: searchQuery,
        status: statusFilter,
        frequency: frequencyFilter,
      }),
    [records, searchQuery, statusFilter, frequencyFilter],
  );
  const sorted = useMemo(
    () => sortRecurringExpenseRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  );
  const stats = useMemo(() => summarizeRecurringExpenses(records), [records]);

  const onSort = (key: RecurringExpenseSortKey) => {
    const next = nextRecurringExpenseSort(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">自動續訂總數</span>
          <span className="text-[22px] font-bold block mt-1">{stats.total}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">進行中</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{stats.active}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已暫停</span>
          <span className="text-[22px] font-bold block mt-1 text-slate-600">{stats.paused}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">7 日內到期</span>
          <span className="text-[22px] font-bold block mt-1 text-amber-600">{stats.dueSoon}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <input
            type="text"
            placeholder="搜尋項目、供應商、信用卡、備註..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-[13px] border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="all">全部狀態</option>
          <option value="active">進行中</option>
          <option value="paused">已暫停</option>
        </select>
        <select
          value={frequencyFilter}
          onChange={(e) => setFrequencyFilter(e.target.value)}
          className="text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="all">全部週期</option>
          {RECURRING_EXPENSE_FREQUENCIES.map((frequency) => (
            <option key={frequency} value={frequency}>
              {RECURRING_EXPENSE_FREQUENCY_LABELS[frequency]}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <RecurringExpenseTableHeaders sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </thead>
            <tbody>
              {sorted.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">
                    {formatExpenseDate(record.nextOccurrenceDate)}
                  </td>
                  <td className="px-4 py-3 text-[14px] font-medium">{record.projectName}</td>
                  <td className="px-4 py-3 text-[13px]">{record.typeLabel}</td>
                  <td className="px-4 py-3 text-[13px]">{record.supplierLabel}</td>
                  <td className="px-4 py-3 text-[13px] max-w-[220px]">{record.creditCardLabel}</td>
                  <td className="px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap">
                    {formatExpenseMoney(record.billedAmount)}
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    {RECURRING_EXPENSE_FREQUENCY_LABELS[record.frequency]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-sm',
                        STATUS_STYLES[record.status],
                      )}
                    >
                      {RECURRING_EXPENSE_STATUS_LABELS[record.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums">{record.automationRunCount}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-[220px] truncate">
                    {record.remarks || '—'}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                    沒有找到符合條件的自動續訂紀錄
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

export function RecurringExpensesPage() {
  const { rows, loading, error, lastSyncedAt } = useRecurringExpenses();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold">自動續訂管理</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            列出所有信用卡自動續訂支出，預設依下次扣款日由舊到新排序。
          </p>
          {lastSyncedAt && (
            <p className="text-[11px] text-muted-foreground mt-1">
              最後更新：{new Date(lastSyncedAt).toLocaleString('zh-HK', { hour12: false })}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          載入失敗：{error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-muted-foreground py-12 text-center">載入中…</div>
      ) : (
        <RecurringExpenseList records={rows} />
      )}
    </div>
  );
}
