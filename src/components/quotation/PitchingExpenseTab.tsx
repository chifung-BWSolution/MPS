import { useEffect, useMemo, useState } from 'react';
import { Banknote, ExternalLink, FileSpreadsheet, Paperclip, Pause, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCreditCards } from '@/hooks/useCreditCards';
import { useQuotationExpenses, type QuotationExpenseWriteInput } from '@/hooks/useQuotationExpenses';
import { useSupplierTypes } from '@/hooks/useSupplierTypes';
import { useWebPageSuppliers } from '@/hooks/useWebPageSuppliers';
import { formatCreditCardOptionLabel } from '@/lib/creditCards';
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_STATUS_LABELS,
  EXPENSE_PAYMENT_STATUS_STYLES,
  formatExpenseDate,
  formatExpenseDateTime,
  formatExpenseMoney,
  formatRecurringSettingDetails,
  groupExpensesByType,
  isExpensePaymentMethod,
  isExpensePaymentStatus,
  isRecurringExpenseFrequency,
  recurringSettingsFromRows,
  summarizeExpenses,
  type ExpenseSourceRelatedType,
  type QuotationExpense,
  type ExpenseTypeGroup,
  type RecurringExpenseSummary,
} from '@/lib/quotationExpenses';
import { PitchingAdsMonthlyExpenses } from '@/components/quotation/PitchingAdsMonthlyExpenses';
import { PitchingBulkExpenseDialog } from '@/components/quotation/PitchingBulkExpenseDialog';
import { ExpenseEditDialog, type ExpenseEditSaveInput } from '@/components/quotation/ExpenseEditDialog';
import { BulkSettlePaymentDialog, SelectionCheckbox } from '@/components/quotation/BulkSettlePaymentDialog';
import { ShopifyBillingImportDialog } from '@/components/quotation/ShopifyBillingImportDialog';
import { isShopifyWebsitePlatform } from '@/lib/shopifyBillingCsv';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import {
  PitchingRecurringExpenseDialog,
  type RecurringExpenseDialogInput,
} from '@/components/quotation/PitchingRecurringExpenseDialog';
import { DeleteConfirmModal } from '@/components/ui/crud-modal';
import { CurrencyBadge } from '@/components/ui/currency-picker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function PitchingExpenseTab({
  relatedType,
  relatedId,
  signedDate,
  handoverDate,
  webandsystemListId,
}: {
  relatedType: ExpenseSourceRelatedType;
  relatedId: string;
  signedDate?: string;
  handoverDate?: string;
  /** Linked `webandsystem_list.id` (client project). Website detail uses `relatedId`. */
  webandsystemListId?: string;
}) {
  const {
    rows,
    loading,
    error,
    addExpense,
    updateExpense,
    deleteExpense,
    saveBulkExpenses,
    settleSelectedExpenses,
    setRecurringExpenseStatus,
    saveGroupRecurring,
  } = useQuotationExpenses(relatedType, relatedId);
  const { cards } = useCreditCards();
  const { types: supplierTypes } = useSupplierTypes();
  const { suppliers } = useWebPageSuppliers();
  const { profiles: websiteProfiles } = useWebsiteProfiles();
  const linkedWebsiteId = relatedType === 'webandsystem' ? relatedId : (webandsystemListId ?? '');
  const canImportShopify = isShopifyWebsitePlatform(
    websiteProfiles.find((profile) => profile.id === linkedWebsiteId)?.platform,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationExpense | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<QuotationExpense | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkEditing, setBulkEditing] = useState<QuotationExpense[] | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleSaving, setSettleSaving] = useState(false);
  const [shopifyImportOpen, setShopifyImportOpen] = useState(false);
  const [shopifyImportSaving, setShopifyImportSaving] = useState(false);
  const [recurringGroup, setRecurringGroup] = useState<ExpenseTypeGroup | null>(null);
  const [recurringSetting, setRecurringSetting] = useState<RecurringExpenseSummary | undefined>();
  const [recurringSaving, setRecurringSaving] = useState(false);

  const summary = useMemo(() => summarizeExpenses(rows), [rows]);
  const groups = useMemo(() => groupExpensesByType(rows), [rows]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const settleCardOptions = useMemo(
    () => cards.filter((card) => card.isActive).map((card) => ({
      value: card.id,
      label: formatCreditCardOptionLabel(card),
    })),
    [cards],
  );

  useEffect(() => {
    const live = new Set(rows.map((row) => row.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => live.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [rows]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (row: QuotationExpense) => {
    setEditing(row);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleSelectedGroup = (ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.includes(id));
      if (allSelected) return prev.filter((id) => !ids.includes(id));
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return [...next];
    });
  };

  const toggleSelectedAll = () => {
    setSelectedIds((prev) => (prev.length === rows.length ? [] : rows.map((row) => row.id)));
  };

  const handleSettle = async (input: {
    paymentMethod: string;
    paymentStatus: string;
    creditCardId: string;
    file: File | null;
  }) => {
    if (!isExpensePaymentMethod(input.paymentMethod) || !isExpensePaymentStatus(input.paymentStatus)) {
      toast.error('請選擇付款方式與付款狀態');
      return;
    }
    const ids = selectedIds;
    setSettleSaving(true);
    const result = await settleSelectedExpenses({
      ids,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      creditCardId: input.creditCardId,
      file: input.file,
    });
    setSettleSaving(false);
    if (result.data?.length) {
      const done = new Set(result.data.map((row) => row.id));
      setSelectedIds((prev) => prev.filter((id) => !done.has(id)));
    }
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`已完成 ${result.data?.length ?? ids.length} 筆付款`);
    setSettleOpen(false);
  };

  const handleAdsMonthlyAdd = async (input: QuotationExpenseWriteInput) => {
    const result = await addExpense(input);
    if (result.error) {
      toast.error(`新增失敗：${result.error.message}`);
      return result;
    }
    toast.success('已加入廣告支出');
    return result;
  };

  const handleShopifyImport = async (
    items: Array<{ input: QuotationExpenseWriteInput }>,
  ) => {
    setShopifyImportSaving(true);
    const result = await saveBulkExpenses(items, []);
    setShopifyImportSaving(false);
    if (result.error) {
      toast.error(`匯入失敗：${result.error.message}`);
      throw new Error(result.error.message);
    }
    toast.success(`已匯入 ${result.data?.length ?? items.length} 筆 Shopify 支出`);
    setShopifyImportOpen(false);
  };

  const handleSave = async (payload: ExpenseEditSaveInput) => {
    const frequency = isRecurringExpenseFrequency(payload.frequency) ? payload.frequency : null;
    setSaving(true);
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
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[12px] text-muted-foreground">共 {rows.length} 筆</span>
          {rows.length > 0 && (
            <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <SelectionCheckbox
                checked={selectedIds.length === rows.length}
                indeterminate={selectedIds.length > 0 && selectedIds.length < rows.length}
                onChange={toggleSelectedAll}
                label="全選支出"
              />
              全選
            </label>
          )}
          {selectedIds.length > 0 && (
            <>
              <span className="text-[12px] text-muted-foreground">已選 {selectedIds.length} 筆</span>
              <button
                type="button"
                onClick={() => setSettleOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
              >
                批量完成付款
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canImportShopify && (
            <button
              type="button"
              onClick={() => setShopifyImportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-border text-foreground bg-white rounded-md text-[13px] font-medium hover:bg-muted/40 transition-colors active:scale-[0.97]"
            >
              <FileSpreadsheet size={14} /> 匯入 Shopify 帳單
            </button>
          )}
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
          <p className="text-[12px] text-muted-foreground/70 mt-1">
            {canImportShopify
              ? '可記錄分期應付、實付、未付與壞帳，或匯入 Shopify 帳單 CSV'
              : '可記錄分期應付、實付、未付與壞帳'}
          </p>
          {canImportShopify && (
            <button
              type="button"
              onClick={() => setShopifyImportOpen(true)}
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-[12px] font-medium text-teal-700 hover:bg-teal-50 rounded-md"
            >
              <FileSpreadsheet size={12} /> 匯入 Shopify 帳單
            </button>
          )}
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
                      <th className="w-10 px-3 py-3">
                        <SelectionCheckbox
                          checked={group.rows.every((row) => selectedIdSet.has(row.id))}
                          indeterminate={
                            group.rows.some((row) => selectedIdSet.has(row.id))
                            && !group.rows.every((row) => selectedIdSet.has(row.id))
                          }
                          onChange={() => toggleSelectedGroup(group.rows.map((row) => row.id))}
                          label={`選擇 ${group.supplierLabel}`}
                        />
                      </th>
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
                      <tr
                        key={row.id}
                        className={cn(
                          'border-b border-border/50 last:border-b-0 hover:bg-muted/20',
                          selectedIdSet.has(row.id) && 'bg-teal-50/70',
                        )}
                      >
                        <td className="px-3 py-3">
                          <SelectionCheckbox
                            checked={selectedIdSet.has(row.id)}
                            onChange={() => toggleSelected(row.id)}
                            label={`選擇 ${group.supplierLabel} 第 ${row.installmentNumber ?? '—'} 期`}
                          />
                        </td>
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

      {relatedType === 'quotation_client' && linkedWebsiteId.trim() && (
        <PitchingAdsMonthlyExpenses
          key={linkedWebsiteId.trim()}
          websiteId={linkedWebsiteId.trim()}
          expenses={rows}
          expensesLoading={loading}
          supplierTypes={supplierTypes}
          suppliers={suppliers}
          onAdd={handleAdsMonthlyAdd}
        />
      )}

      <ExpenseEditDialog
        open={modalOpen}
        expense={editing}
        siblingRows={rows}
        supplierTypes={supplierTypes}
        suppliers={suppliers}
        cards={cards}
        saving={saving}
        onClose={closeModal}
        onSave={(payload) => void handleSave(payload)}
        onRecurringStatus={(status) => void handleRecurringStatus(status)}
      />

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

      <BulkSettlePaymentDialog
        open={settleOpen}
        kind="expense"
        count={selectedIds.length}
        saving={settleSaving}
        creditCardOptions={settleCardOptions}
        onClose={() => {
          if (!settleSaving) setSettleOpen(false);
        }}
        onSubmit={(input) => void handleSettle(input)}
      />

      {canImportShopify && (
        <ShopifyBillingImportDialog
          open={shopifyImportOpen}
          existingRows={rows}
          supplierTypes={supplierTypes}
          suppliers={suppliers}
          cards={cards}
          saving={shopifyImportSaving}
          onClose={() => setShopifyImportOpen(false)}
          onSave={handleShopifyImport}
        />
      )}

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
