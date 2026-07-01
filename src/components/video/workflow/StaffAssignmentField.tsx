import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { StaffAssignment } from '@/types/videoWorkflow';

type Props = {
  label: string;
  value?: StaffAssignment;
  staffOptions: { staffId: string; displayName: string }[];
  onChange: (next?: StaffAssignment) => void;
};

export function StaffAssignmentField({ label, value, staffOptions, onChange }: Props) {
  const handleStaff = (userId: string) => {
    const staff = staffOptions.find(s => s.staffId === userId);
    onChange({
      userId,
      displayName: staff?.displayName ?? userId,
      scheduledAt: value?.scheduledAt ?? '',
    });
  };

  const handleTime = (scheduledAt: string) => {
    if (!value?.userId) {
      onChange(undefined);
      return;
    }
    onChange({ ...value, scheduledAt });
  };

  return (
    <div className="border border-border/60 rounded-md p-3 bg-slate-50/50 space-y-2">
      <p className="text-[12px] font-semibold text-slate-700">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">負責人</label>
          <Select value={value?.userId ?? ''} onValueChange={handleStaff}>
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue placeholder="選擇人員" />
            </SelectTrigger>
            <SelectContent>
              {staffOptions.map(s => (
                <SelectItem key={s.staffId} value={s.staffId}>{s.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">計劃時間</label>
          <Input
            type="datetime-local"
            value={value?.scheduledAt ?? ''}
            onChange={e => handleTime(e.target.value)}
            className="h-8 text-[12px]"
          />
        </div>
      </div>
    </div>
  );
}
