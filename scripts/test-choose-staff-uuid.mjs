import assert from 'node:assert/strict';
import {
  chooseStaffUuid,
  remapStaleStaffUuid,
  isPlaceholderStaff,
  localDateString,
} from '../src/services/staffIdentity.ts';

const JANE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const LOWELL_MANUAL = 'd88d2465-42d1-4205-8a9b-8495083c3691';
const LOWELL_CANONICAL = '04102dd8-8d0f-4536-82cd-904cc0769227';

assert.equal(remapStaleStaffUuid(LOWELL_MANUAL), LOWELL_CANONICAL);

assert.equal(
  chooseStaffUuid({ loginStaffId: JANE, sessionStaffId: OTHER }),
  JANE,
  'login whitelist wins over a corrupted session',
);

assert.equal(
  chooseStaffUuid({ sessionStaffId: LOWELL_MANUAL }),
  LOWELL_CANONICAL,
  'Lowell leftover session UUID remaps to canonical staffs.id',
);

assert.equal(
  chooseStaffUuid({ sessionStaffId: 'cfb_m02' }),
  null,
  'non-UUID session is not used as a report key',
);

assert.equal(chooseStaffUuid({}), null);

assert.equal(
  isPlaceholderStaff({ id: LOWELL_MANUAL, display_name: 'Lowell Lo (manual)' }),
  true,
);

assert.equal(
  isPlaceholderStaff({ id: JANE, display_name: 'Jane Long' }),
  false,
);

const local = localDateString(new Date(2026, 7, 19, 1, 0, 0));
assert.equal(local, '2026-08-19');

console.log('chooseStaffUuid tests passed');
