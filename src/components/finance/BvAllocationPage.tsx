import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Lock, SlidersHorizontal, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFinanceBvAllocation } from '@/hooks/useFinanceBvAllocation';
import { useQuotationBv } from '@/hooks/useQuotationBv';
import { isBvSourceRelatedType } from '@/lib/quotationBv';
import { formatFinanceMoney } from '@/lib/financeLedgers';
import { formatIncomeDate } from '@/lib/quotationIncomes';
import { QuotationBvBulkPanel } from '@/components/quotation/QuotationBvBulkPanel';
import {
  BV_RATIO_FILTERS,
  BV_RATIO_FILTER_LABELS,
  DEFAULT_BV_ALLOCATION_SORT_DIR,
  DEFAULT_BV_ALLOCATION_SORT_KEY,
  DEFAULT_BV_RATIO_FILTER,
  companyBvDetailRow,
  filterBvAllocations,
  formatBvPercent,
  nextBvAllocationSort,
  projectStatusLabel,
  sortBvAllocations,
  summarizeBvAllocations,
  uniqueBvStaffOptions,
  type BvAllocationGroup,
  type BvAllocationSortDir,
  type BvAllocationSortKey,
  type BvRatioFilter,
} from '@/lib/financeBvAllocation';
import {
  FinanceFilterSelect,
  FinancePageFrame,
  FinanceProjectLink,
  FinanceSearchInput,
  FinanceSortableTh,
  financeHeaderClass,
} from '@/components/finance/FinanceListChrome';

const COLUMN_COUNT = 11;

function ratioTone(status: BvAllocationGroup['ratioStatus']) {
  if (status === 'equal') return 'text-emerald-700';
  if (status === 'over') return 'text-rose-700';
  return 'text-amber-700';
}

function BvHeaders({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: BvAllocationSortKey;
  sortDir: BvAllocationSortDir;
  onSort: (key: BvAllocationSortKey) => void;
}) {
  return (
    <tr className="border-b border-border bg-muted/30">
      <FinanceSortableTh label="簽約日期" sortKey="signedDate" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="交付日期" sortKey="handoverDate" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="項目" sortKey="projectName" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="項目類型" sortKey="projectTypeLabel" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="人員" sortKey="staffNames" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="項目狀態" sortKey="projectStatus" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="BV 人數" sortKey="staffCount" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="Ratio%" sortKey="totalRatio" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="總額" sortKey="estimatedIncome" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <FinanceSortableTh label="Est Profit" sortKey="estimatedProfit" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <th className={cn(financeHeaderClass, 'text-right')}>操作</th>
    </tr>
  );
}

function BvStatCard({
  label,
  value,
  hint,
  active,
  tone,
  icon,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  active: boolean;
  tone: 'equal' | 'under' | 'over';
  icon: ReactNode;
  onClick: () => void;
}) {
  const ring =
    tone === 'equal'
      ? 'border-emerald-200 bg-emerald-50/70'
      : tone === 'over'
        ? 'border-rose-200 bg-rose-50/70'
        : 'border-amber-200 bg-amber-50/70';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 transition-colors',
        active && ring,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {icon}
      </div>
      <span className={cn('text-[22px] font-bold block mt-1', ratioTone(tone))}>{value}</span>
      <span className="text-[12px] text-muted-foreground mt-1 block">{hint}</span>
    </button>
  );
}

