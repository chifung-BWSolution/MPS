/**
 * Verify brand_list display_name can be written with the anon key
 * (same role the settings page uses during dev-bypass login).
 */
const url = process.env.MPS_URL || 'https://kwcevjcmdjadhrygjyfp.supabase.co';
const anon = process.env.MPS_ANON_KEY;
if (!anon) {
  console.error('MPS_ANON_KEY is required');
  process.exit(1);
}

const expected = {
  BSC: 'Attitude Beauty',
  BWG: 'BW Gift',
  CF: '志豐集團',
  CFA: '志豐香港',
  CFB: '志豐深圳',
  FCC: 'Food Channels Catering',
  OB: 'Online Business',
};

const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers, ...init });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const listed = await rest('brand_list?select=brand_code,display_name&order=brand_code.asc');
if (listed.status !== 200 || !Array.isArray(listed.body)) {
  console.error('LIST failed', listed);
  process.exit(1);
}

const missing = Object.entries(expected).filter(([code, name]) => {
  const row = listed.body.find((r) => r.brand_code === code);
  return !row || row.display_name !== name;
});
if (missing.length) {
  console.error('Backfill mismatch', missing, listed.body);
  process.exit(1);
}

const probe = listed.body.find((r) => r.brand_code === 'BWA');
if (!probe) {
  console.error('BWA row missing');
  process.exit(1);
}

const original = probe.display_name;
const patched = await rest(`brand_list?brand_code=eq.BWA&select=brand_code,display_name`, {
  method: 'PATCH',
  body: JSON.stringify({ display_name: 'BWA Display Probe' }),
});
if (patched.status !== 200 || !Array.isArray(patched.body) || patched.body.length !== 1) {
  console.error('Anon UPDATE still silent/blocked', patched);
  process.exit(1);
}
if (patched.body[0].display_name !== 'BWA Display Probe') {
  console.error('Anon UPDATE did not persist', patched.body);
  process.exit(1);
}

const restored = await rest(`brand_list?brand_code=eq.BWA&select=brand_code,display_name`, {
  method: 'PATCH',
  body: JSON.stringify({ display_name: original }),
});
if (restored.status !== 200 || restored.body?.[0]?.display_name !== original) {
  console.error('Failed to restore BWA', restored);
  process.exit(1);
}

console.log('brand_list anon write + display_name backfill OK');
console.log(listed.body.map((r) => `${r.brand_code}=${r.display_name}`).join('\n'));
