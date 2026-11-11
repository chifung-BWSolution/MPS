import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { CrudModal } from '@/components/ui/crud-modal';
import { ExpenseEditDialog, type ExpenseEditSaveInput } from '@/components/quotation/ExpenseEditDialog';
import { useCreditCards } from '@/hooks/useCreditCards';
import { useFinanceExpenses } from '@/hooks/useFinanceLedgers';
import { useQuotationExpenses } from '@/hooks/useQuotationExpenses';
import { useSupplierTypes } from '@/hooks/useSupplierTypes';
import { useWebPageSuppliers } from '@/hooks/useWebPageSuppliers';
import {
  DEFAULT_LEDGER_SORT_DIR,
  DEFAULT_PAYABLE_SORT_KEY,
  daysUntilDue,
  expenseStatusLabel,
  filterPayables,
  formatFinanceMoney,
  formatRemainingDays,
  LEDGER_DUE_FILTERS,
  LEDGER_DUE_FILTER_LABELS,
  nextLedgerSort,
  remainingDaysClass,
  sortPayables,
  summarizePayables,
  type FinanceExpenseRow,
  type FinanceLedgerSortDir,
  type LedgerDueFilter,
  type PayableSortKey,
} from '@/lib/financeLedgers';
import {
  EXPENSE_PAYMENT_STATUS_LABELS,
  EXPENSE_PAYMENT_STATUSES,
  formatExpenseDate,
  isExpenseSourceRelatedType,
  type ExpenseSourceRelatedType,
} from '@/lib/quotationExpenses';
import { formatLocalIsoDate } from '@/lib/quotationIncomes';
import { cn } from '@/lib/utils';
import {
  FinanceFilterSelect,
  FinancePageFrame,
  FinanceProjectLink,
  FinanceProjectTypeFilter,
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
      <th className={financeHeaderClass} />
      <FinanceSortableTh label="項目" sortKey="projectName" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="供應商類型" sortKey="typeLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="供應商" sortKey="supplierLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="應付" sortKey="billedAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="實付" sortKey="paymentAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="未付" sortKey="outstanding" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="狀態" sortKey="paymentStatus" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="備註" sortKey="remarks" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <th className={financeHeaderClass}>操作</th>
    </tr>
  );
}

function PayableExpenseEditor({
  sourceRelatedType,
  sourceRelatedId,
  expenseId,
  onClose,
  onSaved,
}: {
  sourceRelatedType: ExpenseSourceRelatedType;
  sourceRelatedId: string;
  expenseId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { rows, loading, error, updateExpense, setRecurringExpenseStatus } = useQuotationExpenses(
    sourceRelatedType,
    sourceRelatedId,
  );
  const { types: supplierTypes } = useSupplierTypes();
  const { suppliers } = useWebPageSuppliers();
  const { cards } = useCreditCards();
  const expense = rows.find((row) => row.id === expenseId) ?? null;
  const [saving, setSaving] = useState(false);

  const handleSave = async (payload: ExpenseEditSaveInput) => {
    setSaving(true);
    const result = await updateExpense(expenseId, payload);
    setSaving(false);
    if (result.error) {
      toast.error(`更新失敗：${result.error.message}`);
      return;
    }
    toast.success(payload.frequency ? '已更新並建立週期支出' : '已更新支出');
    onSaved();
    onClose();
  };

  const handleRecurringStatus = async (status: 'active' | 'paused') => {
    if (!expense?.recurringExpenseId) return;
    setSaving(true);
    const result = await setRecurringExpenseStatus(expense.recurringExpenseId, status);
    setSaving(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(status === 'paused' ? '已暫停週期' : '已恢復週期');
  };

  if (!expense) {
    return (
      <CrudModal isOpen onClose={onClose} title="編輯支出" size="lg">
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {loading ? '載入支出中…' : error || '找不到這筆支出'}
        </p>
      </CrudModal>
    );
  }

  return (
    <ExpenseEditDialog
      open
      expense={expense}
      siblingRows={rows}
      supplierTypes={supplierTypes}
      suppliers={suppliers}
      cards={cards}
      saving={saving}
      onClose={onClose}
      onSave={(payload) => void handleSave(payload)}
      onRecurringStatus={(status) => void handleRecurringStatus(status)}
    />
  );
}

function PayableList({
  records,
  onEdit,
}: {
  records: FinanceExpenseRow[];
  onEdit: (record: FinanceExpenseRow) => void;
}) {
  const asOf = formatLocalIsoDate(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState<LedgerDueFilter>('all');
  const [projectType, setProjectType] = useState('all');
  const [sortKey, setSortKey] = useState<PayableSortKey>(DEFAULT_PAYABLE_SORT_KEY);
  const [sortDir, setSortDir] = useState<FinanceLedgerSortDir>(DEFAULT_LEDGER_SORT_DIR);

  const filtered = useMemo(
    () =>
      filterPayables(records, {
        search: searchQuery,
        status: statusFilter,
        dueFilter,
        projectType,
        asOf,
      }),
    [records, searchQuery, statusFilter, dueFilter, projectType, asOf],
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
        <FinanceProjectTypeFilter value={projectType} onChange={setProjectType} />
        <FinanceFilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="付款狀態">
          <option value="all">全部狀態</option>
          {EXPENSE_PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {EXPENSE_PAYMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </FinanceFilterSelect>
        <FinanceFilterSelect
          value={dueFilter}
          onChange={(value) => setDueFilter(value as LedgerDueFilter)}
          ariaLabel="到期日"
        >
          {LEDGER_DUE_FILTERS.map((filter) => (
            <option key={filter} value={filter}>
              {LEDGER_DUE_FILTER_LABELS[filter]}
            </option>
          ))}
        </FinanceFilterSelect>
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
              {sorted.map((record) => {
                const days = daysUntilDue(record.dueDate, asOf);
                return (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">
                      {formatExpenseDate(record.dueDate)}
                    </td>
                    <td className={cn('px-4 py-3 text-[13px] tabular-nums whitespace-nowrap', remainingDaysClass(days))}>
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onEdit(record)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label={`編輯 ${record.projectName} ${record.typeLabel}`}
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={11} className={cn(financeHeaderClass, 'py-8 text-center font-normal normal-case tracking-normal')}>
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
  const { expenses, loading, error, lastSyncedAt, refresh } = useFinanceExpenses();
  const [editing, setEditing] = useState<{
    sourceRelatedType: ExpenseSourceRelatedType;
    sourceRelatedId: string;
    expenseId: string;
  } | null>(null);

  return (
    <>
      <FinancePageFrame
        title="應付未付"
        description="列出 expenses 表中未付金額大於 0 的紀錄（應付 − 實付 − 壞帳）。"
        lastSyncedAt={lastSyncedAt}
        error={error}
        loading={loading}
      >
        <PayableList
          records={expenses}
          onEdit={(record) => {
            const sourceRelatedId = record.sourceRelatedId?.trim();
            if (!isExpenseSourceRelatedType(record.sourceRelatedType) || !sourceRelatedId) {
              toast.error('找不到對應項目，無法編輯這筆支出');
              return;
            }
            setEditing({
              sourceRelatedType: record.sourceRelatedType,
              sourceRelatedId,
              expenseId: record.id,
            });
          }}
        />
      </FinancePageFrame>
      {editing && (
        <PayableExpenseEditor
          key={editing.expenseId}
          sourceRelatedType={editing.sourceRelatedType}
          sourceRelatedId={editing.sourceRelatedId}
          expenseId={editing.expenseId}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      )}
    </>
  );
}
