import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseServicePeriods,
  servicePeriodDate,
  validateServicePeriods,
  withServicePeriodDate,
} from '../src/lib/servicePeriods';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.deepEqual(parseServicePeriods(null), {});
assert.deepEqual(parseServicePeriods('not-json'), {});
assert.deepEqual(parseServicePeriods([]), {});
assert.deepEqual(
  parseServicePeriods({
    revision: { startDate: '2026-01-02T00:00:00Z', endDate: '2026-02-01' },
    testing: { startDate: '', endDate: '2026-03-01' },
    warranty: { startDate: 'bad', endDate: '2026-06-01' },
    future: { startDate: '2026-07-01', note: 'keep me' },
    blank: {},
  }),
  {
    revision: { startDate: '2026-01-02', endDate: '2026-02-01' },
    testing: { endDate: '2026-03-01' },
    warranty: { endDate: '2026-06-01' },
    future: { startDate: '2026-07-01', note: 'keep me' },
  },
);

const edited = withServicePeriodDate(
  { revision: { startDate: '2026-01-01' }, future: { startDate: '2026-07-01', note: 'keep me' } },
  'testing',
  'endDate',
  '2026-04-01',
);
assert.equal(servicePeriodDate(edited, 'testing', 'endDate'), '2026-04-01');
assert.equal(servicePeriodDate(edited, 'revision', 'startDate'), '2026-01-01');
assert.equal((edited.future as { note?: string }).note, 'keep me');

const cleared = withServicePeriodDate(edited, 'revision', 'startDate', '');
assert.equal(cleared.revision, undefined);
assert.equal(validateServicePeriods({ revision: { startDate: '2026-02-01', endDate: '2026-01-01' } }), '可修改期結束日期不可早於開始日期');
assert.equal(validateServicePeriods({ testing: { startDate: '2026-01-01', endDate: '2026-01-01' } }), null);
assert.equal(validateServicePeriods({}), null);

const migration = read('supabase/migrations/20261008042522_quotation_client_project_service_periods.sql');
assert.match(migration, /ADD COLUMN IF NOT EXISTS service_periods jsonb/);
assert.match(migration, /DEFAULT '\{\}'::jsonb/);
assert.match(migration, /revision \(可修改期\)/);
assert.match(migration, /testing \(測試期\)/);
assert.match(migration, /warranty \(保養期\)/);

const hook = read('src/hooks/useQuotationClientProjects.ts');
assert.match(hook, /service_periods: ServicePeriods \| null/);
assert.match(hook, /servicePeriods: parseServicePeriods\(row\.service_periods\)/);
assert.match(hook, /service_periods: parseServicePeriods\(data\.servicePeriods\)/);
assert.match(hook, /if \(data\.servicePeriods !== undefined\) row\.service_periods = parseServicePeriods\(data\.servicePeriods\)/);
assert.match(hook, /\| 'servicePeriods'/);

const periods = read('src/lib/servicePeriods.ts');
assert.match(periods, /key: 'revision', labelZh: '可修改期'/);
assert.match(periods, /key: 'testing', labelZh: '測試期'/);
assert.match(periods, /key: 'warranty', labelZh: '保養期'/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /const showServicePeriods = moduleId === 'system-dev'/);
assert.match(pitching, /showServicePeriods && \(/);
assert.match(pitching, /ServicePeriodDateFields/);
assert.match(pitching, /aria-label=\{`\$\{field\.labelZh\}\$\{boundLabel\}`\}/);
assert.match(pitching, /servicePeriods: parseServicePeriods\(form\.servicePeriods\)/);
assert.match(pitching, /validateServicePeriods\(form\.servicePeriods\)/);
assert.match(pitching, /label=\{`\$\{field\.labelZh\}開始日期`\}/);
assert.match(pitching, /label=\{`\$\{field\.labelZh\}結束日期`\}/);

const asana = read('src/components/quotation/AsanaPendingModule.tsx');
assert.match(asana, /servicePeriods: form\.servicePeriods/);

console.log('service periods: ok');
