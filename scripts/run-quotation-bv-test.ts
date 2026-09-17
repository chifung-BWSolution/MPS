import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BV_RATIO_TOTAL,
  BV_SOURCE_RELATED_TYPES,
  COMPANY_BV_LABEL,
  COMPANY_BV_RATIO,
  QUOTATION_BV_WITH_COMPANY_VIEW,
  STAFF_BV_POOL,
  formatBvRatio,
  isBvSourceRelatedType,
  isStaffBvComplete,
  mergeBvDraftStaff,
  parseBvRatio,
  projectBvTotal,
  remainingStaffBvRatio,
  scaleLegacyStaffBvRatio,
  suggestStaffBvFromHours,
  sumBvRatios,
  wouldExceedStaffBvPool,
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

assert.equal(COMPANY_BV_RATIO, 30);
assert.equal(STAFF_BV_POOL, 70);
assert.equal(COMPANY_BV_RATIO + STAFF_BV_POOL, BV_RATIO_TOTAL);
assert.equal(COMPANY_BV_LABEL, 'Branding Works');
assert.equal(QUOTATION_BV_WITH_COMPANY_VIEW, 'quotation_bv_with_company');
assert.equal(parseBvRatio(''), null);
assert.equal(parseBvRatio(0), null);
assert.equal(parseBvRatio(100), null);
assert.equal(parseBvRatio(70.01), null);
assert.equal(parseBvRatio(70), 70);
assert.equal(parseBvRatio(50), 50);
assert.equal(parseBvRatio('33.333'), 33.33);
assert.equal(sumBvRatios([50, 25, 25]), BV_RATIO_TOTAL);
assert.equal(remainingStaffBvRatio([40, 20]), 10);
assert.equal(wouldExceedStaffBvPool(80, 30), true);
assert.equal(wouldExceedStaffBvPool(40, 30), false);
assert.equal(wouldExceedStaffBvPool(40, 30.01), true);
assert.equal(scaleLegacyStaffBvRatio(100), 70);
assert.equal(scaleLegacyStaffBvRatio(50), 35);
assert.equal(projectBvTotal([35, 35]), BV_RATIO_TOTAL);
assert.equal(isStaffBvComplete([35, 35]), true);
assert.equal(isStaffBvComplete([40, 20]), false);
assert.equal(formatBvRatio(30), '30');
assert.equal(formatBvRatio(7.5), '7.5');
assert.deepEqual(suggestStaffBvFromHours([10, 10]), [35, 35]);
assert.deepEqual(suggestStaffBvFromHours([0, 10]), [0, 70]);
assert.deepEqual(suggestStaffBvFromHours([0, 0]), [0, 0]);
assert.deepEqual(suggestStaffBvFromHours([3, 12, 23.5]), [5.45, 21.82, 42.73]);
assert.equal(sumBvRatios(suggestStaffBvFromHours([1, 2, 3])), STAFF_BV_POOL);
assert.deepEqual(
  mergeBvDraftStaff(
    [{ id: 'bv-1', staffId: 's1', staffName: 'Ada', bvRatio: 40 }],
    [
      { staffId: 's1', staffName: 'Ada', position: 'PM', hours: 4, entryCount: 2 },
      { staffId: 's2', staffName: 'Ben', position: 'Designer', hours: 6, entryCount: 3 },
    ],
  ),
  [
    { id: 'bv-1', staffId: 's1', staffName: 'Ada', position: 'PM', hours: 4, entryCount: 2, bvRatio: '40' },
    { staffId: 's2', staffName: 'Ben', position: 'Designer', hours: 6, entryCount: 3, bvRatio: '' },
  ],
);
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
assert.match(resolver, /export async function resolveRelatedDayReportIds/);
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
assert.match(hook, /const saveBulk/);
assert.doesNotMatch(hook, /quotation_client_project_id/);

const hoursHook = read('src/hooks/useRelatedProjectStaffHours.ts');
assert.match(hoursHook, /resolveRelatedDayReportIds/);
assert.match(hoursHook, /day_report_entries/);
assert.match(hoursHook, /\.in\('related_id', related\.data\)/);

