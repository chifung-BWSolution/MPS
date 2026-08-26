/**
 * Permission helpers.
 *
 * Current policy: everything is open to every authenticated user EXCEPT
 * the "系統設定" (System Settings) module, which is restricted to roles
 * mapped to 管理層 / management or above.
 *
 * Role enrichment from users.role_tag happens in
 * AuthContext (see mapRoleToInternal), so by the time we read
 * systemUser.role here it already reflects the staff directory tag.
 */

const SETTINGS_ROLES = new Set([
  'management',
  'super_admin',
  'administrator',
  'admin',
  'company_admin',
  'system_dev',
]);

export function canAccessSettings(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s-]/g, '_');
  return SETTINGS_ROLES.has(normalized);
}
