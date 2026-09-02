import assert from 'node:assert/strict';
import {
  normalizeLoginEmail,
  pickPreferredWhitelistRow,
  scoreWhitelistCandidate,
} from '../src/services/authStaffScore.ts';

assert.equal(normalizeLoginEmail('  brandingworks.online@gmail.com  '), 'brandingworks.online@gmail.com');
assert.equal(
  normalizeLoginEmail('\u200BBrandingWorks.Online@gmail.com\u00A0'),
  'brandingworks.online@gmail.com',
);

assert.equal(
  scoreWhitelistCandidate({ staffActive: true, emailMatch: true }),
  130,
);
assert.equal(
  scoreWhitelistCandidate({ staffActive: false }),
  0,
);
assert.equal(
  scoreWhitelistCandidate({ staffActive: false, emailMatch: true }),
  30,
);

const inactiveStaff = { id: 'a', staff_id: 's1' };
const activeStaff = { id: 'b', staff_id: 's2' };
const picked = pickPreferredWhitelistRow([inactiveStaff, activeStaff], (row) =>
  scoreWhitelistCandidate({
    staffActive: row.staff_id === 's2',
    emailMatch: row.staff_id === 's2',
  }),
);
assert.equal(picked?.id, 'b');
assert.equal(pickPreferredWhitelistRow([], () => 0), null);

console.log('authStaffResolve score tests passed');

const url = process.env.MPS_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.MPS_SERVICE;
if (url && key) {
  const leoAuthId = '89c780db-db94-44dd-a707-1ac212e0e343';
  const leoStaffId = '6ddee578-cfe2-4e27-b758-affb02fa02ae';
  const res = await fetch(
    `${url}/rest/v1/users?select=staff_id,auth_user_id,email&auth_user_id=eq.${leoAuthId}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  assert.equal(res.ok, true, `users by auth_user_id HTTP ${res.status}`);
  const rows = await res.json();
  assert.equal(rows.length, 1, 'exactly one users row for Leo auth uid');
  assert.equal(rows[0].staff_id, leoStaffId);
  assert.equal(rows[0].auth_user_id, leoAuthId);

  const miss = await fetch(
    `${url}/rest/v1/users?select=id&auth_user_id=eq.00000000-0000-4000-8000-000000000000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const missRows = await miss.json();
  assert.equal(missRows.length, 0, 'unknown auth uid matches nobody');
  console.log('auth_user_id REST lookup tests passed');
}
