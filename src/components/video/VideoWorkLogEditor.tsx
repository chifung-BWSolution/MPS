import { Plus, Trash2 } from 'lucide-react';
import type { VideoWorkLogDraft, VideoWorkLogType } from '@/types/videoOutputWorkLog';
import { VIDEO_WORK_LOG_TYPE_LABELS } from '@/types/videoOutputWorkLog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type StaffOption = { staffId: string; displayName: string };

type Props = {
  logs: VideoWorkLogDraft[];
  onChange: (logs: VideoWorkLogDraft[]) => void;
  staffOptions: StaffOption[];
  defaultStaffId?: string;
  defaultStaffName?: string;
};

function newDraft(defaultStaffId?: string, defaultStaffName?: string): VideoWorkLogDraft {
  const today = new Date();
  const workDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    staffId: defaultStaffId ?? '',
    staffName: defaultStaffName,
    workDate,
    hours: 0,
    workType: 'editing',
    notes: '',
  };
}

export function VideoWorkLogEditor({ logs, onChange, staffOptions, defaultStaffId, defaultStaffName }: Props) {
  const totalHours = logs.reduce((s, l) => s + (l.hours || 0), 0);

  const updateLog = (index: number, patch: Partial<VideoWorkLogDraft>) => {
    onChange(logs.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const handleStaffChange = (index: number, staffId: string) => {
    const staff = staffOptions.find(s => s.staffId === staffId);
    updateLog(index, { staffId, staffName: staff?.displayName });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[13px] font-bold">工時登記</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            可登記多段工時；保存後將自動帶入工作匯報（有工時時）
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[12px] gap-1"
          onClick={() => onChange([...logs, newDraft(defaultStaffId, defaultStaffName)])}
        >
          <Plus size={12} /> 新增工時段
        </Button>
      </div>

      {logs.length === 0 ? (
        <p className="text-[12px] text-muted-foreground bg-muted/30 rounded-md px-3 py-4 text-center">
          尚未登記工時（可選）
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((log, index) => (
            <div key={log.id ?? `draft-${index}`} className="border border-border/60 rounded-md p-3 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">工時 #{index + 1}</span>
                <button
                  type="button"
                  onClick={() => onChange(logs.filter((_, i) => i !== index))}
                  className="text-rose-500 hover:text-rose-700 p-1"
                  title="刪除此段"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">人員 *</label>
                  <Select value={log.staffId || undefined} onValueChange={v => handleStaffChange(index, v)}>
                    <SelectTrigger className="h-8 text-[12px] bg-white"><SelectValue placeholder="選擇人員" /></SelectTrigger>
                    <SelectContent>
                      {staffOptions.map(s => (
                        <SelectItem key={s.staffId} value={s.staffId}>{s.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">日期 *</label>
                  <Input
                    type="date"
                    value={log.workDate}
                    onChange={e => updateLog(index, { workDate: e.target.value })}
                    className="h-8 text-[12px] bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">工時 (h) *</label>
                  <Input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={log.hours || ''}
                    onChange={e => updateLog(index, { hours: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-[12px] bg-white"
                    placeholder="例如 2.5"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">工作類型</label>
                  <Select
                    value={log.workType}
                    onValueChange={v => updateLog(index, { workType: v as VideoWorkLogType })}
                  >
                    <SelectTrigger className="h-8 text-[12px] bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(VIDEO_WORK_LOG_TYPE_LABELS) as VideoWorkLogType[]).map(t => (
                        <SelectItem key={t} value={t}>{VIDEO_WORK_LOG_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">備註</label>
                <Input
                  value={log.notes ?? ''}
                  onChange={e => updateLog(index, { notes: e.target.value })}
                  className="h-8 text-[12px] bg-white"
                  placeholder="選填"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {logs.length > 0 && (
        <p className="text-[12px] text-right text-muted-foreground">
          合計：<span className="font-bold text-teal-700">{totalHours.toFixed(1)}h</span>
        </p>
      )}
    </div>
  );
}
