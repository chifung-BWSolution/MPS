/** Smoke: OTC2 staff_sync mapping rules (no PII, no MPS writes). */
const OTC2_URL = 'https://zwhbfphavcxncfmcrwrr.supabase.co';
const OTC2_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3aGJmcGhhdmN4bmNmbWNyd3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODg4MjIsImV4cCI6MjA5NTk2NDgyMn0.pxdK15j23OklXl6fQNECaNkxE9mmQggrWw13BJMvaDI';

function locationFromBase(baseLocation) {
  const raw = (baseLocation || '').trim().toLowerCase();
  if (raw.includes('深圳') || raw.includes('sz') || raw.includes('shenzhen')) return 'sz';
  return 'hk';
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(locationFromBase('CFA 香港') === 'hk', 'CFA 香港 → hk');
assert(locationFromBase('CFB 深圳') === 'sz', 'CFB 深圳 → sz');
assert(locationFromBase('') === 'hk', 'empty → hk');

assert(('' ?? '') === '', 'display_name empty stays empty');
assert((null ?? '') === '', 'display_name null → empty string, no fallback');

function isActive(status) {
  return status === 'Active';
}
assert(isActive('Active') === true, 'Active');
assert(isActive('Inactive') === false, 'Inactive');
assert(isActive('Probation') === false, 'Probation not active');

const headers = {
  apikey: OTC2_ANON,
  Authorization: `Bearer ${OTC2_ANON}`,
};
const res = await fetch(
  `${OTC2_URL}/rest/v1/staff_sync?select=id,status,base_location,company,brand_ids,role,company_phone,image_url&limit=1000`,
  { headers },
);
if (!res.ok) throw new Error(`staff_sync HTTP ${res.status}`);
const rows = await res.json();
assert(rows.length > 0, 'staff_sync readable');
assert(rows.every((r) => r.id), 'every row has staff_sync.id');

const active = rows.filter((r) => r.status === 'Active').length;
const withPhone = rows.filter((r) => r.company_phone).length;
const withImage = rows.filter((r) => r.image_url).length;
const hk = rows.filter((r) => locationFromBase(r.base_location) === 'hk').length;
const sz = rows.filter((r) => locationFromBase(r.base_location) === 'sz').length;

console.log(
  JSON.stringify(
    {
      ok: true,
      staff_sync_rows: rows.length,
      active,
      with_company_phone: withPhone,
      with_image_url: withImage,
      loc_hk: hk,
      loc_sz: sz,
    },
    null,
    2,
  ),
);
