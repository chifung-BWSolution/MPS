import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;

function timestampToHktDate(iso: string): string {
  return new Date(new Date(iso).getTime() + HKT_OFFSET_MS).toISOString().slice(0, 10);
}

assert.equal(timestampToHktDate('2026-03-15T15:59:59.000Z'), '2026-03-15');
assert.equal(timestampToHktDate('2026-03-15T16:00:00.000Z'), '2026-03-16');
assert.equal(timestampToHktDate('2026-01-01T00:00:00.000Z'), '2026-01-01');
assert.equal(timestampToHktDate('2025-12-31T16:30:00.000Z'), '2026-01-01');

const shared = read('supabase/functions/_shared/asana-pitching.ts');
assert.match(shared, /HKT_OFFSET_MS = 8 \* 60 \* 60 \* 1000/);
assert.match(shared, /timestampToHktDate/);
assert.match(shared, /todayHktDate/);
assert.match(shared, /return timestampToHktDate\(task\.created_at\) \?\? todayHktDate\(\)/);
assert.doesNotMatch(
  shared,
  /sync_date_mode === ["']active_deal["'] && task\.due_on/,
);

const fn = read('supabase/functions/sync-asana-pitching/index.ts');
assert.match(fn, /action === "backfill_inquiry_date"/);
assert.match(fn, /async function backfillInquiryDates/);
assert.match(fn, /taskInquiryDate\(task\)/);
assert.match(fn, /parseAsanaTaskGidFromLink/);

const hook = read('src/hooks/useQuotationClientProjects.ts');
assert.match(hook, /\.select\('pitching_code'\)/);
assert.match(hook, /pitchingId: updated\?\.pitching_code \|\| r\.pitchingId/);

const pending = read('src/components/quotation/AsanaPendingModule.tsx');
assert.match(pending, /inquiryDate: task\.inquiryDate/);

const migration = read(
  'supabase/migrations/20260910060003_pitching_code_reallocate_on_inquiry_date.sql',
);
assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.quotation_client_project/);
assert.match(migration, /v_fy_label/);
assert.match(migration, /allocate_pitching_code/);

console.log('asana inquiry date: ok');
