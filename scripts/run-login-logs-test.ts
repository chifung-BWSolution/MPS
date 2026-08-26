import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  displayNameForLoginEmail,
  formatLoginLogTime,
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
    { google_email: 'franco.kaffa@gmail.com', display_name: 'Franco Lee' },
  ]),
  'Franco Lee',
);
assert.equal(displayNameForLoginEmail('unknown@example.com', []), 'unknown@example.com');

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
assert.match(hook, /from\('users'\)/);

const page = read('src/components/settings/LoginLogsSettings.tsx');
assert.match(page, /useLoginLogs/);
assert.match(page, /formatLoginLogTime/);
assert.doesNotMatch(page, /wm\.zhang@company\.com/);

const auth = read('src/context/AuthContext.tsx');
assert.match(auth, /const \{ error \} = await supabase\.from\('login_logs'\)\.insert/);
assert.match(auth, /void logLoginEvent\(email, true, hardcodedBypass\.profile\.login_method\)/);
assert.match(auth, /void logLoginEvent\(email, true, 'dev_bypass'\)/);
assert.doesNotMatch(auth, /\.then\(\(\) => \{\}\)\.catch\(\(\) => \{\}\)/);

console.log('login logs: ok');
