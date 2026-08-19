import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(existsSync(join(root, 'src/components/planning-center')), false, 'planning-center folder should be gone');

const appContext = readFileSync(join(root, 'src/context/AppContext.tsx'), 'utf8');
assert.doesNotMatch(appContext, /id:\s*'planning-center'/);
assert.match(appContext, /if \(module === 'planning-center'\)/);
assert.match(appContext, /module: 'dashboard'/);

const home = readFileSync(join(root, 'src/components/home.tsx'), 'utf8');
assert.doesNotMatch(home, /PlanningCenterModule/);
assert.doesNotMatch(home, /planning-center/);

const topNav = readFileSync(join(root, 'src/components/layout/TopNav.tsx'), 'utf8');
assert.doesNotMatch(topNav, /planning-center/);

const sidebar = readFileSync(join(root, 'src/components/layout/Sidebar.tsx'), 'utf8');
assert.doesNotMatch(sidebar, /planning-center/);

console.log('planning-center removal: ok');
