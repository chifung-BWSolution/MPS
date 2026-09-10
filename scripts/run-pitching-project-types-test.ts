import assert from 'node:assert/strict';
import {
  formatPitchingCode,
  formatProjectTypes,
  matchesProjectTypeFilter,
  pitchingCodeFinancialYear,
  pitchingCodePrefix,
  PITCHING_CODE_PATTERN,
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

assert.equal(pitchingCodePrefix(['bwt_system']), 'BWT-S');
assert.equal(pitchingCodePrefix(['bwt_web', 'bwt_system']), 'BWT-S');
assert.equal(pitchingCodePrefix(['bwl_event', 'bwt_web']), 'BWL-E');
assert.equal(pitchingCodePrefix(['bwg_gift']), 'BWG-G');
assert.equal(pitchingCodePrefix(['bwt_web']), 'BWT-W');
assert.equal(pitchingCodePrefix([]), 'BWT-W');
assert.equal(pitchingCodeFinancialYear('2026-04-01'), 26);
assert.equal(pitchingCodeFinancialYear('2027-03-31'), 26);
assert.equal(pitchingCodeFinancialYear('2027-04-01'), 27);
assert.equal(pitchingCodeFinancialYear('2026-03-31'), 25);
assert.equal(formatPitchingCode('BWT-S', 26, 1), 'BWT-S26-001');
assert.match('BWL-E26-001', PITCHING_CODE_PATTERN);

console.log('pitching project types: ok');
