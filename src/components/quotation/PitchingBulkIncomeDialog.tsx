import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import {
  BULK_BILLED_TOTAL_MISMATCH,
  BULK_DATE_MODE_LABELS,
  BULK_DATE_MODES,
  DEFAULT_BULK_DATE_MODE,
  DEFAULT_BULK_INSTALLMENT_COUNT,
  DEFAULT_INCOME_TYPE,
  INCOME_TYPE_PRESETS,
  MAX_BULK_INSTALLMENT_COUNT,
  billedSumMatchesTotal,
  defaultBulkDateRange,
  distributeDueDates,
  findInstallmentCollision,
  formatIncomeMoney,
  formatLocalIsoDate,
  formatMoneyInput,
  incomeToWriteInput,
  inferBulkDateMode,
  normalizeDateRange,
  parseInstallmentNumber,
  parseLocalIsoDate,
  parseMoney,
  planBulkInstallmentNumbers,
  splitBilledAmounts,
  validateBulkIncomeInput,
  type BulkDateMode,
  type QuotationIncome,
} from '@/lib/quotationIncomes';
import type { QuotationIncomeWriteInput } from '@/hooks/useQuotationIncomes';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { Calendar } from '@/components/ui/calendar';
import { CurrencyPicker, StoredHkdHint } from '@/components/ui/currency-picker';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DEFAULT_CURRENCY,
  convertMoneyInput,
  formatMoney,
  fromHkd,
  moneyInputFromHkd,
  parseSystemCurrency,
  toHkd,
  type SystemCurrency,
} from '@/lib/currency';

type BulkRow = {
  key: string;
  id?: string;
  dueDate: string;
  installmentNumber: string;
  billedAmount: string;
};

type BulkDraft = {
  type: string;
  currency: SystemCurrency;
  totalAmount: string;
  dateMode: BulkDateMode;
  startDate: string;
  endDate: string;
  installmentCount: string;
  rows: BulkRow[];
};

function newRowKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function moneyOrEmpty(raw: string): number | null {
  if (!raw.trim()) return null;
  return parseMoney(raw);
}

function numbersFromRows(
  rows: Array<{ installmentNumber?: number | string }>,
  count: number,
): Array<number | undefined> {
  return rows.slice(0, count).map((row) => parseInstallmentNumber(row.installmentNumber) ?? undefined);
}

function rebuildRows(
  draft: BulkDraft,
  projectRows: QuotationIncome[],
  patch: Partial<Pick<BulkDraft, 'type' | 'totalAmount' | 'dateMode' | 'startDate' | 'endDate' | 'installmentCount'>>,
  options?: { resetInstallments?: boolean },
): BulkDraft {
  const next = { ...draft, ...patch };
  const parsedCount = parseInstallmentNumber(next.installmentCount);
  if (parsedCount == null) {
    return { ...next, rows: [] };
  }
  const count = Math.min(parsedCount, MAX_BULK_INSTALLMENT_COUNT);
  if (count !== parsedCount) next.installmentCount = String(count);

  if (next.dateMode === 'even') {
    const range = normalizeDateRange(next.startDate, next.endDate);
    next.startDate = range.start;
    next.endDate = range.end;
  }

  const dueDates = distributeDueDates({
    mode: next.dateMode,
    start: next.startDate,
    end: next.endDate,
    count,
  });
  if (next.dateMode !== 'even') {
    const lastDate = dueDates[dueDates.length - 1];
    if (lastDate) next.endDate = lastDate;
  }
  const total = moneyOrEmpty(next.totalAmount);
  const amounts = total == null ? null : splitBilledAmounts(total, count);
  const editingIds = draft.rows.flatMap((row) => (row.id ? [row.id] : []));
  const keepNumbers = options?.resetInstallments
    ? []
    : numbersFromRows(draft.rows, count);
  const installments = planBulkInstallmentNumbers({
    projectRows,
    type: next.type,
    count,
    editingIds,
    keepNumbers,
  });

  const resize = count !== draft.rows.length;
  const datesChanged =
    next.dateMode !== draft.dateMode
    || next.startDate !== draft.startDate
    || (next.dateMode === 'even' && next.endDate !== draft.endDate)
    || resize;
  const amountsChanged = next.totalAmount !== draft.totalAmount || resize;

  next.rows = Array.from({ length: count }, (_, index) => {
    const existing = draft.rows[index];
    return {
      key: existing?.key ?? newRowKey(),
      id: existing?.id,
      dueDate: datesChanged ? (dueDates[index] ?? '') : (existing?.dueDate ?? dueDates[index] ?? ''),
      installmentNumber: String(installments[index] ?? index + 1),
      billedAmount: amountsChanged
        ? (amounts ? formatMoneyInput(amounts[index] ?? 0) : '')
        : (existing?.billedAmount ?? (amounts ? formatMoneyInput(amounts[index] ?? 0) : '')),
    };
  });

  return next;
}

