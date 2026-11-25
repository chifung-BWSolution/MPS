import { useMemo } from 'react';
import { BvAllocationList } from '@/components/finance/BvAllocationPage';
import { useQuotationSection } from '@/context/QuotationSectionContext';
import { useFinanceBvAllocation } from '@/hooks/useFinanceBvAllocation';
import { filterBvAllocationsBySection } from '@/lib/financeBvAllocation';
import { COMPANY_BV_LABEL, COMPANY_BV_RATIO, STAFF_BV_POOL, formatBvRatio } from '@/lib/quotationBv';

export function QuotationBvAllocationPage() {
  const { allowedTypes, allowedCodes, typeOptions } = useQuotationSection();
  const { groups, loading, error, lastSyncedAt, refresh } = useFinanceBvAllocation();
  const allowed = useMemo(
    () => [...new Set([...allowedTypes, ...allowedCodes].map((value) => value.trim()).filter(Boolean))],
    [allowedTypes, allowedCodes],
  );
  const scoped = useMemo(() => filterBvAllocationsBySection(groups, allowed), [groups, allowed]);
  const projectTypeOptions = useMemo(
    () =>
      typeOptions.map((option) => ({
        key: option.code || option.id,
        label: option.label,
      })),
    [typeOptions],
  );
  const scopeNames = projectTypeOptions.map((option) => option.label).join('、');
  const description = `列出本區項目${scopeNames ? `（${scopeNames}）` : ''}，範圍與 Pitching、Project 相同。分析建議按 day report 已申報工時，把協作者 ${formatBvRatio(STAFF_BV_POOL)}% 按工時比例拆開。${COMPANY_BV_LABEL} 固定 ${formatBvRatio(COMPANY_BV_RATIO)}%。`;

  return (
    <>
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700 mb-4">
          載入失敗：{error}
        </div>
      )}
      {loading ? (
        <div className="space-y-3">
          <div>
            <h1 className="text-[22px] font-bold">BV 分配</h1>
            <p className="text-[13px] text-muted-foreground mt-1">{description}</p>
          </div>
          <div className="text-[13px] text-muted-foreground py-12 text-center">載入中…</div>
        </div>
      ) : (
        <BvAllocationList
          groups={scoped}
          onRefresh={() => void refresh()}
          projectTypeOptions={projectTypeOptions}
          stickyChrome
          header={
            <div>
              <h1 className="text-[22px] font-bold">BV 分配</h1>
              <p className="text-[13px] text-muted-foreground mt-1">{description}</p>
              {lastSyncedAt && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  最後更新：{new Date(lastSyncedAt).toLocaleString('zh-HK', { hour12: false })}
                </p>
              )}
            </div>
          }
        />
      )}
    </>
  );
}
