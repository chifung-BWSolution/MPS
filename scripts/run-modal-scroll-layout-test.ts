import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const crud = read('src/components/ui/crud-modal.tsx');
assert.match(crud, /overflow-hidden/);
assert.match(crud, /min-h-0/);
assert.match(crud, /splitModalChrome/);
assert.match(crud, /resolvedFooter/);

const dialog = read('src/components/ui/dialog.tsx');
assert.match(dialog, /splitDialogChrome/);
assert.match(dialog, /overflow-hidden/);
assert.match(dialog, /min-h-0 flex-1 overflow-y-auto/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /flex justify-end gap-3 pt-2 border-t border-border/);
assert.match(pitching, /新增提案 New Pitching/);

const client = read('src/components/crm/ClientFormModal.tsx');
assert.match(client, /flex flex-col overflow-hidden/);
assert.match(client, /flex-1 min-h-0 overflow-y-auto/);
assert.match(client, /border-t border-border shrink-0/);

const holiday = read('src/components/day-report/HolidaySettings.tsx');
assert.match(holiday, /overflow-hidden flex flex-col/);
assert.match(holiday, /flex-1 min-h-0 overflow-y-auto/);

console.log('modal scroll layout: ok');
