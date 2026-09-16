import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUOTATION_PROJECT_TYPES_TABLE,
  collapseProjectTypeCodes,
  normalizeProjectTypeCode,
  normalizeProjectTypeCodeInitial,
  projectTypeIdFromCodes,
  slugifyProjectTypeCode,
  validateProjectTypeCode,
  validateProjectTypeCodeInitial,
} from '../src/lib/quotationProjectTypes';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(QUOTATION_PROJECT_TYPES_TABLE, 'quotation_project_types');
assert.equal(normalizeProjectTypeCode(' BWT_Web '), 'bwt_web');
assert.equal(normalizeProjectTypeCodeInitial(' bwt-w '), 'BWT-W');
assert.equal(validateProjectTypeCode('bwt_web'), null);
assert.equal(validateProjectTypeCode('BWT-W'), '識別碼須為小寫英數與底線，例如 bwt_web');
assert.equal(validateProjectTypeCodeInitial('BWT-W'), null);
assert.equal(validateProjectTypeCodeInitial('BWTW'), '代碼前綴格式須為 XXX-X，例如 BWT-W');
assert.equal(slugifyProjectTypeCode('BWT-Web'), 'bwt_web');
assert.equal(collapseProjectTypeCodes(['bwt_web', 'bwt_system']), 'bwt_system');
assert.equal(collapseProjectTypeCodes(['bwt_system', 'bwt_web']), 'bwt_system');
assert.equal(collapseProjectTypeCodes(['bwt_web']), 'bwt_web');
assert.equal(projectTypeIdFromCodes(['bwt_web', 'bwt_system'], [{ id: 'uuid-s', code: 'bwt_system' }]), 'uuid-s');

const menu = read('src/context/AppContext.tsx');
assert.match(menu, /id: 'quotation'/);
assert.match(menu, /id: 'system-dev'/);
assert.match(menu, /id: 'project-types'/);
assert.match(menu, /label: '項目類型', section: '設置'/);

const module = read('src/components/quotation/QuotationModule.tsx');
assert.match(module, /QuotationProjectTypesSettings/);
assert.match(module, /subModule === 'project-types'/);

const hook = read('src/hooks/useQuotationProjectTypes.ts');
assert.match(hook, /QUOTATION_PROJECT_TYPES_TABLE/);
assert.match(hook, /from\(QUOTATION_PROJECT_TYPES_TABLE\)/);
assert.match(hook, /const addType/);
assert.match(hook, /const updateType/);
assert.match(hook, /const deleteType/);
assert.match(hook, /const countUsage/);
assert.match(hook, /from\('quotation_client_project'\)/);
assert.match(hook, /\.eq\('project_types', id\)/);

const page = read('src/components/quotation/QuotationProjectTypesSettings.tsx');
assert.match(page, /useQuotationProjectTypes/);
assert.match(page, /新增類型/);
assert.match(page, /顯示名稱/);
assert.match(page, /代碼前綴/);
assert.match(page, /識別碼/);
assert.doesNotMatch(page, /DeleteConfirmModal/);
assert.doesNotMatch(page, /Trash2/);

const createMigration = read('supabase/migrations/20260915031835_create_quotation_project_types.sql');
assert.match(createMigration, /CREATE TABLE IF NOT EXISTS public\.quotation_project_types/);

const fkMigration = read('supabase/migrations/20260915033043_quotation_project_types_uuid_fk.sql');
assert.match(fkMigration, /ADD COLUMN IF NOT EXISTS code text/);
assert.match(fkMigration, /ADD COLUMN IF NOT EXISTS id_uuid uuid/);
assert.match(fkMigration, /THEN 'bwt_system'/);
assert.match(fkMigration, /quotation_client_project_project_types_fkey/);
assert.match(fkMigration, /REFERENCES public\.quotation_project_types\(id\) ON DELETE RESTRICT/);
assert.match(fkMigration, /pitching_code_prefix\(p_type uuid\)/);
assert.match(fkMigration, /allocate_pitching_code/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /function ProjectTypeSelect/);
assert.doesNotMatch(pitching, /ProjectTypeMultiSelect/);
assert.match(pitching, /projectTypeId/);
assert.match(hook, /code,/);

console.log('quotation project types: ok');
