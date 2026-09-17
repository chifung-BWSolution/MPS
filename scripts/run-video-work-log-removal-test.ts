import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const removed = [
  'src/services/videoOutputWorkLogService.ts',
  'src/services/productionProgressWorkLogService.ts',
  'src/services/videoReportLinkService.ts',
  'src/types/videoOutputWorkLog.ts',
  'src/components/video/VideoWorkLogEditor.tsx',
  'src/components/video/VideoEditModal.tsx',
];
for (const rel of removed) {
  assert.equal(existsSync(join(root, rel)), false, `expected ${rel} to be deleted`);
}

const forbidden = [
  'videoOutputWorkLogService',
  'productionProgressWorkLogService',
  'videoReportLinkService',
  'videoOutputWorkLog',
  'VideoWorkLogEditor',
  'VideoEditModal',
  'saveWorkLogsForVideo',
  'saveProductionWithWorkLogs',
  'syncVideoPendingReport',
  'video_output_work_logs',
];

const scanned = [
  'src/hooks/useVideoWorkflow.tsx',
  'src/components/video/workflow/VideoProductionModule.tsx',
  'src/components/video/PlatformPublishModal.tsx',
  'src/components/video/VideoManagementModule.tsx',
  'src/components/video/VideoChannelsList.tsx',
  'src/components/video/workflow/VideoScheduleModule.tsx',
  'src/components/video/workflow/StaffAssignmentField.tsx',
  'src/services/websiteVideoLinkService.ts',
  'src/lib/videoOutputWorkflowMapper.ts',
];

for (const rel of scanned) {
  const src = read(rel);
  for (const token of forbidden) {
    assert.doesNotMatch(src, new RegExp(token), `${rel} still mentions ${token}`);
  }
}

const staffSrc = read('src/services/staffDirectoryService.ts');
assert.match(staffSrc, /export async function fetchStaffDirectoryOptions/);
assert.match(staffSrc, /export function resolveStaffOptionId/);

const scheduleSrc = read('src/components/video/workflow/VideoScheduleModule.tsx');
assert.match(scheduleSrc, /staffDirectoryService/);

const hoursSrc = read('src/lib/videoWorkflowUtils.ts');
assert.match(hoursSrc, /export function sumProductionProgressHours/);

const productionSrc = read('src/components/video/workflow/VideoProductionModule.tsx');
assert.match(productionSrc, /updateVideo\(editingId/);
assert.doesNotMatch(productionSrc, /工時同步失敗/);

const publishSrc = read('src/components/video/PlatformPublishModal.tsx');
assert.doesNotMatch(publishSrc, /待匯報/);
assert.doesNotMatch(publishSrc, /工時（小時）/);

const migrationSrc = read('supabase/migrations/20260917042136_drop_video_output_work_logs.sql');
assert.match(migrationSrc, /DROP TABLE IF EXISTS public\.video_output_work_logs/);

console.log('video work-log removal checks passed');
