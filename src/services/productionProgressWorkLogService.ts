import type { ProductionProgress, ProductionTaskKey } from '@/types/videoWorkflow';
import type { VideoWorkLogDraft, VideoWorkLogType } from '@/types/videoOutputWorkLog';
import type { VideoOutputWorkLog } from '@/types/videoOutputWorkLog';
import { PRODUCTION_TASK_LABELS } from '@/lib/videoWorkflowUtils';
import { localDateString } from '@/services/reportLinkService';
import { PRODUCTION_WORK_LOG_PREFIX } from '@/lib/videoOutputWorkflowMapper';

const TASK_WORK_TYPE: Record<ProductionTaskKey, VideoWorkLogType> = {
  copywriting: 'other',
  script: 'other',
  rawFootage: 'shoot',
  editing: 'editing',
  demo: 'editing',
};

const PRODUCTION_TASK_KEYS: ProductionTaskKey[] = [
  'copywriting',
  'script',
  'rawFootage',
  'editing',
  'demo',
];

function isProductionSyncedLog(log: Pick<VideoOutputWorkLog, 'notes'>): boolean {
  return (log.notes ?? '').startsWith(PRODUCTION_WORK_LOG_PREFIX);
}

export function mergeProductionProgressWorkLogs(
  existingLogs: VideoOutputWorkLog[],
  progress: ProductionProgress,
  staffId: string,
  staffName?: string,
): VideoWorkLogDraft[] {
  const preserved = existingLogs
    .filter(log => !isProductionSyncedLog(log))
    .map(log => ({
      id: log.id,
      staffId: log.staffId,
      staffName: log.staffName,
      workDate: log.workDate,
      hours: log.hours,
      workType: log.workType,
      notes: log.notes,
    }));

  const productionDrafts: VideoWorkLogDraft[] = PRODUCTION_TASK_KEYS.flatMap(key => {
    const task = progress[key];
    if (!task.done || !task.hours || task.hours <= 0) return [];
    return [{
      staffId,
      staffName,
      workDate: localDateString(),
      hours: task.hours,
      workType: TASK_WORK_TYPE[key],
      notes: `${PRODUCTION_WORK_LOG_PREFIX} ${PRODUCTION_TASK_LABELS[key]}`,
    }];
  });

  return [...preserved, ...productionDrafts];
}
