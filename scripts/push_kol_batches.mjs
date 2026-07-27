/**
 * Push scripts/_kol_batches/batch_XX.json to Supabase REST (anon insert).
 * Usage: node scripts/push_kol_batches.mjs
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY (or pass as args)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '_kol_batches');

const url = process.env.SUPABASE_URL || process.argv[2];
const key = process.env.SUPABASE_ANON_KEY || process.argv[3];

if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => /^batch_\d+\.json$/.test(f))
  .sort();

let inserted = 0;
let failed = 0;

for (const file of files) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  let batchOk = 0;
  let batchSkip = 0;
  for (const row of rows) {
    const res = await fetch(`${url}/rest/v1/kol_profile`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (res.ok) {
      inserted++;
      batchOk++;
    } else {
      const t = await res.text();
      if (t.includes('23505') || t.includes('duplicate') || t.includes('unique')) {
        batchSkip++;
      } else {
        failed++;
        console.error('  row fail', row.name, t.slice(0, 200));
      }
    }
  }
  console.log(`OK ${file}: inserted=${batchOk} skipped_dup=${batchSkip}`);
}

console.log(JSON.stringify({ inserted, failed, files: files.length }));
