import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { CrudModal } from '@/components/ui/crud-modal';
import {
  FinanceFilterSelect,
  FinanceProjectLink,
  FinanceSearchInput,
  FinanceStatCard,
  financeHeaderClass,
} from '@/components/finance/FinanceListChrome';
import { IncomeEditDialog, type IncomeEditSaveInput } from '@/components/quotation/IncomeEditDialog';
import { useFinanceIncomes } from '@/hooks/useFinanceLedgers';
import { useQuotationIncomes } from '@/hooks/useQuotationIncomes';
import {
  ANNUAL_FEE_PROJECT_TYPE_KEYS,
  annualFeePaymentStatusLabel,
  buildAnnualFeeGroups,
  formatAnnualFeeNextDueLabel,
  summarizeAnnualFeeGroups,
  type AnnualFeeGroup,
} from '@/lib/annualFeeIncomes';
import { financeProjectTypeLabel } from '@/lib/financeProjectType';
import {
  daysUntilDue,
  formatFinanceMoney,
  formatRemainingDays,
  remainingDaysClass,
} from '@/lib/financeLedgers';
import { formatIncomeDate, formatLocalIsoDate } from '@/lib/quotationIncomes';
import { cn } from '@/lib/utils';

function AnnualFeeIncomeEditor({
  projectId,
  incomeId,
  onClose,
  onSaved,
}: {
  projectId: string;
  incomeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { rows, loading, error, updateIncome } = useQuotationIncomes(projectId);
  const income = rows.find((row) => row.id === incomeId) ?? null;
  const [saving, setSaving] = useState(false);

  const handleSave = async (payload: IncomeEditSaveInput) => {
    setSaving(true);
    const result = await updateIncome(incomeId, payload);
    setSaving(false);
    if (result.error) {
      toast.error(`更新失敗：${result.error.message}`);
      return;
    }
    toast.success('已更新收入');
    onSaved();
    onClose();
  };

  if (!income) {
    return (
      <CrudModal isOpen onClose={onClose} title="編輯收入" size="lg">
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {loading ? '載入收入中…' : error || '找不到這筆收入'}
        </p>
      </CrudModal>
    );
  }

  return (
    <IncomeEditDialog
      open
      income={income}
      siblingRows={rows}
      saving={saving}
      onClose={onClose}
      onSave={(payload) => void handleSave(payload)}
    />
  );
}

function GroupHeaderStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-[88px]">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('block text-[14px] font-semibold tabular-nums whitespace-nowrap', accent)}>{value}</span>
    </div>
  );
}

