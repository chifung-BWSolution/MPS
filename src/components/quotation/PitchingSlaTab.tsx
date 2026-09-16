import { useEffect, useState, type FormEvent } from 'react';
import { Headphones, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
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
  'w-full text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500';

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
    <div className="flex items-center gap-2">
      <span className="text-[13px] font-semibold text-muted-foreground tabular-nums w-4 shrink-0">&lt;</span>
      <Input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={fieldClass}
        placeholder="數值"
      />
      <select
        aria-label={`${id} unit`}
        value={unit}
        onChange={(e) => onUnitChange(e.target.value as SlaDurationUnit)}
        className={`${fieldClass} w-[140px] shrink-0`}
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
            <h3 className="text-[14px] font-semibold">IT and System Reliability Metrics</h3>
            <p className="text-[12px] text-muted-foreground">IT 與系統可靠性指標</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="sla-uptime" className="text-[12px] text-muted-foreground">
              Service Availability (Uptime)
            </Label>
            <div className="flex items-center gap-2">
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
                className={fieldClass}
                placeholder="例如 99.9"
              />
              <span className="text-[13px] text-muted-foreground shrink-0">%</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-mttr" className="text-[12px] text-muted-foreground">
              Mean Time to Repair (MTTR)
            </Label>
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
            <h3 className="text-[14px] font-semibold">Customer Support and Help Desk Metrics</h3>
            <p className="text-[12px] text-muted-foreground">客戶支援與服務台指標</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">CS Opening Hours</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={draft.csOpenStart}
                onChange={(e) => setDraft((prev) => ({ ...prev, csOpenStart: e.target.value }))}
                className={fieldClass}
                aria-label="CS opening hours start"
              />
              <span className="text-[13px] text-muted-foreground shrink-0">–</span>
              <Input
                type="time"
                value={draft.csOpenEnd}
                onChange={(e) => setDraft((prev) => ({ ...prev, csOpenEnd: e.target.value }))}
                className={fieldClass}
                aria-label="CS opening hours end"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-frt" className="text-[12px] text-muted-foreground">
              First Response Time (FRT)
            </Label>
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
