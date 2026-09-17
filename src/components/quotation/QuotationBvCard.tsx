import { useMemo, useState } from 'react';
import { Lock, SlidersHorizontal, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuotationBv } from '@/hooks/useQuotationBv';
import type { ProjectHubRelatedType } from '@/lib/projectsHub';
import {
  COMPANY_BV_LABEL,
  COMPANY_BV_RATIO,
  STAFF_BV_POOL,
  formatBvRatio,
  isStaffBvComplete,
  projectBvTotal,
  remainingStaffBvRatio,
  sumBvRatios,
} from '@/lib/quotationBv';
import { QuotationBvBulkPanel } from '@/components/quotation/QuotationBvBulkPanel';

export function QuotationBvCard({
  relatedType,
  relatedId,
  projectTitle,
  variant = 'card',
}: {
  relatedType: ProjectHubRelatedType;
  relatedId: string;
  projectTitle?: string;
  variant?: 'card' | 'embedded';
}) {
  const { rows, loading, error, saveBulk } = useQuotationBv(relatedType, relatedId);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const staffTotal = useMemo(() => sumBvRatios(rows.map((row) => row.bvRatio)), [rows]);
  const remaining = useMemo(() => remainingStaffBvRatio(rows.map((row) => row.bvRatio)), [rows]);
  const total = useMemo(() => projectBvTotal(rows.map((row) => row.bvRatio)), [rows]);
  const isComplete = useMemo(() => isStaffBvComplete(rows.map((row) => row.bvRatio)), [rows]);

  const handleSave = async (payload: Array<{ staffId: string; bvRatio: number }>) => {
    setSaving(true);
    const { error: saveErr } = await saveBulk(payload);
    setSaving(false);
    if (saveErr) {
      toast.error(`儲存失敗：${saveErr.message}`);
      return false;
    }
    toast.success('已更新項目 BV Ratio');
    return true;
  };

  return (
    <div
      className={cn(
        'h-full',
        variant === 'card' && 'bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-teal-50 flex items-center justify-center">
            <Users size={16} className="text-teal-700" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold">協作者 Collaborators</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {COMPANY_BV_LABEL} 固定 {formatBvRatio(COMPANY_BV_RATIO)}%，協作者合計應為 {formatBvRatio(STAFF_BV_POOL)}%
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
        >
          <SlidersHorizontal size={13} /> 批量設定
        </button>
      </div>

      <div
        className={cn(
          'flex items-center justify-between rounded-md px-3 py-2 mb-4 text-[12px]',
          isComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
        )}
      >
        <span>
          合計 {formatBvRatio(total)}%（公司 {formatBvRatio(COMPANY_BV_RATIO)}% + 協作者 {formatBvRatio(staffTotal)}%）
        </span>
        <span>
          {isComplete ? `協作者已分配 ${formatBvRatio(STAFF_BV_POOL)}%` : `協作者尚餘 ${formatBvRatio(remaining)}%`}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 mb-3">
          無法載入協作者：{error}
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-muted-foreground py-8 text-center">載入協作者中…</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-md border border-teal-200/80 bg-teal-50/70 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate">{COMPANY_BV_LABEL}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {formatBvRatio(COMPANY_BV_RATIO)}% BV · 固定政策
              </p>
            </div>
            <span className="inline-flex items-center gap-1 shrink-0 text-[11px] text-teal-800">
              <Lock size={12} />
              鎖定
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-[13px] text-muted-foreground">尚未設定協作者</p>
              <p className="text-[12px] text-muted-foreground/70 mt-1">
                依工時建議分配其餘 {formatBvRatio(STAFF_BV_POOL)}%
              </p>
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{row.staffName}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{formatBvRatio(row.bvRatio)}% BV</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <QuotationBvBulkPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        projectTitle={projectTitle}
        relatedType={relatedType}
        relatedId={relatedId}
        assigned={rows}
        saving={saving}
        onSave={handleSave}
      />
    </div>
  );
}
