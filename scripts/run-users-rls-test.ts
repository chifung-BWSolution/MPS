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
assert.match(authResolve, /\.eq\('email'/);
assert.doesNotMatch(authResolve, /\.ilike\('email'/);

const resolveEmail = read('supabase/migrations/20260902080614_users_resolve_auth_by_email.sql');
assert.match(resolveEmail, /CREATE OR REPLACE FUNCTION public\.resolve_users_for_auth/);
assert.match(resolveEmail, /lower\(trim\(coalesce\(u\.email, ''\)\)\) = auth_email/);
assert.match(resolveEmail, /AND auth_user_id IS NULL/);

const legacyViews = read('supabase/migrations/20260902083308_auth_legacy_table_views.sql');
assert.match(legacyViews, /CREATE OR REPLACE VIEW public\.system_users/);
assert.match(legacyViews, /CREATE OR REPLACE VIEW public\.user_info/);
assert.match(legacyViews, /CREATE OR REPLACE VIEW public\.staff_directory/);
assert.match(legacyViews, /security_invoker = true/);
assert.match(legacyViews, /GRANT SELECT ON public\.system_users TO anon, authenticated/);

const revokeAnon = read('supabase/migrations/20260907023109_revoke_anon_internal_tables.sql');
assert.match(revokeAnon, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon/);
assert.match(revokeAnon, /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC/);
assert.match(revokeAnon, /GRANT EXECUTE ON FUNCTION public\.submit_artist_apply\(jsonb, jsonb\) TO anon/);
assert.match(revokeAnon, /GRANT EXECUTE ON FUNCTION public\.get_volunteer_campaign_public\(text\) TO anon/);
assert.match(revokeAnon, /GRANT EXECUTE ON FUNCTION public\.submit_volunteer_apply\(jsonb\) TO anon/);
assert.match(revokeAnon, /GRANT INSERT ON TABLE public\.kol_apply TO anon/);
assert.match(revokeAnon, /DROP POLICY IF EXISTS "Allow anon select on kol_apply"/);
assert.doesNotMatch(revokeAnon, /GRANT SELECT ON TABLE public\.users TO anon/);

const loginPage = read('src/components/auth/LoginPage.tsx');
assert.match(loginPage, /signInWithEmailPhone/);
assert.doesNotMatch(loginPage, /devBypassLogin/);
assert.doesNotMatch(loginPage, /Developer Bypass/);

const userMgmt = read('src/components/settings/UserManagement.tsx');
assert.match(userMgmt, /from\('users'\)/);
assert.match(userMgmt, /\.upsert\(/);
assert.match(userMgmt, /\.update\(/);
assert.match(userMgmt, /\.delete\(\)/);
assert.match(userMgmt, /invokeProvisionStaffAuth/);

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
if (selectRes.status === 401 && (await selectRes.clone().text()).includes('Invalid API key')) {
  console.log('users RLS REST checks skipped (anon key rejected by API)');
  process.exit(0);
}
assert.ok(
  selectRes.status === 401 || selectRes.status === 403,
  `anon SELECT users must fail after JWT-only login, got ${selectRes.status}`,
);

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
assert.ok(
  loginLookup.status === 401 || loginLookup.status === 403,
  `anon email whitelist lookup must fail, got ${loginLookup.status}`,
);

console.log('users RLS REST checks: ok');
