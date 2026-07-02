import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FootageMode, ProductionProgress, ProductionTask, VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  PRODUCTION_TASK_LABELS,
  normalizeProductionProgress,
  validateProductionProgress,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
} from '@/lib/videoWorkflowUtils';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  open: boolean;
  video: VideoWorkflowMock | null;
  onClose: () => void;
  onSave: (payload: {
    productionProgress: ProductionProgress;
    storagePath?: string;
    plannedPublishDate?: string;
  }) => Promise<string | null>;
};

function TaskRow({
  label,
  task,
  disabled,
  disabledHint,
  onChange,
}: {
  label: string;
  task: ProductionTask;
  disabled?: boolean;
  disabledHint?: string;
  onChange: (next: ProductionTask) => void;
}) {
  return (
    <div className={cn('grid grid-cols-[88px_1fr_100px] gap-3 items-center py-2 border-b border-border/40 last:border-0', disabled && 'opacity-60')}>
      <span className="text-[12px] font-medium text-slate-700">{label}</span>
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={task.done}
          disabled={disabled}
          onChange={e => onChange({ ...task, done: e.target.checked })}
        />
        完成
        {disabledHint && <span className="text-[11px] text-muted-foreground">{disabledHint}</span>}
      </label>
      <div>
        <Input
          type="number"
          min={0}
          step={0.5}
          disabled={disabled}
          value={task.hours ?? ''}
          onChange={e => onChange({ ...task, hours: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 })}
          placeholder="工時 h"
          className="h-8 text-[12px]"
        />
      </div>
    </div>
  );
}

export function ProductionEditModal({ open, video, onClose, onSave }: Props) {
  const [progress, setProgress] = useState<ProductionProgress>(() => normalizeProductionProgress({} as VideoWorkflowMock));
  const [storagePath, setStoragePath] = useState('');
  const [plannedPublishDate, setPlannedPublishDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !video) return;
    setFormError(null);
    setProgress(normalizeProductionProgress(video));
    setStoragePath(video.storagePath ?? '');
    setPlannedPublishDate(video.plannedPublishDate ?? '');
  }, [open, video]);

  if (!video) return null;

  const setFootageMode = (mode: FootageMode) => {
    setProgress(p => ({
      ...p,
      footageMode: mode,
      rawFootage: mode === 'shoot' ? p.rawFootage : { done: false, hours: undefined },
    }));
  };

  const setEditingMode = (mode: boolean | null) => {
    setProgress(p => ({
      ...p,
      editingMode: mode,
      editing: mode === true ? p.editing : { done: false, hours: undefined },
    }));
  };

  const handleSave = async () => {
    setFormError(null);
    const err = validateProductionProgress(progress);
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    const saveErr = await onSave({
      productionProgress: progress,
      storagePath: storagePath.trim() || undefined,
      plannedPublishDate: plannedPublishDate.trim() || undefined,
    });
    setSaving(false);
    if (saveErr) {
      setFormError(saveErr);
      return;
    }
    onClose();
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={onClose}
      title={`編輯 — ${video.videoCode}`}
      size="lg"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {formError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{formError}</p>
        )}

        {video.reviewRejectReason && (
          <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            審核已拒絕：{video.reviewRejectReason}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS.production)}>
            {VIDEO_WORKFLOW_STAGE_LABELS.production}
          </span>
          <span className="text-muted-foreground">{video.vchannelCode}</span>
          <span className="font-bold">{video.title}</span>
          {video.shootAt && <span className="text-muted-foreground">拍攝 {video.shootAt}</span>}
        </div>

        <div className="border border-border/60 rounded-md p-3 space-y-1">
          <p className="text-[12px] font-bold text-teal-800 mb-2">製作進度</p>

          <TaskRow
            label={PRODUCTION_TASK_LABELS.copywriting}
            task={progress.copywriting}
            onChange={copywriting => setProgress(p => ({ ...p, copywriting }))}
          />
          <TaskRow
            label={PRODUCTION_TASK_LABELS.script}
            task={progress.script}
            onChange={script => setProgress(p => ({ ...p, script }))}
          />

          <div className="py-2 border-b border-border/40">
            <p className="text-[11px] text-muted-foreground mb-2">原片來源</p>
            <div className="flex flex-wrap gap-4 text-[12px]">
              {([
                { value: 'shoot', label: '拍攝原片' },
                { value: 'ai', label: 'AI 生成' },
                { value: 'unset', label: '未設定' },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="footageMode"
                    checked={
                      opt.value === 'unset'
                        ? progress.footageMode === null
                        : progress.footageMode === opt.value
                    }
                    onChange={() => setFootageMode(opt.value === 'unset' ? null : opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <TaskRow
            label={PRODUCTION_TASK_LABELS.rawFootage}
            task={progress.rawFootage}
            disabled={progress.footageMode !== 'shoot'}
            disabledHint={progress.footageMode === 'ai' ? 'AI 生成，無需原片' : progress.footageMode === null ? '請先選原片來源' : undefined}
            onChange={rawFootage => setProgress(p => ({ ...p, rawFootage }))}
          />

          <div className="py-2 border-b border-border/40">
            <p className="text-[11px] text-muted-foreground mb-2">是否剪輯</p>
            <div className="flex flex-wrap gap-4 text-[12px]">
              {([
                { value: 'no', label: '不需要' },
                { value: 'yes', label: '需要' },
                { value: 'unset', label: '未設定' },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="editingMode"
                    checked={
                      opt.value === 'unset'
                        ? progress.editingMode === null
                        : opt.value === 'yes'
                          ? progress.editingMode === true
                          : progress.editingMode === false
                    }
                    onChange={() =>
                      setEditingMode(opt.value === 'unset' ? null : opt.value === 'yes')
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <TaskRow
            label={PRODUCTION_TASK_LABELS.editing}
            task={progress.editing}
            disabled={progress.editingMode !== true}
            disabledHint={progress.editingMode === false ? '不需要剪輯' : progress.editingMode === null ? '請先選是否剪輯' : undefined}
            onChange={editing => setProgress(p => ({ ...p, editing }))}
          />

          <TaskRow
            label={PRODUCTION_TASK_LABELS.demo}
            task={progress.demo}
            onChange={demo => setProgress(p => ({ ...p, demo }))}
          />
        </div>

        <div>
          <label className="text-[12px] font-medium block mb-1">影片存放位置</label>
          <Input
            value={storagePath}
            onChange={e => setStoragePath(e.target.value)}
            placeholder="V:\\... 或 https://..."
            className="h-9 text-[13px]"
          />
        </div>

        <div>
          <label className="text-[12px] font-medium block mb-1">計劃發佈日期 *</label>
          <Input
            type="date"
            value={plannedPublishDate}
            onChange={e => setPlannedPublishDate(e.target.value)}
            className="h-9 text-[13px]"
          />
          <p className="text-[11px] text-muted-foreground mt-1">提交審核前必填</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>取消</Button>
        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 size={14} className="animate-spin mr-1" />保存中…</> : '保存'}
        </Button>
      </div>
    </CrudModal>
  );
}
