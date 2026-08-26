import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(existsSync(join(root, 'src/components/settings/TalentApplicationForm.tsx')), false);

const settings = read('src/components/settings/SettingsModule.tsx');
assert.doesNotMatch(settings, /TalentApplicationForm/);
assert.doesNotMatch(settings, /talent-form/);
assert.doesNotMatch(settings, /藝人表格/);

const menu = read('src/context/AppContext.tsx');
assert.doesNotMatch(menu, /id: 'talent-form', label: '藝人表格'/);
assert.match(menu, /sub === 'talent-form'/);
assert.match(menu, /module: 'talent', subModule: 'invite'/);

const migration = read('supabase/migrations/20260826033000_drop_talent_form.sql');
assert.match(migration, /DROP TABLE IF EXISTS public\.talent_form CASCADE/);

const liveSources = [
  'src/components/settings/TalentApplicationFormV2.tsx',
  'src/components/talent/TalentInvitePublicPage.tsx',
  'src/components/talent/TalentSubmissionViewPage.tsx',
  'src/components/talent/TalentModule.tsx',
  'src/lib/artist-apply-api.ts',
].map(read).join('\n');
assert.doesNotMatch(liveSources, /from\('talent_form'\)/);
assert.doesNotMatch(liveSources, /from\("talent_form"\)/);

console.log('drop talent_form: ok');
