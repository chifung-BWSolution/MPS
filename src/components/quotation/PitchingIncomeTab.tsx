import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Paperclip, Pencil, Plus, Receipt, ScrollText, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuotationIncomes } from '@/hooks/useQuotationIncomes';
import {
  INCOME_PAYMENT_METHOD_LABELS,
  INCOME_PAYMENT_STATUS_LABELS,
  INCOME_PAYMENT_STATUS_STYLES,
  formatIncomeDate,
  formatIncomeDateTime,
  formatIncomeMoney,
  isIncomePaymentMethod,
  isIncomePaymentStatus,
  groupIncomesByType,
  summarizeIncomes,
  type QuotationIncome,
} from '@/lib/quotationIncomes';
import { PitchingBulkIncomeDialog } from '@/components/quotation/PitchingBulkIncomeDialog';
import { IncomeEditDialog, type IncomeEditSaveInput } from '@/components/quotation/IncomeEditDialog';
import { BulkSettlePaymentDialog, SelectionCheckbox } from '@/components/quotation/BulkSettlePaymentDialog';
import { useDocumentExistence } from '@/hooks/useInvoiceReceipts';
import { documentExistsColor } from '@/lib/invoiceReceipts';
import { openInvoiceReceiptEditor, type InvoiceReceiptDocKind, type QuotationClientPage } from '@/lib/quotationProjectNavigation';
import { DeleteConfirmModal } from '@/components/ui/crud-modal';
import { CurrencyBadge } from '@/components/ui/currency-picker';

