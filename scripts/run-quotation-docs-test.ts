import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUOTATION_DOC_MAX_SIZE_BYTES,
  QUOTATION_DOC_TYPE_PRESETS,
  QUOTATION_DOC_TYPES_TABLE,
  QUOTATION_DOCS_BUCKET,
  QUOTATION_DOCS_TABLE,
  QUOTATION_LIST_DOC_TYPE_IDS,
  isQuotationListDocType,
  addDaysIso,
  fileExtension,
  formatDocDate,
  formatFileSize,
  isAllowedQuotationDocFile,
  isImageDoc,
  optionalIsoDate,
  quotationDocExpiryStatus,
  quotationDocStoragePath,
  sanitizeFileName,
  validateQuotationDocDates,
} from '../src/lib/quotationDocs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(optionalIsoDate(''), undefined);
assert.equal(optionalIsoDate('2026-08-25T12:00:00Z'), '2026-08-25');
assert.equal(sanitizeFileName('報價單 (final).pdf'), 'final.pdf');
assert.equal(sanitizeFileName('報價單.pdf'), 'file.pdf');
assert.equal(
  sanitizeFileName('202511 BWL Quote - CituU 香港城市大學 住宿生網站及系統 (1).pdf'),
  '202511_BWL_Quote_-_CituU_1.pdf',
);
assert.match(
  quotationDocStoragePath(
    'asana_1211887294565495',
    '202511 BWL Quote - CituU 香港城市大學 住宿生網站及系統 (1).pdf',
    '40721da9-0f59-493c-8197-1adeb530024c',
  ),
  /^[A-Za-z0-9._/-]+$/,
);
assert.equal(fileExtension('contract.DOCX'), 'docx');
assert.equal(formatDocDate('2026-08-25'), '2026/08/25');
assert.equal(formatFileSize(512), '512 B');
assert.equal(formatFileSize(2048), '2.0 KB');
assert.equal(formatFileSize(2 * 1024 * 1024), '2.0 MB');
assert.equal(isImageDoc('image/png', 'a.bin'), true);
assert.equal(isImageDoc(undefined, 'mood.jpg'), true);
assert.equal(isImageDoc('application/pdf', 'quote.pdf'), false);
assert.equal(
  quotationDocStoragePath('proj-1', '報價單 (v2).pdf', 'abc'),
  'proj-1/abc/v2.pdf',
);

assert.equal(isAllowedQuotationDocFile({ name: 'q.pdf', type: 'application/pdf', size: 10 }), null);
assert.match(
  isAllowedQuotationDocFile({ name: 'q.exe', type: 'application/x-msdownload', size: 10 }) ?? '',
  /不支援/,
);
assert.match(
  isAllowedQuotationDocFile({
    name: 'big.pdf',
    type: 'application/pdf',
    size: QUOTATION_DOC_MAX_SIZE_BYTES + 1,
  }) ?? '',
  /不可超過/,
);

assert.equal(validateQuotationDocDates('2026-01-10', '2026-01-09'), '到期日不可早於文件日期');
assert.equal(validateQuotationDocDates('2026-01-10', '2026-01-11'), null);
assert.equal(validateQuotationDocDates(undefined, '2026-01-11'), null);

assert.equal(quotationDocExpiryStatus(undefined, '2026-08-25'), 'none');
assert.equal(quotationDocExpiryStatus('2026-08-24', '2026-08-25'), 'expired');
assert.equal(quotationDocExpiryStatus('2026-09-10', '2026-08-25'), 'expiring');
assert.equal(quotationDocExpiryStatus(addDaysIso('2026-08-25', 45), '2026-08-25'), 'valid');

assert.deepEqual([...QUOTATION_DOC_TYPE_PRESETS], ['報價單', '項目合約', '參考圖片']);
assert.equal(QUOTATION_DOCS_TABLE, 'quotation_docs');
assert.equal(QUOTATION_DOC_TYPES_TABLE, 'quotation_doc_types');
assert.equal(QUOTATION_DOCS_BUCKET, 'quotation-docs');
assert.deepEqual([...QUOTATION_LIST_DOC_TYPE_IDS], [
  '577a9f77-008d-45b2-90da-40c467fdc3d5',
  'd2b6c029-5850-43b5-80fd-5855b5c80699',
]);
assert.equal(isQuotationListDocType('577a9f77-008d-45b2-90da-40c467fdc3d5'), true);
assert.equal(isQuotationListDocType('d2b6c029-5850-43b5-80fd-5855b5c80699'), true);
assert.equal(isQuotationListDocType('other'), false);

