import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { CurrencyPicker, StoredHkdHint } from '@/components/ui/currency-picker';
import { Input } from '@/components/ui/input';
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
import {
  DEFAULT_INCOME_TYPE,
  INCOME_PAYMENT_METHOD_LABELS,
  INCOME_PAYMENT_METHODS,
  INCOME_PAYMENT_RECORD_MAX_SIZE_MB,
  INCOME_PAYMENT_STATUS_LABELS,
  INCOME_PAYMENT_STATUSES,
  INCOME_TYPE_PRESETS,
  computeOutstanding,
  formatIncomeMoney,
  formatPaymentRecordFileSize,
  hasFilledPaymentAmount,
  nextInstallmentNumber,
  parseInstallmentNumber,
  parseMoney,
  validateIncomeInput,
  type IncomePaymentMethod,
  type IncomePaymentStatus,
  type QuotationIncome,
} from '@/lib/quotationIncomes';
import { cn } from '@/lib/utils';

export type IncomeEditSaveInput = {
  type: string;
  installmentNumber: number | null;
  currency: SystemCurrency;
  billedAmount: number;
  dueDate: string | null;
  paymentAmount: number;
  paymentDate: string | null;
  paymentMethod: IncomePaymentMethod | null;
  paymentStatus: IncomePaymentStatus | null;
  badDebt: number;
  remarks: string | null;
  file: File | null;
  paymentRecordAction?: 'clear';
};

type Draft = {
  type: string;
  installmentNumber: string;
  currency: SystemCurrency;
  billedAmount: string;
  dueDate: string;
  paymentAmount: string;
  paymentDate: string;
  paymentMethod: string;
  paymentStatus: IncomePaymentStatus | '';
  badDebt: string;
  remarks: string;
};

const emptyDraft = (nextInstallment = 1, type = DEFAULT_INCOME_TYPE): Draft => ({
  type,
  installmentNumber: String(nextInstallment),
  currency: DEFAULT_CURRENCY,
  billedAmount: '',
  dueDate: '',
  paymentAmount: '',
  paymentDate: '',
  paymentMethod: '',
  paymentStatus: '',
  badDebt: '',
  remarks: '',
});

