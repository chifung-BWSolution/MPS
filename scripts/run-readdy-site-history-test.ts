import assert from 'node:assert/strict';
import { framerSiteSnapshotIdentity, mergeFramerSiteSnapshots } from '../src/lib/readdyFramerProgress.ts';
import type { FramerSiteSnapshot } from '../src/types/readdyFramer.ts';

function site(
  partial: Pick<FramerSiteSnapshot, 'id' | 'created_at'> & Partial<FramerSiteSnapshot>,
): FramerSiteSnapshot {
  return {
    project_key: '',
    project_name: 'Site',
    source_type: 'github',
    source_label: null,
    framer_project_url: null,
    github_repo_url: null,
    github_branch: null,
    github_all_paths: [],
    storage_bundle_path: null,
    analysis: {
      projectKey: '',
      projectName: 'Site',
      sourceType: 'github',
      framework: '',
      routerFile: null,
      totalFiles: 0,
      pages: [],
      localeCounts: {},
      kindCounts: {},
      sharedFiles: {},
      cssTokens: { colors: {} },
      tailwindConfig: null,
    },
    page_count: 1,
    ...partial,
  };
}

const office = 'chifung-BWSolution/readdy-767ff4';
const music = 'chifung-BWSolution/readdy-fc4c1e';

const duplicates = [
  site({
    id: 'music-new',
    created_at: '2026-11-26T09:14:00.000Z',
    project_name: 'BW Event Music',
    project_key: `gh:${music}:main`,
    source_label: music,
    page_count: 217,
  }),
  site({
    id: 'music-old',
    created_at: '2026-11-26T09:10:00.000Z',
    project_name: 'BW Event Music',
    project_key: `gh:${music}:feature`,
    source_label: `https://github.com/${music}.git`,
    github_repo_url: `https://github.com/${music}`,
    page_count: 217,
  }),
  site({
    id: 'office-new',
    created_at: '2026-11-26T08:56:00.000Z',
    project_name: '香港辦公室設計及寫字樓裝修',
    project_key: '',
    source_label: office,
    page_count: 44,
  }),
  site({
    id: 'office-mid',
    created_at: '2026-11-26T08:45:00.000Z',
    project_name: '香港辦公室設計及寫字樓裝修',
    project_key: `proj:香港辦公室設計及寫字樓裝修:44`,
    source_label: office,
    page_count: 44,
  }),
  site({
    id: 'office-old',
    created_at: '2026-11-26T05:59:00.000Z',
    project_name: '香港辦公室設計及寫字樓裝修',
    project_key: `gh:${office}:main`,
    source_label: office,
    page_count: 44,
  }),
];

assert.equal(framerSiteSnapshotIdentity(duplicates[0]), framerSiteSnapshotIdentity(duplicates[1]));
assert.equal(framerSiteSnapshotIdentity(duplicates[2]), framerSiteSnapshotIdentity(duplicates[4]));
assert.notEqual(framerSiteSnapshotIdentity(duplicates[0]), framerSiteSnapshotIdentity(duplicates[2]));

const merged = mergeFramerSiteSnapshots(duplicates, 20);
assert.deepEqual(merged.map((row) => row.id), ['music-new', 'office-new']);

const uploads = mergeFramerSiteSnapshots([
  site({
    id: 'zip-new',
    created_at: '2026-11-26T10:00:00.000Z',
    source_type: 'upload',
    source_label: 'site-v2.zip',
    analysis: {
      ...duplicates[0].analysis,
      sourceType: 'upload',
      sourceOrigin: 'https://Example.com/',
    },
  }),
  site({
    id: 'zip-old',
    created_at: '2026-11-26T09:00:00.000Z',
    source_type: 'upload',
    source_label: 'site-v1.zip',
    analysis: {
      ...duplicates[0].analysis,
      sourceType: 'upload',
      sourceOrigin: 'https://example.com',
    },
  }),
  site({
    id: 'other-zip',
    created_at: '2026-11-26T08:00:00.000Z',
    source_type: 'upload',
    source_label: 'other.zip',
    project_name: 'Other',
  }),
], 20);
assert.deepEqual(uploads.map((row) => row.id), ['zip-new', 'other-zip']);

const limited = mergeFramerSiteSnapshots(
  [
    site({ id: 'a2', created_at: '2026-11-26T02:00:00.000Z', source_label: 'o/a', project_key: 'gh:o/a:main' }),
    site({ id: 'a1', created_at: '2026-11-26T01:00:00.000Z', source_label: 'o/a', project_key: 'gh:o/a:main' }),
    site({ id: 'b1', created_at: '2026-11-26T03:00:00.000Z', source_label: 'o/b', project_key: 'gh:o/b:main' }),
  ],
  1,
);
assert.deepEqual(limited.map((row) => row.id), ['b1']);

console.log('ALL READDY SITE HISTORY TESTS PASSED');
