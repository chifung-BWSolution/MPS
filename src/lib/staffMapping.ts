/** Map OTC2 staff_sync / staffs.base_location to a location code. Do not persist as office. */
export function locationFromBase(baseLocation: string | null | undefined): 'hk' | 'sz' {
  const raw = (baseLocation || '').trim().toLowerCase();
  if (raw.includes('深圳') || raw.includes('sz') || raw.includes('shenzhen')) return 'sz';
  return 'hk';
}
