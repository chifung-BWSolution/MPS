import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { CurrencyPicker, StoredHkdHint } from '@/components/ui/currency-picker';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import type { QuotationExpenseWriteInput } from '@/hooks/useQuotationExpenses';
import { formatCreditCardOptionLabel, type CreditCardRecord } from '@/lib/creditCards';
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
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_PAYMENT_RECORD_MAX_SIZE_MB,
  EXPENSE_PAYMENT_STATUS_LABELS,
  EXPENSE_PAYMENT_STATUSES,
  RECURRING_EXPENSE_FREQUENCIES,
  RECURRING_EXPENSE_FREQUENCY_LABELS,
  RECURRING_EXPENSE_STATUS_LABELS,
  computeOutstanding,
  expenseCreditCardId,
  formatExpenseDate,
  formatExpenseMoney,
  formatPaymentRecordFileSize,
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
  validateExpenseInput,
  type ExpensePaymentStatus,
  type QuotationExpense,
  type RecurringExpenseFrequency,
  type RecurringExpenseStatus,
} from '@/lib/quotationExpenses';
import type { SupplierType, WebPageSupplier } from '@/types/marketingOps';
import { cn } from '@/lib/utils';

export type ExpenseEditSaveInput = QuotationExpenseWriteInput;

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

export function ExpenseEditDialog({
  open,
  expense,
  siblingRows,
  supplierTypes,
  suppliers,
  cards,
  saving,
  onClose,
  onSave,
  onRecurringStatus,
}: {
  open: boolean;
  expense: QuotationExpense | null;
  siblingRows: QuotationExpense[];
  supplierTypes: SupplierType[];
  suppliers: WebPageSupplier[];
  cards: CreditCardRecord[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: ExpenseEditSaveInput) => void;
  onRecurringStatus: (status: RecurringExpenseStatus) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    expense
      ? draftFromRow(expense)
      : emptyDraft(),
  );
  const [paymentRecordFile, setPaymentRecordFile] = useState<File | null>(null);
  const [clearPaymentRecord, setClearPaymentRecord] = useState(false);
  const expenseId = expense?.id ?? null;

  useEffect(() => {
    if (!open) return;
    const defaultTypeId = supplierTypes.find((type) => type.isActive)?.id ?? '';
    setDraft(
      expense
        ? draftFromRow(expense)
        : emptyDraft(nextExpenseInstallmentNumber(siblingRows, defaultTypeId, ''), defaultTypeId),
    );
    setPaymentRecordFile(null);
    setClearPaymentRecord(false);
    // siblingRows and supplierTypes are read when the dialog opens or switches expense.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expenseId]);

  const outstandingPreview = computeOutstanding(
    parseMoney(draft.billedAmount) ?? 0,
    parseMoney(draft.paymentAmount) ?? 0,
    parseMoney(draft.badDebt) ?? 0,
  );
  const paymentRequired = hasFilledPaymentAmount(draft.paymentAmount);
  const showRecurringBlock = Boolean(draft.creditCardId) && !expense?.recurringExpenseId;
  const recurringPreview = showRecurringBlock && isRecurringExpenseFrequency(draft.frequency) && draft.dueDate
    ? previewRecurringDueDates(draft.frequency, draft.dueDate, 3)
    : [];
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

  const handleSave = () => {
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

    onSave({
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
      paymentRecordAction: clearPaymentRecord && !paymentRecordFile ? 'clear' : undefined,
    });
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={onClose}
      title={expense ? '編輯支出' : '新增單項支出'}
      size="lg"
      footer={
        <CrudModalFooter className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
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
                          installmentNumber: expense
                            ? prev.installmentNumber
                            : String(nextExpenseInstallmentNumber(siblingRows, nextType, nextSupplier)),
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
                    installmentNumber: expense
                      ? prev.installmentNumber
                      : String(nextExpenseInstallmentNumber(siblingRows, prev.supplierTypesId, supplierId)),
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

          {expense?.recurringExpenseId && (
            <div className="space-y-2 rounded-md border border-teal-200 bg-teal-50/40 px-3 py-3">
              <h4 className="text-[13px] font-semibold text-teal-900">週期 Recurring</h4>
              <p className="text-[12px] text-teal-900">
                {expense.recurringFrequency
                  ? RECURRING_EXPENSE_FREQUENCY_LABELS[expense.recurringFrequency]
                  : '週期'}
                {' · '}
                {RECURRING_EXPENSE_STATUS_LABELS[expense.recurringStatus ?? 'active']}
                {' · 自動化已執行 '}
                {expense.recurringAutomationRunCount ?? 0}
                {' 次'}
                {expense.recurringNextOccurrenceDate
                  ? ` · 下次 ${formatExpenseDate(expense.recurringNextOccurrenceDate)}`
                  : ''}
              </p>
              <div className="flex items-center gap-2">
                {expense.recurringStatus === 'paused' ? (
                  <button
                    type="button"
                    onClick={() => onRecurringStatus('active')}
                    disabled={saving}
                    className="px-3 py-1.5 text-[12px] font-medium text-teal-800 bg-white border border-teal-200 rounded-md hover:bg-teal-50 disabled:opacity-50"
                  >
                    恢復週期
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRecurringStatus('paused')}
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
                : expense?.paymentRecordFileUrl && !clearPaymentRecord
                  ? `目前：${expense.paymentRecordFileName || '已上傳檔案'}`
                  : `支援 PDF、圖片、Word、Excel，上限 ${EXPENSE_PAYMENT_RECORD_MAX_SIZE_MB}MB`}
            </p>
            {expense?.paymentRecordFileUrl && !clearPaymentRecord && !paymentRecordFile && (
              <div className="flex items-center gap-3 mt-1.5">
                <a
                  href={expense.paymentRecordFileUrl}
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
  );
}