export function PitchingIncomeTab({
  projectId,
  page = 'pitching',
  signedDate,
  handoverDate,
  onOpenDocument,
}: {
  projectId: string;
  page?: QuotationClientPage;
  signedDate?: string;
  handoverDate?: string;
  onOpenDocument?: (kind: InvoiceReceiptDocKind, incomeId: string) => void;
}) {
  const { rows, loading, error, addIncome, updateIncome, deleteIncome, saveBulkIncomes, settleSelectedIncomes } = useQuotationIncomes(projectId);
  const { invoiceIds, receiptIds } = useDocumentExistence(rows.map((row) => row.id));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationIncome | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<QuotationIncome | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkEditing, setBulkEditing] = useState<QuotationIncome[] | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleSaving, setSettleSaving] = useState(false);

  const summary = useMemo(() => summarizeIncomes(rows), [rows]);
  const groups = useMemo(() => groupIncomesByType(rows), [rows]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const live = new Set(rows.map((row) => row.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => live.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [rows]);
  const openDocument = (kind: InvoiceReceiptDocKind, incomeId: string) => {
    if (onOpenDocument) {
      onOpenDocument(kind, incomeId);
      return;
    }
    openInvoiceReceiptEditor(projectId, page, kind, incomeId);
  };

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (row: QuotationIncome) => {
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

  const openBulkEdit = (groupRows: QuotationIncome[]) => {
    setBulkEditing(groupRows);
    setBulkOpen(true);
  };

  const closeBulk = () => {
    setBulkOpen(false);
    setBulkEditing(null);
  };

  const handleBulkSave = async (
    items: Parameters<typeof saveBulkIncomes>[0],
    deleteIds: string[],
  ) => {
    setBulkSaving(true);
    const result = await saveBulkIncomes(items, deleteIds);
    setBulkSaving(false);
    if (result.error) {
      toast.error(`${bulkEditing?.length ? '更新' : '新增'}失敗：${result.error.message}`);
      return;
    }
    toast.success(bulkEditing?.length ? '已更新整項收入' : '已新增整項收入');
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
    file: File | null;
  }) => {
    if (!isIncomePaymentMethod(input.paymentMethod) || !isIncomePaymentStatus(input.paymentStatus)) {
      toast.error('請選擇收款方式與收款狀態');
      return;
    }
    const ids = selectedIds;
    setSettleSaving(true);
    const result = await settleSelectedIncomes({
      ids,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
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
    toast.success(`已完成 ${result.data?.length ?? ids.length} 筆收款`);
    setSettleOpen(false);
  };

  const handleSave = async (payload: IncomeEditSaveInput) => {
    setSaving(true);
    const result = editing
      ? await updateIncome(editing.id, payload)
      : await addIncome(payload);
    setSaving(false);
    if (result.error) {
      toast.error(`${editing ? '更新' : '新增'}失敗：${result.error.message}`);
      return;
    }
    toast.success(editing ? '已更新收入' : '已新增收入');
    closeModal();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error: delErr } = await deleteIncome(deleting.id);
    if (delErr) {
      toast.error(`刪除失敗：${delErr.message}`);
      return;
    }
    toast.success('已刪除收入');
    setDeleting(null);
  };

  const deleteLabel = deleting
    ? `${deleting.type}${deleting.installmentNumber != null ? ` #${deleting.installmentNumber}` : ''}`
    : '收入';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard label="應收合計" value={formatIncomeMoney(summary.billed)} />
        <SummaryCard label="實收合計" value={formatIncomeMoney(summary.received)} />
        <SummaryCard label="未收合計" value={formatIncomeMoney(summary.outstanding)} accent="text-amber-700" />
        <SummaryCard label="壞帳合計" value={formatIncomeMoney(summary.badDebt)} accent="text-rose-700" />
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
                label="全選收入"
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
                批量完成收款
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openBulkCreate}
            className="flex items-center gap-1.5 px-3 py-2 border border-teal-200 text-teal-700 bg-teal-50 rounded-md text-[13px] font-medium hover:bg-teal-100 transition-colors active:scale-[0.97]"
          >
            <Plus size={14} /> 新增整項收入
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
          >
            <Plus size={14} /> 新增單項收入
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          無法載入收入：{error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-10 text-center text-[13px] text-muted-foreground">
          載入收入中…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
          <Wallet size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">尚未新增收入</p>
          <p className="text-[12px] text-muted-foreground/70 mt-1">可記錄分期應收、實收、未收與壞帳</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <section
              key={group.type}
              className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden"
            >
              <header className="flex items-center justify-between gap-4 flex-wrap px-4 py-3 bg-muted/30 border-b border-border">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold">{group.type}</h3>
                    <button
                      type="button"
                      onClick={() => openBulkEdit(group.rows)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium text-teal-700 hover:bg-teal-50 transition-colors"
                      aria-label={`編輯整項 ${group.type}`}
                    >
                      <Pencil size={12} /> 編輯整項
                    </button>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{group.rows.length} 筆</p>
                </div>
                <div className="flex items-end gap-4 sm:gap-6">
                  <SectionSum label="應收合計" value={formatIncomeMoney(group.summary.billed)} />
                  <SectionSum label="實收合計" value={formatIncomeMoney(group.summary.received)} />
                  <SectionSum
                    label="未收合計"
                    value={formatIncomeMoney(group.summary.outstanding)}
                    accent="text-amber-700"
                  />
                  <SectionSum
                    label="壞帳合計"
                    value={formatIncomeMoney(group.summary.badDebt)}
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
                          label={`選擇 ${group.type}`}
                        />
                      </th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">期數</th>
                      <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">應收</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">到期日</th>
                      <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">實收</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">收款日期</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">收款方式</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">收款紀錄</th>
                      <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                      <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">未收</th>
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
                            label={`選擇 ${group.type} 第 ${row.installmentNumber ?? '—'} 期`}
                          />
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums">
                          {row.installmentNumber ?? '—'}
                          {row.remarks && (
                            <p className="text-[11px] text-muted-foreground font-normal truncate max-w-[160px] mt-0.5">
                              {row.remarks}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                          {formatIncomeMoney(row.billedAmount)}
                          <CurrencyBadge currency={row.currency} />
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatIncomeDate(row.dueDate)}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                          {formatIncomeMoney(row.paymentAmount)}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatIncomeDate(row.paymentDate)}
                        </td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                          {row.paymentMethod ? INCOME_PAYMENT_METHOD_LABELS[row.paymentMethod] : '—'}
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
                              <span className="truncate">{row.paymentRecordFileName || '收款紀錄'}</span>
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
                                INCOME_PAYMENT_STATUS_STYLES[row.paymentStatus],
                              )}
                            >
                              {INCOME_PAYMENT_STATUS_LABELS[row.paymentStatus]}
                            </span>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                          {formatIncomeMoney(row.outstanding)}
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                          {formatIncomeMoney(row.badDebt)}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">
                          <div>{formatIncomeDateTime(row.createdAt)}</div>
                          <div>{formatIncomeDateTime(row.updatedAt)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openDocument('invoice', row.id)}
                              className={cn(
                                'p-1.5 rounded-md hover:bg-blue-50 transition-colors',
                                documentExistsColor(invoiceIds.has(row.id), 'invoice'),
                              )}
                              aria-label={invoiceIds.has(row.id) ? `編輯發票 ${row.type}` : `建立發票 ${row.type}`}
                              title={invoiceIds.has(row.id) ? '編輯發票' : '建立發票'}
                            >
                              <ScrollText size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDocument('receipt', row.id)}
                              className={cn(
                                'p-1.5 rounded-md hover:bg-teal-50 transition-colors',
                                documentExistsColor(receiptIds.has(row.id), 'receipt'),
                              )}
                              aria-label={receiptIds.has(row.id) ? `編輯收據 ${row.type}` : `建立收據 ${row.type}`}
                              title={receiptIds.has(row.id) ? '編輯收據' : '建立收據'}
                            >
                              <Receipt size={13} />
                            </button>
                            {row.paymentRecordFileUrl ? (
                              <a
                                href={row.paymentRecordFileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-md text-muted-foreground hover:bg-teal-50 hover:text-teal-700 transition-colors"
                                aria-label={`查看附件 ${row.paymentRecordFileName || row.type}`}
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
                              aria-label={`編輯 ${row.type}`}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(row)}
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              aria-label={`刪除 ${row.type}`}
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
          ))}
        </div>
      )}

      <IncomeEditDialog
        key={modalOpen ? editing?.id ?? 'create' : 'closed'}
        open={modalOpen}
        income={editing}
        siblingRows={rows}
        saving={saving}
        onClose={closeModal}
        onSave={(payload) => void handleSave(payload)}
      />

      <PitchingBulkIncomeDialog
        open={bulkOpen}
        editingRows={bulkEditing}
        projectRows={rows}
        signedDate={signedDate}
        handoverDate={handoverDate}
        saving={bulkSaving}
        onClose={closeBulk}
        onSave={handleBulkSave}
      />

      <BulkSettlePaymentDialog
        open={settleOpen}
        kind="income"
        count={selectedIds.length}
        saving={settleSaving}
        onClose={() => {
          if (!settleSaving) setSettleOpen(false);
        }}
        onSubmit={(input) => void handleSettle(input)}
      />

      <DeleteConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        itemName={deleteLabel}
        canDelete
        description={`確定要刪除「${deleteLabel}」這筆收入嗎？`}
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
