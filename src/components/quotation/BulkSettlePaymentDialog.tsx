import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  INCOME_PAYMENT_METHOD_LABELS,
  INCOME_PAYMENT_METHODS,
  INCOME_PAYMENT_RECORD_MAX_SIZE_MB,
  INCOME_PAYMENT_STATUS_LABELS,
  INCOME_PAYMENT_STATUSES,
  formatPaymentRecordFileSize,
  isAllowedPaymentRecordFile,
  type IncomePaymentMethod,
  type IncomePaymentStatus,
} from '@/lib/quotationIncomes';
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_PAYMENT_RECORD_MAX_SIZE_MB,
  EXPENSE_PAYMENT_STATUS_LABELS,
  EXPENSE_PAYMENT_STATUSES,
  isCreditCardPaymentMethod,
  type ExpensePaymentMethod,
  type ExpensePaymentStatus,
} from '@/lib/quotationExpenses';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';

export type BulkSettleKind = 'income' | 'expense';

export type BulkSettleSubmit = {
  paymentMethod: string;
  paymentStatus: string;
  creditCardId: string;
  file: File | null;
};

const COPY = {
  income: {
    title: '批量完成收款',
    confirm: '確認完成收款',
    methodLabel: '收款方式 Payment method *',
    methodAria: '收款方式',
    statusLabel: '收款狀態 Payment status *',
    statusAria: '收款狀態',
    recordLabel: '收款紀錄 Payment record',
    recordAria: '收款紀錄檔案',
    defaultStatus: 'Received' as IncomePaymentStatus,
    maxMb: INCOME_PAYMENT_RECORD_MAX_SIZE_MB,
    points: [
      '實收金額會改成該期應收金額',
      '收款日期會改成到期日',
      '未收會變成 0（壞帳維持不變）',
    ],
    apply: '收款方式、收款狀態，以及上傳的收款紀錄，會寫入每一筆已選資料。沒有上傳檔案時，保留各筆原有的收款紀錄。',
    due: '缺少到期日的期數無法完成。',
  },
  expense: {
    title: '批量完成付款',
    confirm: '確認完成付款',
    methodLabel: '付款方式 Payment method *',
    methodAria: '付款方式',
    statusLabel: '付款狀態 Payment status *',
    statusAria: '付款狀態',
    recordLabel: '付款紀錄 Payment record',
    recordAria: '付款紀錄檔案',
    defaultStatus: 'Paid' as ExpensePaymentStatus,
    maxMb: EXPENSE_PAYMENT_RECORD_MAX_SIZE_MB,
    points: [
      '實付金額會改成該期應付金額',
      '付款日期會改成到期日',
      '未付會變成 0（壞帳維持不變）',
    ],
    apply: '付款方式、付款狀態，以及上傳的付款紀錄，會寫入每一筆已選資料。沒有上傳檔案時，保留各筆原有的付款紀錄。',
    due: '缺少到期日的期數無法完成。',
  },
} as const;

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

export function SelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
      }}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 rounded border-border accent-teal-600"
    />
  );
}

export function BulkSettlePaymentDialog({
  open,
  kind,
  count,
  saving,
  creditCardOptions = [],
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: BulkSettleKind;
  count: number;
  saving: boolean;
  creditCardOptions?: SearchableSelectOption[];
  onClose: () => void;
  onSubmit: (input: BulkSettleSubmit) => void;
}) {
  const copy = COPY[kind];
  const [paymentMethod, setPaymentMethod] = useState<IncomePaymentMethod | ExpensePaymentMethod>('Transfer');
  const [paymentStatus, setPaymentStatus] = useState<IncomePaymentStatus | ExpensePaymentStatus>(copy.defaultStatus);
  const [creditCardId, setCreditCardId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setPaymentMethod('Transfer');
    setPaymentStatus(copy.defaultStatus);
    setCreditCardId('');
    setFile(null);
    setFileKey((key) => key + 1);
  }, [open, copy.defaultStatus]);

  const submit = () => {
    if (kind === 'expense' && isCreditCardPaymentMethod(paymentMethod) && !creditCardId.trim()) {
      toast.error('請選擇信用卡');
      return;
    }
    if (file) {
      const fileError = isAllowedPaymentRecordFile(file);
      if (fileError) {
        toast.error(fileError);
        return;
      }
    }
    onSubmit({
      paymentMethod,
      paymentStatus,
      creditCardId,
      file,
    });
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={onClose}
      title={copy.title}
      size="md"
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
            onClick={submit}
            disabled={saving || count === 0}
            className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? '儲存中…' : copy.confirm}
          </button>
        </CrudModalFooter>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-teal-200 bg-teal-50/50 px-3 py-3 text-[12px] text-teal-950 space-y-2">
          <p>已選 {count} 筆。確認後會一次完成，規則如下：</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {copy.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <p>{copy.apply}</p>
          <p>{copy.due}</p>
        </div>

        <div>
          <span className="text-[12px] text-muted-foreground block mb-1.5">{copy.methodLabel}</span>
          {kind === 'income' ? (
            <PillOptions
              value={paymentMethod}
              options={INCOME_PAYMENT_METHODS}
              labels={INCOME_PAYMENT_METHOD_LABELS}
              onChange={(next) => setPaymentMethod(next)}
              ariaLabel={copy.methodAria}
            />
          ) : (
            <PillOptions
              value={paymentMethod}
              options={EXPENSE_PAYMENT_METHODS}
              labels={EXPENSE_PAYMENT_METHOD_LABELS}
              onChange={(next) => {
                setPaymentMethod(next);
                if (!isCreditCardPaymentMethod(next)) setCreditCardId('');
              }}
              ariaLabel={copy.methodAria}
            />
          )}
        </div>

        {kind === 'expense' && isCreditCardPaymentMethod(paymentMethod) && (
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">信用卡 Credit card *</span>
            <SearchableSelect
              value={creditCardId}
              onValueChange={setCreditCardId}
              options={creditCardOptions}
              placeholder="選擇信用卡"
              searchPlaceholder="搜尋信用卡…"
              emptyText="尚未新增信用卡"
            />
          </div>
        )}

        <div>
          <span className="text-[12px] text-muted-foreground block mb-1.5">{copy.statusLabel}</span>
          {kind === 'income' ? (
            <PillOptions
              value={paymentStatus}
              options={INCOME_PAYMENT_STATUSES}
              labels={INCOME_PAYMENT_STATUS_LABELS}
              onChange={setPaymentStatus}
              ariaLabel={copy.statusAria}
            />
          ) : (
            <PillOptions
              value={paymentStatus}
              options={EXPENSE_PAYMENT_STATUSES}
              labels={EXPENSE_PAYMENT_STATUS_LABELS}
              onChange={setPaymentStatus}
              ariaLabel={copy.statusAria}
            />
          )}
        </div>

        <div>
          <span className="text-[12px] text-muted-foreground block mb-1">{copy.recordLabel}</span>
          <Input
            key={fileKey}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.doc,.docx,.xls,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[13px]"
            aria-label={copy.recordAria}
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {file
              ? `${file.name}（${formatPaymentRecordFileSize(file.size)}）`
              : `支援 PDF、圖片、Word、Excel，上限 ${copy.maxMb}MB。上傳後會套用到每一筆已選資料。`}
          </p>
        </div>
      </div>
    </CrudModal>
  );
}
