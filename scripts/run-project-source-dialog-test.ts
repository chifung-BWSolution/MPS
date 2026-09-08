import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const overviewSrc = read('src/components/project/ProjectOverview.tsx');
assert.match(overviewSrc, /ProjectSourceDialog/);
assert.doesNotMatch(overviewSrc, /relatedType="manual"/);
assert.doesNotMatch(overviewSrc, /addProject/);
assert.doesNotMatch(overviewSrc, /function ProjectFormModal/);

const dialogSrc = read('src/components/project/ProjectSourceDialog.tsx');
assert.match(dialogSrc, /WebsiteFormModal/);
assert.match(dialogSrc, /PitchingFormModal/);
assert.match(dialogSrc, /ProjectVchannelFormModal/);
assert.match(dialogSrc, /key: 'website'/);
assert.match(dialogSrc, /key: 'system'/);
assert.match(dialogSrc, /key: 'quotation_client'/);
assert.match(dialogSrc, /key: 'vchannel'/);
assert.match(dialogSrc, /舊自訂項目/);
assert.doesNotMatch(dialogSrc, /related_type: 'manual'/);
assert.match(dialogSrc, /addProfile/);
assert.match(dialogSrc, /addRecord/);
assert.match(dialogSrc, /addChannel/);

const vchannelSrc = read('src/components/project/ProjectVchannelFormModal.tsx');
assert.match(vchannelSrc, /頻道編號/);
assert.match(vchannelSrc, /內部名稱/);
assert.match(vchannelSrc, /公開頻道名稱/);

console.log('project source dialog: ok');
