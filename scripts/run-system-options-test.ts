import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const hook = read('src/hooks/useSystemOptions.ts');
assert.match(hook, /export type OptionCategory = 'platform'/);
assert.match(hook, /\.eq\('category', 'platform'\)/);
assert.doesNotMatch(hook, /brand_category/);
assert.doesNotMatch(hook, /project_type/);

const settings = read('src/components/settings/SettingsModule.tsx');
assert.match(settings, /開發平台選項/);
assert.match(settings, /addOption\('platform'/);
assert.doesNotMatch(settings, /品牌分類選項/);
assert.doesNotMatch(settings, /項目類型選項/);
assert.doesNotMatch(settings, /brand_category/);
assert.doesNotMatch(settings, /project_type/);

const website = read('src/components/website/WebsiteModule.tsx');
assert.match(website, /optionsByCategory\('platform'\)/);

const migration = read('supabase/migrations/20260826025501_drop_unused_system_option_categories.sql');
assert.match(migration, /brand_category/);
assert.match(migration, /project_type/);
assert.match(migration, /DELETE FROM public\.system_options/);

console.log('system options: ok');