export function emptyBulkDraft(
  projectRows: QuotationIncome[],
  signedDate?: string,
  handoverDate?: string,
): BulkDraft {
  const range = defaultBulkDateRange(signedDate, handoverDate);
  return rebuildRows(
    {
      type: DEFAULT_INCOME_TYPE,
      currency: DEFAULT_CURRENCY,
      totalAmount: '',
      dateMode: DEFAULT_BULK_DATE_MODE,
      startDate: range.start,
      endDate: range.end,
      installmentCount: String(DEFAULT_BULK_INSTALLMENT_COUNT),
      rows: [],
    },
    projectRows,
    {},
    { resetInstallments: true },
  );
}

export function bulkDraftFromRows(
  groupRows: QuotationIncome[],
  projectRows: QuotationIncome[],
  signedDate?: string,
  handoverDate?: string,
): BulkDraft {
  const sorted = [...groupRows].sort((a, b) => {
    const aN = a.installmentNumber ?? Number.MAX_SAFE_INTEGER;
    const bN = b.installmentNumber ?? Number.MAX_SAFE_INTEGER;
    if (aN !== bN) return aN - bN;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const dueDates = sorted.map((row) => row.dueDate).filter((value): value is string => Boolean(value));
  const fallback = defaultBulkDateRange(signedDate, handoverDate);
  const range = normalizeDateRange(
    dueDates[0] ?? fallback.start,
    dueDates[dueDates.length - 1] ?? fallback.end,
  );
  const currency = parseSystemCurrency(sorted[0]?.currency);
  const total = sorted.reduce((sum, row) => sum + fromHkd(row.billedAmount, currency), 0);

  return {
    type: sorted[0]?.type ?? DEFAULT_INCOME_TYPE,
    currency,
    totalAmount: formatMoneyInput(total),
    dateMode: inferBulkDateMode(dueDates) ?? DEFAULT_BULK_DATE_MODE,
    startDate: range.start,
    endDate: range.end,
    installmentCount: String(sorted.length || DEFAULT_BULK_INSTALLMENT_COUNT),
    rows: sorted.map((row) => ({
      key: row.id,
      id: row.id,
      dueDate: row.dueDate ?? '',
      installmentNumber: row.installmentNumber != null ? String(row.installmentNumber) : '',
      billedAmount: moneyInputFromHkd(row.billedAmount, currency),
    })),
  };
}

function formatRangeLabel(from?: Date, to?: Date): string {
  if (from && to) {
    return `${formatLocalIsoDate(from).replace(/-/g, '/')} – ${formatLocalIsoDate(to).replace(/-/g, '/')}`;
  }
  if (from) return `${formatLocalIsoDate(from).replace(/-/g, '/')} – 結束日`;
  return '選擇日期範圍';
}

function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const [pickingEnd, setPickingEnd] = useState(false);
  const rangeRef = useRef<DateRange | undefined>();

  const committed = useMemo((): DateRange | undefined => {
    const from = parseLocalIsoDate(startDate);
    const to = parseLocalIsoDate(endDate);
    if (!from && !to) return undefined;
    return { from: from ?? undefined, to: to ?? undefined };
  }, [startDate, endDate]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      rangeRef.current = committed;
      setRange(committed);
      setPickingEnd(false);
    } else {
      rangeRef.current = committed;
      setRange(committed);
      setPickingEnd(false);
    }
  };

  const display = open ? range : committed;
  const label = formatRangeLabel(display?.from, display?.to);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-white px-3 text-left text-[13px] shadow-sm hover:bg-muted/30',
            !(startDate && endDate) && 'text-muted-foreground',
          )}
          aria-label="日期範圍"
        >
          <CalendarDays size={14} className="shrink-0 text-teal-600" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[130]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="px-3 pt-3 text-[11px] text-muted-foreground">
          {pickingEnd ? '再點選結束日期' : '點選開始日期，再點選結束日期'}
        </p>
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={display}
          defaultMonth={display?.from ?? parseLocalIsoDate(startDate) ?? undefined}
          onSelect={(_next, triggerDate) => {
            if (!triggerDate) return;
            if (!pickingEnd) {
              const nextRange = { from: triggerDate, to: undefined };
              rangeRef.current = nextRange;
              setRange(nextRange);
              setPickingEnd(true);
              return;
            }
            const start = rangeRef.current?.from ?? triggerDate;
            const from = start.getTime() <= triggerDate.getTime() ? start : triggerDate;
            const to = start.getTime() <= triggerDate.getTime() ? triggerDate : start;
            const nextRange = { from, to };
            rangeRef.current = nextRange;
            setRange(nextRange);
            setPickingEnd(false);
            onChange(formatLocalIsoDate(from), formatLocalIsoDate(to));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function formatSingleDateLabel(date?: Date): string {
  return date ? formatLocalIsoDate(date).replace(/-/g, '/') : '選擇開始日期';
}

function SingleDatePicker({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseLocalIsoDate(date);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-white px-3 text-left text-[13px] shadow-sm hover:bg-muted/30',
            !date && 'text-muted-foreground',
          )}
          aria-label="開始日期"
        >
          <CalendarDays size={14} className="shrink-0 text-teal-600" />
          <span className="truncate">{formatSingleDateLabel(selected ?? undefined)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[130]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Calendar
          mode="single"
          selected={selected ?? undefined}
          defaultMonth={selected ?? undefined}
          onSelect={(next) => {
            if (!next) return;
            onChange(formatLocalIsoDate(next));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function PitchingBulkIncomeDialog({
  open,
  editingRows,
  projectRows,
  signedDate,
  handoverDate,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  editingRows: QuotationIncome[] | null;
  projectRows: QuotationIncome[];
  signedDate?: string;
  handoverDate?: string;
  saving: boolean;
  onClose: () => void;
  onSave: (
    items: Array<{ id?: string; input: QuotationIncomeWriteInput }>,
    deleteIds: string[],
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState<BulkDraft>(() => emptyBulkDraft(projectRows, signedDate, handoverDate));

  const editing = Boolean(editingRows?.length);
  const billedSum = draft.rows.reduce((sum, row) => sum + (parseMoney(row.billedAmount) ?? 0), 0);
  const totalValue = parseMoney(draft.totalAmount);
  const billedMismatch = draft.rows.length > 0
    && Boolean(draft.totalAmount.trim())
    && !billedSumMatchesTotal(draft.totalAmount, draft.rows);

  useEffect(() => {
    if (!open) return;
    setDraft(
      editingRows?.length
        ? bulkDraftFromRows(editingRows, projectRows, signedDate, handoverDate)
        : emptyBulkDraft(projectRows, signedDate, handoverDate),
    );
    // Re-initialize only when the dialog opens so in-progress edits are not reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patchHeader = (
    patch: Partial<Pick<BulkDraft, 'type' | 'totalAmount' | 'dateMode' | 'startDate' | 'endDate' | 'installmentCount'>>,
    options?: { resetInstallments?: boolean },
  ) => {
    setDraft((prev) => rebuildRows(prev, projectRows, patch, options));
  };

  const setCurrency = (currency: SystemCurrency) => {
    setDraft((prev) => {
      if (prev.currency === currency) return prev;
      return {
        ...prev,
        currency,
        totalAmount: convertMoneyInput(prev.totalAmount, prev.currency, currency),
        rows: prev.rows.map((row) => ({
          ...row,
          billedAmount: convertMoneyInput(row.billedAmount, prev.currency, currency),
        })),
      };
    });
  };

  const handleSave = async () => {
    const validationError = validateBulkIncomeInput(draft);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const numbers = draft.rows.map((row) => parseInstallmentNumber(row.installmentNumber));
    const collision = findInstallmentCollision(
      projectRows,
      draft.type,
      numbers,
      draft.rows.flatMap((row) => (row.id ? [row.id] : [])),
    );
    if (collision != null) {
      toast.error(`期數 ${collision} 已存在`);
      return;
    }

    const items = draft.rows.map((row) => {
      const billedAmount = toHkd(parseMoney(row.billedAmount) ?? 0, draft.currency);
      const installmentNumber = parseInstallmentNumber(row.installmentNumber);
      const existing = row.id ? editingRows?.find((item) => item.id === row.id) : undefined;
      const input: QuotationIncomeWriteInput = existing
        ? incomeToWriteInput(existing, {
            type: draft.type,
            currency: draft.currency,
            installmentNumber,
            billedAmount,
            dueDate: row.dueDate || null,
          })
        : {
            type: draft.type,
            currency: draft.currency,
            installmentNumber,
            billedAmount,
            dueDate: row.dueDate || null,
            paymentAmount: 0,
            paymentDate: null,
            paymentMethod: null,
            paymentStatus: null,
            badDebt: 0,
            remarks: null,
          };
      return { id: row.id, input };
    });
    const keptIds = new Set(draft.rows.flatMap((row) => (row.id ? [row.id] : [])));
    const deleteIds = (editingRows ?? []).filter((row) => !keptIds.has(row.id)).map((row) => row.id);
    try {
      await onSave(items, deleteIds);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '儲存失敗');
    }
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={onClose}
      title={editing ? '編輯整項收入' : '新增整項收入'}
      size="xl"
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
            disabled={saving || billedMismatch}
            className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </CrudModalFooter>
      }
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-[14px] font-semibold">整項設定</h3>
          <CurrencyPicker value={draft.currency} onChange={setCurrency} />
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
                    onClick={() => patchHeader({ type }, { resetInstallments: type !== draft.type })}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">總金額 Total</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.totalAmount}
                onChange={(e) => patchHeader({ totalAmount: e.target.value })}
                placeholder="選填"
                className="text-[13px]"
                aria-label="總金額"
              />
              <StoredHkdHint amount={totalValue} currency={draft.currency} />
              <p className="text-[11px] text-muted-foreground mt-1">填寫後平均分配至各期，可再調整各期應收</p>
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">期數數量 Installments *</span>
              <Input
                type="number"
                min="1"
                max={MAX_BULK_INSTALLMENT_COUNT}
                step="1"
                value={draft.installmentCount}
                onChange={(e) => patchHeader({ installmentCount: e.target.value })}
                className="text-[13px]"
                aria-label="期數數量"
              />
            </div>
          </div>

          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">按日期分期 Date distribution</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="按日期分期">
              {BULK_DATE_MODES.map((mode) => {
                const selected = draft.dateMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => patchHeader({ dateMode: mode })}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                      selected
                        ? 'bg-teal-50 border-teal-300 text-teal-800'
                        : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    {BULK_DATE_MODE_LABELS[mode]}
                  </button>
                );
              })}
            </div>
          </div>

          {draft.dateMode === 'even' ? (
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">日期範圍 Date range</span>
              <DateRangePicker
                startDate={draft.startDate}
                endDate={draft.endDate}
                onChange={(startDate, endDate) => patchHeader({ startDate, endDate })}
              />
            </div>
          ) : (
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">開始日期 Start date</span>
              <SingleDatePicker
                date={draft.startDate}
                onChange={(startDate) => patchHeader({ startDate })}
              />
            </div>
          )}
        </section>

        <section className="space-y-3 pt-2 border-t border-border/60">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <h3 className="text-[14px] font-semibold">分期明細</h3>
            <div className="text-right">
              <p className={cn('text-[12px]', billedMismatch ? 'text-rose-700' : 'text-muted-foreground')}>
                應收合計 {formatIncomeMoney(billedSum, draft.currency)}
                {draft.currency !== DEFAULT_CURRENCY ? `（${formatMoney(toHkd(billedSum, draft.currency))}）` : ''}
                {totalValue != null && draft.totalAmount.trim() ? ` ／ 總額 ${formatIncomeMoney(totalValue, draft.currency)}` : ''}
              </p>
              {billedMismatch && (
                <p className="text-[12px] text-rose-700 mt-0.5" role="alert">
                  {BULK_BILLED_TOTAL_MISMATCH}
                </p>
              )}
            </div>
          </div>

          {draft.rows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">請先設定期數數量</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2 w-12">#</th>
                    <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">到期日 Due date *</th>
                    <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">期數 Installment</th>
                    <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">應收金額 Billed *</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((row, index) => (
                    <tr key={row.key} className="border-b border-border/50 last:border-b-0">
                      <td className="px-3 py-2 text-[13px] text-muted-foreground tabular-nums">{index + 1}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={row.dueDate}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              rows: prev.rows.map((item) =>
                                item.key === row.key ? { ...item, dueDate: e.target.value } : item,
                              ),
                            }))
                          }
                          className="text-[13px]"
                          aria-label={`第 ${index + 1} 期到期日`}
                        />
                      </td>
                      <td className="px-3 py-2 text-[13px] tabular-nums">
                        {row.installmentNumber || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.billedAmount}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              rows: prev.rows.map((item) =>
                                item.key === row.key ? { ...item, billedAmount: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="0.00"
                          className="text-[13px]"
                          aria-label={`第 ${index + 1} 期應收金額`}
                        />
                        <StoredHkdHint amount={parseMoney(row.billedAmount)} currency={draft.currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </CrudModal>
  );
}
