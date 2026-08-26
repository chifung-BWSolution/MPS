import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clientWebsiteNameForType,
  clientWebsiteNameStem,
  clientWebsiteProfileType,
  clientWebsiteSelectLabel,
  suggestedClientWebsiteFormDefaults,
  toClientWebsiteSelectOptions,
} from '../src/lib/clientWebsiteDefaults';
import type { WebsiteProfileFull } from '../src/types/app';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(clientWebsiteProfileType(['bwt_web']), 'website');
assert.equal(clientWebsiteProfileType(['bwt_system']), 'system');
assert.equal(clientWebsiteProfileType(['bwt_web', 'bwt_system']), 'website');
assert.equal(clientWebsiteProfileType(['bwl_event']), 'website');

assert.equal(clientWebsiteNameStem({ companyNameZh: '智豐' }), '智豐');
assert.equal(clientWebsiteNameStem({ companyNameZh: '', companyNameEn: 'Chi Fung' }), 'Chi Fung');
assert.equal(
  clientWebsiteNameStem({
    companyNameZh: '',
    companyNameEn: '',
    clientName: '智豐客戶',
  }),
  '智豐客戶',
);
assert.equal(
  clientWebsiteNameStem({
    companyNameZh: '  ',
    companyNameEn: '',
    clientName: '',
    displayName: '提案A',
  }),
  '提案A',
);

assert.equal(clientWebsiteNameForType('智豐', 'website'), '智豐網站');
assert.equal(clientWebsiteNameForType('智豐', 'system'), '智豐系統');
assert.equal(clientWebsiteNameForType('', 'website'), '');

const webDefaults = suggestedClientWebsiteFormDefaults({
  companyNameZh: '智豐',
  projectTypes: ['bwt_web'],
});
assert.equal(webDefaults.projectCategory, 'client');
assert.equal(webDefaults.profileType, 'website');
assert.equal(webDefaults.websiteName, '智豐網站');
assert.equal(webDefaults.status, 'development');
assert.equal(webDefaults.level, 3);
assert.equal(webDefaults.systemType, undefined);

const systemDefaults = suggestedClientWebsiteFormDefaults({
  companyNameZh: '智豐',
  projectTypes: ['bwt_system'],
});
assert.equal(systemDefaults.profileType, 'system');
assert.equal(systemDefaults.websiteName, '智豐系統');
assert.equal(systemDefaults.systemType, 'client_system');

const clientProfile: WebsiteProfileFull = {
  id: 'ws_client',
  companyId: '',
  brandId: '',
  websiteName: '客戶站',
  domainUrl: 'www.client.example',
  platform: 'other',
  level: 3,
  status: 'development',
  pagesCount: 0,
  articlesCount: 0,
  videosCount: 0,
  socialPostsCount: 0,
  keywordsCount: 0,
  pluginsCount: 0,
  totalHours: 0,
  projectCategory: 'client',
};
const internalProfile: WebsiteProfileFull = {
  ...clientProfile,
  id: 'ws_internal',
  websiteName: '內部站',
  projectCategory: 'internal',
};
const options = toClientWebsiteSelectOptions([clientProfile, internalProfile]);
assert.equal(options[0]?.value, '');
assert.equal(options[0]?.label, '尚未連結');
assert.equal(options.some((o) => o.value === 'ws_client'), true);
assert.equal(options.some((o) => o.value === 'ws_internal'), false);
const withSelectedInternal = toClientWebsiteSelectOptions(
  [clientProfile, internalProfile],
  'ws_internal',
);
assert.equal(withSelectedInternal.some((o) => o.value === 'ws_internal'), true);
assert.equal(clientWebsiteSelectLabel(clientProfile), '客戶站 (www.client.example)');

const pitching = readFileSync(join(root, 'src/components/quotation/PitchingModule.tsx'), 'utf8');
const formModalSrc = pitching.slice(
  pitching.indexOf('export function PitchingFormModal'),
  pitching.indexOf('function PitchingList'),
);
const detailSrc = pitching.slice(pitching.indexOf('export function PitchingDetail'));

assert.match(formModalSrc, /ClientWebsiteSelectField/);
assert.match(formModalSrc, /網站 \/ 系統/);
assert.ok(
  formModalSrc.indexOf('網站 / 系統') < formModalSrc.indexOf('連結 Links'),
  'form website field must appear before Links',
);
assert.ok(
  formModalSrc.indexOf('連結 Links') < formModalSrc.indexOf('Asana 連結'),
  'Links section still contains Asana',
);

assert.match(detailSrc, /ClientWebsiteSelectField/);
assert.match(detailSrc, /showOpenLink/);
assert.ok(
  detailSrc.indexOf('ClientWebsiteSelectField') < detailSrc.indexOf('Asana 連結'),
  'detail website field must appear before Asana',
);

const fieldSrc = readFileSync(
  join(root, 'src/components/quotation/ClientWebsiteSelectField.tsx'),
  'utf8',
);
assert.match(fieldSrc, /WebsiteFormModal/);
assert.match(fieldSrc, /overlayClassName="z-\[120\]"/);
assert.match(fieldSrc, /lockProjectCategory/);
assert.match(fieldSrc, /請先選擇客戶/);
assert.match(fieldSrc, /新增網站\/系統/);

const hook = readFileSync(join(root, 'src/hooks/useQuotationClientProjects.ts'), 'utf8');
assert.match(hook, /webandsystem_list_id/);
assert.match(hook, /webandsystemListId/);
assert.match(hook, /webandsystem_list \( website_name, domain_url, profile_type \)/);

const migration = readFileSync(
  join(root, 'supabase/migrations/20260826120000_quotation_client_project_webandsystem_list_id.sql'),
  'utf8',
);
assert.match(migration, /webandsystem_list_id text/);
assert.match(migration, /REFERENCES public\.webandsystem_list\(id\)/);
assert.match(migration, /ON DELETE SET NULL/);

const websiteModal = readFileSync(join(root, 'src/components/website/WebsiteFormModal.tsx'), 'utf8');
assert.match(websiteModal, /export function WebsiteFormModal/);
assert.match(websiteModal, /overlayClassName/);
assert.match(websiteModal, /lockProjectCategory/);
assert.match(websiteModal, /websiteFormDataToProfile/);

const websiteModule = readFileSync(join(root, 'src/components/website/WebsiteModule.tsx'), 'utf8');
assert.match(websiteModule, /from '@\/components\/website\/WebsiteFormModal'/);
assert.doesNotMatch(websiteModule, /function WebsiteFormModal/);

console.log('pitching webandsystem link: ok');
