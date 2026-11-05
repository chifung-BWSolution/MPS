import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mediaPublicationRowsHaveInvalidUrl,
  mediaPublicationsEqual,
  mediaPublicationsForWrite,
  parseMediaPublications,
} from '../src/lib/mediaPublications';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.deepEqual(parseMediaPublications(null), []);
assert.deepEqual(parseMediaPublications('not-json'), []);
assert.deepEqual(parseMediaPublications({}), []);
assert.deepEqual(
  parseMediaPublications([
    ' example.com/a ',
    { id: 'keep', url: 'https://news.example/b' },
    { id: 'keep', url: 'https://news.example/c' },
    { url: 'not a url' },
    '',
  ]),
  [
    { id: 'media_1', url: 'https://example.com/a' },
    { id: 'keep', url: 'https://news.example/b' },
    { id: 'keep_3', url: 'https://news.example/c' },
  ],
);

const written = mediaPublicationsForWrite([
  { id: 'a', url: 'https://example.com/post' },
  { id: 'b', url: '   ' },
  { id: 'c', url: 'media.example/story' },
]);
assert.deepEqual(written, [
  { id: 'a', url: 'https://example.com/post' },
  { id: 'c', url: 'https://media.example/story' },
]);
assert.equal(mediaPublicationsEqual(written, parseMediaPublications(written)), true);
assert.equal(mediaPublicationsEqual(written, []), false);
assert.equal(mediaPublicationRowsHaveInvalidUrl([{ url: 'https://ok.example' }, { url: '' }]), false);
assert.equal(mediaPublicationRowsHaveInvalidUrl([{ url: 'bad url' }]), true);

const migration = read('supabase/migrations/20261105084244_add_quotation_client_project_media_publications.sql');
assert.match(migration, /ADD COLUMN IF NOT EXISTS media_publications jsonb/);
assert.match(migration, /DEFAULT '\[\]'::jsonb/);
assert.match(migration, /媒體發佈/);

const hook = read('src/hooks/useQuotationClientProjects.ts');
assert.match(hook, /media_publications: unknown/);
assert.match(hook, /mediaPublications: parseMediaPublications\(row\.media_publications\)/);
assert.match(hook, /\| 'mediaPublications'/);
assert.match(hook, /if \(data\.mediaPublications !== undefined\) row\.media_publications = parseMediaPublications\(data\.mediaPublications\)/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
const detailSrc = pitching.slice(pitching.indexOf('export function PitchingDetail'));
const formSrc = pitching.slice(
  pitching.indexOf('export function PitchingFormModal'),
  pitching.indexOf('function PitchingList'),
);
assert.match(detailSrc, /moduleId === 'system-dev' \? \(/);
assert.match(detailSrc, /MediaPublicationsField/);
assert.match(detailSrc, /handleMediaPublicationsChange/);
assert.doesNotMatch(formSrc, /MediaPublicationsField/);
assert.ok(
  detailSrc.indexOf('MediaPublicationsField') < detailSrc.indexOf('Asana 連結'),
  'media publications sit where the website field was, before Asana',
);

const field = read('src/components/quotation/MediaPublicationsField.tsx');
assert.match(field, /媒體發佈/);
assert.match(field, /新增連結/);
assert.match(field, /移除連結/);

console.log('media publications: ok');
