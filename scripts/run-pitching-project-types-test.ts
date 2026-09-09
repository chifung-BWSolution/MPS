import assert from 'node:assert/strict';
import {
  formatProjectTypes,
  matchesProjectTypeFilter,
  PITCHING_PROJECT_TYPE_OPTIONS,
  type PitchingProjectType,
} from '../src/data/pitchingData';

const ids = PITCHING_PROJECT_TYPE_OPTIONS.map((opt) => opt.id);
assert.deepEqual(ids, ['bwl_event', 'bwt_web', 'bwt_system', 'bwg_gift']);
assert.equal(
  PITCHING_PROJECT_TYPE_OPTIONS.find((opt) => opt.id === 'bwg_gift')?.label,
  'BWG-禮品',
);

const all: PitchingProjectType[] = ['bwl_event', 'bwt_web', 'bwt_system', 'bwg_gift'];
assert.equal(formatProjectTypes(all), 'BWL 活動報價、BWT-網頁、BWT-系統、BWG-禮品');
assert.equal(matchesProjectTypeFilter(['bwg_gift'], 'bwg_gift'), true);
assert.equal(matchesProjectTypeFilter(['bwg_gift'], 'bwl_event'), false);
assert.equal(matchesProjectTypeFilter(['bwg_gift'], 'all'), true);

console.log('pitching project types: ok');
