import { useMemo, useState } from 'react';
import { ExternalLink, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuotationIncomes } from '@/hooks/useQuotationIncomes';
import {
  INCOME_PAYMENT_METHOD_LABELS,
  INCOME_PAYMENT_METHODS,
  INCOME_PAYMENT_STATUS_LABELS,
  INCOME_PAYMENT_STATUS_STYLES,
  INCOME_PAYMENT_STATUSES,
  INCOME_TYPE_PRESETS,
  DEFAULT_INCOME_TYPE,
  computeOutstanding,
  formatIncomeDate,
  formatIncomeDateTime,
  formatIncomeMoney,
  formatPaymentRecordFileSize,
  INCOME_PAYMENT_RECORD_MAX_SIZE_MB,
  nextInstallmentNumber,
  parseInstallmentNumber,
  parseMoney,
  summarizeIncomes,
  validateIncomeInput,
  type IncomePaymentMethod,
  type IncomePaymentStatus,
  type QuotationIncome,
} from '@/lib/quotationIncomes';
import { CrudModal, CrudModalFooter, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Draft = {
  type: string;
  installmentNumber: string;
  billedAmount: string;
  dueDate: string;
  paymentAmount: string;
  paymentMethod: string;
  paymentStatus: IncomePaymentStatus | '';
  badDebt: string;
  remarks: string;
};

const emptyDraft = (nextInstallment = 1, type = DEFAULT_INCOME_TYPE): Draft => ({
  type,
  installmentNumber: String(nextInstallment),
  billedAmount: '',
  dueDate: '',
  paymentAmount: '',
  paymentMethod: '',
  paymentStatus: '',
  badDebt: '',
  remarks: '',
});

function draftFromRow(row: QuotationIncome): Draft {
  return {
    type: row.type,
    installmentNumber: row.installmentNumber != null ? String(row.installmentNumber) : '',
    billedAmount: String(row.billedAmount),
    dueDate: row.dueDate ?? '',
    paymentAmount: String(row.paymentAmount),
    paymentMethod: row.paymentMethod ?? '',
    paymentStatus: row.paymentStatus ?? '',
    badDebt: String(row.badDebt),
    remarks: row.remarks ?? '',
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

export function PitchingIncomeTab({ projectId }: { projectId: string }) {
  const { rows, loading, error, addIncome, updateIncome, deleteIncome } = useQuotationIncomes(projectId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationIncome | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<QuotationIncome | null>(null);
  const [paymentRecordFile, setPaymentRecordFile] = useState<File | null>(null);
  const [clearPaymentRecord, setClearPaymentRecord] = useState(false);

  const summary = useMemo(() => summarizeIncomes(rows), [rows]);
  const outstandingPreview = computeOutstanding(
    parseMoney(draft.billedAmount) ?? 0,
    parseMoney(draft.paymentAmount) ?? 0,
    parseMoney(draft.badDebt) ?? 0,
  );

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft(nextInstallmentNumber(rows, DEFAULT_INCOME_TYPE), DEFAULT_INCOME_TYPE));
    setPaymentRecordFile(null);
    setClearPaymentRecord(false);
    setModalOpen(true);
  };

  const openEdit = (row: QuotationIncome) => {
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

  const handleSave = async () => {
    const validationError = validateIncomeInput(draft);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const billedAmount = parseMoney(draft.billedAmount);
    const paymentAmount = parseMoney(draft.paymentAmount);
    const badDebt = parseMoney(draft.badDebt);
    if (billedAmount == null || paymentAmount == null || badDebt == null) return;

    setSaving(true);
    const payload = {
      type: draft.type.trim(),
      installmentNumber: parseInstallmentNumber(draft.installmentNumber),
      billedAmount,
      dueDate: draft.dueDate || null,
      paymentAmount,
      paymentMethod: (draft.paymentMethod || null) as IncomePaymentMethod | null,
      paymentStatus: draft.paymentStatus || null,
      badDebt,
      remarks: draft.remarks.trim() || null,
      file: paymentRecordFile,
      paymentRecordAction: clearPaymentRecord && !paymentRecordFile ? 'clear' : undefined,
    };
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
        <span className="text-[12px] text-muted-foreground">共 {rows.length} 筆</span>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
        >
          <Plus size={14} /> 新增單項收入
        </button>
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
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類型</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">期數</th>
                  <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">應收</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">到期日</th>
                  <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">實收</th>
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
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 text-[13px] font-medium whitespace-nowrap">
                      {row.type}
                      {row.remarks && (
                        <p className="text-[11px] text-muted-foreground font-normal truncate max-w-[160px] mt-0.5">
                          {row.remarks}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] tabular-nums">{row.installmentNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                      {formatIncomeMoney(row.billedAmount)}
                    </td>
                    <td className="px-4 py-3 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">
                      {formatIncomeDate(row.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-[13px] tabular-nums text-right whitespace-nowrap">
                      {formatIncomeMoney(row.paymentAmount)}
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
        </div>
      )}

      <CrudModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? '編輯收入' : '新增單項收入'}
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
        <div className="space-y-4">
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
                        installmentNumber: editing
                          ? prev.installmentNumber
                          : String(nextInstallmentNumber(rows, type)),
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">期數 Installment</span>
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
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">到期日 Due date</span>
              <Input
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="text-[13px]"
                aria-label="到期日"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            </div>
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
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">壞帳 Bad debt</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.badDebt}
                onChange={(e) => setDraft((prev) => ({ ...prev, badDebt: e.target.value }))}
                placeholder="0.00"
                className="text-[13px]"
                aria-label="壞帳"
              />
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">未收 Outstanding（應收 − 實收 − 壞帳）</span>
            <span className="text-[14px] font-semibold tabular-nums">{formatIncomeMoney(outstandingPreview)}</span>
          </div>

          <div>
            <span className="text-[12px] text-muted-foreground block mb-1.5">收款方式 Payment method</span>
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
            <span className="text-[12px] text-muted-foreground block mb-1.5">收款狀態 Payment status</span>
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
                : editing?.paymentRecordFileUrl && !clearPaymentRecord
                  ? `目前：${editing.paymentRecordFileName || '已上傳檔案'}`
                  : `支援 PDF、圖片、Word、Excel，上限 ${INCOME_PAYMENT_RECORD_MAX_SIZE_MB}MB`}
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
        </div>
      </CrudModal>

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