const card = read('src/components/quotation/QuotationBvCard.tsx');
assert.match(card, /協作者 Collaborators/);
assert.match(card, /useQuotationBv/);
assert.match(card, /relatedType/);
assert.match(card, /relatedId/);
assert.match(card, /projectTitle/);
assert.match(card, /variant/);
assert.match(card, /embedded/);
assert.match(card, /saveBulk/);
assert.match(card, /批量設定/);
assert.match(card, /QuotationBvBulkPanel/);
assert.match(card, /COMPANY_BV_LABEL/);
assert.match(card, /COMPANY_BV_RATIO/);
assert.match(card, /STAFF_BV_POOL/);
assert.match(card, /固定政策/);
assert.match(card, /remainingStaffBvRatio/);
assert.doesNotMatch(card, /remainingBvRatio/);
assert.doesNotMatch(card, /wouldExceedBvTotal/);
assert.doesNotMatch(card, /新增協作者/);
assert.doesNotMatch(card, /編輯協作者/);
assert.doesNotMatch(card, /DeleteConfirmModal/);

const panel = read('src/components/quotation/QuotationBvBulkPanel.tsx');
assert.match(panel, /批量設定 BV Ratio/);
assert.match(panel, /套用全部建議/);
assert.match(panel, /suggestStaffBvFromHours/);
assert.match(panel, /mergeBvDraftStaff/);
assert.match(panel, /useRelatedProjectStaffHours/);
assert.match(panel, /分拆建議/);
assert.match(panel, /STAFF_BV_POOL/);
assert.match(panel, /COMPANY_BV_RATIO/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /QuotationBvCard/);
assert.match(pitching, /relatedType="quotation_client"/);
assert.match(pitching, /relatedId=\{record\.id\}/);
assert.match(pitching, /projectTitle=\{draft\.displayName \|\| record\.displayName\}/);
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
assert.match(website, /projectTitle=\{site\.websiteName\}/);
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

const policyMigration = read('supabase/migrations/20260914015735_quotation_bv_company_policy.sql');
assert.match(policyMigration, /CREATE OR REPLACE FUNCTION public\.quotation_bv_company_ratio/);
assert.match(policyMigration, /CREATE OR REPLACE FUNCTION public\.quotation_bv_staff_pool/);
assert.match(policyMigration, /CREATE OR REPLACE FUNCTION public\.quotation_bv_company_label/);
assert.match(policyMigration, /SELECT 30::numeric\(6, 2\)/);
assert.match(policyMigration, /SELECT 70::numeric\(6, 2\)/);
assert.match(policyMigration, /SELECT 'Branding Works'::text/);
assert.match(policyMigration, /ROUND\(bv\.bv_ratio \* public\.quotation_bv_staff_pool\(\) \/ 100\.0, 2\)/);
assert.match(policyMigration, /s\.staff_sum > public\.quotation_bv_staff_pool\(\)/);
assert.match(policyMigration, /ADD CONSTRAINT quotation_bv_bv_ratio_check/);
assert.match(policyMigration, /bv_ratio <= 70/);
assert.match(policyMigration, /v_staff_pool numeric\(6, 2\) := public\.quotation_bv_staff_pool\(\)/);
assert.match(policyMigration, /VALUES \(v_project_id, NEW\.main_pm_id, v_staff_pool\)/);
assert.match(policyMigration, /CREATE OR REPLACE VIEW public\.quotation_bv_with_company/);
assert.match(policyMigration, /security_invoker = true/);
assert.doesNotMatch(policyMigration, /VALUES \(v_project_id, NEW\.main_pm_id, 100\)/);

assert.match(hook, /協作者上限/);

assert.match(pitching, /負責 PM \*/);
assert.match(pitching, /請選擇負責 PM/);
assert.doesNotMatch(pitching, /EMPTY_STAFF_OPTION/);

console.log('quotation bv: ok');
