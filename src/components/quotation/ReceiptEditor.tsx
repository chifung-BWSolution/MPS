import { createElement, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  DocumentPreviewModal,
  DocumentSummaryCard,
  EditorCard,
  FieldLabel,
  InvoiceReceiptEditorShell,
  editorInputClass,
  formatSummaryDate,
} from '@/components/quotation/InvoiceReceiptEditorShell';
import { CompanySelectField, PdfBrandingFields } from '@/components/quotation/PdfBrandingFields';
import { AddLineItemButton, DocumentLineItemsTable, addEmptyLine } from '@/components/quotation/DocumentLineItemsTable';
import { ReceiptPDFDocument } from '@/components/quotation/ReceiptPDFDocument';
import { useApp } from '@/context/AppContext';
import { createReceipt, updateReceipt, useReceiptEditor } from '@/hooks/useInvoiceReceipts';
import {
  RECEIPT_PAYMENT_METHODS,
  RECEIPT_PAYMENT_METHOD_LABELS,
  canViewDocumentMoney,
  formatDocumentMoney,
  invoiceSubTotal,
  isReceiptPaymentMethod,
  receiptFilename,
  receiptNetTotal,
} from '@/lib/invoiceReceipts';
import { applyPrimaryCompanyChange } from '@/lib/pdfBranding';
import { downloadPdfBlob, openPdfPreview, pdfBlobFromDocument } from '@/lib/invoiceReceiptPdf';

