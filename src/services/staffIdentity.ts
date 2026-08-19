const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Leftover placeholder staffs.id values created for the UUID FK migration.
 * Map them to the canonical Bubble staff row so submit / team-view share one identity.
 */
const STALE_MANUAL_STAFF_UUIDS: Record<string, string> = {
  // Lowell Lo (manual) → Lowell Lo (Bubble / BWT OB System)
  'd88d2465-42d1-4205-8a9b-8495083c3691': '04102dd8-8d0f-4536-82cd-904cc0769227',
};

/** True when value is a UUID (staffs.id / FK shape). */
export function isStaffUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value.trim());
}

/** True for leftover `manual_*` / "(manual)" staff rows that must not own live reports. */
export function isPlaceholderStaff(row: {
  bubble_staff_id?: string | null;
  display_name?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  const bubble = (row.bubble_staff_id || '').trim().toLowerCase();
  const name = (row.display_name || '').trim().toLowerCase();
  return bubble.startsWith('manual_') || name.includes('(manual)');
}

/** Rewrite a known leftover manual staff UUID to the canonical staffs.id. */
export function remapStaleStaffUuid(value: string | null | undefined): string {
  const raw = (value || '').trim();
  return STALE_MANUAL_STAFF_UUIDS[raw] || raw;
}

/**
 * Pick one staffs.id from already-fetched candidates.
 * Login whitelist (`users.staff_id`) wins. `staffs.work_email` is last-resort only
 * and only when the match is unique — email-first is what hid Elena/Jane reports.
 */
export function chooseStaffUuid(options: {
  loginStaffId?: string | null;
  sessionStaffId?: string | null;
  uniqueEmailStaffId?: string | null;
  bubbleStaffId?: string | null;
}): string | null {
  const login = remapStaleStaffUuid(options.loginStaffId);
  if (isStaffUuid(login)) return login;

  const session = remapStaleStaffUuid(options.sessionStaffId);
  if (isStaffUuid(session)) return session;

  const email = remapStaleStaffUuid(options.uniqueEmailStaffId);
  if (isStaffUuid(email)) return email;

  const bubble = remapStaleStaffUuid(options.bubbleStaffId);
  if (isStaffUuid(bubble)) return bubble;

  return null;
}

export function localDateString(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
