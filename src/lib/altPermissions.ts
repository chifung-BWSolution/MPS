/**
 * ALT Pilot · 管理權限
 *
 * 刪除歷史紀錄是高風險操作，只允許管理層／系統開發。
 * Edge Function 與前端共用同一份角色清單，避免只靠 UI 隱藏。
 */

const ALT_MANAGER_ROLES = new Set([
  'management',
  'super_admin',
  'administrator',
  'admin',
  'company_admin',
  'system_dev',
]);

export function canManageAltPilot(role: string | null | undefined): boolean {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, '_');
  return ALT_MANAGER_ROLES.has(normalized);
}