function draftFromRow(row: QuotationIncome): Draft {
  const currency = parseSystemCurrency(row.currency);
  return {
    type: row.type,
    installmentNumber: row.installmentNumber != null ? String(row.installmentNumber) : '',
    currency,
    billedAmount: moneyInputFromHkd(row.billedAmount, currency),
    dueDate: row.dueDate ?? '',
    paymentAmount: moneyInputFromHkd(row.paymentAmount, currency, { emptyIfZero: true }),
    paymentDate: row.paymentDate ?? '',
    paymentMethod: row.paymentMethod ?? '',
    paymentStatus: row.paymentStatus ?? '',
    badDebt: moneyInputFromHkd(row.badDebt, currency),
    remarks: row.remarks ?? '',
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

export function IncomeEditDialog({
  open,
  income,
  siblingRows,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  income: QuotationIncome | null;
  siblingRows: Array<{ type?: string; installmentNumber?: number }>;
  saving: boolean;
  onClose: () => void;
  onSave: (input: IncomeEditSaveInput) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    income
      ? draftFromRow(income)
      : emptyDraft(nextInstallmentNumber(siblingRows, DEFAULT_INCOME_TYPE), DEFAULT_INCOME_TYPE),
  );
  const [paymentRecordFile, setPaymentRecordFile] = useState<File | null>(null);
  const [clearPaymentRecord, setClearPaymentRecord] = useState(false);
  const incomeId = income?.id ?? null;

  useEffect(() => {
    if (!open) return;
    setDraft(
      income
        ? draftFromRow(income)
        : emptyDraft(nextInstallmentNumber(siblingRows, DEFAULT_INCOME_TYPE), DEFAULT_INCOME_TYPE),
    );
    setPaymentRecordFile(null);
    setClearPaymentRecord(false);
    // siblingRows is read when the dialog opens or switches income, not on later list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, incomeId]);

  const outstandingPreview = computeOutstanding(
    parseMoney(draft.billedAmount) ?? 0,
    parseMoney(draft.paymentAmount) ?? 0,
    parseMoney(draft.badDebt) ?? 0,
  );
  const paymentRequired = hasFilledPaymentAmount(draft.paymentAmount);

  const handleSave = () => {
    const validationError = validateIncomeInput(draft);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const billedAmount = parseMoney(draft.billedAmount);
    const paymentAmount = parseMoney(draft.paymentAmount);
    const badDebt = parseMoney(draft.badDebt);
    if (billedAmount == null || paymentAmount == null || badDebt == null) return;
    const stored = amountsToHkd({ billedAmount, paymentAmount, badDebt }, draft.currency);
    onSave({
      type: draft.type.trim(),
      installmentNumber: parseInstallmentNumber(draft.installmentNumber),
      currency: draft.currency,
      billedAmount: stored.billedAmount,
      dueDate: draft.dueDate || null,
      paymentAmount: stored.paymentAmount,
      paymentDate: draft.paymentDate || null,
      paymentMethod: (draft.paymentMethod || null) as IncomePaymentMethod | null,
      paymentStatus: draft.paymentStatus || null,
      badDebt: stored.badDebt,
      remarks: draft.remarks.trim() || null,
      file: paymentRecordFile,
      paymentRecordAction: clearPaymentRecord && !paymentRecordFile ? 'clear' : undefined,
    });
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={onClose}
      title={income ? '編輯收入' : '新增單項收入'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">類型 Type *</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="收入類型">
                {INCOME_TYPE_PRESETS.map((type) => {
                  const selected = draft.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          type,
                          installmentNumber: income
                            ? prev.installmentNumber
                            : String(nextInstallmentNumber(siblingRows, type)),
                        }))
                      }
                      className={cn(
                        'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                        selected
                          ? 'bg-teal-50 border-teal-300 text-teal-800'
                          : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
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
              <span className="text-[12px] text-muted-foreground block mb-1">應收金額 Billed *</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.billedAmount}
                onChange={(e) => setDraft((prev) => ({ ...prev, billedAmount: e.target.value }))}
                placeholder="0.00"
                className="text-[13px]"
                aria-label="應收金額"
              />
              <StoredHkdHint amount={parseMoney(draft.billedAmount)} currency={draft.currency} />
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">到期日 Due date *</span>
              <Input
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
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
            <h3 className="text-[14px] font-semibold">完成收款</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">於完成收款時填寫</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">實收金額 Payment</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.paymentAmount}
                onChange={(e) => setDraft((prev) => ({ ...prev, paymentAmount: e.target.value }))}
                placeholder="0.00"
                className="text-[13px]"
                aria-label="實收金額"
              />
              <StoredHkdHint amount={parseMoney(draft.paymentAmount)} currency={draft.currency} />
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">
                收款日期 Payment date{paymentRequired ? ' *' : ''}
              </span>
              <Input
                type="date"
                value={draft.paymentDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, paymentDate: e.target.value }))}
                className="text-[13px]"
                aria-label="收款日期"
              />
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">未收 Outstanding（應收 − 實收 − 壞帳）</span>
            <span className="text-[14px] font-semibold tabular-nums text-right">
              {formatIncomeMoney(outstandingPreview, draft.currency)}
              {draft.currency !== DEFAULT_CURRENCY && (
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {formatMoney(toHkd(outstandingPreview, draft.currency))}
                </span>
              )}
            </span>
          </div>

          <div>
            <span className="text-[12px] text-muted-foreground block mb-1.5">
              收款方式 Payment method{paymentRequired ? ' *' : ''}
            </span>
            <PillOptions
              value={draft.paymentMethod}
              options={INCOME_PAYMENT_METHODS}
              labels={INCOME_PAYMENT_METHOD_LABELS}
              onChange={(paymentMethod) =>
                setDraft((prev) => ({
                  ...prev,
                  paymentMethod: prev.paymentMethod === paymentMethod ? '' : paymentMethod,
                }))
              }
              ariaLabel="收款方式"
            />
          </div>

          <div>
            <span className="text-[12px] text-muted-foreground block mb-1.5">
              收款狀態 Payment status{paymentRequired ? ' *' : ''}
            </span>
            <PillOptions
              value={draft.paymentStatus}
              options={INCOME_PAYMENT_STATUSES}
              labels={INCOME_PAYMENT_STATUS_LABELS}
              onChange={(paymentStatus) =>
                setDraft((prev) => ({
                  ...prev,
                  paymentStatus: prev.paymentStatus === paymentStatus ? '' : paymentStatus,
                }))
              }
              ariaLabel="收款狀態"
            />
          </div>

          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">收款紀錄 Payment record</span>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                setPaymentRecordFile(e.target.files?.[0] ?? null);
                setClearPaymentRecord(false);
              }}
              className="text-[13px]"
              aria-label="收款紀錄檔案"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {paymentRecordFile
                ? `${paymentRecordFile.name}（${formatPaymentRecordFileSize(paymentRecordFile.size)}）`
                : income?.paymentRecordFileUrl && !clearPaymentRecord
                  ? `目前：${income.paymentRecordFileName || '已上傳檔案'}`
                  : `支援 PDF、圖片、Word、Excel，上限 ${INCOME_PAYMENT_RECORD_MAX_SIZE_MB}MB`}
            </p>
            {income?.paymentRecordFileUrl && !clearPaymentRecord && !paymentRecordFile && (
              <div className="flex items-center gap-3 mt-1.5">
                <a
                  href={income.paymentRecordFileUrl}
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
