import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { useRelatedProjectStaffHours } from '@/hooks/useRelatedProjectStaffHours';
import type { QuotationBvRecord } from '@/lib/quotationBv';
import {
  COMPANY_BV_LABEL,
  COMPANY_BV_RATIO,
  STAFF_BV_POOL,
  formatBvRatio,
  isStaffBvComplete,
  mergeBvDraftStaff,
  projectBvTotal,
  suggestStaffBvFromHours,
  sumBvRatios,
} from '@/lib/quotationBv';
import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';

type DraftRow = {
  key: string;
  id?: string;
  staffId: string;
  staffName: string;
  position: string;
  hours: number;
  entryCount: number;
  bvRatio: string;
};

function newRowKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `bv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function emptyRow(): DraftRow {
  return {
    key: newRowKey(),
    staffId: '',
    staffName: '',
    position: '',
    hours: 0,
    entryCount: 0,
    bvRatio: '',
  };
}

export function QuotationBvBulkPanel({
  isOpen,
  onClose,
  projectTitle,
  relatedType,
  relatedId,
  assigned,
  saving,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectTitle?: string;
  relatedType: string;
  relatedId: string;
  assigned: QuotationBvRecord[];
  saving: boolean;
  onSave: (rows: Array<{ staffId: string; bvRatio: number }>) => Promise<boolean>;
}) {
  const { rows: hourStats, loading: hoursLoading, error: hoursError } = useRelatedProjectStaffHours(
    isOpen ? relatedType : undefined,
    isOpen ? relatedId : undefined,
  );
  const includeIds = useMemo(
    () => [...assigned.map((row) => row.staffId), ...hourStats.map((row) => row.staffId)],
    [assigned, hourStats],
  );
  const { options: staffOptions } = useActiveStaffOptions(includeIds);

  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setDraftRows(
      mergeBvDraftStaff(assigned, hourStats).map((row) => ({
        ...row,
        key: row.id || newRowKey(),
      })),
    );
  }, [isOpen, assigned, hourStats]);

  const suggestions = useMemo(
    () => suggestStaffBvFromHours(draftRows.map((row) => row.hours)),
    [draftRows],
  );
  const totalHours = useMemo(
    () => draftRows.reduce((sum, row) => sum + (row.hours > 0 ? row.hours : 0), 0),
    [draftRows],
  );
  const parsedRatios = useMemo(
    () =>
      draftRows.map((row) => {
        const value = Number(String(row.bvRatio).trim());
        return Number.isFinite(value) && value > 0 ? value : 0;
      }),
    [draftRows],
  );
  const staffTotal = useMemo(() => sumBvRatios(parsedRatios), [parsedRatios]);
  const total = useMemo(() => projectBvTotal(parsedRatios), [parsedRatios]);
  const isComplete = useMemo(() => isStaffBvComplete(parsedRatios), [parsedRatios]);

  const assignedStaffIds = useMemo(
    () => new Set(draftRows.map((row) => row.staffId).filter(Boolean)),
    [draftRows],
  );

  const addRow = () => {
    setDraftRows((prev) => [...prev, emptyRow()]);
  };

  const applyAllSuggestions = () => {
    if (totalHours <= 0) {
      toast.error('此項目尚未有相關工時，無法套用分拆建議');
      return;
    }
    setDraftRows((prev) =>
      prev.map((row, index) => {
        const suggested = suggestions[index] || 0;
        return {
          ...row,
          bvRatio: suggested > 0 ? formatBvRatio(suggested) : '',
        };
      }),
    );
  };

  const applyOneSuggestion = (index: number) => {
    const suggested = suggestions[index] || 0;
    if (suggested <= 0) return;
    setDraftRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, bvRatio: formatBvRatio(suggested) } : row,
      ),
    );
  };

  const updateRow = (key: string, patch: Partial<DraftRow>) => {
    setDraftRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    setDraftRows((prev) => prev.filter((row) => row.key !== key));
  };

  const handleSave = async () => {
    const payload: Array<{ staffId: string; bvRatio: number }> = [];
    const seen = new Set<string>();

    for (const row of draftRows) {
      const staffId = row.staffId.trim();
      const raw = String(row.bvRatio).trim();
      if (!staffId && !raw) continue;
      if (!staffId) {
        toast.error('請為每一筆 BV 選擇同事');
        return;
      }
      if (!raw) continue;
      const ratio = Number(raw);
      if (!Number.isFinite(ratio) || ratio <= 0 || ratio > STAFF_BV_POOL) {
        toast.error(`${row.staffName || '協作者'} 的 BV 比例須為大於 0、不大於 ${formatBvRatio(STAFF_BV_POOL)} 的數字`);
        return;
      }
      if (seen.has(staffId)) {
        toast.error('同一同事不可重複分配');
        return;
      }
      seen.add(staffId);
      payload.push({ staffId, bvRatio: ratio });
    }

    if (staffTotal > STAFF_BV_POOL) {
      toast.error(`協作者 BV 合計不可超過 ${formatBvRatio(STAFF_BV_POOL)}%（${COMPANY_BV_LABEL} 固定 ${formatBvRatio(COMPANY_BV_RATIO)}%）`);
      return;
    }

    const ok = await onSave(payload);
    if (ok) onClose();
  };

  return (
    <CrudModal
      isOpen={isOpen}
      onClose={onClose}
      title="批量設定 BV Ratio"
      size="2xl"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors"
          >
            <Plus size={13} /> 新增 BV
          </button>
          <button
            type="button"
            onClick={applyAllSuggestions}
            disabled={hoursLoading || totalHours <= 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            <Sparkles size={13} /> 套用全部建議
          </button>
        </div>
      }
      footer={
        <CrudModalFooter className="flex items-center justify-between gap-3">
          <div className="text-[13px]">
            <span className="text-muted-foreground">合計 Ratio</span>
            <span
              className={cn(
                'ml-2 font-semibold tabular-nums',
                isComplete ? 'text-teal-700' : 'text-amber-700',
              )}
            >
              {formatBvRatio(total)}%
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
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
          </div>
        </CrudModalFooter>
      }
    >
      <div className="space-y-4">
        {projectTitle ? (
          <p className="text-[13px] text-muted-foreground -mt-1">{projectTitle}</p>
        ) : null}

        <div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h3 className="text-[14px] font-semibold">BV 負責人 Ratio</h3>
              <p className="text-[12px] text-muted-foreground mt-1">
                為本項目所有 BV 人員設定分配比例。已有工時的同事會自動列出，可再新增人員。
              </p>
              <p className="text-[12px] text-amber-700 mt-1">
                「分拆建議」= 工時 ÷ 總工時 × {formatBvRatio(STAFF_BV_POOL)}
                %。公司固定 {formatBvRatio(COMPANY_BV_RATIO)}
                %，其餘按相關 day report 工時比例分配。
              </p>
            </div>
          </div>

          {hoursError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 mb-3">
              無法載入工時：{hoursError}
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border/60 bg-[#f7f9fc]">
                  <th className="px-3 py-2 font-medium">人員</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">工時</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">總工時</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">份額</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">分拆建議</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap w-[120px]">Ratio</th>
                  <th className="px-2 py-2 w-9" />
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50 bg-teal-50/70">
                  <td className="px-3 py-2.5">
                    <p className="text-[13px] font-medium">{COMPANY_BV_LABEL}</p>
                    <p className="text-[11px] text-muted-foreground">固定政策</p>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-muted-foreground">—</td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-muted-foreground">—</td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                    {formatBvRatio(COMPANY_BV_RATIO)}%
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-amber-700">
                    {formatBvRatio(COMPANY_BV_RATIO)}%
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="inline-flex items-center h-9 px-3 rounded-md border border-teal-200 bg-white text-[13px] tabular-nums">
                        {formatBvRatio(COMPANY_BV_RATIO)}
                        <span className="ml-1 text-muted-foreground">%</span>
                      </span>
                      <Lock size={12} className="text-teal-700 shrink-0" />
                    </div>
                  </td>
                  <td />
                </tr>

                {hoursLoading && draftRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                      載入工時與協作者中…
                    </td>
                  </tr>
                ) : draftRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-[13px] text-muted-foreground">
                      尚未有協作者或相關工時，請新增 BV
                    </td>
                  </tr>
                ) : (
                  draftRows.map((row, index) => {
                    const suggested = suggestions[index] || 0;
                    const availableStaff = staffOptions.filter(
                      (opt) => opt.value === row.staffId || !assignedStaffIds.has(opt.value),
                    );
                    return (
                      <tr key={row.key} className="border-b border-border/40 last:border-b-0">
                        <td className="px-3 py-2 align-top">
                          {row.id && row.staffId ? (
                            <div>
                              <p className="text-[13px] font-medium">{row.staffName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {[row.position, row.entryCount > 0 ? `${row.entryCount} 筆` : '']
                                  .filter(Boolean)
                                  .join(' · ') || '協作者'}
                              </p>
                            </div>
                          ) : (
                            <SearchableSelect
                              value={row.staffId}
                              onValueChange={(staffId) => {
                                const option = staffOptions.find((opt) => opt.value === staffId);
                                updateRow(row.key, {
                                  staffId,
                                  staffName: option?.label || '',
                                });
                              }}
                              options={availableStaff}
                              placeholder="搜尋同事..."
                              searchPlaceholder="搜尋姓名或電郵..."
                              emptyText="沒有可選同事"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-[13px] tabular-nums whitespace-nowrap">
                          {formatHours(row.hours)}h
                        </td>
                        <td className="px-3 py-2 text-right text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">
                          {totalHours > 0 ? `${formatHours(totalHours)}h` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-[13px] tabular-nums whitespace-nowrap">
                          {formatBvRatio(STAFF_BV_POOL)}%
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {suggested > 0 ? (
                            <button
                              type="button"
                              onClick={() => applyOneSuggestion(index)}
                              title="套用此建議"
                              className="text-[13px] tabular-nums text-amber-700 hover:text-amber-800 hover:underline"
                            >
                              {formatBvRatio(suggested)}%
                            </button>
                          ) : (
                            <span className="text-[13px] tabular-nums text-muted-foreground">0%</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={STAFF_BV_POOL}
                              step="0.01"
                              value={row.bvRatio}
                              onChange={(e) => updateRow(row.key, { bvRatio: e.target.value })}
                              placeholder={suggested > 0 ? formatBvRatio(suggested) : '0'}
                              className="h-9 text-[13px] text-right pr-7 tabular-nums"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                              %
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            aria-label={`移除 ${row.staffName || '協作者'}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 w-full flex items-center justify-center gap-1 py-2.5 rounded-md border border-dashed border-border text-[13px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <Plus size={14} /> 新增 BV 紀錄
          </button>
        </div>
      </div>
    </CrudModal>
  );
}
