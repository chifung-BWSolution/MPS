import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BV_RATIO_TOTAL,
  BV_SOURCE_RELATED_TYPES,
  isBvSourceRelatedType,
  parseBvRatio,
  remainingBvRatio,
  sumBvRatios,
  wouldExceedBvTotal,
} from '../src/lib/quotationBv';
import {
  PROJECTS_TABLE,
  PROJECT_HUB_RELATED_TYPES,
  isProjectHubRelatedType,
  mergeProjectHubIds,
  pickWriteProjectHubId,
} from '../src/lib/projectsHub';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(parseBvRatio(''), null);
assert.equal(parseBvRatio(0), null);
assert.equal(parseBvRatio(100.01), null);
assert.equal(parseBvRatio(50), 50);
assert.equal(parseBvRatio('33.333'), 33.33);
assert.equal(sumBvRatios([50, 25, 25]), BV_RATIO_TOTAL);
assert.equal(remainingBvRatio([40, 20]), 40);
assert.equal(wouldExceedBvTotal(80, 30), true);
assert.equal(wouldExceedBvTotal(70, 30), false);
assert.equal(PROJECTS_TABLE, 'projects');
assert.deepEqual([...BV_SOURCE_RELATED_TYPES], ['quotation_client', 'webandsystem']);
assert.equal(isBvSourceRelatedType('quotation_client'), true);
assert.equal(isBvSourceRelatedType('webandsystem'), true);
assert.equal(isBvSourceRelatedType('vchannel'), false);
assert.equal(isProjectHubRelatedType('webandsystem'), true);
assert.equal(isProjectHubRelatedType('manual'), true);
assert.ok(PROJECT_HUB_RELATED_TYPES.includes('quotation_client'));
assert.deepEqual(mergeProjectHubIds('p-own', ['p-q1', 'p-own', 'p-q2']), ['p-own', 'p-q1', 'p-q2']);
assert.equal(pickWriteProjectHubId('p-own', ['p-q1']), 'p-own');
assert.equal(pickWriteProjectHubId(null, ['p-q1', 'p-q2']), 'p-q1');
assert.equal(pickWriteProjectHubId('', []), null);

const migration = read('supabase/migrations/20260825110000_create_quotation_bv.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.quotation_bv/);
assert.match(migration, /quotation_client_project_id text NOT NULL/);
assert.match(migration, /staff_id uuid NOT NULL/);
assert.match(migration, /bv_ratio numeric\(6, 2\) NOT NULL/);
assert.match(migration, /REFERENCES public\.quotation_client_project\(id\)/);
assert.match(migration, /REFERENCES public\.staffs\(id\)/);
assert.match(migration, /INSERT INTO public\.quotation_bv/);
assert.match(migration, /SELECT p\.id, p\.main_pm_id, 100/);
assert.match(migration, /FROM public\.quotation_client_project p/);
assert.match(migration, /WHERE p\.main_pm_id IS NOT NULL/);

const hubMigration = read('supabase/migrations/20260910073957_quotation_bv_link_projects_hub.sql');
assert.match(hubMigration, /ADD COLUMN IF NOT EXISTS project_id uuid/);
assert.match(hubMigration, /p\.related_type = 'quotation_client'/);
assert.match(hubMigration, /p\.related_id = bv\.quotation_client_project_id/);
assert.match(hubMigration, /DROP COLUMN quotation_client_project_id/);
assert.match(hubMigration, /REFERENCES public\.projects\(id\) ON DELETE CASCADE/);
assert.match(hubMigration, /UNIQUE \(project_id, staff_id\)/);
assert.match(hubMigration, /CREATE TRIGGER trg_sync_quotation_bv_seed_main_pm/);
assert.match(hubMigration, /AND p\.related_id = NEW\.id/);
assert.match(hubMigration, /INSERT INTO public\.quotation_bv \(project_id, staff_id, bv_ratio\)/);

const hub = read('src/lib/projectsHub.ts');
assert.match(hub, /export const PROJECTS_TABLE = 'projects'/);
assert.match(hub, /webandsystem/);
assert.match(hub, /mergeProjectHubIds/);
assert.match(hub, /pickWriteProjectHubId/);

const resolver = read('src/lib/resolveProjectHub.ts');
assert.match(resolver, /export async function resolveProjectHubId/);
assert.match(resolver, /export async function resolveRelatedProjectHubIds/);
assert.match(resolver, /webandsystem_list_id/);
assert.match(resolver, /quotation_client/);
assert.match(resolver, /\.in\('related_id', ids\)/);
assert.match(resolver, /from\(PROJECTS_TABLE\)/);

const hook = read('src/hooks/useQuotationBv.ts');
assert.match(hook, /QUOTATION_BV_TABLE/);
assert.match(hook, /resolveRelatedProjectHubIds/);
assert.match(hook, /\.in\('project_id', resolved\.data\.projectIds\)/);
assert.match(hook, /project_id/);
assert.match(hook, /staff:staffs!staff_id/);
assert.match(hook, /const addRow/);
assert.match(hook, /const updateRow/);
assert.match(hook, /const deleteRow/);
assert.doesNotMatch(hook, /quotation_client_project_id/);

const card = read('src/components/quotation/QuotationBvCard.tsx');
assert.match(card, /協作者 Collaborators/);
assert.match(card, /useQuotationBv/);
assert.match(card, /relatedType/);
assert.match(card, /relatedId/);
assert.match(card, /variant/);
assert.match(card, /embedded/);
assert.match(card, /addRow/);
assert.match(card, /updateRow/);
assert.match(card, /deleteRow/);
assert.match(card, /DeleteConfirmModal/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /QuotationBvCard/);
assert.match(pitching, /<QuotationBvCard relatedType="quotation_client" relatedId=\{record\.id\} \/>/);
assert.match(pitching, /xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
assert.match(pitching, /提案描述/);
assert.doesNotMatch(
  pitching,
  /border-t border-border pt-4[\s\S]*label="提案描述"/,
);
assert.doesNotMatch(pitching, /<QuotationBvCard projectId=\{record\.id\} \/>/);

const website = read('src/components/website/WebsiteModule.tsx');
assert.match(website, /QuotationBvCard/);
assert.match(website, /relatedType="webandsystem"/);
assert.match(website, /relatedId=\{site\.id\}/);
assert.match(website, /variant="embedded"/);
assert.match(website, /resolveProjectHubId\('webandsystem', site\.id\)/);
assert.match(website, /\.in\('related_id', \[\.\.\.relatedIds\]\)/);
assert.doesNotMatch(website, /尚未分配團隊/);

const project = read('src/components/quotation/ProjectModule.tsx');
assert.match(project, /PitchingDetail/);

const automation = read('supabase/migrations/20260825120000_quotation_bv_main_pm_automations.sql');
assert.match(automation, /CREATE OR REPLACE FUNCTION public\.trg_quotation_bv_seed_main_pm/);
assert.match(automation, /VALUES \(NEW\.id, NEW\.main_pm_id, 100\)/);
assert.match(automation, /staff_id = NEW\.main_pm_id/);
assert.match(automation, /DELETE FROM public\.quotation_bv/);
assert.match(automation, /VALUES \(NEW\.id, NEW\.main_pm_id, v_old_ratio\)/);

assert.match(pitching, /負責 PM \*/);
assert.match(pitching, /請選擇負責 PM/);
assert.doesNotMatch(pitching, /EMPTY_STAFF_OPTION/);

console.log('quotation bv: ok');
