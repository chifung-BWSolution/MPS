import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pendingAsanaProjectSelectItems,
  pickQuotationClientForAsanaGid,
} from '../src/lib/asanaDayReportLink';
import { importedProjectIdsFromAsanaRefs } from '../src/lib/asanaTaskLink';
import {
  PROJECT_SELECT_KIND_LABELS,
  PROJECT_SELECT_KIND_ORDER,
} from '../src/lib/searchableProjectSelect';
import { reportProjectKind } from '../src/lib/reportProjectKind';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20261105032102_asana_task_day_report_links.sql'),
  'utf8',
);

const tasks = [
  { asanaTaskGid: '1209456549512345', displayName: 'Pending pitch' },
  { asanaTaskGid: '1212345678901234', displayName: 'Imported by link' },
  { asanaTaskGid: '1201112223334445', displayName: 'Imported by gid' },
  { asanaTaskGid: 'not-a-gid', displayName: 'Ignored' },
];

const imported = importedProjectIdsFromAsanaRefs([
  {
    id: 'manual_nwoded',
    asana_link: 'https://app.asana.com/1/6649488167653/project/1208704092427502/task/1212345678901234',
    asana_task_gid: null,
  },
  {
    id: 'gid_only',
    asana_link: null,
    asana_task_gid: '1201112223334445',
  },
]);

const pending = pendingAsanaProjectSelectItems(
  tasks.map((task) => ({ ...task, asanaProjectGid: '1209549009281325' })),
  imported,
  [{ projectGid: '1209549009281325', projectName: 'BWT Active 1' }],
);
assert.deepEqual(pending.map((item) => item.id), [
  '1209456549512345',
  '1212345678901234',
  '1201112223334445',
]);
assert.equal(pending[0]?.name, 'Pending pitch');
assert.equal(pending[0]?.kind, 'asana_task');
assert.equal(pending[0]?.relatedId, '1209456549512345');
assert.equal(pending[0]?.asanaImported, false);
assert.equal(pending.find((item) => item.id === '1212345678901234')?.asanaImported, true);
assert.equal(pending.find((item) => item.id === '1201112223334445')?.asanaImported, true);
assert.equal(pending[0]?.asanaProjectGid, '1209549009281325');
assert.equal(pending[0]?.asanaProjectName, 'BWT Active 1');

const chosen = pickQuotationClientForAsanaGid([
  {
    id: 'older_link',
    asana_link: 'https://app.asana.com/0/0/1209456549512345',
    asana_task_gid: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'newer_exact',
    asana_link: null,
    asana_task_gid: '1209456549512345',
    created_at: '2026-06-01T00:00:00Z',
  },
], '1209456549512345');
assert.equal(chosen?.id, 'newer_exact');

const oldestLink = pickQuotationClientForAsanaGid([
  {
    id: 'later',
    asana_link: 'https://app.asana.com/0/0/1209998887776665',
    asana_task_gid: null,
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 'earlier',
    asana_link: 'https://app.asana.com/0/0/1209998887776665',
    asana_task_gid: null,
    created_at: '2026-02-01T00:00:00Z',
  },
], '1209998887776665');
assert.equal(oldestLink?.id, 'earlier');

assert.equal(reportProjectKind({ relatedType: 'asana_task' }), 'asana_task');
assert.equal(reportProjectKind(null), 'orphan');
assert.equal(reportProjectKind({ relatedType: 'something_else' }), 'orphan');

assert.equal(PROJECT_SELECT_KIND_ORDER.at(-1), 'asana_task');
assert.equal(PROJECT_SELECT_KIND_LABELS.asana_task, 'Asana 項目');

assert.match(migration, /UPDATE public\.day_report_entries/);
assert.match(migration, /related_id = v_hub_id::text/);
assert.match(migration, /related_name = v_hub_name/);
assert.match(migration, /'webandsystem', 'quotation_client', 'vchannel', 'asana_task'/);
assert.match(migration, /link_mode IN \('required', 'optional'\)/);
assert.doesNotMatch(migration, /'quotation_client' = ANY \(link_types\)/);
assert.match(migration, /ARRAY\['asana_task'\]::text\[\]/);
assert.match(migration, /migrate_day_report_hours_for_asana_task\(NEW\.id\)/);
assert.match(migration, /trg_retarget_day_report_asana_task/);
assert.match(migration, /找不到 projects 紀錄/);

console.log('asana day report link ok');
