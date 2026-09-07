/** Shared rules for treating staffs.private_phone as the Auth password. */

export function normalizePhonePassword(raw: string | null | undefined): string | null {
  let value = (raw || '').trim().replace(/[\s\-().]/g, '');
  if (value.startsWith('+')) value = value.slice(1);

  if (value.startsWith('852') && value.length > 8) {
    value = value.slice(3);
  } else if (value.startsWith('86') && value.length > 10) {
    value = value.slice(2);
  }

  if (value.length < 6) return null;
  return value;
}
