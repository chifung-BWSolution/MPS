import { useMemo, useState } from 'react';
import { Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { useQuotationBv } from '@/hooks/useQuotationBv';
import type { ProjectHubRelatedType } from '@/lib/projectsHub';
import {
  COMPANY_BV_LABEL,
  COMPANY_BV_RATIO,
  STAFF_BV_POOL,
  isStaffBvComplete,
  projectBvTotal,
  remainingStaffBvRatio,
  sumBvRatios,
  wouldExceedStaffBvPool,
  type QuotationBvRecord,
} from '@/lib/quotationBv';
import { CrudModal, CrudModalFooter, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';

type Draft = {
  staffId: string;
  bvRatio: string;
};

const emptyDraft = (remaining = ''): Draft => ({
  staffId: '',
  bvRatio: remaining,
});

function formatRatio(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

export function QuotationBvCard({
  relatedType,
  relatedId,
  variant = 'card',
}: {
  relatedType: ProjectHubRelatedType;
  relatedId: string;
  variant?: 'card' | 'embedded';
}) {
  const { rows, loading, error, addRow, updateRow, deleteRow } = useQuotationBv(relatedType, relatedId);
  const { options: staffOptions } = useActiveStaffOptions(rows.map((row) => row.staffId));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationBvRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<QuotationBvRecord | null>(null);

  const staffTotal = useMemo(() => sumBvRatios(rows.map((row) => row.bvRatio)), [rows]);
  const remaining = useMemo(() => remainingStaffBvRatio(rows.map((row) => row.bvRatio)), [rows]);
  const total = useMemo(() => projectBvTotal(rows.map((row) => row.bvRatio)), [rows]);
  const isComplete = useMemo(() => isStaffBvComplete(rows.map((row) => row.bvRatio)), [rows]);

  const assignedStaffIds = useMemo(() => {
    const ids = new Set(rows.map((row) => row.staffId));
    if (editing) ids.delete(editing.staffId);
    return ids;
  }, [rows, editing]);

  const availableStaff = useMemo(
    () => staffOptions.filter((opt) => !assignedStaffIds.has(opt.value)),
    [staffOptions, assignedStaffIds],
  );

  const otherSum = useMemo(() => {
    if (!editing) return staffTotal;
    return sumBvRatios(rows.filter((row) => row.id !== editing.id).map((row) => row.bvRatio));
  }, [editing, rows, staffTotal]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft(remaining > 0 ? String(remaining) : ''));
    setModalOpen(true);
  };

  const openEdit = (row: QuotationBvRecord) => {
    setEditing(row);
    setDraft({ staffId: row.staffId, bvRatio: formatRatio(row.bvRatio) });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setDraft(emptyDraft());
  };

  const handleSave = async () => {
    const staffId = draft.staffId.trim();
    const ratio = Number(draft.bvRatio);
    if (!staffId) {
      toast.error('請選擇協作者');
      return;
    }
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > STAFF_BV_POOL) {
      toast.error(`BV 比例須為大於 0、不大於 ${STAFF_BV_POOL} 的數字`);
      return;
    }
    if (wouldExceedStaffBvPool(otherSum, ratio)) {
      toast.error(`協作者 BV 合計不可超過 ${STAFF_BV_POOL}%（${COMPANY_BV_LABEL} 固定 ${COMPANY_BV_RATIO}%）`);
      return;
    }

    setSaving(true);
    if (editing) {
      const { error: saveErr } = await updateRow(editing.id, { staffId, bvRatio: ratio });
      setSaving(false);
      if (saveErr) {
        toast.error(`更新失敗：${saveErr.message}`);
        return;
      }
      toast.success('已更新協作者');
    } else {
      const { error: addErr } = await addRow({ staffId, bvRatio: ratio });
      setSaving(false);
      if (addErr) {
        toast.error(`新增失敗：${addErr.message}`);
        return;
      }
      toast.success('已新增協作者');
    }
    closeModal();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error: delErr } = await deleteRow(deleting.id);
    if (delErr) {
      toast.error(`刪除失敗：${delErr.message}`);
      return;
    }
    toast.success('已移除協作者');
    setDeleting(null);
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
              {COMPANY_BV_LABEL} 固定 {formatRatio(COMPANY_BV_RATIO)}%，協作者合計應為 {formatRatio(STAFF_BV_POOL)}%
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus size={13} /> 新增
        </button>
      </div>

      <div
        className={cn(
          'flex items-center justify-between rounded-md px-3 py-2 mb-4 text-[12px]',
          isComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
        )}
      >
        <span>
          合計 {formatRatio(total)}%（公司 {formatRatio(COMPANY_BV_RATIO)}% + 協作者 {formatRatio(staffTotal)}%）
        </span>
        <span>
          {isComplete ? `協作者已分配 ${formatRatio(STAFF_BV_POOL)}%` : `協作者尚餘 ${formatRatio(remaining)}%`}
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
                {formatRatio(COMPANY_BV_RATIO)}% BV · 固定政策
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
                新增同事並分配其餘 {formatRatio(STAFF_BV_POOL)}%
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
                  <p className="text-[11px] text-muted-foreground tabular-nums">{formatRatio(row.bvRatio)}% BV</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label={`編輯 ${row.staffName}`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(row)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    aria-label={`刪除 ${row.staffName}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <CrudModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? '編輯協作者' : '新增協作者'}
        size="sm"
        footer={
          <CrudModalFooter className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
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
          </CrudModalFooter>
        }
      >
        <div className="space-y-4">
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">同事 Staff</span>
            <SearchableSelect
              value={draft.staffId}
              onValueChange={(staffId) => setDraft((prev) => ({ ...prev, staffId }))}
              options={availableStaff}
              placeholder="搜尋同事..."
              searchPlaceholder="搜尋姓名或電郵..."
              emptyText="沒有可選同事"
            />
          </div>
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">BV 比例 (%)</span>
            <Input
              type="number"
              min={0.01}
              max={STAFF_BV_POOL}
              step="0.01"
              value={draft.bvRatio}
              onChange={(e) => setDraft((prev) => ({ ...prev, bvRatio: e.target.value }))}
              placeholder={remaining > 0 && !editing ? String(remaining) : '例如 35'}
              className="text-[13px]"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {COMPANY_BV_LABEL} 固定 {formatRatio(COMPANY_BV_RATIO)}%。其他協作者已佔 {formatRatio(otherSum)}
              %，這筆最多 {formatRatio(Math.max(0, STAFF_BV_POOL - otherSum))}%
            </p>
          </div>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        itemName={deleting?.staffName || '協作者'}
        canDelete
        description={`確定要移除「${deleting?.staffName || ''}」的 BV 分配嗎？`}
      />
    </div>
  );
}
