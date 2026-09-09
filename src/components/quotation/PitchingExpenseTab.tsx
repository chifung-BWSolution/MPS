import { useMemo, useState } from 'react';
import { Banknote, ExternalLink, Paperclip, Pause, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCreditCards } from '@/hooks/useCreditCards';
import { useQuotationExpenses } from '@/hooks/useQuotationExpenses';
import { useSupplierTypes } from '@/hooks/useSupplierTypes';
import { useWebPageSuppliers } from '@/hooks/useWebPageSuppliers';
import { formatCreditCardOptionLabel } from '@/lib/creditCards';
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_PAYMENT_RECORD_MAX_SIZE_MB,
  EXPENSE_PAYMENT_STATUS_LABELS,
  EXPENSE_PAYMENT_STATUS_STYLES,
  EXPENSE_PAYMENT_STATUSES,
  RECURRING_EXPENSE_FREQUENCIES,
  RECURRING_EXPENSE_FREQUENCY_LABELS,
  RECURRING_EXPENSE_STATUS_LABELS,
  computeOutstanding,
  expenseCreditCardId,
  formatExpenseDate,
  formatExpenseDateTime,
  formatExpenseMoney,
  formatPaymentRecordFileSize,
  formatRecurringSettingDetails,
  groupExpensesByType,
  hasFilledPaymentAmount,
  isCreditCardPaymentMethod,
  isRecurringExpenseFrequency,
  nextExpenseInstallmentNumber,
  optionalExpensePaymentMethod,
  optionalExpensePaymentStatus,
  paidRecurringExpenseFields,
  parseInstallmentNumber,
  parseMoney,
  previewRecurringDueDates,
  recurringSettingsFromRows,
  summarizeExpenses,
  validateExpenseInput,
  type ExpensePaymentStatus,
  type QuotationExpense,
  type ExpenseTypeGroup,
  type RecurringExpenseFrequency,
  type RecurringExpenseSummary,
} from '@/lib/quotationExpenses';
import { PitchingBulkExpenseDialog } from '@/components/quotation/PitchingBulkExpenseDialog';
import {
  PitchingRecurringExpenseDialog,
  type RecurringExpenseDialogInput,
} from '@/components/quotation/PitchingRecurringExpenseDialog';
import { CrudModal, CrudModalFooter, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { CurrencyBadge, CurrencyPicker, StoredHkdHint } from '@/components/ui/currency-picker';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_CURRENCY,
  amountsToHkd,
  convertMoneyInput,
  formatMoney,
  moneyInputFromHkd,
  parseSystemCurrency,
  toHkd,
  type SystemCurrency,
} from '@/lib/currency';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Draft = {
  supplierTypesId: string;
  supplierId: string;
  installmentNumber: string;
  currency: SystemCurrency;
  billedAmount: string;
  dueDate: string;
  paymentAmount: string;
  paymentDate: string;
  paymentMethod: string;
  creditCardId: string;
  paymentStatus: ExpensePaymentStatus | '';
  badDebt: string;
  remarks: string;
  frequency: RecurringExpenseFrequency | '';
};

const emptyDraft = (nextInstallment = 1, supplierTypesId = '', supplierId = ''): Draft => ({
  supplierTypesId,
  supplierId,
  installmentNumber: String(nextInstallment),
  currency: DEFAULT_CURRENCY,
  billedAmount: '',
  dueDate: '',
  paymentAmount: '',
  paymentDate: '',
  paymentMethod: '',
  creditCardId: '',
  paymentStatus: '',
  badDebt: '',
  remarks: '',
  frequency: '',
});

function draftFromRow(row: QuotationExpense): Draft {
  const currency = parseSystemCurrency(row.currency);
  return {
    supplierTypesId: row.supplierTypesId,
    supplierId: row.supplierId,
    installmentNumber: row.installmentNumber != null ? String(row.installmentNumber) : '',
    currency,
    billedAmount: moneyInputFromHkd(row.billedAmount, currency),
    dueDate: row.dueDate ?? '',
    paymentAmount: moneyInputFromHkd(row.paymentAmount, currency, { emptyIfZero: true }),
    paymentDate: row.paymentDate ?? '',
    paymentMethod: row.paymentMethod ?? '',
    creditCardId: row.creditCardId ?? '',
    paymentStatus: row.paymentStatus ?? '',
    badDebt: moneyInputFromHkd(row.badDebt, currency),
    remarks: row.remarks ?? '',
    frequency: '',
  };
}

