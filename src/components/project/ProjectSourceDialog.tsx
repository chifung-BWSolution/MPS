import { useMemo, useState, type ReactNode } from 'react';
import { Globe, Server, Users, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import { useQuotationClientProjects } from '@/hooks/useQuotationClientProjects';
import { useQuotationClientList } from '@/hooks/useQuotationClientList';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { useProjects, projectCategoryOf, projectKindOf, projectLevelOf, type MasterProject } from '@/hooks/useProjects';
import { toQuotationClientSelectOption } from '@/data/quotationClientList';
import {
  PitchingFormModal,
  pitchingFormToUpdate,
  type PitchingFormValues,
} from '@/components/quotation/PitchingModule';
import {
  WebsiteFormModal,
  emptyFormData,
  websiteFormDataToProfile,
  type WebsiteFormData,
} from '@/components/website/WebsiteFormModal';
import { VchannelFormModal } from '@/components/video/VchannelFormModal';
import { useVchannels } from '@/hooks/useVchannels';
import type { ProjectSelectKind } from '@/lib/searchableProjectSelect';
import { nextClientProjectIdForWebsite, syncWebsiteClientProjectLink } from '@/lib/websiteClientProjectLink';
import type { WebsiteLevel, WebsiteProfileFull } from '@/types/app';

const kindChoices: { key: ProjectSelectKind; label: string; icon: ReactNode }[] = [
  { key: 'website', label: '網站', icon: <Globe size={14} /> },
  { key: 'system', label: '系統', icon: <Server size={14} /> },
  { key: 'quotation_client', label: '客戶項目', icon: <Users size={14} /> },
  { key: 'vchannel', label: '影片頻道', icon: <Video size={14} /> },
];

const manualStatusOptions = [
  { value: 'planning', label: '規劃中' },
  { value: 'active', label: '進行中' },
  { value: 'on_hold', label: '暫停' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

function websiteFormFromProfile(site: WebsiteProfileFull): WebsiteFormData {
  return {
    websiteName: site.websiteName,
    domainUrl: site.domainUrl || '',
    companyId: site.companyId,
    brandId: site.brandId,
    brand: site.brand || '',
    platform: site.platform,
    hostingProvider: site.hostingProvider || '',
    level: site.level,
    status: site.status,
    notes: site.notes || '',
    profileType: site.profileType || 'website',
    projectCategory: site.projectCategory === 'client' ? 'client' : 'internal',
    systemType: site.systemType,
  };
}

function websiteFormFromProject(project: MasterProject): WebsiteFormData {
  return {
    ...emptyFormData,
    websiteName: project.name,
    domainUrl: typeof project.meta.domain_url === 'string' ? project.meta.domain_url : '',
    companyId: project.companyListId || '',
    brandId: project.brandListId || '',
    level: (projectLevelOf(project) ?? 3) as WebsiteLevel,
    status: (['development', 'live', 'maintenance', 'archived'].includes(project.status)
      ? project.status
      : 'development') as WebsiteFormData['status'],
    notes: typeof project.meta.notes === 'string' ? project.meta.notes : '',
    profileType: project.meta.profile_type === 'system' ? 'system' : 'website',
    projectCategory: projectCategoryOf(project),
  };
}

function KindPicker({ onPick, onClose }: { onPick: (kind: ProjectSelectKind) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[480px] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[16px] font-bold">新增項目</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">選擇來源類型，將建立對應模組的紀錄並同步到項目總覽。</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 grid grid-cols-2 gap-3">
          {kindChoices.map(choice => (
            <button
              key={choice.key}
              type="button"
              onClick={() => onPick(choice.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-md border text-[13px] font-medium transition-colors',
                choice.key === 'system'
                  ? 'border-border hover:border-purple-400 hover:bg-purple-50'
                  : 'border-border hover:border-teal-400 hover:bg-teal-50',
              )}
            >
              {choice.icon}
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManualLeftoverForm({
  project,
  onClose,
  onSaved,
}: {
  project: MasterProject;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const { updateProject } = useProjects();
  const [form, setForm] = useState({
    name: project.name,
    clientName: project.clientName || '',
    status: manualStatusOptions.some(o => o.value === project.status) ? project.status : 'planning',
    companyListId: project.companyListId || '',
    brandListId: project.brandListId || '',
    notes: typeof project.meta.notes === 'string' ? project.meta.notes : '',
  });
  const selectedCompany = companies.find(c => c.uuid === form.companyListId || c.id === form.companyListId);
  const availableBrands = brands.filter(b => {
    if (!b.isActive) return false;
    if (!form.companyListId) return true;
    return b.companyId === form.companyListId || b.companyId === selectedCompany?.uuid || b.companyId === selectedCompany?.id;
  });

  return (
    <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">編輯舊自訂項目</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            此為舊自訂項目，不會再新增。請改在來源模組建立網站／系統／客戶項目／影片頻道。
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">項目名稱 *</label>
            <input
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">客戶名稱</label>
            <input
              value={form.clientName}
              onChange={e => setForm(prev => ({ ...prev, clientName: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬公司</label>
              <select
                value={form.companyListId}
                onChange={e => setForm(prev => ({ ...prev, companyListId: e.target.value, brandListId: '' }))}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="">選擇公司</option>
                {companies.filter(c => c.isActive).map(c => (
                  <option key={c.uuid || c.id} value={c.uuid || c.id}>{c.companyCode} — {c.companyNameZh || c.companyNameEn}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬品牌</label>
              <select
                value={form.brandListId}
                onChange={e => setForm(prev => ({ ...prev, brandListId: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="">選擇品牌</option>
                {availableBrands.map(b => (
                  <option key={b.id} value={b.id}>{b.brandCode} — {b.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
            <select
              value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            >
              {manualStatusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80">
            取消
          </button>
          <button
            type="button"
            disabled={!form.name.trim()}
            onClick={async () => {
              const result = await updateProject(project, {
                name: form.name,
                clientName: form.clientName || null,
                status: form.status,
                companyListId: form.companyListId || null,
                brandListId: form.brandListId || null,
                notes: form.notes || null,
              });
              if (result.error) {
                toast.error('儲存失敗', { description: result.error.message });
                return;
              }
              toast.success('項目已更新');
              await onSaved();
            }}
            className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            儲存變更
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectSourceDialog({
  mode,
  project,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit';
  project?: MasterProject | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { systemUser } = useAuth();
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const { profiles, addProfile, updateProfile } = useWebsiteProfiles();
  const { records, loading: pitchingLoading, addRecord, updateRecord } = useQuotationClientProjects();
  const { records: clientListRecords, addClient } = useQuotationClientList();
  const { channels, loading: vchannelLoading } = useVchannels();
  const editKind = project ? projectKindOf(project) : null;
  const [pickedKind, setPickedKind] = useState<ProjectSelectKind | null>(
    editKind && editKind !== 'manual' ? editKind : null,
  );
  const editingRecord = project?.relatedType === 'quotation_client'
    ? records.find(r => r.id === project.relatedId) ?? null
    : null;
  const { options: staffOptions } = useActiveStaffOptions([
    editingRecord?.mainPmId,
    systemUser?.staff_id,
  ]);
  const clientOptions = useMemo(
    () => clientListRecords.map(toQuotationClientSelectOption),
    [clientListRecords],
  );

  if (mode === 'edit' && project?.relatedType === 'manual') {
    return <ManualLeftoverForm project={project} onClose={onClose} onSaved={onSaved} />;
  }

  if (mode === 'add' && !pickedKind) {
    return <KindPicker onPick={setPickedKind} onClose={onClose} />;
  }

  const kind = pickedKind ?? (editKind !== 'manual' ? editKind : null);
  if (!kind) return null;

  const handleWebsiteSave = async (data: WebsiteFormData) => {
    if (mode === 'add') {
      const newSite = websiteFormDataToProfile(data, companies, brands);
      const err = await addProfile(newSite);
      if (err) {
        toast.error('新增失敗', { description: err.message });
        return;
      }
      const linkErr = await syncWebsiteClientProjectLink({
        websiteId: newSite.id,
        nextProjectId: nextClientProjectIdForWebsite(data.projectCategory, data.quotationClientProjectId),
        records,
        updateRecord,
      });
      if (linkErr.error) {
        toast.error('網站已新增，但客戶項目連結失敗', { description: linkErr.error.message });
      } else {
        toast.success(data.profileType === 'system' ? '系統已新增' : '網站已新增');
      }
      await onSaved();
      return;
    }
    if (!project) return;
    const company = companies.find(c => c.uuid === data.companyId || c.id === data.companyId);
    const brandRow = brands.find(b => b.brandCode === data.brand && (b.companyId === (company?.uuid || company?.id) || !data.companyId))
      || brands.find(b => b.brandCode === data.brand);
    const err = await updateProfile(project.relatedId, {
      websiteName: data.websiteName,
      domainUrl: data.domainUrl,
      companyId: company?.uuid || data.companyId,
      brandId: brandRow?.id || data.brandId || '',
      platform: data.platform as WebsiteProfileFull['platform'],
      hostingProvider: data.hostingProvider,
      company: company?.companyCode || '',
      brand: brandRow?.brandCode || data.brand || '',
      level: data.level,
      status: data.status,
      notes: data.notes || undefined,
      profileType: data.profileType,
      projectCategory: data.projectCategory,
      systemType: data.systemType,
    });
    if (err) {
      toast.error('儲存失敗', { description: err.message });
      return;
    }
    const linkErr = await syncWebsiteClientProjectLink({
      websiteId: project.relatedId,
      nextProjectId: nextClientProjectIdForWebsite(data.projectCategory, data.quotationClientProjectId),
      records,
      updateRecord,
    });
    if (linkErr.error) {
      toast.error('項目已更新，但客戶項目連結失敗', { description: linkErr.error.message });
    } else {
      toast.success('項目已更新');
    }
    await onSaved();
  };

  const handlePitchingSave = async (form: PitchingFormValues) => {
    const selectedStaff = staffOptions.find(s => s.value === form.mainPmId);
    const payload = {
      ...pitchingFormToUpdate(form),
      assignedPmName: selectedStaff?.label || '',
      mainPmName: selectedStaff?.label || undefined,
    };
    if (mode === 'edit' && project) {
      const { error } = await updateRecord(project.relatedId, payload);
      if (error) {
        toast.error('儲存失敗', { description: error.message });
        return;
      }
      toast.success('客戶項目已更新');
      await onSaved();
      return;
    }
    const { error } = await addRecord({
      clientId: form.clientId.trim(),
      clientName: form.clientName.trim(),
      displayName: form.displayName.trim(),
      inquiryDate: form.inquiryDate,
      signedDate: form.signedDate || undefined,
      handoverDate: form.handoverDate || undefined,
      description: form.description.trim() || undefined,
      projectTypes: form.projectTypes,
      assignedPm: '',
      assignedPmName: selectedStaff?.label || '',
      mainPmId: form.mainPmId.trim() || undefined,
      mainPmName: selectedStaff?.label || undefined,
      status: 'initial',
      webandsystemListId: form.webandsystemListId.trim() || undefined,
      asanaLink: form.asanaLink.trim() || undefined,
    });
    if (error) {
      toast.error('新增失敗', { description: error.message });
      return;
    }
    toast.success('客戶項目已新增');
    await onSaved();
  };

  if (kind === 'website' || kind === 'system') {
    const site = project ? profiles.find(p => p.id === project.relatedId) : undefined;
    const initialData = site
      ? websiteFormFromProfile(site)
      : project
        ? websiteFormFromProject(project)
        : { ...emptyFormData, profileType: kind };
    return (
      <WebsiteFormModal
        mode={mode}
        websiteId={mode === 'edit' ? site?.id || project?.relatedId : undefined}
        initialData={initialData}
        onClose={onClose}
        onSave={handleWebsiteSave}
      />
    );
  }

  if (kind === 'quotation_client') {
    if (mode === 'edit' && !editingRecord) {
      return (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] px-6 py-5 space-y-3">
            <h3 className="text-[16px] font-bold">編輯客戶項目</h3>
            <p className="text-[13px] text-muted-foreground">
              {pitchingLoading ? '載入來源紀錄中…' : '找不到此客戶項目的來源紀錄。'}
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80">
                關閉
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <PitchingFormModal
        isOpen
        onClose={onClose}
        onSubmit={handlePitchingSave}
        clientOptions={clientOptions}
        staffOptions={staffOptions}
        defaultMainPmId={systemUser?.staff_id}
        initialRecord={mode === 'edit' ? editingRecord : null}
        createTitle="新增客戶項目"
        onCreateClient={addClient}
      />
    );
  }

  const channel = project ? channels.find(c => c.id === project.relatedId) : undefined;
  if (mode === 'edit' && !channel) {
    return (
      <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] px-6 py-5 space-y-3">
          <h3 className="text-[16px] font-bold">編輯影片頻道</h3>
          <p className="text-[13px] text-muted-foreground">
            {vchannelLoading ? '載入來源紀錄中…' : '找不到此影片頻道的來源紀錄。'}
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80">
              關閉
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <VchannelFormModal
      isOpen
      mode={mode}
      channel={mode === 'edit' ? channel : null}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
