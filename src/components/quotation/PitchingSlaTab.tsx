import { useEffect, useState, type FormEvent } from 'react';
import { Headphones, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SLA_DURATION_UNITS,
  SLA_DURATION_UNIT_LABELS,
  draftToProjectSla,
  slaEquals,
  slaToDraft,
  validateProjectSla,
  type ProjectSla,
  type ProjectSlaDraft,
  type SlaDurationUnit,
} from '@/lib/projectSla';

const fieldClass =
  'text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500';

function FieldLabel({
  htmlFor,
  zh,
  en,
}: {
  htmlFor?: string;
  zh: string;
  en: string;
}) {
  return (
    <Label htmlFor={htmlFor} className="block space-y-0.5">
      <span className="block text-[13px] font-medium text-foreground">{zh}</span>
      <span className="block text-[12px] font-normal text-muted-foreground">{en}</span>
    </Label>
  );
}

function DurationField({
  id,
  value,
  unit,
  onValueChange,
  onUnitChange,
}: {
  id: string;
  value: string;
  unit: SlaDurationUnit;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: SlaDurationUnit) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-[13px] font-semibold text-muted-foreground tabular-nums w-4 shrink-0">&lt;</span>
      <Input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(fieldClass, 'min-w-0 w-0 flex-1')}
        placeholder="數值"
      />
      <select
        aria-label={`${id} unit`}
        value={unit}
        onChange={(e) => onUnitChange(e.target.value as SlaDurationUnit)}
        className={cn(fieldClass, 'w-[4.75rem] shrink-0 px-2')}
      >
        {SLA_DURATION_UNITS.map((item) => (
          <option key={item} value={item}>
            {SLA_DURATION_UNIT_LABELS[item]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PitchingSlaTab({
  sla,
  saving = false,
  onPersist,
}: {
  sla: ProjectSla | undefined;
  saving?: boolean;
  onPersist: (next: ProjectSla) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ProjectSlaDraft>(() => slaToDraft(sla));

  useEffect(() => {
    setDraft(slaToDraft(sla));
  }, [sla]);

  const nextSla = draftToProjectSla(draft);
  const dirty = !slaEquals(sla, nextSla);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const error = validateProjectSla(nextSla);
    if (error) {
      toast.error(error);
      return;
    }
    await onPersist(nextSla);
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-teal-600" />
          <div>
            <h3 className="text-[14px] font-semibold">IT 與系統可靠性指標</h3>
            <p className="text-[12px] text-muted-foreground">IT and System Reliability Metrics</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5 min-w-0">
            <FieldLabel htmlFor="sla-uptime" zh="服務可用率" en="Service Availability (Uptime)" />
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[13px] font-semibold text-muted-foreground tabular-nums w-4 shrink-0">&gt;</span>
              <Input
                id="sla-uptime"
                type="number"
                min="0"
                max="100"
                step="any"
                value={draft.serviceAvailabilityPercent}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, serviceAvailabilityPercent: e.target.value }))
                }
                className={cn(fieldClass, 'min-w-0 w-0 flex-1')}
                placeholder="例如 99.9"
              />
              <span className="text-[13px] text-muted-foreground shrink-0">%</span>
            </div>
          </div>
          <div className="space-y-1.5 min-w-0">
            <FieldLabel htmlFor="sla-mttr" zh="平均修復時間" en="Mean Time to Repair (MTTR)" />
            <DurationField
              id="sla-mttr"
              value={draft.mttrValue}
              unit={draft.mttrUnit}
              onValueChange={(mttrValue) => setDraft((prev) => ({ ...prev, mttrValue }))}
              onUnitChange={(mttrUnit) => setDraft((prev) => ({ ...prev, mttrUnit }))}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Headphones size={16} className="text-teal-600" />
          <div>
            <h3 className="text-[14px] font-semibold">客戶支援與服務台指標</h3>
            <p className="text-[12px] text-muted-foreground">Customer Support and Help Desk Metrics</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5 min-w-0">
            <FieldLabel zh="客服開放時間" en="CS Opening Hours" />
            <div className="flex min-w-0 items-center gap-2">
              <Input
                type="time"
                value={draft.csOpenStart}
                onChange={(e) => setDraft((prev) => ({ ...prev, csOpenStart: e.target.value }))}
                className={cn(fieldClass, 'min-w-0 w-0 flex-1')}
                aria-label="客服開放開始時間"
              />
              <span className="text-[13px] text-muted-foreground shrink-0">–</span>
              <Input
                type="time"
                value={draft.csOpenEnd}
                onChange={(e) => setDraft((prev) => ({ ...prev, csOpenEnd: e.target.value }))}
                className={cn(fieldClass, 'min-w-0 w-0 flex-1')}
                aria-label="客服開放結束時間"
              />
            </div>
          </div>
          <div className="space-y-1.5 min-w-0">
            <FieldLabel htmlFor="sla-frt" zh="首次回應時間" en="First Response Time (FRT)" />
            <DurationField
              id="sla-frt"
              value={draft.frtValue}
              unit={draft.frtUnit}
              onValueChange={(frtValue) => setDraft((prev) => ({ ...prev, frtValue }))}
              onUnitChange={(frtUnit) => setDraft((prev) => ({ ...prev, frtUnit }))}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          className="bg-teal-600 hover:bg-teal-700 text-white"
          disabled={saving || !dirty}
        >
          <Save size={14} />
          {saving ? '儲存中…' : '儲存 SLA'}
        </Button>
      </div>
    </form>
  );
}
