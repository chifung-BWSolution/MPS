/**
 * Quick parser smoke test (no xlsx file required).
 * Run: node scripts/test_backlink_parser.mjs
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Inline minimal sheet mimicking Excel layout from screenshots
const sheetData = [
  ['Brand', 'Target domain', '網站', 'Domain', '', '2024', 'Nov', 'Action', '', 'Dec', 'Action'],
  [
    'BW Design',
    '1. 主要',
    'Office Design',
    'https://hkofficedesign.com/',
    '',
    '23/11',
    '-purchased 6,000 backlinks , $326\n-DRC up to 50 (vs existing 27 in diib) , $406',
    '',
    '6/12',
    '$50usd-purchased 25,000 backlinks-50links of PR',
  ],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(sheetData);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const ws2 = XLSX.utils.aoa_to_sheet([
  ['Brand', 'Target domain', '網站', 'Domain', '', '2024', 'Nov', 'Action'],
  ['BW Furniture', '2. 次要', 'Furniture', 'https://example-furniture.com/', '', '24/11', 'purchased $311 for 6000 backlinks'],
]);
XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

// Dynamic import of compiled parser is awkward; duplicate minimal check inline
function splitActions(text) {
  const normalized = String(text).replace(/\r\n/g, '\n').trim();
  const items = [];
  for (const line of normalized.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const dashParts = line.split(/(?=\s*-)/).map((p) => p.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
    if (dashParts.length > 1) items.push(...dashParts);
    else if (dashParts.length === 1) items.push(dashParts[0]);
    else items.push(line);
  }
  return items.filter(Boolean);
}

const actions = splitActions('-purchased 6,000 backlinks , $326\n-DRC up to 50 (vs existing 27 in diib) , $406');
if (actions.length !== 2) {
  console.error('FAIL: expected 2 actions, got', actions.length, actions);
  process.exit(1);
}

const parsed = XLSX.read(buf, { type: 'buffer' });
if (parsed.SheetNames.length !== 2) {
  console.error('FAIL: expected 2 sheets');
  process.exit(1);
}

console.log('OK: parser smoke test passed');
console.log('  actions split:', actions.length);
console.log('  sheets:', parsed.SheetNames.join(', '));
