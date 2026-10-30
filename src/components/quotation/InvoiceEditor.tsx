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
import { InvoicePDFDocument } from '@/components/quotation/InvoicePDFDocument';
import { useApp } from '@/context/AppContext';
import { createInvoice, updateInvoice, useInvoiceEditor } from '@/hooks/useInvoiceReceipts';
import {
  INVOICE_FLOOR_ERROR,
  canViewDocumentMoney,
  formatDocumentMoney,
  invoiceDiscountAmount,
  invoiceFilename,
  invoiceGrossTotal,
  invoiceMainAmount,
  invoiceMeetsFloor,
  invoiceNetTotal,
  buildServiceRenewalMessage,
  serviceRenewalTotal,
} from '@/lib/invoiceReceipts';
import { applyPrimaryCompanyChange } from '@/lib/pdfBranding';
import { downloadPdfBlob, openPdfPreview, pdfBlobFromDocument } from '@/lib/invoiceReceiptPdf';
import { cn } from '@/lib/utils';

export function InvoiceEditor({
  incomeId,
  onBack,
}: {
  incomeId: string;
  onBack: () => void;
}) {
  const { user } = useApp();
  const canViewMoney = canViewDocumentMoney(user.role);
  const { state, setState, loading, error, refresh } = useInvoiceEditor(incomeId);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showRenewalOverride, setShowRenewalOverride] = useState<{ incomeId: string; value: boolean } | null>(null);
  const [launchOverride, setLaunchOverride] = useState<{ incomeId: string; value: string } | null>(null);
  const [monthlyOverride, setMonthlyOverride] = useState<{ incomeId: string; value: number } | null>(null);
  const [periodOverride, setPeriodOverride] = useState<{ incomeId: string; value: number } | null>(null);
  const [totalOverride, setTotalOverride] = useState<{ incomeId: string; value: number } | null>(null);
  const [textEdit, setTextEdit] = useState<{ incomeId: string; value: boolean } | null>(null);

  const totals = useMemo(() => {
    if (!state) return null;
    const mainAmount = invoiceMainAmount(state.form.mainItemQty, state.form.mainItemPrice);
    const subTotal = invoiceGrossTotal(state.form.mainItemQty, state.form.mainItemPrice, state.lines) - mainAmount;
    const gross = invoiceGrossTotal(state.form.mainItemQty, state.form.mainItemPrice, state.lines);
    const discount = invoiceDiscountAmount(state.form.enableDiscount, state.form.discountAmount);
    const net = invoiceNetTotal(
      state.form.mainItemQty,
      state.form.mainItemPrice,
      state.lines,
      state.form.enableDiscount,
      state.form.discountAmount,
    );
    const floorOk = invoiceMeetsFloor(gross, state.income.amount);
    return { mainAmount, subTotal, gross, discount, net, floorOk };
  }, [state]);

  const forThisIncome = <T,>(slot: { incomeId: string; value: T } | null): T | undefined => (
    slot && slot.incomeId === incomeId ? slot.value : undefined
  );
  const launchDate = forThisIncome(launchOverride) ?? state?.renewalSource.launchDate ?? '';
  const monthlyAmount = forThisIncome(monthlyOverride) ?? totals?.net ?? 0;
  const periodCount = forThisIncome(periodOverride) ?? state?.renewalSource.incomeCount ?? 0;
  const totalTouched = totalOverride?.incomeId === incomeId;
  const totalIncomeAmount = totalOverride?.incomeId === incomeId
    ? totalOverride.value
    : serviceRenewalTotal(monthlyAmount, periodCount);
  const monthlyTouched = monthlyOverride?.incomeId === incomeId;
  const hasFieldOverride = launchOverride?.incomeId === incomeId
    || monthlyTouched
    || periodOverride?.incomeId === incomeId
    || totalTouched;
  const hasWebsite = state?.renewalSource.hasWebsite ?? false;
  const defaultNote = state
    ? buildServiceRenewalMessage({
      launchDate: state.renewalSource.launchDate,
      dueDate: state.form.dueDate,
      monthlyAmount: totals?.net ?? 0,
      periodCount: state.renewalSource.incomeCount,
      totalAmount: serviceRenewalTotal(totals?.net ?? 0, state.renewalSource.incomeCount),
      hasWebsite,
    })
    : '';
  const savedNote = state?.form.serviceRenewalNote.trim() ?? '';
  const renewalCustom = textEdit?.incomeId === incomeId
    ? textEdit.value
    : !hasFieldOverride && savedNote !== '' && savedNote !== defaultNote;
  const renewalVisible = showRenewalOverride?.incomeId === incomeId
    ? showRenewalOverride.value
    : (state?.income.installmentNo ?? 0) >= 2;

  if (loading) {
    return <p className="text-[13px] text-muted-foreground py-10">載入發票中…</p>;
  }
  if (error || !state || !totals) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-rose-600">{error ?? '無法載入發票'}</p>
        <button type="button" className="text-[13px] text-teal-700" onClick={onBack}>返回</button>
      </div>
    );
  }

  const patchForm = (updates: Partial<typeof state.form>) => {
    setState({ ...state, form: { ...state.form, ...updates } });
  };

  const renewalMessage = (input: {
    launchDate: string;
    dueDate: string;
    monthlyAmount: number;
    periodCount: number;
    totalAmount: number;
  }) => buildServiceRenewalMessage({ ...input, hasWebsite: state.renewalSource.hasWebsite });

  const followInvoiceTotal = (net: number) => {
    if (renewalCustom || monthlyTouched) return null;
    const total = totalTouched ? totalIncomeAmount : serviceRenewalTotal(net, periodCount);
    return renewalMessage({
      launchDate,
      dueDate: state.form.dueDate,
      monthlyAmount: net,
      periodCount,
      totalAmount: total,
    });
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
      ? await updateInvoice(state.saved.id, incomeId, state.form, state.lines, state.income.amount)
      : await createInvoice(incomeId, state.form, state.lines, state.income.amount);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? '儲存失敗');
      return false;
    }
    toast.success('發票已儲存');
    await refresh();
    return true;
  };

  const syncRenewal = (
    next: {
      launchDate: string;
      dueDate: string;
      monthlyAmount: number;
      periodCount: number;
      totalAmount: number;
    },
    formPatch: Partial<typeof state.form> = {},
  ) => {
    const patch: Partial<typeof state.form> = { ...formPatch };
    if (!renewalCustom) patch.serviceRenewalNote = renewalMessage(next);
    if (Object.keys(patch).length > 0) patchForm(patch);
  };

  const resetRenewalMessage = () => {
    setLaunchOverride(null);
    setMonthlyOverride(null);
    setPeriodOverride(null);
    setTotalOverride(null);
    setTextEdit({ incomeId, value: false });
    patchForm({ serviceRenewalNote: defaultNote });
  };

  const buildPdf = () =>
    createElement(InvoicePDFDocument, {
      form: renewalVisible ? state.form : { ...state.form, serviceRenewalNote: '' },
      lines: state.lines,
      company: primaryCompany,
      mainAmount: totals.mainAmount,
      subItemsTotal: totals.subTotal,
      grossTotal: totals.gross,
      discountVal: totals.discount,
      netTotal: totals.net,
      canViewFinancialValues: canViewMoney,
      branding: state.form.pdfBranding,
    });

  const handlePreview = async () => {
    if (!totals.floorOk) {
      toast.error(INVOICE_FLOOR_ERROR);
      return;
    }
    try {
      const blob = await pdfBlobFromDocument(buildPdf());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(openPdfPreview(blob));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '預覽失敗');
    }
  };

  const deliverPdf = async (blob: Blob) => {
    await downloadPdfBlob(blob, invoiceFilename(state.form.invoiceNo, state.form.billToName));
  };

  const downloadOnly = async () => {
    try {
      await deliverPdf(await pdfBlobFromDocument(buildPdf()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '下載失敗');
    }
  };

  const handleDownload = async () => {
    const blobPromise = pdfBlobFromDocument(buildPdf());
    const saved = await persist();
    if (!saved) {
      void blobPromise.catch(() => undefined);
      return;
    }
    try {
      await deliverPdf(await blobPromise);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '下載失敗');
    }
  };

  const summaryRows = [
    { label: '主項目 Main Item', value: formatDocumentMoney(totals.mainAmount) },
    ...(totals.subTotal ? [{ label: '附加項目 Sub Items', value: formatDocumentMoney(totals.subTotal) }] : []),
    { label: '小計 Subtotal', value: formatDocumentMoney(totals.gross), danger: !totals.floorOk },
    { label: '收入金額 Income Amount', value: formatDocumentMoney(state.income.amount ?? 0) },
    ...(state.form.enableDiscount
      ? [{ label: '折扣 Discount', value: `-${formatDocumentMoney(totals.discount)}`, danger: true }]
      : []),
  ];

  return (
    <>
      <InvoiceReceiptEditorShell
        title={state.saved ? '編輯發票' : '建立發票'}
        documentNo={state.form.invoiceNo}
        kind="invoice"
        income={state.income}
        floorBlocked={!totals.floorOk}
        saving={saving}
        onBack={onBack}
        onPreview={() => void handlePreview()}
        onDownload={() => void handleDownload()}
        onSave={() => void persist()}
        form={(
          <>
            <EditorCard title="發票基本資料" subtitle="Basic Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>發票編號 Invoice #</FieldLabel>
                  <Input className={editorInputClass} value={state.form.invoiceNo} onChange={(e) => patchForm({ invoiceNo: e.target.value })} />
                </div>
                <CompanySelectField companies={state.companies} value={state.form.companyId} onChange={changeCompany} label="公司 BU" />
              </div>
              {state.form.pdfBranding && (
                <PdfBrandingFields
                  branding={state.form.pdfBranding}
                  companies={state.companies}
                  primaryId={state.form.companyId}
                  accent="blue"
                  onChange={(pdfBranding) => patchForm({ pdfBranding })}
                />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>發票日期 Invoice Date</FieldLabel>
                  <Input className={editorInputClass} type="date" value={state.form.invoiceDate} onChange={(e) => patchForm({ invoiceDate: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>到期日 Due Date</FieldLabel>
                  <Input
                    className={editorInputClass}
                    type="date"
                    value={state.form.dueDate}
                    onChange={(e) => {
                      const dueDate = e.target.value;
                      syncRenewal({
                        launchDate,
                        dueDate,
                        monthlyAmount,
                        periodCount,
                        totalAmount: totalIncomeAmount,
                      }, { dueDate });
                    }}
                  />
                </div>
                <div>
                  <FieldLabel>收款人 Receiver</FieldLabel>
                  <Input className={editorInputClass} value={state.form.billToName} onChange={(e) => patchForm({ billToName: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>項目名稱 Project Name</FieldLabel>
                  <Input className={editorInputClass} value={state.form.projectName} onChange={(e) => patchForm({ projectName: e.target.value })} />
                </div>
              </div>
            </EditorCard>

            <EditorCard title="主要項目" subtitle="Main Item">
              <div>
                <FieldLabel>項目名稱 Item Name</FieldLabel>
                <Textarea
                  rows={4}
                  className={editorInputClass}
                  value={state.form.mainItemName}
                  onChange={(e) => patchForm({ mainItemName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <FieldLabel>數量 Qty</FieldLabel>
                  <Input
                    type="number"
                    className={editorInputClass}
                    value={state.form.mainItemQty}
                    onChange={(e) => {
                      const mainItemQty = Number(e.target.value) || 0;
                      const note = followInvoiceTotal(invoiceNetTotal(
                        mainItemQty,
                        state.form.mainItemPrice,
                        state.lines,
                        state.form.enableDiscount,
                        state.form.discountAmount,
                      ));
                      patchForm({ mainItemQty, ...(note != null ? { serviceRenewalNote: note } : {}) });
                    }}
                  />
                </div>
                <div>
                  <FieldLabel>單價 Price</FieldLabel>
                  <Input
                    type="number"
                    className={editorInputClass}
                    value={state.form.mainItemPrice}
                    onChange={(e) => {
                      const mainItemPrice = Number(e.target.value) || 0;
                      const note = followInvoiceTotal(invoiceNetTotal(
                        state.form.mainItemQty,
                        mainItemPrice,
                        state.lines,
                        state.form.enableDiscount,
                        state.form.discountAmount,
                      ));
                      patchForm({ mainItemPrice, ...(note != null ? { serviceRenewalNote: note } : {}) });
                    }}
                  />
                </div>
                <div>
                  <FieldLabel>金額 Amount</FieldLabel>
                  <Input readOnly className={cn(editorInputClass, 'text-muted-foreground')} value={formatDocumentMoney(totals.mainAmount)} />
                </div>
              </div>
            </EditorCard>

            <EditorCard
              title={`附加項目 Sub Items (${state.lines.length})`}
              extra={(
                <AddLineItemButton onClick={() => setState({ ...state, lines: addEmptyLine(state.lines) })} />
              )}
            >
              <DocumentLineItemsTable
                lines={state.lines}
                onChange={(lines) => {
                  const note = followInvoiceTotal(invoiceNetTotal(
                    state.form.mainItemQty,
                    state.form.mainItemPrice,
                    lines,
                    state.form.enableDiscount,
                    state.form.discountAmount,
                  ));
                  setState({
                    ...state,
                    lines,
                    form: note != null ? { ...state.form, serviceRenewalNote: note } : state.form,
                  });
                }}
              />
            </EditorCard>

            <EditorCard title="折扣" subtitle="Discount">
              <label className="inline-flex items-center gap-2 text-[13px]">
                <Switch
                  checked={state.form.enableDiscount}
                  onCheckedChange={(enableDiscount) => {
                    const note = followInvoiceTotal(invoiceNetTotal(
                      state.form.mainItemQty,
                      state.form.mainItemPrice,
                      state.lines,
                      enableDiscount,
                      state.form.discountAmount,
                    ));
                    patchForm({ enableDiscount, ...(note != null ? { serviceRenewalNote: note } : {}) });
                  }}
                />
                啟用折扣
              </label>
              {state.form.enableDiscount && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>折扣說明</FieldLabel>
                    <Input className={editorInputClass} value={state.form.discountDescription} onChange={(e) => patchForm({ discountDescription: e.target.value })} />
                  </div>
                  <div>
                    <FieldLabel>折扣金額</FieldLabel>
                    <Input
                      className={editorInputClass}
                      type="number"
                      value={state.form.discountAmount}
                      onChange={(e) => {
                        const discountAmount = Number(e.target.value) || 0;
                        const note = followInvoiceTotal(invoiceNetTotal(
                          state.form.mainItemQty,
                          state.form.mainItemPrice,
                          state.lines,
                          state.form.enableDiscount,
                          discountAmount,
                        ));
                        patchForm({ discountAmount, ...(note != null ? { serviceRenewalNote: note } : {}) });
                      }}
                    />
                  </div>
                </div>
              )}
            </EditorCard>

            <EditorCard
              title="服務說明"
              subtitle="Service note"
              extra={renewalCustom && renewalVisible ? (
                <button
                  type="button"
                  className="text-[12px] font-medium text-blue-700 hover:underline"
                  onClick={resetRenewalMessage}
                >
                  重設為預設
                </button>
              ) : null}
            >
              <label className="inline-flex items-center gap-2 text-[13px]">
                <Switch
                  checked={renewalVisible}
                  onCheckedChange={(checked) => setShowRenewalOverride({ incomeId, value: checked })}
                />
                顯示上線及下年度服務費說明
              </label>
              <p className="text-[12px] text-muted-foreground">
                期數為 2 或以上時預設開啟。此開關只影響本次預覽與下載，不會另外儲存。
              </p>
              {renewalVisible && (
                <>
                  {!renewalCustom && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>上線日期</FieldLabel>
                        <Input
                          type="date"
                          className={editorInputClass}
                          value={launchDate}
                          onChange={(e) => {
                            const nextLaunch = e.target.value;
                            setLaunchOverride({ incomeId, value: nextLaunch });
                            syncRenewal({
                              launchDate: nextLaunch,
                              dueDate: state.form.dueDate,
                              monthlyAmount,
                              periodCount,
                              totalAmount: totalIncomeAmount,
                            });
                          }}
                        />
                      </div>
                      <div>
                        <FieldLabel>發票到期日</FieldLabel>
                        <Input
                          type="date"
                          className={editorInputClass}
                          value={state.form.dueDate}
                          onChange={(e) => {
                            const dueDate = e.target.value;
                            syncRenewal({
                              launchDate,
                              dueDate,
                              monthlyAmount,
                              periodCount,
                              totalAmount: totalIncomeAmount,
                            }, { dueDate });
                          }}
                        />
                      </div>
                      <div>
                        <FieldLabel>發票金額</FieldLabel>
                        <Input
                          type="number"
                          className={editorInputClass}
                          value={monthlyAmount}
                          onChange={(e) => {
                            const monthly = Number(e.target.value);
                            const nextMonthly = Number.isFinite(monthly) ? monthly : 0;
                            const total = serviceRenewalTotal(nextMonthly, periodCount);
                            setMonthlyOverride({ incomeId, value: nextMonthly });
                            setTotalOverride(null);
                            syncRenewal({
                              launchDate,
                              dueDate: state.form.dueDate,
                              monthlyAmount: nextMonthly,
                              periodCount,
                              totalAmount: total,
                            });
                          }}
                        />
                      </div>
                      <div>
                        <FieldLabel>總期數</FieldLabel>
                        <Input
                          type="number"
                          className={editorInputClass}
                          value={periodCount}
                          onChange={(e) => {
                            const periods = Number(e.target.value);
                            const nextPeriods = Number.isFinite(periods) ? periods : 0;
                            const total = serviceRenewalTotal(monthlyAmount, nextPeriods);
                            setPeriodOverride({ incomeId, value: nextPeriods });
                            setTotalOverride(null);
                            syncRenewal({
                              launchDate,
                              dueDate: state.form.dueDate,
                              monthlyAmount,
                              periodCount: nextPeriods,
                              totalAmount: total,
                            });
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">預設為同一客戶項目的收入筆數，對應說明中的「× n 個月」。</p>
                      </div>
                      <div className="md:col-span-2">
                        <FieldLabel>收入合計</FieldLabel>
                        <Input
                          type="number"
                          className={editorInputClass}
                          value={totalIncomeAmount}
                          onChange={(e) => {
                            const total = Number(e.target.value);
                            const nextTotal = Number.isFinite(total) ? total : 0;
                            setTotalOverride({ incomeId, value: nextTotal });
                            syncRenewal({
                              launchDate,
                              dueDate: state.form.dueDate,
                              monthlyAmount,
                              periodCount,
                              totalAmount: nextTotal,
                            });
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">預設為發票金額 × 總期數。</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <FieldLabel>說明全文</FieldLabel>
                    <Textarea
                      rows={4}
                      className={editorInputClass}
                      value={state.form.serviceRenewalNote}
                      onChange={(e) => {
                        setTextEdit({ incomeId, value: true });
                        patchForm({ serviceRenewalNote: e.target.value });
                      }}
                    />
                  </div>
                </>
              )}
            </EditorCard>

            <EditorCard title="備註" subtitle="Note">
              <Textarea rows={5} className={editorInputClass} value={state.form.note} onChange={(e) => patchForm({ note: e.target.value })} />
            </EditorCard>
          </>
        )}
        summary={(
          <DocumentSummaryCard
            kind="invoice"
            title="$ 發票摘要 Summary"
            rows={summaryRows}
            totalLabel="合計 Total"
            totalValue={formatDocumentMoney(totals.net)}
            meta={[
              { label: '發票編號', value: state.form.invoiceNo },
              { label: '發票日期', value: formatSummaryDate(state.form.invoiceDate) },
              { label: '到期日', value: formatSummaryDate(state.form.dueDate) },
              { label: '收款人', value: state.form.billToName },
              { label: '公司', value: primaryCompany?.code || primaryCompany?.display || '' },
            ]}
            floorBlocked={!totals.floorOk}
            saving={saving}
            onSave={() => void persist()}
            onPreview={() => void handlePreview()}
            onDownload={() => void handleDownload()}
          />
        )}
      />

      {previewUrl && (
        <DocumentPreviewModal
          kind="invoice"
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
