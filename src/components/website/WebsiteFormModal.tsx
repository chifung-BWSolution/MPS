import { useState, useEffect } from 'react';
import { X, Globe, Server, Building2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import { useSystemOptions } from '@/hooks/useSystemOptions';
import type { Brand, Company, ProfileType, ProjectCategory, SystemType, WebsiteLevel, WebsiteProfileFull } from '@/types/app';

export interface WebsiteFormData {
  websiteName: string;
  domainUrl: string;
  companyId: string;
  brandId: string;
  brand: string;
  platform: string;
  hostingProvider: string;
  level: WebsiteLevel;
  status: 'development' | 'live' | 'maintenance' | 'archived';
  notes: string;
  profileType: ProfileType;
  projectCategory: ProjectCategory;
  systemType?: SystemType;
}

export const emptyFormData: WebsiteFormData = {
  websiteName: '',
  domainUrl: '',
  companyId: '',
  brandId: '',
  brand: '',
  platform: '',
  hostingProvider: '',
  level: 3,
  status: 'development',
  notes: '',
  profileType: 'website',
  projectCategory: 'internal',
  systemType: undefined,
};

export function websiteFormDataToProfile(
  data: WebsiteFormData,
  companies: Company[],
  brands: Brand[],
): WebsiteProfileFull {
  const company = companies.find((c) => c.uuid === data.companyId || c.id === data.companyId);
  const brandRow =
    brands.find(
      (b) =>
        b.brandCode === data.brand &&
        (b.companyId === (company?.uuid || company?.id) || !data.companyId),
    ) || brands.find((b) => b.brandCode === data.brand);
  return {
    id: `${data.profileType === 'system' ? 'sys' : 'ws'}_${Date.now()}`,
    companyId: company?.uuid || data.companyId,
    brandId: brandRow?.id || data.brandId || '',
    websiteName: data.websiteName,
    domainUrl: data.domainUrl,
    platform: data.platform as WebsiteProfileFull['platform'],
    hostingProvider: data.hostingProvider,
    company: company?.companyCode || '',
    brand: brandRow?.brandCode || data.brand || '',
    level: data.level,
    status: data.status,
    notes: data.notes || undefined,
    pagesCount: 0,
    articlesCount: 0,
    videosCount: 0,
    socialPostsCount: 0,
    keywordsCount: 0,
    pluginsCount: 0,
    totalHours: 0,
    profileType: data.profileType,
    projectCategory: data.projectCategory,
    systemType: data.systemType,
  };
}

export function WebsiteFormModal({
  mode,
  initialData,
  onClose,
  onSave,
  overlayClassName,
  lockProjectCategory = false,
  suggestedNameForType,
}: {
  mode: 'add' | 'edit';
  initialData?: WebsiteFormData;
  onClose: () => void;
  onSave: (data: WebsiteFormData) => void | Promise<void>;
  overlayClassName?: string;
  lockProjectCategory?: boolean;
  suggestedNameForType?: (profileType: ProfileType) => string;
}) {
  const [form, setForm] = useState<WebsiteFormData>(initialData || emptyFormData);
  const [saving, setSaving] = useState(false);
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const uniqueBrandCodes = Array.from(
    new Set(
      brands
        .filter((b) => b.isActive)
        .filter((b) => {
          if (!form.companyId) return true;
          const co = companies.find((c) => c.uuid === form.companyId || c.id === form.companyId);
          return b.companyId === form.companyId || b.companyId === co?.uuid || b.companyId === co?.id;
        })
        .map((b) => b.brandCode),
    ),
  ).sort();
  const { byCategory: optionsByCategory } = useSystemOptions();
  const platformOptions = optionsByCategory('platform');
  const knownPlatformValues = platformOptions
    .filter((p) => p.value.toLowerCase() !== 'custom' && p.value !== '自訂')
    .map((p) => p.value);
  const canonicalPlatform = form.platform
    ? (knownPlatformValues.find((v) => v.toLowerCase() === form.platform.toLowerCase()) ?? form.platform)
    : '';
  const [isCustomSelected, setIsCustomSelected] = useState(false);
  const [customPlatform, setCustomPlatform] = useState('');

  useEffect(() => {
    if (knownPlatformValues.length === 0) return;
    const isCustom =
      !!form.platform && !knownPlatformValues.some((v) => v.toLowerCase() === form.platform.toLowerCase());
    setIsCustomSelected(isCustom);
    setCustomPlatform(isCustom ? form.platform : '');
  }, [knownPlatformValues.length]);

  const handleChange = (field: keyof WebsiteFormData, value: WebsiteFormData[keyof WebsiteFormData]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProfileTypeChange = (profileType: ProfileType) => {
    setForm((prev) => {
      const suggestedCurrent = suggestedNameForType?.(prev.profileType) ?? '';
      const shouldRetarget =
        Boolean(suggestedNameForType) &&
        (!prev.websiteName.trim() || prev.websiteName === suggestedCurrent);
      return {
        ...prev,
        profileType,
        websiteName: shouldRetarget ? suggestedNameForType!(profileType) : prev.websiteName,
        systemType:
          profileType === 'system'
            ? prev.systemType || (lockProjectCategory ? 'client_system' : undefined)
            : prev.systemType,
      };
    });
  };

  const handleSubmit = async () => {
    if (!form.websiteName || saving) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50', overlayClassName)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">{mode === 'add' ? '新增網站/系統' : '編輯網站/系統'}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">類型 *</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleProfileTypeChange('website')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-medium transition-all',
                  form.profileType === 'website'
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-border text-muted-foreground hover:bg-muted/50',
                )}
              >
                <Globe size={13} /> 網站
              </button>
              <button
                type="button"
                onClick={() => handleProfileTypeChange('system')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-medium transition-all',
                  form.profileType === 'system'
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-border text-muted-foreground hover:bg-muted/50',
                )}
              >
                <Server size={13} /> 系統
              </button>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">項目類型 *</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={lockProjectCategory}
                onClick={() => handleChange('projectCategory', 'internal')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-medium transition-all',
                  form.projectCategory === 'internal'
                    ? 'border-teal-600 bg-teal-50 text-teal-700'
                    : 'border-border text-muted-foreground hover:bg-muted/50',
                  lockProjectCategory && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Building2 size={13} /> 內部項目
              </button>
              <button
                type="button"
                disabled={lockProjectCategory}
                onClick={() => handleChange('projectCategory', 'client')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-medium transition-all',
                  form.projectCategory === 'client'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-border text-muted-foreground hover:bg-muted/50',
                  lockProjectCategory && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Users size={13} /> 客戶項目
              </button>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              {form.profileType === 'system' ? '系統名稱' : '網站名稱'} *
            </label>
            <input
              value={form.websiteName}
              onChange={(e) => handleChange('websiteName', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              placeholder={form.profileType === 'system' ? '輸入系統名稱' : '輸入網站名稱'}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              {form.profileType === 'system' ? '系統 URL / 域名' : '域名 URL'}
            </label>
            <input
              value={form.domainUrl}
              onChange={(e) => handleChange('domainUrl', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              placeholder={form.profileType === 'system' ? 'app.example.com' : 'www.example.com'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬公司</label>
              <select
                value={form.companyId}
                onChange={(e) => handleChange('companyId', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="">選擇公司</option>
                {companies
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.uuid || c.id} value={c.uuid || c.id}>
                      {c.companyCode} — {c.companyNameEn}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬品牌</label>
              <select
                value={form.brand}
                onChange={(e) => handleChange('brand', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="">選擇品牌</option>
                {uniqueBrandCodes.map((code) => {
                  const brand = brands.find((b) => b.brandCode === code);
                  return (
                    <option key={code} value={code}>
                      {brand ? `${brand.brandCode} — ${brand.displayName}` : code}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">平台</label>
              <select
                value={isCustomSelected ? '__custom__' : canonicalPlatform}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomSelected(true);
                    handleChange('platform', customPlatform || '');
                  } else {
                    setIsCustomSelected(false);
                    setCustomPlatform('');
                    handleChange('platform', e.target.value);
                  }
                }}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="">選擇平台</option>
                {platformOptions
                  .filter((p) => p.value.toLowerCase() !== 'custom' && p.value !== '自訂')
                  .map((p) => (
                    <option key={p.id} value={p.value}>
                      {p.value}
                    </option>
                  ))}
                <option value="__custom__">自訂</option>
              </select>
              {isCustomSelected && (
                <input
                  value={customPlatform}
                  onChange={(e) => {
                    const v = e.target.value.slice(0, 10);
                    setCustomPlatform(v);
                    handleChange('platform', v);
                  }}
                  maxLength={10}
                  placeholder="輸入自訂平台 (最多10字)"
                  className="mt-2 w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                />
              )}
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">主機商</label>
              <input
                value={form.hostingProvider}
                onChange={(e) => handleChange('hostingProvider', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                placeholder="如 Cloudways, AWS..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Level 等級</label>
              <select
                value={form.level}
                onChange={(e) => handleChange('level', Number(e.target.value) as WebsiteLevel)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value={1}>L1 主打</option>
                <option value={2}>L2 重要</option>
                <option value={3}>L3 定期推廣</option>
                <option value={4}>L4 不主動</option>
                <option value={5}>L5 已關閉</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
              <select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="development">開發中</option>
                <option value="live">已上線</option>
                <option value="maintenance">維護中</option>
                <option value="archived">已封存</option>
              </select>
            </div>
          </div>

          {form.profileType === 'system' && (
            <div className="space-y-4 p-4 rounded-lg bg-purple-50/50 border border-purple-100">
              <h4 className="text-[13px] font-bold text-purple-700 flex items-center gap-1.5">
                <Server size={13} /> 系統專屬設定
              </h4>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">系統類型</label>
                <select
                  value={form.systemType || ''}
                  onChange={(e) => handleChange('systemType', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-purple-600 bg-white"
                >
                  <option value="">選擇類型...</option>
                  <option value="internal_tool">內部工具</option>
                  <option value="client_system">客戶系統</option>
                  <option value="saas_platform">SaaS 平台</option>
                  <option value="erp">ERP 系統</option>
                  <option value="crm">CRM 系統</option>
                  <option value="other">其他系統</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 resize-none bg-white"
              placeholder="其他備註..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!form.websiteName || saving}
            className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '儲存中…' : mode === 'add' ? '新增' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
}
