const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const res = await fetch(`${url}/functions/v1/provision-staff-auth`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ mode: 'all' }),
});

const text = await res.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text };
}

console.log('status', res.status);
if (parsed.results) {
  const summary = parsed.results.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    if (row.reason) acc[row.reason] = (acc[row.reason] || 0) + 1;
    return acc;
  }, {});
  console.log('summary', summary);
} else {
  console.log(parsed.error || parsed);
}
