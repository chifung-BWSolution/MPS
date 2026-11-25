/**
 * 社媒自動化營運 · 權限（PRD §11）
 *
 * 前端只做「隱藏／禁用」，真正的判定一律在 Edge Function 入口重算。
 * 既有 8 角色的行為不變：這裡只是多一組「內容自動化」專用判斷。
 */

import type { ContentAction, ContentPermissionUser } from './contentTypes.ts';

/** 管理層等價角色（AuthContext 已把 admin 家族映射成 management，這裡保留 system_dev） */
const MANAGEMENT_ROLES = new Set(['management', 'system_dev', 'super_admin', 'administrator']);

/** 可生成／編輯／送審 */
const WRITER_ROLES = new Set([
  ...MANAGEMENT_ROLES,
  'copywriter',
  'marketing',
  'project_manager',
  'chief_editor',
]);

/** 可批准／駁回／Confirm／排程 */
const APPROVER_ROLES = new Set([...MANAGEMENT_ROLES, 'chief_editor']);

/** 可接入站點／管理憑證／全域設定 */
const SITE_MANAGER_ROLES = new Set([...MANAGEMENT_ROLES]);

function normalizeRole(role: string | null | undefined): string {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, '_');
}

/**
 * `users.role_tag` → 內部角色，供 Edge Function 使用。
 *
 * 與 `AuthContext.mapRoleToInternal` 規則一致（該檔為前端 enrichment），
 * 但額外支援 `chief_editor`：總編輯必須先於「admin／管理」判斷，
 * 否則 role_tag 寫成「Chief Editor (Administrator)」時會被誤判為 management。
 */
export function resolveInternalRole(
  roleTag: string | null | undefined,
  classification?: string | null,
): string {
  if (!roleTag && !classification) return 'staff';
  const raw = String(roleTag || classification || '')
    .toLowerCase()
    .trim();

  if (
    raw === 'chief_editor' ||
    raw.includes('chief editor') ||
    raw.includes('editor-in-chief') ||
    raw.includes('editor in chief') ||
    raw.includes('總編輯') ||
    raw.includes('总编辑')
  ) {
    return 'chief_editor';
  }
  if (raw === 'system_dev' || raw.includes('系統開發') || raw.includes('系统开发')) {
    return 'system_dev';
  }
  if (raw.includes('admin') || raw.includes('管理') || raw === 'super admin' || raw === 'management') {
    return 'management';
  }
  if (raw.includes('pm') || raw.includes('project manager') || raw.includes('項目經理') || raw.includes('项目经理')) {
    return 'project_manager';
  }
  if (raw.includes('design') || raw.includes('設計') || raw.includes('设计')) {
    return 'designer';
  }
  if (raw.includes('account') || raw.includes('會計') || raw.includes('会计') || raw.includes('finance')) {
    return 'accountant';
  }
  if (raw.includes('copy') || raw.includes('文案') || raw.includes('writer')) {
    return 'copywriter';
  }
  if (raw.includes('video') || raw.includes('影片') || raw.includes('editor')) {
    return 'video_editor';
  }
  if (raw.includes('market') || raw.includes('營銷') || raw.includes('营销') || raw.includes('推廣') || raw.includes('推广')) {
    return 'marketing';
  }
  if (raw.includes('系統使用者') || raw.includes('系统使用者') || raw.includes('system') || raw.includes('staff') || raw.includes('在職') || raw.includes('在职')) {
    return 'staff';
  }
  return 'staff';
}


export function canView(user: ContentPermissionUser | null | undefined): boolean {
  return Boolean(normalizeRole(user?.role));
}

export function canWrite(user: ContentPermissionUser | null | undefined): boolean {
  return WRITER_ROLES.has(normalizeRole(user?.role));
}

export function canApprove(user: ContentPermissionUser | null | undefined): boolean {
  return APPROVER_ROLES.has(normalizeRole(user?.role));
}

export function canManageSites(user: ContentPermissionUser | null | undefined): boolean {
  return SITE_MANAGER_ROLES.has(normalizeRole(user?.role));
}

export function canManageSettings(user: ContentPermissionUser | null | undefined): boolean {
  return SITE_MANAGER_ROLES.has(normalizeRole(user?.role));
}

export function canPublish(user: ContentPermissionUser | null | undefined): boolean {
  return APPROVER_ROLES.has(normalizeRole(user?.role));
}

/** 單一入口：UI 請一律走這支，不要散落 role 判斷 */
export function can(
  user: ContentPermissionUser | null | undefined,
  action: ContentAction,
): boolean {
  switch (action) {
    case 'view':
      return canView(user);
    case 'write':
      return canWrite(user);
    case 'approve':
      return canApprove(user);
    case 'manage_sites':
      return canManageSites(user);
    case 'manage_settings':
      return canManageSettings(user);
    case 'publish':
      return canPublish(user);
    default:
      return false;
  }
}

export function describeRole(role: string | null | undefined): string {
  switch (normalizeRole(role)) {
    case 'chief_editor':
      return '總編輯';
    case 'management':
      return '管理層';
    case 'copywriter':
      return '文案';
    case 'marketing':
      return '市場推廣';
    case 'project_manager':
      return '專案經理';
    case 'designer':
      return '設計師';
    case 'accountant':
      return '會計';
    case 'video_editor':
      return '影片剪輯';
    default:
      return '員工';
  }
}