function setDraftCurrency(prev: Draft, currency: SystemCurrency): Draft {
  if (prev.currency === currency) return prev;
  return {
    ...prev,
    currency,
    billedAmount: convertMoneyInput(prev.billedAmount, prev.currency, currency),
    paymentAmount: convertMoneyInput(prev.paymentAmount, prev.currency, currency),
    badDebt: convertMoneyInput(prev.badDebt, prev.currency, currency),
  };
}

function PillOptions<T extends string>({
  value,
  options,
  labels,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
              selected
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
            )}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

export function PitchingExpenseTab({
  projectId,
  signedDate,
  handoverDate,
}: {
  projectId: string;
  signedDate?: string;
  handoverDate?: string;
}) {
  const {
    rows,
    loading,
    error,
    addExpense,
    updateExpense,
    deleteExpense,
    saveBulkExpenses,
    setRecurringExpenseStatus,
    saveGroupRecurring,
  } = useQuotationExpenses(projectId);
  const { cards } = useCreditCards();
  const { types: supplierTypes } = useSupplierTypes();
  const { suppliers } = useWebPageSuppliers();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationExpense | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<QuotationExpense | null>(null);
  const [paymentRecordFile, setPaymentRecordFile] = useState<File | null>(null);
  const [clearPaymentRecord, setClearPaymentRecord] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkEditing, setBulkEditing] = useState<QuotationExpense[] | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [recurringGroup, setRecurringGroup] = useState<ExpenseTypeGroup | null>(null);
  const [recurringSetting, setRecurringSetting] = useState<RecurringExpenseSummary | undefined>();
  const [recurringSaving, setRecurringSaving] = useState(false);

  const summary = useMemo(() => summarizeExpenses(rows), [rows]);
  const groups = useMemo(() => groupExpensesByType(rows), [rows]);
  const outstandingPreview = computeOutstanding(
    parseMoney(draft.billedAmount) ?? 0,
    parseMoney(draft.paymentAmount) ?? 0,
    parseMoney(draft.badDebt) ?? 0,
  );
  const paymentRequired = hasFilledPaymentAmount(draft.paymentAmount);
  const showRecurringBlock = Boolean(draft.creditCardId) && !editing?.recurringExpenseId;
  const recurringPreview = showRecurringBlock && isRecurringExpenseFrequency(draft.frequency) && draft.dueDate
    ? previewRecurringDueDates(draft.frequency, draft.dueDate, 3)
    : [];
  const defaultTypeId = supplierTypes.find((type) => type.isActive)?.id ?? '';
  const typeOptions = useMemo(
    () => supplierTypes.filter((type) => type.isActive || type.id === draft.supplierTypesId),
    [supplierTypes, draft.supplierTypesId],
  );
  const supplierOptions = useMemo(
    () =>
      suppliers
        .filter((supplier) =>
          supplier.supplierTypesId === draft.supplierTypesId
          && (supplier.isActive || supplier.id === draft.supplierId),
        )
        .map((supplier) => ({
          value: supplier.id,
          label: supplier.displayName,
          keywords: [supplier.companyName, supplier.url].filter(Boolean).join(' '),
        })),
    [suppliers, draft.supplierTypesId, draft.supplierId],
  );
  const creditCardOptions = useMemo(
    () =>
      cards
        .filter((card) => card.isActive || card.id === draft.creditCardId)
        .map((card) => {
          const label = formatCreditCardOptionLabel(card);
          return {
            value: card.id,
            label: card.isActive ? label : `${label}（已停用）`,
            keywords: [card.bank, card.lastFour, card.companyName, card.brandCode, card.holder]
              .filter(Boolean)
              .join(' '),
          };
        }),
    [cards, draft.creditCardId],
  );

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft(
      nextExpenseInstallmentNumber(rows, defaultTypeId, ''),
      defaultTypeId,
    ));
    setPaymentRecordFile(null);
    setClearPaymentRecord(false);
    setModalOpen(true);
  };

  const openEdit = (row: QuotationExpense) => {
    setEditing(row);
    setDraft(draftFromRow(row));
    setPaymentRecordFile(null);
    setClearPaymentRecord(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setDraft(emptyDraft());
    setPaymentRecordFile(null);
    setClearPaymentRecord(false);
  };

  const openBulkCreate = () => {
    setBulkEditing(null);
    setBulkOpen(true);
  };

  const openBulkEdit = (groupRows: QuotationExpense[]) => {
    setBulkEditing(groupRows);
    setBulkOpen(true);
  };

  const closeBulk = () => {
    setBulkOpen(false);
    setBulkEditing(null);
  };

  const openRecurringSettings = (group: ExpenseTypeGroup, settings: RecurringExpenseSummary[]) => {
    setRecurringGroup(group);
    setRecurringSetting(settings[0]);
  };

  const closeRecurringSettings = () => {
    setRecurringGroup(null);
    setRecurringSetting(undefined);
  };

  const handleRecurringSave = async (input: RecurringExpenseDialogInput) => {
    if (!recurringGroup) return;
    setRecurringSaving(true);
    const result = await saveGroupRecurring({
      ...input,
      supplierTypesId: recurringGroup.supplierTypesId,
      supplierId: recurringGroup.supplierId,
    });
    setRecurringSaving(false);
    if (result.error) {
      toast.error(`儲存循環設定失敗：${result.error.message}`);
      return;
    }
    toast.success(input.id ? '已更新循環設定' : '已新增循環設定');
    closeRecurringSettings();
  };

  const handleBulkSave = async (
    items: Parameters<typeof saveBulkExpenses>[0],
    deleteIds: string[],
  ) => {
    setBulkSaving(true);
    const result = await saveBulkExpenses(items, deleteIds);
    setBulkSaving(false);
    if (result.error) {
      toast.error(`${bulkEditing?.length ? '更新' : '新增'}失敗：${result.error.message}`);
      return;
    }
    toast.success(bulkEditing?.length ? '已更新整項支出' : '已新增整項支出');
    closeBulk();
  };

  const handleSave = async () => {
    const validationError = validateExpenseInput(draft);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const billedAmount = parseMoney(draft.billedAmount);
    const paymentAmount = parseMoney(draft.paymentAmount);
    const badDebt = parseMoney(draft.badDebt);
    if (billedAmount == null || paymentAmount == null || badDebt == null) return;
    const frequency = isRecurringExpenseFrequency(draft.frequency) ? draft.frequency : null;
    const paid = frequency && draft.dueDate
      ? paidRecurringExpenseFields(billedAmount, draft.dueDate)
      : null;
    const stored = amountsToHkd({
      billedAmount,
      paymentAmount: paid?.paymentAmount ?? paymentAmount,
      badDebt: paid?.badDebt ?? badDebt,
    }, draft.currency);

    setSaving(true);
    const payload = {
      supplierTypesId: draft.supplierTypesId.trim(),
      supplierId: draft.supplierId.trim(),
      installmentNumber: parseInstallmentNumber(draft.installmentNumber),
      currency: draft.currency,
      billedAmount: stored.billedAmount,
      dueDate: draft.dueDate || null,
      paymentAmount: stored.paymentAmount,
      paymentDate: paid?.paymentDate ?? (draft.paymentDate || null),
      paymentMethod: paid?.paymentMethod ?? optionalExpensePaymentMethod(draft.paymentMethod),
      creditCardId: expenseCreditCardId(
        paid?.paymentMethod ?? draft.paymentMethod,
        draft.creditCardId,
      ),
      paymentStatus: paid?.paymentStatus ?? optionalExpensePaymentStatus(draft.paymentStatus),
      badDebt: stored.badDebt,
      remarks: draft.remarks.trim() || null,
      frequency,
      file: paymentRecordFile,
      paymentRecordAction: (clearPaymentRecord && !paymentRecordFile ? 'clear' : undefined) as
        | 'clear'
        | undefined,
    };
    const result = editing
      ? await updateExpense(editing.id, payload)
      : await addExpense(payload);
    setSaving(false);
    if (result.error) {
      toast.error(`${editing ? '更新' : '新增'}失敗：${result.error.message}`);
      return;
    }
    toast.success(
      frequency
        ? (editing ? '已更新並建立週期支出' : '已新增週期支出')
        : (editing ? '已更新支出' : '已新增支出'),
    );
    closeModal();
  };

  const handleRecurringStatus = async (status: 'active' | 'paused') => {
    if (!editing?.recurringExpenseId) return;
    setSaving(true);
    const result = await setRecurringExpenseStatus(editing.recurringExpenseId, status);
    setSaving(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setEditing((prev) => prev
      ? { ...prev, recurringStatus: status }
      : prev);
    toast.success(status === 'paused' ? '已暫停週期' : '已恢復週期');
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error: delErr } = await deleteExpense(deleting.id);
    if (delErr) {
      toast.error(`刪除失敗：${delErr.message}`);
      return;
    }
    toast.success('已刪除支出');
    setDeleting(null);
  };

  const deleteLabel = deleting
    ? `${deleting.typeLabel} ${deleting.supplierLabel}${deleting.installmentNumber != null ? ` #${deleting.installmentNumber}` : ''}`
    : '支出';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard label="應付合計" value={formatExpenseMoney(summary.billed)} />
        <SummaryCard label="實付合計" value={formatExpenseMoney(summary.paid)} />
        <SummaryCard label="未付合計" value={formatExpenseMoney(summary.outstanding)} accent="text-amber-700" />
        <SummaryCard label="壞帳合計" value={formatExpenseMoney(summary.badDebt)} accent="text-rose-700" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[12px] text-muted-foreground">共 {rows.length} 筆</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openBulkCreate}
            className="flex items-center gap-1.5 px-3 py-2 border border-teal-200 text-teal-700 bg-teal-50 rounded-md text-[13px] font-medium hover:bg-teal-100 transition-colors active:scale-[0.97]"
          >
            <Plus size={14} /> 新增整項支出
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
          >
            <Plus size={14} /> 新增單項支出
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          無法載入支出：{error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-10 text-center text-[13px] text-muted-foreground">
          載入支出中…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
          <Banknote size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">尚未新增支出</p>
          <p className="text-[12px] text-muted-foreground/70 mt-1">可記錄分期應付、實付、未付與壞帳</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const recurringSettings = recurringSettingsFromRows(group.rows);
            const primaryRecurring = recurringSettings[0];
            const RecurringIcon = primaryRecurring?.status === 'paused' ? Pause : Repeat;
            return (
            <section
              key={group.key}
              className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden"
            >
              <header className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 bg-muted/30 border-b border-border">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {recurringSettings.length > 0 && (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'inline-flex',
                                primaryRecurring?.status === 'paused' ? 'text-amber-600' : 'text-teal-600',
                              )}
                              aria-label={`${group.supplierLabel} ${
                                primaryRecurring?.status === 'paused' ? '週期已暫停' : '週期進行中'
                              }`}
                              tabIndex={0}
                            >
                              <RecurringIcon size={14} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            align="start"
                            className="max-w-xs space-y-1 bg-white text-foreground border border-border shadow-md"
                          >
                            {recurringSettings.map((setting) => (
                              <p key={setting.id} className="text-[12px] leading-5">
                                {formatRecurringSettingDetails(setting)}
                              </p>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <h3 className="text-[14px] font-semibold">{group.supplierLabel}</h3>
                    <button
                      type="button"
                      onClick={() => openBulkEdit(group.rows)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium text-teal-700 hover:bg-teal-50 transition-colors"
                      aria-label={`編輯整項 ${group.supplierLabel}`}
                    >
                      <Pencil size={12} /> 編輯整項
                    </button>
                    <button
                      type="button"
                      onClick={() => openRecurringSettings(group, recurringSettings)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium text-teal-700 hover:bg-teal-50 transition-colors"
                      aria-label={`循環設定 ${group.supplierLabel}`}
                    >
                      <Repeat size={12} /> 循環設定
                    </button>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{group.typeLabel} · {group.rows.length} 筆</p>
                </div>
                <div className="flex items-end gap-4 sm:gap-6">
                  <SectionSum label="應付合計" value={formatExpenseMoney(group.summary.billed)} />
                  <SectionSum label="實付合計" value={formatExpenseMoney(group.summary.paid)} />
                  <SectionSum
                    label="未付合計"
                    value={formatExpenseMoney(group.summary.outstanding)}
                    accent="text-amber-700"
                  />
                  <SectionSum
                    label="壞帳合計"
                    value={formatExpenseMoney(group.summary.badDebt)}
                    accent="text-rose-700"
                  />
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">期數</th>
                      <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">應付</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">到期日</th>
                      <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">實付</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">付款日期</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">付款方式</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">付款紀錄</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                      <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">未付</th>
                      <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">壞帳</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">建立 / 修改</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20">
                        <td className="px-4 py-3 text-[13px] tabular-nums">
                          <div className="flex items-center gap-1.5">
                            <span>{row.installmentNumber ?? '—'}</span>
                            {row.recurringExpenseId && (
                              <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium border bg-teal-50 text-teal-800 border-teal-200">
                                週期
                              </span>
                            )}
                          </div>
                          {row.remarks && (
                            <p className="text-[11px] text-muted-foreground font-normal truncate max-w-[160px] mt-0.5">
                              {row.remarks}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                          {formatExpenseMoney(row.billedAmount)}
                          <CurrencyBadge currency={row.currency} />
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatExpenseDate(row.dueDate)}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                          {formatExpenseMoney(row.paymentAmount)}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatExpenseDate(row.paymentDate)}
                        </td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                          {row.paymentMethod ? EXPENSE_PAYMENT_METHOD_LABELS[row.paymentMethod] : '—'}
                          {row.creditCardLabel && (
                            <p className="text-[11px] text-muted-foreground font-normal truncate max-w-[200px] mt-0.5">
                              {row.creditCardLabel}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.paymentRecordFileUrl ? (
                            <a
                              href={row.paymentRecordFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[13px] font-medium text-teal-700 hover:text-teal-800 max-w-[160px]"
                            >
                              <ExternalLink size={12} className="shrink-0" />
                              <span className="truncate">{row.paymentRecordFileName || '付款紀錄'}</span>
                            </a>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.paymentStatus ? (
                            <span
                              className={cn(
                                'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border',
                                EXPENSE_PAYMENT_STATUS_STYLES[row.paymentStatus],
                              )}
                            >
                              {EXPENSE_PAYMENT_STATUS_LABELS[row.paymentStatus]}
                            </span>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                          {formatExpenseMoney(row.outstanding)}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                          {formatExpenseMoney(row.badDebt)}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">
                          <div>{formatExpenseDateTime(row.createdAt)}</div>
                          <div>{formatExpenseDateTime(row.updatedAt)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {row.paymentRecordFileUrl ? (
                              <a
                                href={row.paymentRecordFileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-md text-muted-foreground hover:bg-teal-50 hover:text-teal-700 transition-colors"
                                aria-label={`查看附件 ${row.paymentRecordFileName || row.typeLabel}`}
                                title={row.paymentRecordFileName || '查看附件'}
                              >
                                <Paperclip size={13} />
                              </a>
                            ) : (
                              <span
                                className="p-1.5 rounded-md text-muted-foreground/30"
                                aria-label="沒有附件"
                                title="沒有附件"
                              >
                                <Paperclip size={13} />
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              aria-label={`編輯 ${row.typeLabel}`}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(row)}
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              aria-label={`刪除 ${row.typeLabel}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            );
          })}
        </div>
      )}

      <CrudModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? '編輯支出' : '新增單項支出'}
        size="lg"
        footer={
          <CrudModalFooter className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? '儲存中…' : '儲存'}
            </button>
          </CrudModalFooter>
        }
      >
        <div className="space-y-6">
          <section className="space-y-4">
            <h3 className="text-[14px] font-semibold">款項資訊</h3>
            <CurrencyPicker
              value={draft.currency}
              onChange={(currency) => setDraft((prev) => setDraftCurrency(prev, currency))}
            />
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">類型 Type *</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="支出類型">
                {typeOptions.map((type) => {
                  const selected = draft.supplierTypesId === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() =>
                        setDraft((prev) => {
                          const nextType = type.id;
                          const nextSupplier = prev.supplierTypesId === nextType ? prev.supplierId : '';
                          return {
                            ...prev,
                            supplierTypesId: nextType,
                            supplierId: nextSupplier,
                            installmentNumber: editing
                              ? prev.installmentNumber
                              : String(nextExpenseInstallmentNumber(rows, nextType, nextSupplier)),
                          };
                        })
                      }
                      className={cn(
                        'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                        selected
                          ? 'bg-teal-50 border-teal-300 text-teal-800'
                          : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      {type.displayName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1">供應商 Supplier *</span>
                <SearchableSelect
                  value={draft.supplierId}
                  onValueChange={(supplierId) =>
                    setDraft((prev) => ({
                      ...prev,
                      supplierId,
                      installmentNumber: editing
                        ? prev.installmentNumber
                        : String(nextExpenseInstallmentNumber(rows, prev.supplierTypesId, supplierId)),
                    }))
                  }
                  options={supplierOptions}
                  placeholder={draft.supplierTypesId ? '選擇供應商' : '請先選擇支出類型'}
                  searchPlaceholder="搜尋供應商…"
                  emptyText={draft.supplierTypesId ? '此類型沒有供應商' : '請先選擇支出類型'}
                  disabled={!draft.supplierTypesId}
                />
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1">期數 Installment *</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.installmentNumber}
                  onChange={(e) => setDraft((prev) => ({ ...prev, installmentNumber: e.target.value }))}
                  className="text-[13px]"
                  aria-label="期數"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1">應付金額 Billed *</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.billedAmount}
                  onChange={(e) =>
                    setDraft((prev) => {
                      const billedAmount = e.target.value;
                      if (!isRecurringExpenseFrequency(prev.frequency) || !prev.dueDate) {
                        return { ...prev, billedAmount };
                      }
                      const billed = parseMoney(billedAmount);
                      const paid = billed != null
                        ? paidRecurringExpenseFields(billed, prev.dueDate)
                        : null;
                      return {
                        ...prev,
                        billedAmount,
                        paymentAmount: paid ? String(paid.paymentAmount) : prev.paymentAmount,
                        paymentDate: paid?.paymentDate ?? prev.paymentDate,
                        paymentStatus: paid?.paymentStatus ?? prev.paymentStatus,
                      };
                    })
                  }
                  placeholder="0.00"
                  className="text-[13px]"
                  aria-label="應付金額"
                />
                <StoredHkdHint amount={parseMoney(draft.billedAmount)} currency={draft.currency} />
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1">到期日 Due date *</span>
                <Input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) =>
                    setDraft((prev) => {
                      const dueDate = e.target.value;
                      if (!isRecurringExpenseFrequency(prev.frequency) || !dueDate) {
                        return { ...prev, dueDate };
                      }
                      const billed = parseMoney(prev.billedAmount);
                      const paid = billed != null
                        ? paidRecurringExpenseFields(billed, dueDate)
                        : null;
                      return {
                        ...prev,
                        dueDate,
                        paymentAmount: paid ? String(paid.paymentAmount) : prev.paymentAmount,
                        paymentDate: paid?.paymentDate ?? prev.paymentDate,
                        paymentStatus: paid?.paymentStatus ?? prev.paymentStatus,
                      };
                    })
                  }
                  className="text-[13px]"
                  aria-label="到期日"
                />
              </div>
            </div>

            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">備註 Remarks</span>
              <Textarea
                value={draft.remarks}
                onChange={(e) => setDraft((prev) => ({ ...prev, remarks: e.target.value }))}
                placeholder="補充說明"
                rows={3}
                className="text-[13px]"
                aria-label="備註"
              />
            </div>
          </section>

          <section className="space-y-4 pt-2 border-t border-border/60">
            <div>
              <h3 className="text-[14px] font-semibold">完成付款</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">於完成付款時填寫</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1">實付金額 Payment</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.paymentAmount}
                  onChange={(e) => setDraft((prev) => ({ ...prev, paymentAmount: e.target.value }))}
                  placeholder="0.00"
                  className="text-[13px]"
                  aria-label="實付金額"
                />
                <StoredHkdHint amount={parseMoney(draft.paymentAmount)} currency={draft.currency} />
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1">
                  付款日期 Payment date{paymentRequired ? ' *' : ''}
                </span>
                <Input
                  type="date"
                  value={draft.paymentDate}
                  onChange={(e) => setDraft((prev) => ({ ...prev, paymentDate: e.target.value }))}
                  className="text-[13px]"
                  aria-label="付款日期"
                />
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">未付 Outstanding（應付 − 實付 − 壞帳）</span>
              <span className="text-[14px] font-semibold tabular-nums text-right">
                {formatExpenseMoney(outstandingPreview, draft.currency)}
                {draft.currency !== DEFAULT_CURRENCY && (
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {formatMoney(toHkd(outstandingPreview, draft.currency))}
                  </span>
                )}
              </span>
            </div>

            <div>
              <span className="text-[12px] text-muted-foreground block mb-1.5">
                付款方式 Payment method{paymentRequired ? ' *' : ''}
              </span>
              <PillOptions
                value={draft.paymentMethod}
                options={EXPENSE_PAYMENT_METHODS}
                labels={EXPENSE_PAYMENT_METHOD_LABELS}
                onChange={(paymentMethod) =>
                  setDraft((prev) => {
                    const next = prev.paymentMethod === paymentMethod ? '' : paymentMethod;
                    const keepCard = isCreditCardPaymentMethod(next);
                    return {
                      ...prev,
                      paymentMethod: next,
                      creditCardId: keepCard ? prev.creditCardId : '',
                      frequency: keepCard ? prev.frequency : '',
                    };
                  })
                }
                ariaLabel="付款方式"
              />
            </div>

            {isCreditCardPaymentMethod(draft.paymentMethod) && (
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1">
                  信用卡 Credit card *
                </span>
                <SearchableSelect
                  value={draft.creditCardId}
                  onValueChange={(creditCardId) =>
                    setDraft((prev) => ({
                      ...prev,
                      creditCardId,
                      frequency: creditCardId ? prev.frequency : '',
                    }))
                  }
                  options={creditCardOptions}
                  placeholder="選擇信用卡"
                  searchPlaceholder="搜尋信用卡…"
                  emptyText="尚未新增信用卡"
                />
              </div>
            )}

            {showRecurringBlock && (
              <div className="space-y-3 rounded-md border border-teal-200 bg-teal-50/40 px-3 py-3">
                <div>
                  <h4 className="text-[13px] font-semibold text-teal-900">週期 Recurring</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    選擇頻率後將建立週期，第一筆即標記已付款；之後由每日排程自動新增
                  </p>
                </div>
                <PillOptions
                  value={draft.frequency}
                  options={RECURRING_EXPENSE_FREQUENCIES}
                  labels={RECURRING_EXPENSE_FREQUENCY_LABELS}
                  onChange={(frequency) =>
                    setDraft((prev) => {
                      const next = prev.frequency === frequency ? '' : frequency;
                      if (!next) return { ...prev, frequency: '' };
                      const billed = parseMoney(prev.billedAmount);
                      const paid = billed != null && prev.dueDate
                        ? paidRecurringExpenseFields(billed, prev.dueDate)
                        : null;
                      return {
                        ...prev,
                        frequency: next,
                        paymentAmount: paid ? String(paid.paymentAmount) : prev.paymentAmount,
                        paymentDate: paid?.paymentDate ?? prev.paymentDate,
                        paymentStatus: paid?.paymentStatus ?? prev.paymentStatus,
                      };
                    })
                  }
                  ariaLabel="週期頻率"
                />
                {recurringPreview.length > 0 && (
                  <p className="text-[12px] text-teal-900">
                    預覽到期日：{recurringPreview.map((date) => formatExpenseDate(date)).join('、')}
                  </p>
                )}
              </div>
            )}

            {editing?.recurringExpenseId && (
              <div className="space-y-2 rounded-md border border-teal-200 bg-teal-50/40 px-3 py-3">
                <h4 className="text-[13px] font-semibold text-teal-900">週期 Recurring</h4>
                <p className="text-[12px] text-teal-900">
                  {editing.recurringFrequency
                    ? RECURRING_EXPENSE_FREQUENCY_LABELS[editing.recurringFrequency]
                    : '週期'}
                  {' · '}
                  {RECURRING_EXPENSE_STATUS_LABELS[editing.recurringStatus ?? 'active']}
                  {' · 自動化已執行 '}
                  {editing.recurringAutomationRunCount ?? 0}
                  {' 次'}
                  {editing.recurringNextOccurrenceDate
                    ? ` · 下次 ${formatExpenseDate(editing.recurringNextOccurrenceDate)}`
                    : ''}
                </p>
                <div className="flex items-center gap-2">
                  {editing.recurringStatus === 'paused' ? (
                    <button
                      type="button"
                      onClick={() => void handleRecurringStatus('active')}
                      disabled={saving}
                      className="px-3 py-1.5 text-[12px] font-medium text-teal-800 bg-white border border-teal-200 rounded-md hover:bg-teal-50 disabled:opacity-50"
                    >
                      恢復週期
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleRecurringStatus('paused')}
                      disabled={saving}
                      className="px-3 py-1.5 text-[12px] font-medium text-rose-700 bg-white border border-rose-200 rounded-md hover:bg-rose-50 disabled:opacity-50"
                    >
                      暫停週期
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <span className="text-[12px] text-muted-foreground block mb-1.5">
                付款狀態 Payment status{paymentRequired ? ' *' : ''}
              </span>
              <PillOptions
                value={draft.paymentStatus}
                options={EXPENSE_PAYMENT_STATUSES}
                labels={EXPENSE_PAYMENT_STATUS_LABELS}
                onChange={(paymentStatus) =>
                  setDraft((prev) => ({
                    ...prev,
                    paymentStatus: prev.paymentStatus === paymentStatus ? '' : paymentStatus,
                  }))
                }
                ariaLabel="付款狀態"
              />
            </div>

            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">付款紀錄 Payment record</span>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  setPaymentRecordFile(e.target.files?.[0] ?? null);
                  setClearPaymentRecord(false);
                }}
                className="text-[13px]"
                aria-label="付款紀錄檔案"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {paymentRecordFile
                  ? `${paymentRecordFile.name}（${formatPaymentRecordFileSize(paymentRecordFile.size)}）`
                  : editing?.paymentRecordFileUrl && !clearPaymentRecord
                    ? `目前：${editing.paymentRecordFileName || '已上傳檔案'}`
                    : `支援 PDF、圖片、Word、Excel，上限 ${EXPENSE_PAYMENT_RECORD_MAX_SIZE_MB}MB`}
              </p>
              {editing?.paymentRecordFileUrl && !clearPaymentRecord && !paymentRecordFile && (
                <div className="flex items-center gap-3 mt-1.5">
                  <a
                    href={editing.paymentRecordFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-teal-700 hover:text-teal-800"
                  >
                    開啟現有檔案
                  </a>
                  <button
                    type="button"
                    onClick={() => setClearPaymentRecord(true)}
                    className="text-[12px] text-rose-600 hover:text-rose-700"
                  >
                    移除檔案
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </CrudModal>

      <PitchingBulkExpenseDialog
        open={bulkOpen}
        editingRows={bulkEditing}
        projectRows={rows}
        signedDate={signedDate}
        handoverDate={handoverDate}
        saving={bulkSaving}
        supplierTypes={supplierTypes}
        suppliers={suppliers}
        onClose={closeBulk}
        onSave={handleBulkSave}
      />

      <PitchingRecurringExpenseDialog
        open={Boolean(recurringGroup)}
        group={recurringGroup}
        setting={recurringSetting}
        cards={cards}
        saving={recurringSaving}
        onClose={closeRecurringSettings}
        onSave={handleRecurringSave}
      />

      <DeleteConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        itemName={deleteLabel}
        canDelete
        description={`確定要刪除「${deleteLabel}」這筆支出嗎？`}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
      <span className="text-[12px] text-muted-foreground block">{label}</span>
      <span className={cn('text-[16px] font-semibold tabular-nums mt-1 block', accent)}>{value}</span>
    </div>
  );
}

function SectionSum({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="text-right">
      <span className="text-[11px] text-muted-foreground block">{label}</span>
      <span className={cn('text-[13px] font-semibold tabular-nums whitespace-nowrap', accent)}>{value}</span>
    </div>
  );
}
