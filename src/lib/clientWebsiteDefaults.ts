import type { WebsiteFormData } from '../components/website/WebsiteFormModal';
import type { PitchingProjectType } from '../data/pitchingData';
import type { ProfileType, WebsiteProfileFull } from '../types/app';
import type { SearchableSelectOption } from '../components/ui/searchable-select';

export const UNLINKED_WEBSITE_OPTION: SearchableSelectOption = {
  value: '',
  label: '尚未連結',
};

export function clientWebsiteProfileType(projectTypes: PitchingProjectType[]): ProfileType {
  const hasSystem = projectTypes.includes('bwt_system');
  const hasWeb = projectTypes.includes('bwt_web');
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
  projectTypes: PitchingProjectType[];
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
