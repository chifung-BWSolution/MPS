import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_PAYMENT_STATUS_LABELS,
  EXPENSE_PAYMENT_STATUSES,
  expenseCreditCardId,
  isCreditCardPaymentMethod,
  type ExpensePaymentMethod,
  type ExpensePaymentStatus,
  type QuotationExpense,
} from '@/lib/quotationExpenses';
import type { QuotationExpenseWriteInput } from '@/hooks/useQuotationExpenses';
import {
  assignShopifyBillingInstallments,
  isShopifyBillingDuplicate,
  matchShopifyBillingSupplier,
  parseShopifyBillingCsvBuffer,
  shopifyChargeLabel,
  shopifyChargeToExpenseInput,
  type ShopifyBillingAssignment,
  type ShopifyBillingCharge,
  type ShopifyBillingPaymentDefaults,
} from '@/lib/shopifyBillingCsv';
import { formatMoney, toHkd } from '@/lib/currency';
import { formatCreditCardOptionLabel } from '@/lib/creditCards';
import type { CreditCardRecord } from '@/lib/creditCards';
import type { SupplierType, WebPageSupplier } from '@/types/marketingOps';

type PreviewRow = {
  charge: ShopifyBillingCharge;
  assignment: ShopifyBillingAssignment | null;
  duplicate: boolean;
  selected: boolean;
};

const emptyPayment = (): ShopifyBillingPaymentDefaults => ({
  paymentMethod: 'Transfer',
  paymentStatus: 'Paid',
  creditCardId: '',
});

function supplierAssignment(
  supplier: Pick<WebPageSupplier, 'id' | 'supplierTypesId' | 'displayName'> | null | undefined,
  types: SupplierType[],
): ShopifyBillingAssignment | null {
  if (!supplier?.supplierTypesId) return null;
  return {
    supplierTypesId: supplier.supplierTypesId,
    supplierId: supplier.id,
    supplierLabel: supplier.displayName,
    typeLabel: types.find((type) => type.id === supplier.supplierTypesId)?.displayName,
  };
}

