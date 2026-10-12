import { useMemo, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { useWebsiteAdsMonthlyExpenses } from '@/hooks/useWebsiteAdsMonthlyExpenses';
import type { QuotationExpenseWriteInput } from '@/hooks/useQuotationExpenses';
import { formatMoney } from '@/lib/currency';
import { formatMoneyAmount } from '@/lib/formatMoney';
import {
  ADS_EXPENSE_PLATFORM_LABELS,
  adsMonthlyExpenseKey,
  adsMonthlyExpenseRemarks,
  adsMonthlySpendToExpenseInput,
  formatAdsMonthLabel,
  isAdsMonthlyExpenseAdded,
  isCurrentAdsMonth,
  matchAdsExpenseSupplier,
  monthEndIso,
  nextAdsMonthlyInstallment,
  type AdsMonthlySpend,
} from '@/lib/adsMonthlyExpenses';
import type { QuotationExpense } from '@/lib/quotationExpenses';
import type { SupplierType, WebPageSupplier } from '@/types/marketingOps';

function formatSpendAmount(spend: AdsMonthlySpend): string {
  if (spend.currency) return formatMoney(spend.amount, spend.currency);
  const amount = formatMoneyAmount(spend.amount);
  return spend.currencyCode ? `${amount} ${spend.currencyCode}` : amount;
}

function SpendCell({
  spends,
  expenses,
  expensesLoading,
  savingKey,
  onAdd,
}: {
  spends: AdsMonthlySpend[];
  expenses: QuotationExpense[];
  expensesLoading: boolean;
  savingKey: string;
  onAdd: (spend: AdsMonthlySpend) => void;
}) {
  if (spends.length === 0) {
    return <span className="text-[13px] text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-2">
      {spends.map((spend) => {
        const key = adsMonthlyExpenseKey(spend);
        const added = isAdsMonthlyExpenseAdded(expenses, spend);
        const unsupported = !spend.currency;
        return (
          <div key={key} className="flex items-center justify-end gap-3">
            <div className="text-right">
              <div className="text-[13px] font-medium tabular-nums whitespace-nowrap">
                {formatSpendAmount(spend)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {spend.campaignCount} 個活動
              </div>
            </div>
            {expensesLoading ? (
              <span className="text-[12px] text-muted-foreground">載入支出…</span>
            ) : added ? (
              <span className="inline-flex px-2 py-1 rounded-md text-[12px] font-medium border bg-emerald-50 text-emerald-800 border-emerald-200">
                已加入
              </span>
            ) : unsupported ? (
              <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                {spend.currencyCode ? `尚未支援 ${spend.currencyCode}` : '缺少帳戶幣別'}
              </span>
            ) : (
              <button
                type="button"
                disabled={savingKey === key}
                onClick={() => onAdd(spend)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50"
                aria-label={`加入 ${formatAdsMonthLabel(spend.month)} ${ADS_EXPENSE_PLATFORM_LABELS[spend.platform]} 支出`}
              >
                <Plus size={12} />
                {savingKey === key ? '加入中…' : '加入支出'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PitchingAdsMonthlyExpenses({
  websiteId,
  expenses,
  expensesLoading = false,
  supplierTypes,
  suppliers,
  onAdd,
}: {
  websiteId: string;
  expenses: QuotationExpense[];
  expensesLoading?: boolean;
  supplierTypes: SupplierType[];
  suppliers: WebPageSupplier[];
  onAdd: (input: QuotationExpenseWriteInput) => Promise<{ error: { message: string } | null }>;
}) {
  const { months, platforms, hasCampaigns, loading, error } = useWebsiteAdsMonthlyExpenses(websiteId);
  const [pending, setPending] = useState<AdsMonthlySpend | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [savingKey, setSavingKey] = useState('');

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

  if (!websiteId.trim()) return null;
  if (loading || (!error && !hasCampaigns)) return null;

  const openAdd = (spend: AdsMonthlySpend) => {
    if (!spend.currency) return;
    const matched = matchAdsExpenseSupplier(spend.platform, suppliers);
    setPending(spend);
    setSupplierId(matched?.id ?? '');
    setDueDate(monthEndIso(spend.month));
    setNote(adsMonthlyExpenseRemarks(spend));
  };

  const closeAdd = () => {
    if (savingKey) return;
    setPending(null);
    setSupplierId('');
    setDueDate('');
    setNote('');
  };

  const confirmAdd = async () => {
    if (!pending?.currency) return;
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (!supplier?.supplierTypesId) {
      toast.error('請選擇供應商');
      return;
    }
    if (!dueDate) {
      toast.error('請選擇到期日');
      return;
    }
    const key = adsMonthlyExpenseKey(pending);
    setSavingKey(key);
    try {
      const result = await onAdd(adsMonthlySpendToExpenseInput({
        spend: { ...pending, currency: pending.currency },
        supplierTypesId: supplier.supplierTypesId,
        supplierId: supplier.id,
        installmentNumber: nextAdsMonthlyInstallment(expenses, supplier.supplierTypesId, supplier.id),
        dueDate,
        note,
      }));
      if (result.error) return;
      setPending(null);
    } finally {
      setSavingKey('');
    }
  };

  return (
    <section className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
      <header className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Megaphone size={14} className="text-teal-700" />
          <h3 className="text-[14px] font-semibold">廣告月費</h3>
        </div>
        <p className="text-[12px] text-muted-foreground mt-1">
          Google Ads 依關聯網域，Facebook Ads 依網站品牌或已連結廣告帳戶。每一列是一個月的花費，可加入支出。
        </p>
      </header>

      {error && (
        <div className="mx-4 my-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          無法載入廣告月費：{error}
        </div>
      )}

      {error ? null : months.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
          已關聯廣告活動，尚無花費紀錄。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">月份</th>
                {platforms.google && (
                  <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Google Ads</th>
                )}
                {platforms.facebook && (
                  <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Facebook Ads</th>
                )}
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month} className="border-b border-border/50 last:border-b-0">
                  <td className="px-4 py-3 text-[13px] whitespace-nowrap align-top">
                    <div className="font-medium">{formatAdsMonthLabel(month.month)}</div>
                    {isCurrentAdsMonth(month.month) && (
                      <div className="text-[11px] text-amber-700 mt-0.5">本月尚未結束</div>
                    )}
                  </td>
                  {platforms.google && (
                    <td className="px-4 py-3 align-top">
                      <SpendCell
                        spends={month.spends.filter((spend) => spend.platform === 'google')}
                        expenses={expenses}
                        expensesLoading={expensesLoading}
                        savingKey={savingKey}
                        onAdd={openAdd}
                      />
                    </td>
                  )}
                  {platforms.facebook && (
                    <td className="px-4 py-3 align-top">
                      <SpendCell
                        spends={month.spends.filter((spend) => spend.platform === 'facebook')}
                        expenses={expenses}
                        expensesLoading={expensesLoading}
                        savingKey={savingKey}
                        onAdd={openAdd}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CrudModal
        isOpen={pending != null}
        onClose={closeAdd}
        title="加入廣告月費"
        size="sm"
        footer={
          <CrudModalFooter className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeAdd}
              disabled={Boolean(savingKey)}
              className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void confirmAdd()}
              disabled={Boolean(savingKey)}
              className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
            >
              {savingKey ? '加入中…' : '加入支出'}
            </button>
          </CrudModalFooter>
        }
      >
        {pending && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <div className="text-[12px] text-muted-foreground">
                {ADS_EXPENSE_PLATFORM_LABELS[pending.platform]} · {formatAdsMonthLabel(pending.month)}
              </div>
              <div className="text-[16px] font-semibold tabular-nums mt-0.5">
                {formatSpendAmount(pending)}
              </div>
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">供應商 *</span>
              <SearchableSelect
                value={supplierId}
                onValueChange={setSupplierId}
                options={supplierOptions}
                placeholder="選擇供應商"
                searchPlaceholder="搜尋供應商"
              />
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">到期日 *</span>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">備註</span>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
            </div>
          </div>
        )}
      </CrudModal>
    </section>
  );
}
