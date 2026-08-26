import { useMemo, useState } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  WebsiteFormModal,
  websiteFormDataToProfile,
  type WebsiteFormData,
} from '@/components/website/WebsiteFormModal';
import { useApp } from '@/context/AppContext';
import { useBrands } from '@/hooks/useBrands';
import { useCompanies } from '@/hooks/useCompanies';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import type { PitchingProjectType } from '@/data/pitchingData';
import {
  clientWebsiteNameForType,
  clientWebsiteNameStem,
  suggestedClientWebsiteFormDefaults,
  toClientWebsiteSelectOptions,
} from '@/lib/clientWebsiteDefaults';
import { openWebsiteDetail } from '@/lib/websiteNavigation';

export function ClientWebsiteSelectField({
  value,
  onChange,
  clientId,
  companyNameZh,
  companyNameEn,
  clientName,
  displayName,
  projectTypes,
  showOpenLink = false,
}: {
  value: string;
  onChange: (webandsystemListId: string) => void;
  clientId: string;
  companyNameZh?: string;
  companyNameEn?: string;
  clientName?: string;
  displayName?: string;
  projectTypes: PitchingProjectType[];
  showOpenLink?: boolean;
}) {
  const { navigateTo } = useApp();
  const { profiles, addProfile } = useWebsiteProfiles();
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const options = useMemo(
    () => toClientWebsiteSelectOptions(profiles, value),
    [profiles, value],
  );
  const selected = profiles.find((profile) => profile.id === value);
  const nameInput = {
    companyNameZh,
    companyNameEn,
    clientName,
    displayName,
  };
  const nameStem = clientWebsiteNameStem(nameInput);

  const handleQuickAdd = () => {
    if (!clientId.trim()) {
      toast.error('請先選擇客戶');
      return;
    }
    setShowQuickAdd(true);
  };

  const handleSave = async (data: WebsiteFormData) => {
    const site = websiteFormDataToProfile(data, companies, brands);
    const err = await addProfile(site);
    if (err) {
      toast.error('新增失敗', { description: err.message });
      return;
    }
    toast.success(data.profileType === 'system' ? '系統已新增' : '網站已新增');
    onChange(site.id);
    setShowQuickAdd(false);
  };

  return (
    <>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">網站 / 系統</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchableSelect
              value={value}
              onValueChange={onChange}
              options={options}
              placeholder="搜尋客戶網站/系統..."
              searchPlaceholder="搜尋名稱或網域..."
              emptyText="找不到客戶網站/系統"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleQuickAdd}
            className="h-9 shrink-0 gap-1.5 text-[13px] border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100"
          >
            <Plus size={14} /> 新增網站/系統
          </Button>
        </div>
        {selected?.domainUrl && (
          <p className="text-[11px] text-muted-foreground mt-1 truncate">{selected.domainUrl}</p>
        )}
        {showOpenLink && value && (
          <button
            type="button"
            onClick={() => openWebsiteDetail(value, navigateTo)}
            className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-teal-700 hover:text-teal-800"
          >
            <ExternalLink size={12} /> 開啟網站/系統
          </button>
        )}
      </div>
      {showQuickAdd && (
        <WebsiteFormModal
          mode="add"
          initialData={suggestedClientWebsiteFormDefaults({
            ...nameInput,
            projectTypes,
          })}
          lockProjectCategory
          suggestedNameForType={(profileType) => clientWebsiteNameForType(nameStem, profileType)}
          overlayClassName="z-[120]"
          onClose={() => setShowQuickAdd(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
