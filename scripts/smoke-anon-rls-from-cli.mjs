const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf8');
const start = raw.indexOf('[');
const end = raw.lastIndexOf(']');
if (start < 0 || end < 0) {
  console.error('No JSON array in CLI output');
  process.exit(1);
}
const keys = JSON.parse(raw.slice(start, end + 1));
const anon = keys.find((k) => k.id === 'anon' || k.name === 'anon');
if (!anon?.api_key) {
  console.error('anon key not found');
  process.exit(1);
}

const url = 'https://kwcevjcmdjadhrygjyfp.supabase.co';
const headers = {
  apikey: anon.api_key,
  Authorization: `Bearer ${anon.api_key}`,
};

async function probe(name, path, init = {}) {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  const denied = res.status === 401 || res.status === 403;
  return { name, status: res.status, denied, snippet: text.slice(0, 80) };
}

const results = [];
for (const [name, path] of [
  ['users', '/rest/v1/users?select=id&limit=1'],
  ['staffs', '/rest/v1/staffs?select=id&limit=1'],
  ['day_reports', '/rest/v1/day_reports?select=id&limit=1'],
]) {
  results.push(await probe(name, path));
}

results.push(
  await probe(
    'get_volunteer_campaign_public',
    '/rest/v1/rpc/get_volunteer_campaign_public',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: '__smoke_missing__' }),
    },
  ),
);

const failed = results.filter((row) => {
  if (row.name === 'get_volunteer_campaign_public') return row.denied;
  return !row.denied;
});

for (const row of results) {
  console.log(`${row.name} ${row.status} ${row.denied ? 'blocked' : 'allowed'}`);
}
if (failed.length) {
  console.error('smoke failed', failed.map((row) => row.name).join(', '));
  process.exit(1);
}
console.log('anon RLS REST smoke: ok');
