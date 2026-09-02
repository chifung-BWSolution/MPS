import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  displayNameForLoginEmail,
  formatLoginLogTime,
  isUsersUuid,
  loginMethodLabel,
  mapLoginLogRow,
} from '../src/lib/loginLogs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(loginMethodLabel('google'), 'Google');
assert.equal(loginMethodLabel('dev_bypass'), '開發登入');
assert.equal(loginMethodLabel('dev_bypass_developer'), '開發登入');
assert.equal(loginMethodLabel(''), '—');

assert.equal(
  displayNameForLoginEmail('brandingworks.online@gmail.com', [
    { email: 'BrandingWorks.Online@gmail.com', display_name: 'Leo Tse' },
  ]),
  'Leo Tse',
);
assert.equal(
  displayNameForLoginEmail('franco.kaffa@gmail.com', [
    { email: 'franco.kaffa@gmail.com', display_name: 'Franco Lee' },
  ]),
  'Franco Lee',
);
assert.equal(displayNameForLoginEmail('unknown@example.com', []), 'unknown@example.com');
assert.equal(isUsersUuid('c87bfd89-a004-4db0-b3c4-f408a5f223e0'), true);
assert.equal(isUsersUuid('fallback-6ddee578-cfe2-4e27-b758-affb02fa02ae'), false);
assert.equal(isUsersUuid('ui-bootstrap-abc'), false);

const mapped = mapLoginLogRow(
  {
    id: 'log-1',
    email: 'brandingworks.online@gmail.com',
    login_method: 'google',
    ip_address: null,
    user_agent: 'Mozilla',
    success: true,
    created_at: '2026-08-26T02:47:47.338775+00:00',
  },
  [{ email: 'brandingworks.online@gmail.com', display_name: 'Leo Tse' }],
);
assert.equal(mapped.displayName, 'Leo Tse');
assert.equal(mapped.loginMethodLabel, 'Google');
assert.equal(mapped.success, true);
assert.equal(formatLoginLogTime(mapped.createdAt), '2026-08-26 10:47:47');

const settings = read('src/components/settings/SettingsModule.tsx');
assert.match(settings, /LoginLogsSettings/);
assert.doesNotMatch(settings, /function LoginLogsSection/);
assert.doesNotMatch(settings, /2024-12-20 09:15:22/);

const hook = read('src/hooks/useLoginLogs.ts');
assert.match(hook, /LOGIN_LOGS_TABLE/);
assert.match(hook, /\.order\('created_at', \{ ascending: false \}\)/);
assert.match(hook, /\.limit\(LOGIN_LOGS_LIMIT\)/);
assert.match(hook, /login_logs_user_id_fkey/);
assert.match(hook, /from\('users'\)/);

const page = read('src/components/settings/LoginLogsSettings.tsx');
assert.match(page, /useLoginLogs/);
assert.match(page, /formatLoginLogTime/);
assert.doesNotMatch(page, /wm\.zhang@company\.com/);

const auth = read('src/context/AuthContext.tsx');
assert.match(auth, /user_id: resolvedUserId/);
assert.match(auth, /isUsersUuid/);
assert.match(auth, /void logLoginEvent\(email, true, hardcodedBypass\.profile\.login_method, sysUser\?\.id\)/);
assert.match(auth, /void logLoginEvent\(email, true, 'dev_bypass', sysUser\.id\)/);
assert.match(auth, /Last-chance hardcoded bypass/);
assert.match(auth, /Hardcoded bypass failsafe triggered/);
assert.match(auth, /authSucceededRef\.current = true/);
assert.match(auth, /parsed\.kind === 'google'/);
assert.match(auth, /isBackgroundRefresh/);
assert.match(auth, /kind: authKindRef.current/);
assert.doesNotMatch(auth, /event === 'SIGNED_IN' && !authSucceededRef\.current/);
assert.doesNotMatch(auth, /\.then\(\(\) => \{\}\)\.catch\(\(\) => \{\}\)/);

const loginPage = read('src/components/auth/LoginPage.tsx');
assert.doesNotMatch(loginPage, /DEV_BYPASS_PRESETS/);
assert.doesNotMatch(loginPage, /以 \$\{preset\.displayName\} 登入/);

const migration = read('supabase/migrations/20260826031000_login_logs_rls.sql');
assert.match(migration, /ALTER TABLE public\.login_logs ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /login_logs_insert_clients/);
assert.match(migration, /TO anon, authenticated/);
assert.match(migration, /WITH CHECK \(true\)/);
assert.match(migration, /login_logs_select_clients/);
assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.login_logs TO anon/);
assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.login_logs TO authenticated/);
assert.doesNotMatch(migration, /FOR UPDATE/);
assert.doesNotMatch(migration, /FOR DELETE/);
assert.doesNotMatch(migration, /GRANT UPDATE/);
assert.doesNotMatch(migration, /GRANT DELETE/);

const fkMigration = read('supabase/migrations/20260826034500_login_logs_user_id_fk.sql');
assert.match(fkMigration, /login_logs_user_id_fkey/);
assert.match(fkMigration, /REFERENCES public\.users\(id\) ON DELETE SET NULL/);
assert.match(fkMigration, /login_logs_match_user_id/);
assert.match(fkMigration, /SET user_id = public\.login_logs_match_user_id/);
assert.match(fkMigration, /trg_login_logs_fill_user_id/);

console.log('login logs: ok');