export function ReceiptEditor({
  incomeId,
  onBack,
}: {
  incomeId: string;
  onBack: () => void;
}) {
  const { user } = useApp();
  const canViewMoney = canViewDocumentMoney(user.role);
  const { state, setState, loading, error, refresh } = useReceiptEditor(incomeId);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const totals = useMemo(() => {
    if (!state) return null;
    const subTotal = invoiceSubTotal(state.lines);
    const net = receiptNetTotal(
      state.form.amountReceived,
      state.lines,
      state.form.enablePriceDifference,
      state.form.priceDifference,
    );
    const diff = state.form.enablePriceDifference ? state.form.priceDifference : 0;
    return { subTotal, net, diff };
  }, [state]);

  if (loading) {
    return <p className="text-[13px] text-muted-foreground py-10">載入收據中…</p>;
  }
  if (error || !state || !totals) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-rose-600">{error ?? '無法載入收據'}</p>
        <button type="button" className="text-[13px] text-teal-700" onClick={onBack}>返回</button>
      </div>
    );
  }

  const patchForm = (updates: Partial<typeof state.form>) => {
    setState({ ...state, form: { ...state.form, ...updates } });
  };

  const primaryCompany = state.companies.find((c) => c.id === state.form.companyId) ?? null;

  const changeCompany = (companyId: string | null) => {
    const next = state.companies.find((c) => c.id === companyId) ?? null;
    patchForm({
      companyId,
      pdfBranding: applyPrimaryCompanyChange(state.form.pdfBranding, state.form.companyId, next),
    });
  };

  const persist = async () => {
    setSaving(true);
    const result = state.saved
      ? await updateReceipt(state.saved.id, incomeId, state.form, state.lines)
      : await createReceipt(incomeId, state.form, state.lines);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? '儲存失敗');
      return false;
    }
    toast.success('收據已儲存');
    await refresh();
    return true;
  };

  const buildPdf = () =>
    createElement(ReceiptPDFDocument, {
      form: state.form,
      lines: state.lines,
      company: primaryCompany,
      subItemsTotal: totals.subTotal,
      netTotal: totals.net,
      canViewFinancialValues: canViewMoney,
      branding: state.form.pdfBranding,
    });

  const handlePreview = async () => {
    try {
      const blob = await pdfBlobFromDocument(buildPdf());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(openPdfPreview(blob));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '預覽失敗');
    }
  };

  const downloadOnly = async () => {
    try {
      const blob = await pdfBlobFromDocument(buildPdf());
      downloadPdfBlob(blob, receiptFilename(state.form.receiptNo, state.form.receivedFromName));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '下載失敗');
    }
  };

  const handleDownload = async () => {
    const saved = await persist();
    if (!saved) return;
    await downloadOnly();
  };

  const summaryRows = [
    { label: '收到金額 Amount Received', value: formatDocumentMoney(state.form.amountReceived) },
    ...(totals.subTotal ? [{ label: '附加項目 Sub Items', value: formatDocumentMoney(totals.subTotal) }] : []),
    ...(state.form.enablePriceDifference
      ? [{ label: '差額 Diff', value: formatDocumentMoney(totals.diff), danger: true }]
      : []),
  ];

  return (
    <>
      <InvoiceReceiptEditorShell
        title={state.saved ? '編輯收據' : '建立收據'}
        documentNo={state.form.receiptNo}
        kind="receipt"
        income={state.income}
        saving={saving}
        onBack={onBack}
        onPreview={() => void handlePreview()}
        onDownload={() => void handleDownload()}
        onSave={() => void persist()}
        form={(
          <>
            <EditorCard title="收據基本資料" subtitle="Basic Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>收據編號 Receipt #</FieldLabel>
                  <Input className={editorInputClass} value={state.form.receiptNo} onChange={(e) => patchForm({ receiptNo: e.target.value })} />
                </div>
                <CompanySelectField companies={state.companies} value={state.form.companyId} onChange={changeCompany} label="成本中心 BU" />
              </div>
              {state.form.pdfBranding && (
                <PdfBrandingFields
                  branding={state.form.pdfBranding}
                  companies={state.companies}
                  primaryId={state.form.companyId}
                  accent="emerald"
                  showPaymentInfo={false}
                  onChange={(pdfBranding) => patchForm({ pdfBranding })}
                />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>付款方式 Payment Method</FieldLabel>
                  <select
                    className="h-9 w-full rounded-md border-transparent bg-muted/40 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring focus:bg-white"
                    value={state.form.paymentMethod}
                    onChange={(e) => patchForm({
                      paymentMethod: isReceiptPaymentMethod(e.target.value) ? e.target.value : '',
                    })}
                  >
                    <option value="">選擇付款方式…</option>
                    {RECEIPT_PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{RECEIPT_PAYMENT_METHOD_LABELS[method]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>收據日期 Receipt Date</FieldLabel>
                  <Input className={editorInputClass} type="date" value={state.form.receiptDate} onChange={(e) => patchForm({ receiptDate: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>付款日期 Payment Date</FieldLabel>
                  <Input className={editorInputClass} type="date" value={state.form.paymentDate} onChange={(e) => patchForm({ paymentDate: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>收款自 Received From</FieldLabel>
                  <Input className={editorInputClass} value={state.form.receivedFromName} onChange={(e) => patchForm({ receivedFromName: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>項目名稱 Project Name</FieldLabel>
                  <Input className={editorInputClass} value={state.form.projectName} onChange={(e) => patchForm({ projectName: e.target.value })} />
                </div>
              </div>
            </EditorCard>

            <EditorCard title="收款金額" subtitle="Amount Received">
              <div>
                <FieldLabel>收到金額 (HKD)</FieldLabel>
                <Input
                  type="number"
                  className={editorInputClass}
                  value={state.form.amountReceived}
                  onChange={(e) => patchForm({ amountReceived: Number(e.target.value) || 0 })}
                />
              </div>
            </EditorCard>

            <EditorCard
              title={`附加項目 Sub Items (${state.lines.length})`}
              extra={(
                <AddLineItemButton accent="emerald" onClick={() => setState({ ...state, lines: addEmptyLine(state.lines) })} />
              )}
            >
              <DocumentLineItemsTable lines={state.lines} onChange={(lines) => setState({ ...state, lines })} />
            </EditorCard>

            <EditorCard title="差額" subtitle="Price Difference">
              <label className="inline-flex items-center gap-2 text-[13px]">
                <Switch
                  checked={state.form.enablePriceDifference}
                  onCheckedChange={(enablePriceDifference) => patchForm({ enablePriceDifference })}
                />
                啟用差額
              </label>
              {state.form.enablePriceDifference && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>差額說明</FieldLabel>
                    <Input className={editorInputClass} value={state.form.priceDifferenceDescription} onChange={(e) => patchForm({ priceDifferenceDescription: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel>差額金額</FieldLabel>
                    <Input className={editorInputClass} type="number" value={state.form.priceDifference} onChange={(e) => patchForm({ priceDifference: Number(e.target.value) || 0 })} />
                  </div>
                </div>
              )}
            </EditorCard>

            <EditorCard title="備註" subtitle="Note">
              <Textarea rows={4} className={editorInputClass} value={state.form.notes} onChange={(e) => patchForm({ notes: e.target.value })} />
            </EditorCard>
          </>
        )}
        summary={(
          <DocumentSummaryCard
            kind="receipt"
            title="$ 收據摘要 Summary"
            rows={summaryRows}
            totalLabel="實收合計 Net Total"
            totalValue={formatDocumentMoney(totals.net)}
            meta={[
              { label: '收據編號', value: state.form.receiptNo },
              { label: '收據日期', value: formatSummaryDate(state.form.receiptDate) },
              { label: '付款日期', value: formatSummaryDate(state.form.paymentDate) },
              { label: '收款自', value: state.form.receivedFromName },
              { label: '付款方式', value: state.form.paymentMethod },
            ]}
            saving={saving}
            onSave={() => void persist()}
            onPreview={() => void handlePreview()}
            onDownload={() => void handleDownload()}
          />
        )}
      />

      {previewUrl && (
        <DocumentPreviewModal
          kind="receipt"
          url={previewUrl}
          onDownload={() => void downloadOnly()}
          onClose={() => {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }}
        />
      )}
    </>
  );
}
