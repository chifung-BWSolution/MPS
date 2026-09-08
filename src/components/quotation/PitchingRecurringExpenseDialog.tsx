import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatCreditCardOptionLabel } from '@/lib/creditCards';
import type { CreditCardRecord } from '@/lib/creditCards';
import {
  RECURRING_EXPENSE_FREQUENCIES,
  RECURRING_EXPENSE_FREQUENCY_LABELS,
  RECURRING_EXPENSE_STATUS_LABELS,
  defaultGroupRecurringNextDate,
  formatExpenseDate,
  formatMoneyInput,
  parseMoney,
  previewRecurringDueDates,
  validateRecurringSettingInput,
  type ExpenseTypeGroup,
  type RecurringExpenseFrequency,
  type RecurringExpenseStatus,
  type RecurringExpenseSummary,
} from '@/lib/quotationExpenses';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';

export type RecurringExpenseDialogInput = {
  id?: string;
  creditCardId: string;
  billedAmount: number;
  remarks?: string | null;
  frequency: RecurringExpenseFrequency;
  nextOccurrenceDate: string;
  status: RecurringExpenseStatus;
  attachExpenseIds: string[];
};

type Draft = {
  creditCardId: string;
  frequency: RecurringExpenseFrequency | '';
  billedAmount: string;
  nextOccurrenceDate: string;
  status: RecurringExpenseStatus;
  remarks: string;
};

function draftFromGroup(
  group: ExpenseTypeGroup,
  setting?: RecurringExpenseSummary,
): Draft {
  const frequency = setting?.frequency ?? 'monthly';
  const lastRow = [...group.rows].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).at(-1);
  return {
    creditCardId: setting?.creditCardId ?? lastRow?.creditCardId ?? '',
    frequency,
    billedAmount: formatMoneyInput(setting?.billedAmount ?? lastRow?.billedAmount ?? 0),
    nextOccurrenceDate: setting?.nextOccurrenceDate
      ?? defaultGroupRecurringNextDate(group.rows, frequency),
    status: setting?.status ?? 'active',
    remarks: setting?.remarks ?? lastRow?.remarks ?? '',
  };
}

export function PitchingRecurringExpenseDialog({
  open,
  group,
  setting,
  cards,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  group: ExpenseTypeGroup | null;
  setting?: RecurringExpenseSummary;
  cards: CreditCardRecord[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: RecurringExpenseDialogInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>({
    creditCardId: '',
    frequency: 'monthly',
    billedAmount: '',
    nextOccurrenceDate: '',
    status: 'active',
    remarks: '',
  });

  useEffect(() => {
    if (!open || !group) return;
    setDraft(draftFromGroup(group, setting));
  }, [open, group, setting]);

  const cardOptions = useMemo(
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

  const preview = draft.frequency && draft.nextOccurrenceDate
    ? previewRecurringDueDates(draft.frequency, draft.nextOccurrenceDate, 3)
    : [];
  const editing = Boolean(setting?.id);

  const handleSave = async () => {
    const error = validateRecurringSettingInput(draft);
    if (error) {
      toast.error(error);
      return;
    }
    const billedAmount = parseMoney(draft.billedAmount);
    if (billedAmount == null || !draft.frequency || !group) return;
    await onSave({
      id: setting?.id,
      creditCardId: draft.creditCardId,
      billedAmount,
      remarks: draft.remarks.trim() || null,
      frequency: draft.frequency,
      nextOccurrenceDate: draft.nextOccurrenceDate,
      status: draft.status,
      attachExpenseIds: group.rows.map((row) => row.id),
    });
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={onClose}
      title={editing ? '編輯循環設定' : '新增循環設定'}
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
            onClick={() => void handleSave()}
            disabled={saving || !group}
            className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </CrudModalFooter>
      }
    >
      <div className="space-y-4">
        <p className="text-[12px] text-muted-foreground">
          {group ? `${group.supplierLabel} · ${group.typeLabel}` : '循環設定'}
          {setting ? ` · 自動化已執行 ${setting.automationRunCount} 次` : ''}
        </p>

        <div>
          <span className="text-[12px] text-muted-foreground block mb-1.5">頻率 Frequency *</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="週期頻率">
            {RECURRING_EXPENSE_FREQUENCIES.map((frequency) => {
              const selected = draft.frequency === frequency;
              return (
                <button
                  key={frequency}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      frequency,
                      nextOccurrenceDate: group && !setting
                        ? defaultGroupRecurringNextDate(group.rows, frequency)
                        : prev.nextOccurrenceDate,
                    }))
                  }
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                    selected
                      ? 'bg-teal-50 border-teal-300 text-teal-800'
                      : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {RECURRING_EXPENSE_FREQUENCY_LABELS[frequency]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-[12px] text-muted-foreground block mb-1">信用卡 Credit card *</span>
          <SearchableSelect
            value={draft.creditCardId}
            onValueChange={(creditCardId) => setDraft((prev) => ({ ...prev, creditCardId }))}
            options={cardOptions}
            placeholder="選擇信用卡"
            searchPlaceholder="搜尋信用卡…"
            emptyText="尚未新增信用卡"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">每期金額 Amount *</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.billedAmount}
              onChange={(e) => setDraft((prev) => ({ ...prev, billedAmount: e.target.value }))}
              className="text-[13px]"
              aria-label="每期金額"
            />
          </div>
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">下次到期日 Next due *</span>
            <Input
              type="date"
              value={draft.nextOccurrenceDate}
              onChange={(e) => setDraft((prev) => ({ ...prev, nextOccurrenceDate: e.target.value }))}
              className="text-[13px]"
              aria-label="下次到期日"
            />
          </div>
        </div>

        <div>
          <span className="text-[12px] text-muted-foreground block mb-1.5">狀態 Status</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="週期狀態">
            {(['active', 'paused'] as const).map((status) => {
              const selected = draft.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDraft((prev) => ({ ...prev, status }))}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                    selected
                      ? status === 'paused'
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-teal-50 border-teal-300 text-teal-800'
                      : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {RECURRING_EXPENSE_STATUS_LABELS[status]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-[12px] text-muted-foreground block mb-1">備註 Remarks</span>
          <Textarea
            value={draft.remarks}
            onChange={(e) => setDraft((prev) => ({ ...prev, remarks: e.target.value }))}
            rows={2}
            className="text-[13px]"
            aria-label="循環備註"
          />
        </div>

        {preview.length > 0 && (
          <p className="text-[12px] text-teal-900">
            預覽到期日：{preview.map((date) => formatExpenseDate(date)).join('、')}
          </p>
        )}
      </div>
    </CrudModal>
  );
}
