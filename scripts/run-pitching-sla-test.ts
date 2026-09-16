import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  draftToProjectSla,
  emptyProjectSlaDraft,
  normalizeTimeValue,
  parseProjectSla,
  slaEquals,
  slaToDraft,
  validateProjectSla,
} from '../src/lib/projectSla';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.deepEqual(parseProjectSla(null), {});
assert.deepEqual(parseProjectSla('not-json'), {});
assert.deepEqual(
  parseProjectSla({
    serviceAvailabilityPercent: '99.9',
    mttr: { value: 4, unit: 'hours' },
    csOpeningHours: { start: '09:00:00', end: '18:00' },
    frt: { value: 30, unit: 'minutes' },
  }),
  {
    serviceAvailabilityPercent: 99.9,
    mttr: { value: 4, unit: 'hours' },
    csOpeningHours: { start: '09:00', end: '18:00' },
    frt: { value: 30, unit: 'minutes' },
  },
);

const draft = slaToDraft({
  serviceAvailabilityPercent: 99.5,
  mttr: { value: 1, unit: 'days' },
  csOpeningHours: { start: '09:00', end: '18:00' },
  frt: { value: 2, unit: 'hours' },
});
assert.equal(draft.serviceAvailabilityPercent, '99.5');
assert.equal(draft.mttrUnit, 'days');
assert.deepEqual(draftToProjectSla(draft), {
  serviceAvailabilityPercent: 99.5,
  mttr: { value: 1, unit: 'days' },
  csOpeningHours: { start: '09:00', end: '18:00' },
  frt: { value: 2, unit: 'hours' },
});
assert.equal(slaEquals(draftToProjectSla(emptyProjectSlaDraft()), {}), true);
assert.equal(normalizeTimeValue('09:00:00'), '09:00');

assert.equal(validateProjectSla({ serviceAvailabilityPercent: 0 }), '服務可用率須大於 0% 且不超過 100%');
assert.equal(validateProjectSla({ serviceAvailabilityPercent: 101 }), '服務可用率須大於 0% 且不超過 100%');
assert.equal(validateProjectSla({ mttr: { value: 0, unit: 'hours' } }), '平均修復時間 (MTTR) 須大於 0');
assert.equal(
  validateProjectSla({ csOpeningHours: { start: '09:00', end: '' } }),
  '請同時填寫客服開放開始與結束時間',
);
assert.equal(validateProjectSla({
  serviceAvailabilityPercent: 99.9,
  mttr: { value: 4, unit: 'hours' },
  csOpeningHours: { start: '09:00', end: '18:00' },
  frt: { value: 30, unit: 'minutes' },
}), null);

const migration = read('supabase/migrations/20260916103315_quotation_client_project_sla.sql');
assert.match(migration, /ADD COLUMN IF NOT EXISTS sla jsonb/);
assert.match(migration, /DEFAULT '\{\}'::jsonb/);

const hook = read('src/hooks/useQuotationClientProjects.ts');
assert.match(hook, /sla: ProjectSla \| null/);
assert.match(hook, /sla: parseProjectSla\(row\.sla\)/);
assert.match(hook, /\| 'sla'/);
assert.match(hook, /if \(data\.sla !== undefined\) row\.sla = data\.sla/);

const types = read('src/data/pitchingData.ts');
assert.match(types, /sla\?: ProjectSla/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingSlaTab/);
assert.match(pitching, /label: 'SLA'/);
assert.match(pitching, /showSlaTab = draft\.status === 'confirmed'/);
assert.match(pitching, /tab\.id !== 'sla' \|\| showSlaTab/);
assert.match(pitching, /handleSlaPersist/);
assert.match(pitching, /activeTab === 'sla'/);

const tab = read('src/components/quotation/PitchingSlaTab.tsx');
assert.match(tab, /IT 與系統可靠性指標/);
assert.match(tab, /IT and System Reliability Metrics/);
assert.match(tab, /zh="服務可用率"/);
assert.match(tab, /en="Service Availability \(Uptime\)"/);
assert.match(tab, /zh="平均修復時間"/);
assert.match(tab, /en="Mean Time to Repair \(MTTR\)"/);
assert.match(tab, /客戶支援與服務台指標/);
assert.match(tab, /Customer Support and Help Desk Metrics/);
assert.match(tab, /zh="客服開放時間"/);
assert.match(tab, /en="CS Opening Hours"/);
assert.match(tab, /zh="首次回應時間"/);
assert.match(tab, /en="First Response Time \(FRT\)"/);
assert.match(tab, /type="time"/);
assert.match(tab, /w-\[4\.75rem\] shrink-0/);
assert.match(tab, /onPersist\(nextSla\)/);

const labels = read('src/lib/projectSla.ts');
assert.match(labels, /days: '日'/);
assert.match(labels, /hours: '小時'/);
assert.match(labels, /minutes: '分鐘'/);

console.log('pitching sla: ok');