function BvDetailRows({ group }: { group: BvAllocationGroup }) {
  const company = companyBvDetailRow();
  return (
    <tr className="bg-muted/15">
      <td colSpan={COLUMN_COUNT} className="px-4 py-3">
        <div className="rounded-md border border-border/60 bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className={cn(financeHeaderClass, 'normal-case tracking-normal')}>人員</th>
                <th className={cn(financeHeaderClass, 'normal-case tracking-normal')}>職稱</th>
                <th className={cn(financeHeaderClass, 'normal-case tracking-normal text-right')}>BV</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/40">
                <td className="px-4 py-2.5 text-[13px] font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock size={12} className="text-teal-700" />
                    {company.staffName}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{company.staffPosition}</td>
                <td className="px-4 py-2.5 text-[13px] tabular-nums text-right">{formatBvPercent(company.bvRatio)}</td>
              </tr>
              {group.staff.map((row) => (
                <tr key={row.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5 text-[13px] font-medium">{row.staffName}</td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{row.staffPosition || '—'}</td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums text-right">{formatBvPercent(row.bvRatio)}</td>
                </tr>
              ))}
              {group.staff.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                    尚未設定協作者
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function canAssignBv(group: BvAllocationGroup): boolean {
  return Boolean(isBvSourceRelatedType(group.relatedType) && group.relatedId?.trim());
}

function BvAllocationBulkDialog({
  group,
  onClose,
  onSaved,
}: {
  group: BvAllocationGroup;
  onClose: () => void;
  onSaved: () => void;
}) {
  const relatedType = isBvSourceRelatedType(group.relatedType) ? group.relatedType : undefined;
  const relatedId = group.relatedId?.trim() || undefined;
  const { rows, saveBulk } = useQuotationBv(relatedType, relatedId);
  const [saving, setSaving] = useState(false);

  if (!relatedType || !relatedId) return null;

  return (
    <QuotationBvBulkPanel
      isOpen
      onClose={onClose}
      projectTitle={group.projectName}
      relatedType={relatedType}
      relatedId={relatedId}
      assigned={rows}
      saving={saving}
      onSave={async (payload) => {
        setSaving(true);
        const { error } = await saveBulk(payload);
        setSaving(false);
        if (error) {
          toast.error(`儲存失敗：${error.message}`);
          return false;
        }
        toast.success('已更新項目 BV Ratio');
        onSaved();
        return true;
      }}
    />
  );
}

function BvAllocationList({
  groups,
  onRefresh,
}: {
  groups: BvAllocationGroup[];
  onRefresh: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [ratioFilter, setRatioFilter] = useState<BvRatioFilter>(DEFAULT_BV_RATIO_FILTER);
  const [staffFilter, setStaffFilter] = useState('all');
  const [sortKey, setSortKey] = useState<BvAllocationSortKey>(DEFAULT_BV_ALLOCATION_SORT_KEY);
  const [sortDir, setSortDir] = useState<BvAllocationSortDir>(DEFAULT_BV_ALLOCATION_SORT_DIR);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<BvAllocationGroup | null>(null);

  const staffOptions = useMemo(() => uniqueBvStaffOptions(groups), [groups]);
  const stats = useMemo(() => summarizeBvAllocations(groups), [groups]);
  const filtered = useMemo(
    () =>
      filterBvAllocations(groups, {
        search: searchQuery,
        ratioStatus: ratioFilter,
        staffId: staffFilter === 'all' ? undefined : staffFilter,
      }),
    [groups, searchQuery, ratioFilter, staffFilter],
  );
  const sorted = useMemo(() => sortBvAllocations(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const toggleRatioFilter = (next: BvRatioFilter) => {
    setRatioFilter((current) => (current === next ? 'all' : next));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BvStatCard
          label="Ratio = 100%"
          value={stats.equal}
          hint="分配完成"
          active={ratioFilter === 'equal'}
          tone="equal"
          icon={<CheckCircle2 size={18} className="text-emerald-600" />}
          onClick={() => toggleRatioFilter('equal')}
        />
        <BvStatCard
          label="Ratio < 100%"
          value={stats.under}
          hint="分配不足"
          active={ratioFilter === 'under'}
          tone="under"
          icon={<AlertTriangle size={18} className="text-amber-500" />}
          onClick={() => toggleRatioFilter('under')}
        />
        <BvStatCard
          label="Ratio > 100%"
          value={stats.over}
          hint="分配超額"
          active={ratioFilter === 'over'}
          tone="over"
          icon={<AlertTriangle size={18} className="text-rose-500" />}
          onClick={() => toggleRatioFilter('over')}
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <FinanceSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜尋項目名稱、編號或人員..."
        />
        <FinanceFilterSelect
          value={staffFilter}
          onChange={setStaffFilter}
          ariaLabel="人員"
        >
          <option value="all">全部人員</option>
          {staffOptions.map((staff) => (
            <option key={staff.id} value={staff.id}>
              {staff.name}
            </option>
          ))}
        </FinanceFilterSelect>
        <FinanceFilterSelect
          value={ratioFilter}
          onChange={(value) => setRatioFilter(value as BvRatioFilter)}
          ariaLabel="BV 狀態"
        >
          {BV_RATIO_FILTERS.map((filter) => (
            <option key={filter} value={filter}>
              {BV_RATIO_FILTER_LABELS[filter]}
            </option>
          ))}
        </FinanceFilterSelect>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <BvHeaders
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={(key) => {
                  const next = nextBvAllocationSort(sortKey, sortDir, key);
                  setSortKey(next.key);
                  setSortDir(next.dir);
                }}
              />
            </thead>
            <tbody>
              {sorted.map((group) => {
                const expanded = expandedId === group.projectId;
                return (
                  <BvGroupRows
                    key={group.projectId}
                    group={group}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : group.projectId)}
                    onAssign={() => setAssigning(group)}
                  />
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMN_COUNT}
                    className={cn(financeHeaderClass, 'py-8 text-center font-normal normal-case tracking-normal')}
                  >
                    沒有找到符合條件的 BV 分配項目
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {assigning && (
        <BvAllocationBulkDialog
          group={assigning}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function BvGroupRows({
  group,
  expanded,
  onToggle,
  onAssign,
}: {
  group: BvAllocationGroup;
  expanded: boolean;
  onToggle: () => void;
  onAssign: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <>
      <tr
        className={cn(
          'border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer',
          expanded && 'bg-muted/10',
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums whitespace-nowrap">
          <span className="inline-flex items-center gap-2">
            <Chevron size={14} className="text-muted-foreground shrink-0" />
            {formatIncomeDate(group.signedDate)}
          </span>
        </td>
        <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums whitespace-nowrap">
          {formatIncomeDate(group.handoverDate)}
        </td>
        <td className="px-4 py-3">
          <span onClick={(event) => event.stopPropagation()}>
            <FinanceProjectLink
              name={group.projectName}
              quotationClientProjectId={group.quotationClientProjectId}
              projectStatus={group.projectStatus}
              websiteId={group.websiteId}
            />
          </span>
          {group.pitchingCode && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{group.pitchingCode}</p>
          )}
        </td>
        <td className="px-4 py-3 text-[13px]">{group.projectTypeLabel || '—'}</td>
        <td className="px-4 py-3 text-[13px]" title={group.staffNames || undefined}>
          {group.staffNameItems.length === 0 ? (
            '—'
          ) : (
            <span className="inline-flex flex-wrap items-center gap-x-1">
              {group.staffNameItems.map((row, index) => (
                <span key={row.staffId || `${row.staffName}-${index}`} className="inline-flex items-center gap-0.5">
                  {row.isMainPm && (
                    <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" aria-label="主要 PM" />
                  )}
                  {row.staffName}
                  {index < group.staffNameItems.length - 1 ? '、' : ''}
                </span>
              ))}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-[13px]">{projectStatusLabel(group.projectStatus)}</td>
        <td className="px-4 py-3 text-[13px] tabular-nums">{group.staffCount}</td>
        <td className={cn('px-4 py-3 text-[13px] font-medium tabular-nums whitespace-nowrap', ratioTone(group.ratioStatus))}>
          {formatBvPercent(group.totalRatio)}
        </td>
        <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">
          {group.estimatedIncome == null ? '—' : formatFinanceMoney(group.estimatedIncome)}
        </td>
        <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">
          {group.estimatedProfit == null ? '—' : formatFinanceMoney(group.estimatedProfit)}
        </td>
        <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            disabled={!canAssignBv(group)}
            onClick={onAssign}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <SlidersHorizontal size={13} /> 批量設定
          </button>
        </td>
      </tr>
      {expanded && <BvDetailRows group={group} />}
    </>
  );
}

export function BvAllocationPage() {
  const { groups, loading, error, lastSyncedAt, refresh } = useFinanceBvAllocation();

  return (
    <FinancePageFrame
      title="BV 分配"
      description="列出 pitching / 網站項目的 BV 分配，包含尚未寫入 quotation_bv 的項目。公司固定 30%，協作者合計應為 70%，項目合計應為 100%。"
      lastSyncedAt={lastSyncedAt}
      error={error}
      loading={loading}
    >
      <BvAllocationList groups={groups} onRefresh={() => void refresh()} />
    </FinancePageFrame>
  );
}
