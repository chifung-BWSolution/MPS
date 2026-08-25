import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUOTATION_DOC_MAX_SIZE_BYTES,
  QUOTATION_DOC_TYPE_PRESETS,
  QUOTATION_DOCS_BUCKET,
  QUOTATION_DOCS_TABLE,
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
assert.equal(sanitizeFileName('報價單 (final).pdf'), '報價單_final_.pdf');
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
  'proj-1/abc/報價單_v2_.pdf',
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
assert.equal(QUOTATION_DOCS_BUCKET, 'quotation-docs');

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

const tab = read('src/components/quotation/PitchingDocsTab.tsx');
assert.match(tab, /項目文件/);
assert.match(tab, /useQuotationDocs/);
assert.match(tab, /addDoc/);
assert.match(tab, /updateDoc/);
assert.match(tab, /deleteDoc/);
assert.match(tab, /DeleteConfirmModal/);
assert.match(tab, /aria-label="篩選文件類型"/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingDocsTab/);
assert.match(pitching, /id: 'docs', label: '項目文件'/);
assert.match(pitching, /<PitchingDocsTab projectId=\{record\.id\} \/>/);

const project = read('src/components/quotation/ProjectModule.tsx');
assert.match(project, /PitchingDetail/);

console.log('quotation docs: ok');
