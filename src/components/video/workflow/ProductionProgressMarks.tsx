import { Check, Minus } from 'lucide-react';
import type { ProductionTaskKey, VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  getProductionTaskDisplayStatus,
  normalizeProductionProgress,
  PRODUCTION_TASK_KEYS,
  PRODUCTION_TASK_LABELS,
  type ProductionTaskDisplayStatus,
} from '@/lib/videoWorkflowUtils';

export { PRODUCTION_TASK_KEYS, PRODUCTION_TASK_LABELS };

export function ProductionProgressMark({ status }: { status: ProductionTaskDisplayStatus }) {
  if (status === 'done') {
    return (
      <span className="inline-flex justify-center text-teal-600" title="完成">
        <Check size={14} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'na') {
    return (
      <span className="inline-flex justify-center text-muted-foreground" title="不適用">
        <Minus size={14} />
      </span>
    );
  }
  return (
    <span className="inline-flex justify-center text-[13px] text-muted-foreground" title="未完成">
      ○
    </span>
  );
}

export function ProductionProgressMarks({ video }: { video: VideoWorkflowMock }) {
  const progress = normalizeProductionProgress(video);
  return (
    <>
      {PRODUCTION_TASK_KEYS.map(key => (
        <ProductionProgressMark key={key} status={getProductionTaskDisplayStatus(progress, key)} />
      ))}
    </>
  );
}