const migration = read('supabase/migrations/20260825140000_create_quotation_docs.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.quotation_docs/);
assert.match(migration, /quotation_client_project_id text NOT NULL/);
assert.match(migration, /REFERENCES public\.quotation_client_project\(id\) ON DELETE CASCADE/);
assert.match(migration, /doc_type text NOT NULL/);
assert.match(migration, /file_name text NOT NULL/);
assert.match(migration, /file_url text NOT NULL/);
assert.match(migration, /document_date date/);
assert.match(migration, /expiry_date date/);
assert.match(migration, /INSERT INTO storage\.buckets/);
assert.match(migration, /'quotation-docs'/);

const hook = read('src/hooks/useQuotationDocs.ts');
assert.match(hook, /QUOTATION_DOCS_TABLE/);
assert.match(hook, /QUOTATION_DOCS_BUCKET/);
assert.match(hook, /quotation_client_project_id/);
assert.match(hook, /const addDoc/);
assert.match(hook, /const updateDoc/);
assert.match(hook, /const deleteDoc/);
assert.match(hook, /uploadQuotationDocFile/);
assert.match(hook, /docTypeId/);
assert.match(hook, /quotation_doc_types/);
assert.match(hook, /請選擇文件類型/);
assert.match(hook, /useQuotationDocsList/);
assert.match(hook, /\.in\('doc_type'/);
assert.match(hook, /QUOTATION_LIST_DOC_TYPE_IDS/);

const typeMigration = read('supabase/migrations/20260907082750_create_quotation_doc_types.sql');
assert.match(typeMigration, /CREATE TABLE IF NOT EXISTS public\.quotation_doc_types/);
assert.match(typeMigration, /display text NOT NULL UNIQUE/);
assert.match(typeMigration, /is_active boolean NOT NULL DEFAULT true/);
assert.match(typeMigration, /REFERENCES public\.quotation_doc_types\(id\) ON DELETE RESTRICT/);
assert.match(typeMigration, /報價單/);
assert.match(typeMigration, /項目合約/);
assert.match(typeMigration, /參考圖片/);

const tab = read('src/components/quotation/PitchingDocsTab.tsx');
assert.match(tab, /項目文件/);
assert.match(tab, /useQuotationDocs/);
assert.match(tab, /useQuotationDocTypes/);
assert.match(tab, /addDoc/);
assert.match(tab, /updateDoc/);
assert.match(tab, /deleteDoc/);
assert.match(tab, /DeleteConfirmModal/);
assert.match(tab, /aria-label="篩選文件類型"/);
assert.match(tab, /請選擇文件類型/);
assert.doesNotMatch(tab, /QUOTATION_DOC_TYPE_PRESETS/);
assert.doesNotMatch(tab, /自行輸入/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingDocsTab/);
assert.match(pitching, /id: 'docs', label: '項目文件'/);
assert.match(pitching, /<PitchingDocsTab projectId=\{record\.id\} \/>/);
assert.doesNotMatch(pitching, /關聯報價單/);
assert.doesNotMatch(pitching, /生成報價單/);
assert.doesNotMatch(pitching, /onConvertToQuote/);

const project = read('src/components/quotation/ProjectModule.tsx');
assert.match(project, /PitchingDetail/);
assert.doesNotMatch(project, /onConvertToQuote/);
assert.doesNotMatch(project, /navigateTo\('quotation', 'new'\)/);

const list = read('src/components/quotation/QuotationDocsList.tsx');
assert.match(list, /useQuotationDocsList/);
assert.match(list, /報價單列表/);
assert.match(list, /項目文件/);

const moduleSrc = read('src/components/quotation/QuotationModule.tsx');
assert.match(moduleSrc, /QuotationDocsList/);
assert.doesNotMatch(moduleSrc, /subModule === 'items'/);
assert.doesNotMatch(moduleSrc, /subModule === 'new'/);

console.log('quotation docs: ok');
