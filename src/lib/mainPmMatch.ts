export type MainPmStaffCandidate = {
  id: string;
  display_name: string | null;
  work_email: string | null;
  status: string | null;
  created_at: string | null;
};

export function normalizeWorkEmail(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

export function isActiveStaff(status: string | null | undefined): boolean {
  return (status || '').trim().toLowerCase() === 'active';
}

function latestCreatedActive(
  staffs: MainPmStaffCandidate[],
  predicate: (staff: MainPmStaffCandidate) => boolean,
): MainPmStaffCandidate | null {
  const matches = staffs
    .filter((staff) => isActiveStaff(staff.status) && predicate(staff))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return matches[0] ?? null;
}

export function assignedNameMatchesDisplayName(
  assignedName: string | null | undefined,
  displayName: string | null | undefined,
): boolean {
  const assigned = (assignedName || '').trim().toLowerCase();
  const display = (displayName || '').trim().toLowerCase();
  if (!assigned || !display) return false;
  if (assigned === display) return true;
  if (assigned.startsWith(`${display} -`) || assigned.startsWith(`${display} –`) || assigned.startsWith(`${display} —`)) {
    return true;
  }
  // Asana first name only, e.g. "Franco" → "Franco Lee"
  return display.startsWith(`${assigned} `);
}

/** Prefer Asana work-email match, then assigned_pm_name ↔ staffs.display_name. */
export function resolveMainPmId(
  staffs: MainPmStaffCandidate[],
  input: { email?: string | null; name?: string | null },
): string | null {
  const email = normalizeWorkEmail(input.email);
  if (email) {
    const byEmail = latestCreatedActive(
      staffs,
      (staff) => normalizeWorkEmail(staff.work_email) === email,
    );
    if (byEmail) return byEmail.id;
  }

  const name = (input.name || '').trim();
  if (!name) return null;
  const byName = latestCreatedActive(staffs, (staff) =>
    assignedNameMatchesDisplayName(name, staff.display_name),
  );
  return byName?.id ?? null;
}
