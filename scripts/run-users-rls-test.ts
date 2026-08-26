import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const migration = read('supabase/migrations/20260826050000_users_rls.sql');
assert.match(migration, /ALTER TABLE public\.users ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /users_select_clients/);
assert.match(migration, /TO anon, authenticated/);
assert.match(migration, /users_insert_authenticated/);
assert.match(migration, /users_update_authenticated/);
assert.match(migration, /users_delete_authenticated/);
assert.match(migration, /TO authenticated/);
assert.match(migration, /GRANT SELECT ON TABLE public\.users TO anon/);
assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.users TO authenticated/);
assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /login_logs_match_user_id/);
assert.doesNotMatch(migration, /GRANT INSERT ON TABLE public\.users TO anon/);
assert.doesNotMatch(migration, /GRANT UPDATE ON TABLE public\.users TO anon/);
assert.doesNotMatch(migration, /GRANT DELETE ON TABLE public\.users TO anon/);
assert.doesNotMatch(migration, /GRANT ALL ON TABLE public\.users TO anon/);

const authResolve = read('src/services/authStaffResolve.ts');
assert.match(authResolve, /from\('users'\)/);
assert.match(authResolve, /rpc\('resolve_users_for_auth'\)/);
assert.match(authResolve, /\.eq\('auth_user_id'/);
assert.match(authResolve, /\.ilike\('email'/);

const userMgmt = read('src/components/settings/UserManagement.tsx');
assert.match(userMgmt, /from\('users'\)/);
assert.match(userMgmt, /\.upsert\(/);
assert.match(userMgmt, /\.update\(/);
assert.match(userMgmt, /\.delete\(\)/);

const staffDir = read('src/components/settings/StaffDirectory.tsx');
assert.match(staffDir, /from\('users'\)/);
assert.match(staffDir, /\.upsert\(/);
assert.match(staffDir, /\.delete\(\)/);

const loginLogs = read('src/hooks/useLoginLogs.ts');
assert.match(loginLogs, /from\('users'\)/);
assert.match(loginLogs, /login_logs_user_id_fkey/);

console.log('users RLS file checks: ok');

const url = process.env.MPS_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.MPS_SERVICE;

if (!url || !anonKey) {
  console.log('users RLS REST checks skipped (no anon URL/key)');
  process.exit(0);
}

const headers = (key: string, extra: Record<string, string> = {}) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  ...extra,
});

const selectRes = await fetch(`${url}/rest/v1/users?select=id,email,staff_id&limit=1`, {
  headers: headers(anonKey),
});
if (selectRes.status === 401) {
  const body = await selectRes.text();
  if (body.includes('Invalid API key')) {
    console.log('users RLS REST checks skipped (anon key rejected by API)');
    process.exit(0);
  }
  assert.fail(`anon SELECT users HTTP 401: ${body}`);
}
assert.equal(selectRes.ok, true, `anon SELECT users HTTP ${selectRes.status}`);
const selectRows = await selectRes.json();
assert.ok(Array.isArray(selectRows), 'anon SELECT returns an array');
assert.ok(selectRows.length >= 1, 'anon SELECT can read the login allowlist');

const insertRes = await fetch(`${url}/rest/v1/users`, {
  method: 'POST',
  headers: headers(anonKey, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
  body: JSON.stringify({
    staff_id: '00000000-0000-4000-8000-000000000000',
    email: 'rls-anon-should-fail@example.com',
  }),
});
assert.ok(insertRes.status === 401 || insertRes.status === 403, `anon INSERT users must fail, got ${insertRes.status}`);

const updateRes = await fetch(
  `${url}/rest/v1/users?id=eq.00000000-0000-4000-8000-000000000000`,
  {
    method: 'PATCH',
    headers: headers(anonKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email: 'rls-anon-should-fail@example.com' }),
  },
);
assert.ok(updateRes.status === 401 || updateRes.status === 403, `anon UPDATE users must fail, got ${updateRes.status}`);

const deleteRes = await fetch(
  `${url}/rest/v1/users?id=eq.00000000-0000-4000-8000-000000000000`,
  {
    method: 'DELETE',
    headers: headers(anonKey),
  },
);
assert.ok(deleteRes.status === 401 || deleteRes.status === 403, `anon DELETE users must fail, got ${deleteRes.status}`);

if (serviceKey) {
  const serviceRes = await fetch(`${url}/rest/v1/users?select=id&limit=1`, {
    headers: headers(serviceKey),
  });
  assert.equal(serviceRes.ok, true, `service SELECT users HTTP ${serviceRes.status}`);
}

const leoEmail = 'brandingworks.online@gmail.com';
const loginLookup = await fetch(
  `${url}/rest/v1/users?select=id,email,staff_id&email=eq.${encodeURIComponent(leoEmail)}`,
  { headers: headers(anonKey) },
);
assert.equal(loginLookup.ok, true, `anon email whitelist lookup HTTP ${loginLookup.status}`);
const leoRows = await loginLookup.json();
assert.equal(leoRows.length, 1, 'anon can resolve Leo for login');
assert.equal(leoRows[0].email, leoEmail);

console.log('users RLS REST checks: ok');
