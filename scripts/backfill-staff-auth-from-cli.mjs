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
const service = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
if (!service?.api_key) {
  console.error('service_role key not found');
  process.exit(1);
}

const url = 'https://kwcevjcmdjadhrygjyfp.supabase.co';
const res = await fetch(`${url}/functions/v1/provision-staff-auth`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${service.api_key}`,
    apikey: service.api_key,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ mode: 'all' }),
});
const parsed = await res.json().catch(() => ({}));
console.log('status', res.status);
if (Array.isArray(parsed.results)) {
  const summary = {};
  for (const row of parsed.results) {
    summary[row.action] = (summary[row.action] || 0) + 1;
    if (row.reason) summary[row.reason] = (summary[row.reason] || 0) + 1;
  }
  console.log('count', parsed.results.length, 'summary', summary);
} else {
  console.log(parsed.error || parsed);
}
