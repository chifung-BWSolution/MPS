import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEDULES_TABLE,
  formatScheduleDate,
  optionalIsoDate,
  sortSchedules,
  validateScheduleInput,
} from '../src/lib/schedules';
import { PROJECTS_TABLE } from '../src/lib/projectsHub';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(SCHEDULES_TABLE, 'schedules');
assert.equal(PROJECTS_TABLE, 'projects');
assert.equal(optionalIsoDate(''), undefined);
assert.equal(optionalIsoDate('2026-09-16T12:00:00Z'), '2026-09-16');
assert.equal(formatScheduleDate(undefined), '—');
assert.equal(formatScheduleDate('2026-09-16'), '2026/09/16');
assert.equal(validateScheduleInput({ title: '', date: '2026-09-16' }), '請輸入標題');
assert.equal(validateScheduleInput({ title: 'Kickoff', date: '' }), '請選擇日期');
assert.equal(validateScheduleInput({ title: 'Kickoff', date: '2026-09-16' }), null);

assert.deepEqual(
  sortSchedules([
    { id: 'b', title: 'B', date: '2026-09-16', description: '', relatedProjectId: 'p', createdAt: '2', updatedAt: '2' },
    { id: 'a', title: 'A', date: '2026-09-15', description: '', relatedProjectId: 'p', createdAt: '1', updatedAt: '1' },
    { id: 'c', title: 'C', date: '2026-09-16', description: '', relatedProjectId: 'p', createdAt: '1', updatedAt: '1' },
  ]).map((row) => row.id),
  ['a', 'c', 'b'],
);

const migrations = readdirSync(join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('_create_schedules.sql'))
  .sort();
assert.ok(migrations.length >= 1, 'missing create_schedules migration');
const migration = read(`supabase/migrations/${migrations[migrations.length - 1]}`);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.schedules/);
assert.match(migration, /title text NOT NULL/);
assert.match(migration, /date date NOT NULL/);
assert.match(migration, /description text/);
assert.match(migration, /related_project_id uuid NOT NULL/);
assert.match(migration, /REFERENCES public\.projects\(id\) ON DELETE CASCADE/);
assert.doesNotMatch(migration, /REFERENCES public\.quotation_client_project/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /Allow select on schedules/);
assert.match(migration, /Allow insert on schedules/);
assert.match(migration, /Allow update on schedules/);
assert.match(migration, /Allow delete on schedules/);

const hook = read('src/hooks/useSchedules.ts');
assert.match(hook, /SCHEDULES_TABLE/);
assert.match(hook, /resolveProjectHubId/);
assert.match(hook, /related_project_id/);
assert.match(hook, /const addSchedule/);
assert.match(hook, /const updateSchedule/);
assert.match(hook, /const deleteSchedule/);
assert.doesNotMatch(hook, /quotation_client_project_id/);

const tab = read('src/components/quotation/PitchingScheduleTab.tsx');
assert.match(tab, /useSchedules/);
assert.match(tab, /新增排程/);
assert.match(tab, /編輯排程/);
assert.match(tab, /addSchedule/);
assert.match(tab, /updateSchedule/);
assert.match(tab, /deleteSchedule/);
assert.match(tab, /DeleteConfirmModal/);
assert.match(tab, /尚未建立項目排程/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingScheduleTab/);
assert.match(pitching, /id: 'schedule', label: '項目排程'/);
assert.match(pitching, /<PitchingScheduleTab relatedType="quotation_client" relatedId=\{record\.id\} \/>/);

console.log('schedules: ok');
