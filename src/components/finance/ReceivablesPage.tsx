import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { CrudModal } from '@/components/ui/crud-modal';
import { IncomeEditDialog, type IncomeEditSaveInput } from '@/components/quotation/IncomeEditDialog';
import { useFinanceIncomes } from '@/hooks/useFinanceLedgers';
import { useQuotationIncomes } from '@/hooks/useQuotationIncomes';
import {
  DEFAULT_LEDGER_SORT_DIR,
  DEFAULT_RECEIVABLE_SORT_KEY,
  daysUntilDue,
  filterReceivables,
  formatFinanceMoney,
  formatRemainingDays,
  incomeStatusLabel,
  LEDGER_DUE_FILTERS,
  LEDGER_DUE_FILTER_LABELS,
  nextLedgerSort,
  remainingDaysClass,
  sortReceivables,
  summarizeReceivables,
  type FinanceIncomeRow,
  type FinanceLedgerSortDir,
  type LedgerDueFilter,
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
  FinanceProjectTypeFilter,
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
      <th className={financeHeaderClass} />
      <FinanceSortableTh label="項目" sortKey="projectName" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="客戶" sortKey="clientName" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="類型" sortKey="typeLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="期數" sortKey="installmentNumber" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="應收" sortKey="billedAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="實收" sortKey="paymentAmount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="未收" sortKey="outstanding" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="狀態" sortKey="paymentStatus" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="備註" sortKey="remarks" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <th className={financeHeaderClass}>操作</th>
    </tr>
  );
}

function ReceivableIncomeEditor({
  projectId,
  incomeId,
  onClose,
  onSaved,
}: {
  projectId: string;
  incomeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { rows, loading, error, updateIncome } = useQuotationIncomes(projectId);
  const income = rows.find((row) => row.id === incomeId) ?? null;
  const [saving, setSaving] = useState(false);

  const handleSave = async (payload: IncomeEditSaveInput) => {
    setSaving(true);
    const result = await updateIncome(incomeId, payload);
    setSaving(false);
    if (result.error) {
      toast.error(`更新失敗：${result.error.message}`);
      return;
    }
    toast.success('已更新收入');
    onSaved();
    onClose();
  };

  if (!income) {
    return (
      <CrudModal isOpen onClose={onClose} title="編輯收入" size="lg">
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {loading ? '載入收入中…' : error || '找不到這筆收入'}
        </p>
      </CrudModal>
    );
  }

  return (
    <IncomeEditDialog
      open
      income={income}
      siblingRows={rows}
      saving={saving}
      onClose={onClose}
      onSave={(payload) => void handleSave(payload)}
    />
  );
}

function ReceivableList({
  records,
  onEdit,
}: {
  records: FinanceIncomeRow[];
  onEdit: (record: FinanceIncomeRow) => void;
}) {
  const asOf = formatLocalIsoDate(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState<LedgerDueFilter>('all');
  const [projectType, setProjectType] = useState('all');
  const [sortKey, setSortKey] = useState<ReceivableSortKey>(DEFAULT_RECEIVABLE_SORT_KEY);
  const [sortDir, setSortDir] = useState<FinanceLedgerSortDir>(DEFAULT_LEDGER_SORT_DIR);

  const filtered = useMemo(
    () =>
      filterReceivables(records, {
        search: searchQuery,
        status: statusFilter,
        dueFilter,
        projectType,
        asOf,
      }),
    [records, searchQuery, statusFilter, dueFilter, projectType, asOf],
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
        <FinanceProjectTypeFilter value={projectType} onChange={setProjectType} />
        <FinanceFilterSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="收款狀態">
          <option value="all">全部狀態</option>
          {INCOME_PAYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {INCOME_PAYMENT_STATUS_LABELS[status]}
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
              {sorted.map((record) => {
                const days = daysUntilDue(record.dueDate, asOf);
                return (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">
                      {formatIncomeDate(record.dueDate)}
                    </td>
                    <td className={cn('px-4 py-3 text-[13px] tabular-nums whitespace-nowrap', remainingDaysClass(days))}>
                      {formatRemainingDays(days)}
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
                  <td colSpan={12} className={cn(financeHeaderClass, 'py-8 text-center font-normal normal-case tracking-normal')}>
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
  const { incomes, loading, error, lastSyncedAt, refresh } = useFinanceIncomes();
  const [editing, setEditing] = useState<{ projectId: string; incomeId: string } | null>(null);

  return (
    <>
      <FinancePageFrame
        title="應收未收"
        description="列出 incomes 表中未收金額大於 0 的紀錄（應收 − 實收 − 壞帳）。"
        lastSyncedAt={lastSyncedAt}
        error={error}
        loading={loading}
      >
        <ReceivableList
          records={incomes}
          onEdit={(record) => {
            const projectId = record.quotationClientProjectId?.trim();
            if (!projectId) {
              toast.error('找不到對應項目，無法編輯這筆收入');
              return;
            }
            setEditing({ projectId, incomeId: record.id });
          }}
        />
      </FinancePageFrame>
      {editing && (
        <ReceivableIncomeEditor
          key={editing.incomeId}
          projectId={editing.projectId}
          incomeId={editing.incomeId}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      )}
    </>
  );
}
