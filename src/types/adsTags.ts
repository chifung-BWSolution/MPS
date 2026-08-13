export type AdsPlatform = 'google' | 'facebook';

export type AdsTag = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AdsCampaignTagAssignment = {
  tagId: string;
  platform: AdsPlatform;
  campaignRowId: string;
};

export const ADS_TAG_COLOR_OPTIONS = [
  { id: 'teal', label: '青綠', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'blue', label: '藍', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'indigo', label: '靛', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'violet', label: '紫', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'rose', label: '玫紅', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'amber', label: '琥珀', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'orange', label: '橙', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'slate', label: '灰', className: 'bg-slate-100 text-slate-700 border-slate-200' },
] as const;

export type AdsTagColorId = (typeof ADS_TAG_COLOR_OPTIONS)[number]['id'];

export function adsTagColorClass(color: string | null | undefined): string {
  const found = ADS_TAG_COLOR_OPTIONS.find((c) => c.id === color);
  return found?.className ?? 'bg-slate-100 text-slate-700 border-slate-200';
}
