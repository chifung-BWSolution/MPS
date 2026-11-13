import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesWorkflowView } from '../src/components/talent/kolWorkflow';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const newBeauty = {
  primary_category: 'both',
  lifecycle_status: 'unprocessed',
  source_system: 'beauty18',
};
assert.equal(matchesWorkflowView(newBeauty, 'all'), false);
assert.equal(matchesWorkflowView(newBeauty, 'food'), false);
assert.equal(matchesWorkflowView(newBeauty, 'beauty'), false);
assert.equal(matchesWorkflowView(newBeauty, 'new-beauty'), true);
assert.equal(
  matchesWorkflowView({ ...newBeauty, lifecycle_status: 'shortlist' }, 'new-beauty'),
  false
);
assert.equal(
  matchesWorkflowView({ ...newBeauty, lifecycle_status: 'shortlist' }, 'shortlist'),
  true
);
assert.equal(
  matchesWorkflowView({ ...newBeauty, lifecycle_status: 'meeting' }, 'meeting'),
  true
);
assert.equal(
  matchesWorkflowView({ ...newBeauty, lifecycle_status: 'star' }, 'star'),
  true
);

const olderBeauty = {
  primary_category: 'beauty',
  lifecycle_status: 'unprocessed',
  source_system: 'excel',
};
assert.equal(matchesWorkflowView(olderBeauty, 'beauty'), true);
assert.equal(matchesWorkflowView(olderBeauty, 'new-beauty'), false);
assert.equal(matchesWorkflowView(olderBeauty, 'all'), true);
assert.equal(matchesWorkflowView(olderBeauty, 'food'), false);

const food = {
  primary_category: 'food',
  lifecycle_status: 'unprocessed',
  source_system: 'emailmeform',
};
assert.equal(matchesWorkflowView(food, 'food'), true);
assert.equal(matchesWorkflowView(food, 'all'), true);
assert.equal(matchesWorkflowView(food, 'new-beauty'), false);
assert.equal(matchesWorkflowView({ ...food, lifecycle_status: 'shortlist' }, 'food'), false);

const srcDir = join(root, 'src');
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const appSources = walk(srcDir).filter((path) => /\.(ts|tsx)$/.test(path));
for (const path of appSources) {
  const text = readFileSync(path, 'utf8');
  assert.equal(text.includes('kol_new_beauty'), false, path);
}

console.log('kol workflow view tests passed');
