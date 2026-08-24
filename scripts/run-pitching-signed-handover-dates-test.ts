import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optionalIsoDate } from '../src/data/pitchingData';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(optionalIsoDate(undefined), undefined);
assert.equal(optionalIsoDate(null), undefined);
assert.equal(optionalIsoDate(''), undefined);
assert.equal(optionalIsoDate('2026-08-24'), '2026-08-24');
assert.equal(optionalIsoDate('2026-08-24T00:00:00.000Z'), '2026-08-24');
assert.equal(optionalIsoDate('not-a-date'), undefined);

const migration = read('supabase/migrations/20260824110000_quotation_client_project_signed_handover_dates.sql');
assert.match(migration, /ADD COLUMN IF NOT EXISTS signed_date date/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS handover_date date/);

const hook = read('src/hooks/useQuotationClientProjects.ts');
assert.match(hook, /signed_date: string \| null/);
assert.match(hook, /handover_date: string \| null/);
assert.match(hook, /signedDate: optionalIsoDate\(row\.signed_date\)/);
assert.match(hook, /handoverDate: optionalIsoDate\(row\.handover_date\)/);
assert.match(hook, /signed_date: optionalIsoDate\(data\.signedDate\) \?\? null/);
assert.match(hook, /handover_date: optionalIsoDate\(data\.handoverDate\) \?\? null/);
assert.match(hook, /\| 'signedDate'/);
assert.match(hook, /\| 'handoverDate'/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /簽約日期 Signed Date/);
assert.match(pitching, /交付日期 Handover Date/);
assert.match(pitching, /label="簽約日期"/);
assert.match(pitching, /label="交付日期"/);
assert.match(pitching, /signedDate: form\.signedDate/);
assert.match(pitching, /handoverDate: form\.handoverDate/);
assert.match(pitching, /signedDate: draft\.signedDate/);
assert.match(pitching, /handoverDate: draft\.handoverDate/);

console.log('pitching signed/handover dates: ok');
