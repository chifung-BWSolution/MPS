import assert from 'node:assert/strict';
import {
  bwaApiErrorMessage,
  bwaCustomerLabel,
  bwaProjectListMetrics,
  bwaProjectTitle,
  bwaStatusOptions,
  filterBwaProjects,
  isBwaProjectId,
  parseYoutubeUrlInput,
  type BwaProject,
} from '../src/lib/bwaProjects.ts';

function project(partial: Partial<BwaProject> & Pick<BwaProject, 'id'>): BwaProject {
  return {
    project_code: null,
    project_name: null,
    external_project_name: null,
    external_customer_name: null,
    description: null,
    status: null,
    payment_status: null,
    estimated_income: null,
    estimated_expense: null,
    estimated_profit: null,
    signed_date: null,
    start_date: null,
    handover_date: null,
    size: null,
    actual_size: null,
    project_size: null,
    site_address: null,
    youtube_url: null,
    asana_link: null,
    working_folder: null,
    customer: null,
    main_pm: null,
    main_designer: null,
    other_pm: null,
    more_pm: null,
    creator_staff: null,
    modifier_staff: null,
    cost_centre: null,
    financial_year: null,
    team_type: null,
    service_type: null,
    quote_project_type: null,
    service_types: [],
    project_types: [],
    district: null,
    building: null,
    main_contractor: null,
    main_air_supplier: null,
    main_network_supplier: null,
    supplier: null,
    pitching: null,
    created_by_user: null,
    ...partial,
  };
}

const rows = [
  project({
    id: '11111111-1111-4111-8111-111111111111',
    project_code: 'BWA-001',
    project_name: '中環辦公室',
    status: '進行中',
    site_address: '皇后大道中 1 號',
    youtube_url: 'https://www.youtube.com/watch?v=abc',
    customer: { id: 'c1', label: '甲公司', customer_name: '甲', company_name: '甲公司' },
    district: { id: 'd1', label: '中環', region_id: 'hk', region_label: '香港島' },
  }),
  project({
    id: '22222222-2222-4222-8222-222222222222',
    project_code: 'BWA-002',
    project_name: '九龍展廳',
    status: '已完成',
    external_customer_name: '乙客戶',
    site_address: '彌敦道',
  }),
];

assert.equal(parseYoutubeUrlInput('  ').youtube_url, null);
assert.equal(
  parseYoutubeUrlInput('https://www.youtube.com/watch?v=VIDEO_ID').youtube_url,
  'https://www.youtube.com/watch?v=VIDEO_ID',
);
assert.equal(parseYoutubeUrlInput('https://youtu.be/VIDEO_ID').ok, true);
assert.equal(parseYoutubeUrlInput('https://www.youtube.com/shorts/VIDEO_ID').ok, true);
assert.equal(parseYoutubeUrlInput('https://www.youtube.com/live/VIDEO_ID').ok, true);
assert.equal(parseYoutubeUrlInput('https://www.youtube.com/embed/VIDEO_ID').ok, true);
assert.equal(parseYoutubeUrlInput('http://www.youtube.com/watch?v=VIDEO_ID').ok, false);
assert.equal(parseYoutubeUrlInput('https://example.com/watch?v=VIDEO_ID').ok, false);
assert.equal(parseYoutubeUrlInput('https://www.youtube.com/playlist?list=abc').ok, false);
assert.equal(parseYoutubeUrlInput('https://www.youtube.com/watch').ok, false);

assert.equal(isBwaProjectId('11111111-1111-4111-8111-111111111111'), true);
assert.equal(isBwaProjectId('not-a-uuid'), false);

assert.equal(bwaProjectTitle(rows[1]), '九龍展廳');
assert.equal(bwaCustomerLabel(rows[0]), '甲公司');
assert.equal(bwaCustomerLabel(rows[1]), '乙客戶');
assert.deepEqual(bwaProjectListMetrics(rows), { total: 2, withYoutube: 1 });
assert.deepEqual(bwaStatusOptions(rows), ['已完成', '進行中']);
assert.deepEqual(filterBwaProjects(rows, { search: '皇后' }).map((row) => row.project_code), ['BWA-001']);
assert.deepEqual(filterBwaProjects(rows, { status: '已完成' }).map((row) => row.project_code), ['BWA-002']);
assert.deepEqual(
  filterBwaProjects(rows, { search: '乙', status: '已完成' }).map((row) => row.project_code),
  ['BWA-002'],
);
assert.equal(bwaApiErrorMessage(503, { code: 'service_unavailable' }).includes('API 金鑰'), true);
assert.equal(bwaApiErrorMessage(400, { code: 'invalid_youtube_url' }).includes('YouTube'), true);

console.log('bwa projects api ok');
