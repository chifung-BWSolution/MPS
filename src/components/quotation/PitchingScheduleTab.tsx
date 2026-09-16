import { useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CrudModal, CrudModalFooter, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSchedules } from '@/hooks/useSchedules';
import {
  formatScheduleDate,
  validateScheduleInput,
  type Schedule,
  type ScheduleInput,
} from '@/lib/schedules';

function emptyDraft(): ScheduleInput {
  return { title: '', date: '', description: '' };
}

function ScheduleFormDialog({
  isOpen,
  onClose,
  editing,
  draft,
  onDraftChange,
  saving,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  editing: Schedule | null;
  draft: ScheduleInput;
  onDraftChange: (next: ScheduleInput) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <CrudModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? '編輯排程' : '新增排程'}
      size="md"
      footer={
        <CrudModalFooter className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
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
          <span className="text-[12px] text-muted-foreground block mb-1">標題 *</span>
          <Input
            value={draft.title}
            onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
            placeholder="例如：初稿提交"
            aria-label="排程標題"
          />
        </div>
        <div>
          <span className="text-[12px] text-muted-foreground block mb-1">日期 *</span>
          <Input
            type="date"
            value={draft.date}
            onChange={(e) => onDraftChange({ ...draft, date: e.target.value })}
            aria-label="排程日期"
          />
        </div>
        <div>
          <span className="text-[12px] text-muted-foreground block mb-1">描述</span>
          <Textarea
            value={draft.description ?? ''}
            onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
            placeholder="補充說明（選填）"
            rows={4}
            aria-label="排程描述"
          />
        </div>
      </div>
    </CrudModal>
  );
}

export function PitchingScheduleTab({
  relatedType,
  relatedId,
}: {
  relatedType: string;
  relatedId: string;
}) {
  const { rows, loading, error, addSchedule, updateSchedule, deleteSchedule } = useSchedules(
    relatedType,
    relatedId,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [draft, setDraft] = useState<ScheduleInput>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Schedule | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setModalOpen(true);
  };

  const openEdit = (row: Schedule) => {
    setEditing(row);
    setDraft({
      title: row.title,
      date: row.date,
      description: row.description,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setDraft(emptyDraft());
  };

  const handleSave = async () => {
    const validation = validateScheduleInput(draft);
    if (validation) {
      toast.error(validation);
      return;
    }

    setSaving(true);
    const result = editing
      ? await updateSchedule(editing.id, draft)
      : await addSchedule(draft);
    setSaving(false);
    if (result.error) {
      toast.error(`${editing ? '更新' : '新增'}失敗：${result.error.message}`);
      return;
    }
    toast.success(editing ? '已更新排程' : '已新增排程');
    closeModal();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error: delErr } = await deleteSchedule(deleting.id);
    if (delErr) {
      toast.error(`刪除失敗：${delErr.message}`);
      return;
    }
    toast.success('已刪除排程');
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[12px] text-muted-foreground">共 {rows.length} 項</span>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
        >
          <Plus size={14} /> 新增排程
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          無法載入項目排程：{error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-10 text-center text-[13px] text-muted-foreground">
          載入項目排程中…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
          <CalendarDays size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">尚未建立項目排程</p>
          <p className="text-[12px] text-muted-foreground/70 mt-1">可新增日期、標題與描述，方便追蹤項目進度</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    日期
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    標題
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    描述
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 text-[13px] tabular-nums whitespace-nowrap">
                      {formatScheduleDate(row.date)}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium">{row.title}</td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-[360px]">
                      <p className="line-clamp-2 whitespace-pre-wrap">{row.description || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          aria-label={`編輯 ${row.title}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(row)}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          aria-label={`刪除 ${row.title}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ScheduleFormDialog
        isOpen={modalOpen}
        onClose={closeModal}
        editing={editing}
        draft={draft}
        onDraftChange={setDraft}
        saving={saving}
        onSave={() => void handleSave()}
      />

      <DeleteConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        itemName={deleting?.title || '排程'}
        canDelete
        description={`確定要刪除「${deleting?.title || ''}」嗎？`}
      />
    </div>
  );
}
