/**
 * Fetch existing keys from REST, insert any missing batch rows.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '_kol_batches');
const url = (process.argv[2] || '').replace(/\/$/, '');
const key = process.argv[3] || '';

if (!url || !key) {
  console.error('Usage: node scripts/sync_missing_kol.mjs <URL> <KEY>');
  process.exit(1);
}

async function fetchAllKeys() {
  const phones = new Set();
  const emails = new Set();
  let from = 0;
  const page = 1000;
  while (true) {
    const res = await fetch(
      `${url}/rest/v1/kol_profile?select=phone,email&offset=${from}&limit=${page}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'count=exact',
        },
      }
    );
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      if (r.phone) phones.add(String(r.phone).toLowerCase());
      if (r.email) emails.add(String(r.email).toLowerCase());
    }
    if (rows.length < page) break;
    from += page;
  }
  return { phones, emails };
}

let all = [];
for (const f of fs.readdirSync(dir).filter((x) => /^batch_\d+\.json$/.test(x)).sort()) {
  all = all.concat(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

const { phones, emails } = await fetchAllKeys();
console.log('db keys', phones.size, emails.size, 'expected', all.length);

const missing = all.filter((r) => {
  const p = (r.phone || '').toLowerCase();
  const e = (r.email || '').toLowerCase();
  if (p && phones.has(p)) return false;
  if (e && emails.has(e)) return false;
  return true;
});

console.log('missing', missing.length);
fs.writeFileSync(path.join(dir, 'missing.json'), JSON.stringify(missing));

let inserted = 0;
for (const row of missing) {
  const res = await fetch(`${url}/rest/v1/kol_profile`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(row),
  });
  if (res.ok) {
    inserted++;
    process.stdout.write('+');
  } else {
    const t = await res.text();
    console.error('\n', row.name, res.status, t.slice(0, 200));
  }
}
console.log('\ninserted', inserted);

const countRes = await fetch(`${url}/rest/v1/kol_profile?select=id&limit=1`, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: 'count=exact',
    Range: '0-0',
  },
});
console.log('content-range', countRes.headers.get('content-range'));
