import {
  videoLoginMethodLabel,
  videoTwoFaLabel,
  type VideoLoginMethod,
} from '../types/videoLoginMethod';

export type LoginMethodStatusFilter = 'all' | 'active' | 'inactive';

export function loginMethodListMetrics(items: VideoLoginMethod[]) {
  return {
    total: items.length,
    active: items.filter(item => item.isActive).length,
    twoFa: items.filter(item => item.twoFaMethods.some(method => method !== 'na')).length,
  };
}

export function filterVideoLoginMethods(
  items: VideoLoginMethod[],
  {
    search = '',
    methodFilter = 'all',
    statusFilter = 'all',
  }: {
    search?: string;
    methodFilter?: string;
    statusFilter?: LoginMethodStatusFilter | string;
  } = {},
): VideoLoginMethod[] {
  const q = search.trim().toLowerCase();
  return items.filter(item => {
    if (methodFilter !== 'all' && item.loginMethod !== methodFilter) return false;
    if (statusFilter === 'active' && !item.isActive) return false;
    if (statusFilter === 'inactive' && item.isActive) return false;
    if (!q) return true;
    return [
      item.displayName,
      videoLoginMethodLabel(item.loginMethod),
      item.accountName,
      item.phoneNumber,
      item.email,
      item.note,
      item.twoFaMethods.map(videoTwoFaLabel).join(' '),
    ]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}
