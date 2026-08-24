import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'url';
import { resolveMainPmId, assignedNameMatchesDisplayName } from '../src/lib/mainPmMatch';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(assignedNameMatchesDisplayName('Ada Ou', 'Ada Ou'), true);
assert.equal(
  assignedNameMatchesDisplayName('Ada Ou - CFB OB Website Marketing BSC (Ast. Leader)', 'Ada Ou'),
  true,
);
assert.equal(assignedNameMatchesDisplayName('Miko Zhou - CFB OB Website Marketing', 'Miko Tsoi'), false);
assert.equal(assignedNameMatchesDisplayName('Franco', 'Franco'), true);
assert.equal(assignedNameMatchesDisplayName('Franco', 'Franco Lee'), true);

const staffs = [
  {
    id: 'old-ada',
    display_name: 'Ada Ou',
    work_email: 'old.ada@example.com',
    status: 'inactive',
    created_at: '2026-08-20T00:00:00.000Z',
  },
  {
    id: 'new-ada',
    display_name: 'Ada Ou',
    work_email: 'cfb.m04@chifung.net',
    status: 'active',
    created_at: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'older-ada-active',
    display_name: 'Ada Ou',
    work_email: 'cfb.m04@chifung.net',
    status: 'active',
    created_at: '2026-06-30T00:00:00.000Z',
  },
  {
    id: 'lowell',
    display_name: 'Lowell Lo',
    work_email: ' brandingworks.ebiz@gmail.com ',
    status: 'active',
    created_at: '2026-06-30T00:00:00.000Z',
  },
];

assert.equal(
  resolveMainPmId(staffs, { email: 'cfb.m04@chifung.net', name: 'Ada Ou - Role' }),
  'new-ada',
);
assert.equal(resolveMainPmId(staffs, { email: null, name: 'Lowell Lo - BWL OB Marketing' }), 'lowell');
assert.equal(resolveMainPmId(staffs, { email: 'nobody@example.com', name: 'Unknown Person' }), null);

const hook = readFileSync(join(root, 'src/hooks/useQuotationClientProjects.ts'), 'utf8');
assert.match(hook, /main_pm_id/);
assert.match(hook, /main_pm:staffs!main_pm_id/);

const pitching = readFileSync(join(root, 'src/components/quotation/PitchingModule.tsx'), 'utf8');
assert.match(pitching, /formatMainPmName/);
assert.match(pitching, /mainPmId/);
assert.match(pitching, /staffOptions/);
assert.doesNotMatch(pitching, /assignedPmName: draft\.assignedPmName/);

const project = readFileSync(join(root, 'src/components/quotation/ProjectModule.tsx'), 'utf8');
assert.match(project, /formatMainPmName/);
assert.match(project, /staffOptions/);

const migration = readFileSync(
  join(root, 'supabase/migrations/20260824090000_quotation_client_project_main_pm_id.sql'),
  'utf8',
);
assert.match(migration, /main_pm_id uuid/);
assert.match(migration, /REFERENCES public\.staffs\(id\)/);

console.log('main pm: ok');