function AnnualFeeGroupCard({
  group,
  asOf,
  showAll,
  onToggleShowAll,
  onEdit,
}: {
  group: AnnualFeeGroup;
  asOf: string;
  showAll: boolean;
  onToggleShowAll: () => void;
  onEdit: (incomeId: string) => void;
}) {
  const visibleRows = showAll ? group.rows : group.defaultRows;
  const hiddenCount = group.rows.length - group.defaultRows.length;

  return (
    <section className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
      <header className="flex items-start justify-between gap-4 flex-wrap px-4 py-3 bg-muted/30 border-b border-border">
        <div className="min-w-0">
          <FinanceProjectLink
            name={group.projectName}
            quotationClientProjectId={group.projectId}
            projectStatus={group.projectStatus}
          />
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {group.clientName || '—'}
            <span className="mx-1.5">·</span>
            {financeProjectTypeLabel(group.projectTypeKey)}
          </p>
        </div>
        <div className="flex items-start gap-5 flex-wrap">
          <GroupHeaderStat label="收入合計" value={formatFinanceMoney(group.totalBilled)} />
          <GroupHeaderStat label="期數" value={String(group.installmentCount)} />
          <GroupHeaderStat
            label="下次收費日"
            value={formatAnnualFeeNextDueLabel(group)}
            accent={group.nextDueDate ? undefined : 'text-rose-600'}
          />
          <GroupHeaderStat
            label="下次收費金額"
            value={formatFinanceMoney(group.upcomingAmount)}
            accent="text-rose-700"
          />
        </div>
      </header>

      {hiddenCount > 0 && (
        <div className="px-4 py-2 border-b border-border/60 flex justify-end">
          <button
            type="button"
            onClick={onToggleShowAll}
            className="text-[12px] font-medium text-teal-700 hover:text-teal-800"
          >
            {showAll ? '只看未收與即將到期' : `顯示全部期數（${group.rows.length}）`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className={financeHeaderClass}>到期日</th>
              <th className={financeHeaderClass}>期數</th>
              <th className={financeHeaderClass}>類型</th>
              <th className={financeHeaderClass}>應收</th>
              <th className={financeHeaderClass}>實收</th>
              <th className={financeHeaderClass}>未收</th>
              <th className={financeHeaderClass}>狀態</th>
              <th className={financeHeaderClass}>編輯</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const days = daysUntilDue(row.dueDate, asOf);
              return (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-[13px] text-muted-foreground whitespace-nowrap">
                    <span className="tabular-nums">{formatIncomeDate(row.dueDate)}</span>
                    <span className={cn('ml-2 tabular-nums', remainingDaysClass(days))}>
                      {formatRemainingDays(days)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums">{row.installmentNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-[13px]">{row.typeLabel}</td>
                  <td className="px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap">
                    {formatFinanceMoney(row.billedAmount, row.currency)}
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">
                    {formatFinanceMoney(row.paymentAmount, row.currency)}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap text-rose-700">
                    {formatFinanceMoney(row.outstanding, row.currency)}
                  </td>
                  <td className="px-4 py-3 text-[13px]">{annualFeePaymentStatusLabel(row)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onEdit(row.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label={`編輯 ${group.projectName} 第 ${row.installmentNumber ?? ''} 期`}
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className={cn(financeHeaderClass, 'py-6 text-center font-normal normal-case tracking-normal')}
                >
                  沒有未收逾期或即將到期的期數
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AnnualFeesPage() {
  const { incomes, loading, error, lastSyncedAt, refresh } = useFinanceIncomes();
  const asOf = formatLocalIsoDate(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [projectType, setProjectType] = useState('all');
  const [showAllIds, setShowAllIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ projectId: string; incomeId: string } | null>(null);

  const groups = useMemo(
    () => buildAnnualFeeGroups(incomes, { search: searchQuery, projectType, asOf }),
    [incomes, searchQuery, projectType, asOf],
  );
  const stats = useMemo(() => summarizeAnnualFeeGroups(groups), [groups]);
  const showAll = useMemo(() => new Set(showAllIds), [showAllIds]);

  return (
    <div>
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[22px] font-bold">年度收費</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            列出 BWT 系統與 BWT 網頁客戶項目的收入，按項目合計，並顯示下次收費與仍未收的逾期金額。
          </p>
          {lastSyncedAt && (
            <p className="text-[11px] text-muted-foreground mt-1">
              最後更新：{new Date(lastSyncedAt).toLocaleString('zh-HK', { hour12: false })}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FinanceStatCard label="項目數" value={stats.projectCount} />
          <FinanceStatCard label="收入合計" value={formatFinanceMoney(stats.totalBilled)} />
          <FinanceStatCard
            label="下次收費合計"
            value={formatFinanceMoney(stats.upcomingAmount)}
            accent="text-rose-700"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <FinanceSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜尋項目、客戶..."
          />
          <FinanceFilterSelect
            value={projectType}
            onChange={setProjectType}
            ariaLabel="項目類型"
          >
            <option value="all">全部</option>
            {ANNUAL_FEE_PROJECT_TYPE_KEYS.map((key) => (
              <option key={key} value={key}>
                {financeProjectTypeLabel(key)}
              </option>
            ))}
          </FinanceFilterSelect>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700 mb-5">
          載入失敗：{error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-muted-foreground py-12 text-center">載入中…</div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-8 text-center text-[13px] text-muted-foreground">
          沒有找到符合條件的年度收費
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <AnnualFeeGroupCard
              key={group.projectId}
              group={group}
              asOf={asOf}
              showAll={showAll.has(group.projectId)}
              onToggleShowAll={() =>
                setShowAllIds((prev) =>
                  prev.includes(group.projectId)
                    ? prev.filter((id) => id !== group.projectId)
                    : [...prev, group.projectId],
                )
              }
              onEdit={(incomeId) => setEditing({ projectId: group.projectId, incomeId })}
            />
          ))}
        </div>
      )}

      {editing && (
        <AnnualFeeIncomeEditor
          key={editing.incomeId}
          projectId={editing.projectId}
          incomeId={editing.incomeId}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
}
