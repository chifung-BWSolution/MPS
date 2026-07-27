/**
 * Robust REST push — continues until all batch JSON files are posted.
 * Usage:
 *   node scripts/push_kol_rest.mjs <SUPABASE_URL> <ANON_KEY>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '_kol_batches');
const url = (process.env.SUPABASE_URL || process.argv[2] || '').replace(/\/$/, '');
const key = process.env.SUPABASE_ANON_KEY || process.argv[3] || '';

if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => /^batch_\d+\.json$/.test(f))
  .sort();

async function postRows(rows) {
  const res = await fetch(`${url}/rest/v1/kol_profile`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text();
  return { ok: false, status: res.status, text };
}

let okBatches = 0;
let failBatches = 0;
let rowOk = 0;
let rowFail = 0;

for (const file of files) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  // Post in slices of 20 for reliability
  for (let i = 0; i < rows.length; i += 20) {
    const slice = rows.slice(i, i + 20);
    const result = await postRows(slice);
    if (result.ok) {
      okBatches++;
      rowOk += slice.length;
      process.stdout.write('.');
    } else {
      // row by row
      for (const row of slice) {
        const r2 = await postRows(row);
        if (r2.ok) {
          rowOk++;
          process.stdout.write('+');
        } else {
          rowFail++;
          const t = r2.text || '';
          if (!/duplicate|unique|23505/i.test(t)) {
            console.error(`\nFAIL ${file} ${row.name}: ${r2.status} ${t.slice(0, 180)}`);
            failBatches++;
          } else {
            process.stdout.write('d');
          }
        }
      }
    }
  }
}

console.log('\n' + JSON.stringify({ rowOk, rowFail, okBatches, failBatches, files: files.length }));