export function ShopifyBillingImportDialog({
  open,
  existingRows,
  supplierTypes,
  suppliers,
  cards,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  existingRows: QuotationExpense[];
  supplierTypes: SupplierType[];
  suppliers: WebPageSupplier[];
  cards: CreditCardRecord[];
  saving: boolean;
  onClose: () => void;
  onSave: (items: Array<{ input: QuotationExpenseWriteInput }>) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [stores, setStores] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [payment, setPayment] = useState<ShopifyBillingPaymentDefaults>(emptyPayment);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const reset = () => {
    setFileName('');
    setParseError(null);
    setStores([]);
    setRows([]);
    setPayment(emptyPayment());
    setSkipDuplicates(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const supplierOptions = useMemo(
    () =>
      suppliers
        .filter((supplier) => supplier.isActive && supplier.supplierTypesId)
        .map((supplier) => {
          const typeLabel = supplierTypes.find((type) => type.id === supplier.supplierTypesId)?.displayName;
          return {
            value: supplier.id,
            label: typeLabel ? `${supplier.displayName} · ${typeLabel}` : supplier.displayName,
            keywords: [supplier.companyName, supplier.url, typeLabel].filter(Boolean).join(' '),
          };
        }),
    [suppliers, supplierTypes],
  );

  const creditCardOptions = useMemo(
    () =>
      cards
        .filter((card) => card.isActive || card.id === payment.creditCardId)
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
    [cards, payment.creditCardId],
  );

  const applyFile = async (file: File | undefined) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setParseError('請上傳 Shopify 帳單 CSV 或 Excel');
      return;
    }
    try {
      const parsed = parseShopifyBillingCsvBuffer(await file.arrayBuffer());
      if (parsed.error) {
        setFileName(file.name);
        setParseError(parsed.error);
        setStores([]);
        setRows([]);
        return;
      }
      setFileName(file.name);
      setParseError(null);
      setStores(parsed.stores);
      setRows(parsed.charges.map((charge) => {
        const matched = matchShopifyBillingSupplier(charge, suppliers);
        const duplicate = existingRows.some((expense) => isShopifyBillingDuplicate(expense, charge));
        return {
          charge,
          assignment: supplierAssignment(matched, supplierTypes),
          duplicate,
          selected: !duplicate,
        };
      }));
    } catch (error) {
      setFileName(file.name);
      setParseError(error instanceof Error ? error.message : '無法讀取檔案');
      setStores([]);
      setRows([]);
    }
  };

  const selectedRows = rows.filter((row) => row.selected && (!skipDuplicates || !row.duplicate));
  const missingSupplier = selectedRows.some((row) => !row.assignment);
  const paid = payment.paymentStatus === 'Paid';
  const needsCard = paid && isCreditCardPaymentMethod(payment.paymentMethod);
  const canImport = selectedRows.length > 0 && !missingSupplier && (!needsCard || Boolean(payment.creditCardId));

  const handleSave = async () => {
    if (!canImport) {
      if (!selectedRows.length) toast.error('沒有可匯入的列');
      else if (missingSupplier) toast.error('請為未配對的收費選擇供應商');
      else if (needsCard) toast.error('請選擇信用卡');
      return;
    }

    const installments = assignShopifyBillingInstallments(
      selectedRows.map((row) => ({
        importKey: row.charge.importKey,
        supplierTypesId: row.assignment!.supplierTypesId,
        supplierId: row.assignment!.supplierId,
        sortDate: row.charge.chargeDate || row.charge.invoiceDate || '',
      })),
      existingRows,
    );

    const items = selectedRows.map((row) => ({
      input: shopifyChargeToExpenseInput(
        row.charge,
        row.assignment!,
        payment,
        installments.get(row.charge.importKey) ?? 1,
      ),
    }));

    try {
      await onSave(items);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '匯入失敗');
    }
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={close}
      title="匯入 Shopify 帳單"
      size="2xl"
      footer={
        <CrudModalFooter className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px] text-muted-foreground">
            {rows.length ? `將匯入 ${selectedRows.length} / ${rows.length} 筆` : '選擇 Shopify 匯出的 charges CSV'}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !canImport}
              className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? '匯入中…' : '匯入支出'}
            </button>
          </div>
        </CrudModalFooter>
      }
    >
      <div className="space-y-5">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            void applyFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            'rounded-md border border-dashed px-4 py-6 text-center transition-colors',
            dragOver ? 'border-teal-400 bg-teal-50' : 'border-border bg-muted/20',
          )}
        >
          <Upload size={20} className="mx-auto text-teal-700 mb-2" />
          <p className="text-[13px] font-medium mb-3">拖放或選擇 Shopify Billing CSV</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="mx-auto block text-[13px] file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-teal-600 file:text-white file:text-[13px] file:font-medium"
            aria-label="Shopify 帳單檔案"
            onChange={(event) => {
              void applyFile(event.target.files?.[0]);
            }}
          />
          <p className="text-[12px] text-muted-foreground mt-3">
            {fileName || '從 Shopify Admin → Billing → Charges 匯出，含 GemPages 等 App 收費'}
          </p>
        </div>

        {parseError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {parseError}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap text-[12px] text-muted-foreground">
              <span>
                <FileSpreadsheet size={12} className="inline mr-1" />
                {stores.length ? `商店：${stores.join('、')}` : '已讀取收費列'}
              </span>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(event) => setSkipDuplicates(event.target.checked)}
                />
                略過已匯入列
              </label>
            </div>

            <section className="space-y-3">
              <h3 className="text-[14px] font-semibold">付款預設</h3>
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1.5">付款方式</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="匯入付款方式">
                  {EXPENSE_PAYMENT_METHODS.map((method) => {
                    const selected = payment.paymentMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPayment((prev) => ({
                          ...prev,
                          paymentMethod: method,
                          creditCardId: expenseCreditCardId(method, prev.creditCardId) ?? '',
                        }))}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                          selected
                            ? 'bg-teal-50 border-teal-300 text-teal-800'
                            : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        {EXPENSE_PAYMENT_METHOD_LABELS[method]}
                      </button>
                    );
                  })}
                </div>
              </div>
              {needsCard && (
                <div>
                  <span className="text-[12px] text-muted-foreground block mb-1">信用卡</span>
                  <SearchableSelect
                    value={payment.creditCardId}
                    onValueChange={(creditCardId) => setPayment((prev) => ({ ...prev, creditCardId }))}
                    options={creditCardOptions}
                    placeholder="選擇信用卡"
                    searchPlaceholder="搜尋信用卡…"
                  />
                </div>
              )}
              <div>
                <span className="text-[12px] text-muted-foreground block mb-1.5">付款狀態</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="匯入付款狀態">
                  {EXPENSE_PAYMENT_STATUSES.map((status) => {
                    const selected = payment.paymentStatus === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPayment((prev) => ({ ...prev, paymentStatus: status }))}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                          selected
                            ? 'bg-teal-50 border-teal-300 text-teal-800'
                            : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        {EXPENSE_PAYMENT_STATUS_LABELS[status]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground w-10">匯入</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">收費</th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">金額</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">週期 / 日期</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground min-w-[220px]">供應商</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const skipped = skipDuplicates && row.duplicate;
                    return (
                      <tr
                        key={row.charge.importKey}
                        className={cn('border-b border-border/50 last:border-b-0', skipped && 'opacity-50')}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`匯入 ${shopifyChargeLabel(row.charge) || row.charge.billNumber}`}
                            checked={row.selected && !skipped}
                            disabled={skipped}
                            onChange={(event) => {
                              const selected = event.target.checked;
                              setRows((prev) => prev.map((item) => (
                                item.charge.importKey === row.charge.importKey
                                  ? { ...item, selected }
                                  : item
                              )));
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-[13px] font-medium">{shopifyChargeLabel(row.charge) || row.charge.chargeCategory}</p>
                          <p className="text-[11px] text-muted-foreground">
                            #{row.charge.billNumber} · {row.charge.chargeCategory}
                            {row.duplicate ? ' · 已存在' : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          <p className="text-[13px]">{formatMoney(row.charge.amount, row.charge.currency)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatMoney(toHkd(row.charge.amount, row.charge.currency))}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">
                          {row.charge.cycleStart && row.charge.cycleEnd
                            ? `${row.charge.cycleStart}–${row.charge.cycleEnd}`
                            : (row.charge.chargeDate || row.charge.invoiceDate || '—')}
                        </td>
                        <td className="px-3 py-2">
                          <SearchableSelect
                            value={row.assignment?.supplierId ?? ''}
                            onValueChange={(supplierId) => {
                              const supplier = suppliers.find((item) => item.id === supplierId) ?? null;
                              setRows((prev) => prev.map((item) => (
                                item.charge.importKey === row.charge.importKey
                                  ? { ...item, assignment: supplierAssignment(supplier, supplierTypes) }
                                  : item
                              )));
                            }}
                            options={supplierOptions}
                            placeholder="選擇供應商"
                            searchPlaceholder="搜尋供應商…"
                            disabled={skipped}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </CrudModal>
  );
}
