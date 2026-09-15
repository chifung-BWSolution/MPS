import type { WebsiteFormData } from '../components/website/WebsiteFormModal';
import type { ProfileType, WebsiteProfileFull } from '../types/app';
import { resolveProjectTypeCode } from './quotationProjectTypes';
import type { SearchableSelectOption } from '../components/ui/searchable-select';

export const UNLINKED_WEBSITE_OPTION: SearchableSelectOption = {
  value: '',
  label: '尚未連結',
};

function projectTypeRefs(value: string | readonly string[] | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const single = String(value).trim();
  return single ? [single] : [];
}

export function clientWebsiteProfileType(projectTypes: string | readonly string[] | null | undefined): ProfileType {
  const refs = projectTypeRefs(projectTypes).map((ref) => resolveProjectTypeCode(ref) || ref);
  const hasSystem = refs.includes('bwt_system');
  const hasWeb = refs.includes('bwt_web');
  if (hasSystem && !hasWeb) return 'system';
  return 'website';
}

export function clientWebsiteNameStem(input: {
  companyNameZh?: string;
  companyNameEn?: string;
  clientName?: string;
  displayName?: string;
}): string {
  return (
    input.companyNameZh?.trim() ||
    input.companyNameEn?.trim() ||
    input.clientName?.trim() ||
    input.displayName?.trim() ||
    ''
  );
}

export function clientWebsiteNameForType(stem: string, profileType: ProfileType): string {
  if (!stem) return '';
  return `${stem}${profileType === 'system' ? '系統' : '網站'}`;
}

export function suggestedClientWebsiteFormDefaults(input: {
  companyNameZh?: string;
  companyNameEn?: string;
  clientName?: string;
  displayName?: string;
  projectTypes: string | readonly string[] | null | undefined;
}): WebsiteFormData {
  const profileType = clientWebsiteProfileType(input.projectTypes);
  const stem = clientWebsiteNameStem(input);
  return {
    websiteName: clientWebsiteNameForType(stem, profileType),
    domainUrl: '',
    companyId: '',
    brandId: '',
    brand: '',
    platform: '',
    hostingProvider: '',
    level: 3,
    status: 'development',
    notes: '',
    profileType,
    projectCategory: 'client',
    systemType: profileType === 'system' ? 'client_system' : undefined,
    quotationClientProjectId: '',
  };
}

export function clientWebsiteSelectLabel(profile: Pick<WebsiteProfileFull, 'websiteName' | 'domainUrl'>): string {
  const name = profile.websiteName.trim() || '未命名';
  const domain = profile.domainUrl?.trim();
  return domain ? `${name} (${domain})` : name;
}

export function toClientWebsiteSelectOptions(
  profiles: WebsiteProfileFull[],
  selectedId?: string,
): SearchableSelectOption[] {
  const clientProfiles = profiles.filter((profile) => {
    if (profile.projectCategory === 'client') return true;
    return Boolean(selectedId && profile.id === selectedId);
  });
  return [
    UNLINKED_WEBSITE_OPTION,
    ...clientProfiles.map((profile) => ({
      value: profile.id,
      label: clientWebsiteSelectLabel(profile),
      keywords: [profile.websiteName, profile.domainUrl].filter(Boolean).join(' '),
    })),
  ];
}
