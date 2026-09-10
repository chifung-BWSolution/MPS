import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PITCHING_CURRENCY,
  pitchingStatusConfig,
  type PitchingExpenseItem,
  type PitchingRecord,
  type PitchingStatus,
} from '@/data/pitchingData';
import {
  hasQualifyingQuotationDoc,
  missingConfirmedFields,
  missingFollowingUpFields,
} from '@/lib/clientProjectStatus';
import { isQuotationListDocType, validateQuotationDocDates } from '@/lib/quotationDocs';
import { useQuotationDocs } from '@/hooks/useQuotationDocs';
import { useQuotationDocTypes } from '@/hooks/useQuotationDocTypes';
import {
  QuotationDocFormDialog,
  emptyQuotationDocFormDraft,
  type QuotationDocFormDraft,
} from '@/components/quotation/QuotationDocFormDialog';
import type { QuotationClientProjectUpdate } from '@/hooks/useQuotationClientProjects';

function nextExpenseId() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function PitchingStatusConversionModal({
  record,
  target,
  saving,
  onClose,
  onConfirm,
}: {
  record: PitchingRecord;
  target: PitchingStatus;
  saving: boolean;
  onClose: () => void;
  onConfirm: (patch: QuotationClientProjectUpdate) => Promise<boolean>;
}) {
  const isConfirmed = target === 'confirmed';
  const { rows: docs, loading: docsLoading, addDoc } = useQuotationDocs(isConfirmed ? record.id : undefined);
  const { types } = useQuotationDocTypes();
  const listTypes = useMemo(
    () => types.filter((type) => isQuotationListDocType(type.id)),
    [types],
  );

  const [incomeDraft, setIncomeDraft] = useState(
    record.estimatedIncome != null ? String(record.estimatedIncome) : '',
  );
  const [expenses, setExpenses] = useState<PitchingExpenseItem[]>(record.estimatedExpenses ?? []);
  const [expenseDraft, setExpenseDraft] = useState({ name: '', amount: '', notes: '' });
  const [signedDate, setSignedDate] = useState(record.signedDate ?? '');
  const [handoverDate, setHandoverDate] = useState(record.handoverDate ?? '');
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docDraft, setDocDraft] = useState<QuotationDocFormDraft>(() => ({
    ...emptyQuotationDocFormDraft(),
    projectId: record.id,
    docTypeId: listTypes[0]?.id ?? '',
  }));
  const [docSaving, setDocSaving] = useState(false);

  const qualifyingDocs = docs.filter((doc) => isQuotationListDocType(doc.docTypeId));
  const parsedIncome = incomeDraft.trim() === '' ? undefined : Number(incomeDraft);
  const draftRecord = {
    estimatedIncome: parsedIncome,
    estimatedExpenses: expenses,
    signedDate,
    handoverDate,
  };

  const addExpense = () => {
    const amount = parseFloat(expenseDraft.amount);
    if (!expenseDraft.name.trim() || !Number.isFinite(amount) || amount < 0) {
      toast.error('請填寫費用名稱與有效金額');
      return;
    }
    setExpenses((prev) => [
      ...prev,
      {
        id: nextExpenseId(),
        name: expenseDraft.name.trim(),
        amount,
        currency: PITCHING_CURRENCY,
        notes: expenseDraft.notes.trim() || undefined,
      },
    ]);
    setExpenseDraft({ name: '', amount: '', notes: '' });
  };

  const openDocDialog = () => {
    setDocDraft({
      ...emptyQuotationDocFormDraft(),
      projectId: record.id,
      docTypeId: listTypes[0]?.id ?? '',
    });
    setDocDialogOpen(true);
  };

  const handleDocSave = async () => {
    const docTypeId = docDraft.docTypeId.trim();
    if (!docTypeId) {
      toast.error('請選擇文件類型');
      return;
    }
    if (!docDraft.file) {
      toast.error('請選擇檔案');
      return;
    }
    const dateError = validateQuotationDocDates(docDraft.documentDate, docDraft.expiryDate);
    if (dateError) {
      toast.error(dateError);
      return;
    }
    setDocSaving(true);
    const { error } = await addDoc({
      docTypeId,
      fileName: docDraft.file.name,
      fileUrl: '',
      storagePath: '',
      documentDate: docDraft.documentDate,
      expiryDate: docDraft.expiryDate,
      file: docDraft.file,
    });
    setDocSaving(false);
    if (error) {
      toast.error(`上傳失敗：${error.message}`);
      return;
    }
    toast.success('已上傳文件');
    setDocDialogOpen(false);
  };

  const handleConfirm = async () => {
    if (isConfirmed) {
      const missing = missingConfirmedFields(draftRecord, docs);
      if (missing.includes('estimated_income')) {
        toast.error('請填寫預計收入');
        return;
      }
      if (missing.includes('estimated_expenses')) {
        toast.error('請至少新增一筆預計支出');
        return;
      }
      if (missing.includes('signed_date')) {
        toast.error('請選擇簽約日期');
        return;
      }
      if (missing.includes('handover_date')) {
        toast.error('請選擇交付日期');
        return;
      }
      if (missing.includes('quotation_doc') || !hasQualifyingQuotationDoc(docs)) {
        toast.error('請上傳至少一份報價單或已簽署報價單／合約');
        return;
      }
      const ok = await onConfirm({
        status: target,
        estimatedIncome: parsedIncome,
        estimatedExpenses: expenses,
        signedDate,
        handoverDate,
      });
      if (ok) onClose();
      return;
    }

    const missing = missingFollowingUpFields(draftRecord);
    if (missing.includes('estimated_income')) {
      toast.error('請填寫預計收入');
      return;
    }
    if (missing.includes('estimated_expenses')) {
      toast.error('請至少新增一筆預計支出');
      return;
    }
    const ok = await onConfirm({
      status: target,
      estimatedIncome: parsedIncome,
      estimatedExpenses: expenses,
    });
    if (ok) onClose();
  };

  const title = `轉為${pitchingStatusConfig[target].label}`;
  const showBudget = !isConfirmed || missingFollowingUpFields(record).length > 0;

  return (
    <>
      <CrudModal
        isOpen
        onClose={onClose}
        title={title}
        size={isConfirmed ? 'lg' : 'md'}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button
              type="button"
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={saving || (isConfirmed && docsLoading)}
              onClick={() => void handleConfirm()}
            >
              {saving ? '儲存中…' : '確認轉換'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <p className="text-[13px] text-muted-foreground">
            {isConfirmed
              ? '確認項目前請補齊預計收支、簽約／交付日期，以及至少一份報價單或已簽署報價單／合約。'
              : '跟進中前請補齊預計收入與至少一筆預計支出。'}
          </p>

          {showBudget && (
            <div className="space-y-4">
              <div>
                <Label className="text-[12px]">預計收入（{PITCHING_CURRENCY}）*</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={incomeDraft}
                  onChange={(e) => setIncomeDraft(e.target.value)}
                  placeholder="20000"
                  className="mt-1 h-9 text-[13px]"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[12px]">預計支出 *</Label>
                {expenses.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">尚無費用項目，請新增至少一筆。</p>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate">{item.name}</p>
                          {item.notes && (
                            <p className="text-[11px] text-muted-foreground truncate">{item.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[13px] tabular-nums">
                            ${item.amount.toLocaleString('en-US')} {PITCHING_CURRENCY}
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpenses((prev) => prev.filter((row) => row.id !== item.id))}
                            className="p-1 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600"
                            title="刪除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr_auto] gap-2">
                  <Input
                    value={expenseDraft.name}
                    onChange={(e) => setExpenseDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="費用名稱"
                    className="h-9 text-[13px]"
                    disabled={saving}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={expenseDraft.amount}
                    onChange={(e) => setExpenseDraft((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="金額"
                    className="h-9 text-[13px]"
                    disabled={saving}
                  />
                  <Input
                    value={expenseDraft.notes}
                    onChange={(e) => setExpenseDraft((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="備註（選填）"
                    className="h-9 text-[13px]"
                    disabled={saving}
                  />
                  <Button type="button" variant="secondary" className="h-9 gap-1" onClick={addExpense} disabled={saving}>
                    <Plus size={13} /> 新增
                  </Button>
                </div>
              </div>
            </div>
          )}

          {isConfirmed && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12px]">簽約日期 *</Label>
                  <Input
                    type="date"
                    value={signedDate}
                    onChange={(e) => setSignedDate(e.target.value)}
                    className="mt-1 h-9 text-[13px]"
                    disabled={saving}
                  />
                </div>
                <div>
                  <Label className="text-[12px]">交付日期 *</Label>
                  <Input
                    type="date"
                    value={handoverDate}
                    onChange={(e) => setHandoverDate(e.target.value)}
                    className="mt-1 h-9 text-[13px]"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[12px]">報價單 / 已簽署報價單／合約 *</Label>
                {docsLoading ? (
                  <p className="text-[12px] text-muted-foreground">載入文件中…</p>
                ) : qualifyingDocs.length > 0 ? (
                  <ul className="space-y-1.5">
                    {qualifyingDocs.map((doc) => (
                      <li
                        key={doc.id}
                        className="text-[13px] rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800"
                      >
                        {doc.docTypeDisplay || '文件'} · {doc.fileName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    尚未有符合的報價文件，請先上傳一份報價單或已簽署報價單／合約。
                  </p>
                )}
                <Button type="button" variant="secondary" className="h-9" onClick={openDocDialog} disabled={saving}>
                  上傳文件
                </Button>
              </div>
            </div>
          )}
        </div>
      </CrudModal>

      {isConfirmed && (
        <QuotationDocFormDialog
          isOpen={docDialogOpen}
          onClose={() => setDocDialogOpen(false)}
          editing={null}
          draft={docDraft}
          onDraftChange={setDocDraft}
          types={listTypes}
          saving={docSaving}
          onSave={() => void handleDocSave()}
        />
      )}
    </>
  );
}
