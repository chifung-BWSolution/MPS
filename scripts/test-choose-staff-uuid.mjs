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
  chooseStaffUuid({ loginStaffId: JANE, uniqueEmailStaffId: OTHER, sessionStaffId: OTHER }),
  JANE,
  'login whitelist wins over work_email and a corrupted session',
);

assert.equal(
  chooseStaffUuid({ sessionStaffId: LOWELL_MANUAL, uniqueEmailStaffId: OTHER }),
  LOWELL_CANONICAL,
  'Lowell leftover session UUID remaps before email',
);

assert.equal(
  chooseStaffUuid({ uniqueEmailStaffId: JANE }),
  JANE,
  'unique work_email is fallback when login/session are missing',
);

assert.equal(
  chooseStaffUuid({ sessionStaffId: 'cfb_m02', uniqueEmailStaffId: JANE }),
  JANE,
  'non-UUID session does not block unique email fallback',
);

assert.equal(
  chooseStaffUuid({ bubbleStaffId: JANE }),
  JANE,
  'bubble id is last resort',
);

assert.equal(chooseStaffUuid({}), null);

assert.equal(
  isPlaceholderStaff({ bubble_staff_id: 'manual_super_admin_lowell', display_name: 'Lowell Lo (manual)' }),
  true,
);

const local = localDateString(new Date(2026, 7, 19, 1, 0, 0));
assert.equal(local, '2026-08-19');

console.log('chooseStaffUuid tests passed');
