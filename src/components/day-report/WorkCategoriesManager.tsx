import { useState } from 'react';
import { Plus, Edit2, GripVertical, Globe, Building2, FolderOpen, Tag, Check, X, Info, Save, Video } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { WorkCategory } from '@/data/dayReportDataV2';
import { useDayReportTypes } from '@/hooks/useDayReportTypes';

export type LinkMode = 'required' | 'optional' | 'none';
export type LinkProjectType = 'webandsystem' | 'quotation_client' | 'vchannel';

export const LINK_PROJECT_TYPES: LinkProjectType[] = ['webandsystem', 'quotation_client', 'vchannel'];

export function isRelationRequired(mode: LinkMode | undefined | null): boolean {
  return mode === 'required';
}

export function linkRuleIsValid(mode: LinkMode, types: LinkProjectType[]): boolean {
  return mode === 'none' || types.length > 0;
}

export interface WorkCategoryConfig {
  id: string;
  category: WorkCategory | string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  linkMode: LinkMode;
  linkTypes: LinkProjectType[];
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export const defaultCategoryLinkRules: Record<WorkCategory, { mode: LinkMode; types: LinkProjectType[] }> = {
  website_design: { mode: 'required', types: ['webandsystem'] },
  website_dev: { mode: 'required', types: ['webandsystem'] },
  article_writing: { mode: 'required', types: ['webandsystem'] },
  video_shooting: { mode: 'required', types: ['vchannel'] },
  video_editing: { mode: 'required', types: ['vchannel'] },
  social_media: { mode: 'required', types: ['vchannel'] },
  edm: { mode: 'required', types: ['webandsystem'] },
  paid_ads: { mode: 'required', types: ['webandsystem'] },
  seo: { mode: 'required', types: ['webandsystem'] },
  graphic_design: { mode: 'required', types: ['webandsystem'] },
  client_meeting: { mode: 'required', types: ['quotation_client'] },
  internal_meeting: { mode: 'optional', types: [...LINK_PROJECT_TYPES] },
  training: { mode: 'none', types: [] },
};

export const linkModeConfig: Record<LinkMode, { label: string; description: string; icon: React.ElementType; color: string; bg: string }> = {
  required: {
    label: '必填',
    description: '必須從已選的項目類型中選擇一個項目',
    icon: Check,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  optional: {
    label: '選填',
    description: '可從已選的項目類型中選擇，亦可留空',
    icon: Tag,
    color: 'text-teal-700',
    bg: 'bg-teal-50',
  },
  none: {
    label: '不關聯',
    description: '不顯示項目選擇，關聯欄位固定為空',
    icon: FolderOpen,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
  },
};

export const linkProjectTypeConfig: Record<LinkProjectType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  webandsystem: {
    label: '網站或系統',
    icon: Globe,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  quotation_client: {
    label: '客戶項目',
    icon: Building2,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
  },
  vchannel: {
    label: '影片頻道',
    icon: Video,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
  },
};

export function linkTypeNames(types: LinkProjectType[]): string {
  return types.map(type => linkProjectTypeConfig[type].label).join('、');
}

const availableIcons = ['📋', '📎', '🗂️', '📌', '🔔', '🏷️', '⚙️', '🛠️', '📐', '🧩', '🎯', '💡', '🔧', '📝', '🎪', '🎭', '🗓️', '🧾', '📦', '🏗️'];
const availableColors = [
  { color: 'text-blue-700', bg: 'bg-blue-100' },
  { color: 'text-indigo-700', bg: 'bg-indigo-100' },
  { color: 'text-emerald-700', bg: 'bg-emerald-100' },
  { color: 'text-purple-700', bg: 'bg-purple-100' },
  { color: 'text-pink-700', bg: 'bg-pink-100' },
  { color: 'text-rose-700', bg: 'bg-rose-100' },
  { color: 'text-orange-700', bg: 'bg-orange-100' },
  { color: 'text-cyan-700', bg: 'bg-cyan-100' },
  { color: 'text-amber-700', bg: 'bg-amber-100' },
  { color: 'text-teal-700', bg: 'bg-teal-100' },
  { color: 'text-lime-700', bg: 'bg-lime-100' },
  { color: 'text-yellow-700', bg: 'bg-yellow-100' },
];

type LinkForm = {
  label: string;
  description: string;
  icon: string;
  color: string;
  bg: string;
  linkMode: LinkMode;
  linkTypes: LinkProjectType[];
};

function toggleLinkType(types: LinkProjectType[], type: LinkProjectType): LinkProjectType[] {
  return types.includes(type) ? types.filter(item => item !== type) : [...types, type];
}

function LinkRuleFields({
  mode,
  types,
  onChange,
}: {
  mode: LinkMode;
  types: LinkProjectType[];
  onChange: (mode: LinkMode, types: LinkProjectType[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">關聯方式</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(Object.entries(linkModeConfig) as [LinkMode, typeof linkModeConfig['none']][]).map(([key, config]) => {
            const Icon = config.icon;
            const selected = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key, key === 'none' ? [] : types)}
                className={cn(
                  'flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all',
                  selected
                    ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-200'
                    : 'border-border/60 hover:border-teal-200 hover:bg-muted/20'
                )}
              >
                <Icon size={13} className={cn('mt-0.5 shrink-0', selected ? 'text-teal-600' : 'text-muted-foreground')} />
                <div>
                  <span className={cn('text-[11px] font-bold block', selected ? 'text-teal-700' : 'text-foreground')}>{config.label}</span>
                  <span className="text-[10px] text-muted-foreground">{config.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {mode !== 'none' && (
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">關聯項目類型</label>
          <div className="flex flex-wrap gap-2">
            {LINK_PROJECT_TYPES.map(key => {
              const config = linkProjectTypeConfig[key];
              const Icon = config.icon;
              const selected = types.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange(mode, toggleLinkType(types, key))}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all',
                    selected
                      ? 'border-teal-400 bg-teal-50 text-teal-700'
                      : 'border-border/60 text-muted-foreground hover:border-teal-200'
                  )}
                >
                  <Icon size={13} />
                  {config.label}
                  {selected && <Check size={11} className="text-teal-600" />}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">可多選。只選一種時，匯報只能關聯該類型項目。</p>
          {types.length === 0 && (
            <p className="text-[10px] text-amber-700 mt-1">必填或選填至少要選一種項目類型。</p>
          )}
        </div>
      )}
    </div>
  );
}

function LinkTypeChips({ types }: { types: LinkProjectType[] }) {
  if (types.length === 0) return <span className="text-[12px] text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      {types.map(type => {
        const config = linkProjectTypeConfig[type];
        const Icon = config.icon;
        return (
          <span key={type} className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium', config.bg, config.color)}>
            <Icon size={9} />
            {config.label}
          </span>
        );
      })}
    </div>
  );
}

export function WorkCategoriesManager() {
  const { types: categories, loading, addType, updateType } = useDayReportTypes();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LinkForm>({
    label: '',
    description: '',
    icon: '📋',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    linkMode: 'none',
    linkTypes: [],
  });
  const [showAddNew, setShowAddNew] = useState(false);
  const [newForm, setNewForm] = useState<LinkForm>({
    label: '',
    description: '',
    icon: '📋',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    linkMode: 'required',
    linkTypes: ['webandsystem'],
  });

  const startEditing = (cat: WorkCategoryConfig) => {
    setEditingId(cat.id);
    setEditForm({
      label: cat.label,
      description: cat.description,
      icon: cat.icon,
      color: cat.color,
      bg: cat.bg,
      linkMode: cat.linkMode in linkModeConfig ? cat.linkMode : 'none',
      linkTypes: cat.linkMode === 'none' ? [] : cat.linkTypes,
    });
  };

  const saveEditing = async () => {
    if (!editingId || !editForm.label.trim()) return;
    if (!linkRuleIsValid(editForm.linkMode, editForm.linkTypes)) {
      toast.error('請至少選擇一種關聯項目類型');
      return;
    }
    const linkTypes = editForm.linkMode === 'none' ? [] : editForm.linkTypes;
    const error = await updateType(editingId, {
      label: editForm.label,
      description: editForm.description,
      icon: editForm.icon,
      color: editForm.color,
      bg: editForm.bg,
      linkMode: editForm.linkMode,
      linkTypes,
    });
    if (error) {
      toast.error('儲存失敗', { description: error.message });
      return;
    }
    setEditingId(null);
    toast.success(`已更新「${editForm.label}」工作類型`, { description: '變更已儲存' });
  };

  const toggleActive = async (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    const error = await updateType(id, { isActive: !cat.isActive });
    if (error) {
      toast.error('更新失敗', { description: error.message });
      return;
    }
    toast.success(!cat.isActive ? `已啟用「${cat.label}」` : `已停用「${cat.label}」`, {
      description: !cat.isActive ? '此類型已恢復顯示' : '此類型將不會顯示在匯報表單中',
    });
  };

  const addNewCategory = async () => {
    if (!newForm.label.trim()) return;
    if (!linkRuleIsValid(newForm.linkMode, newForm.linkTypes)) {
      toast.error('請至少選擇一種關聯項目類型');
      return;
    }
    const newId = `custom_${Date.now()}`;
    const newLabel = newForm.label;
    const newItem: WorkCategoryConfig = {
      id: newId,
      category: newId,
      label: newLabel,
      icon: newForm.icon,
      color: newForm.color,
      bg: newForm.bg,
      linkMode: newForm.linkMode,
      linkTypes: newForm.linkMode === 'none' ? [] : newForm.linkTypes,
      description: newForm.description,
      isActive: true,
      sortOrder: categories.length,
    };
    const error = await addType(newItem);
    if (error) {
      toast.error('新增失敗', { description: error.message });
      return;
    }
    setNewForm({
      label: '',
      description: '',
      icon: '📋',
      color: 'text-blue-700',
      bg: 'bg-blue-100',
      linkMode: 'required',
      linkTypes: ['webandsystem'],
    });
    setShowAddNew(false);
    toast.success(`已新增「${newLabel}」工作類型`, { description: '新類型已加入列表並預設啟用' });
  };

  const activeCount = categories.filter(c => c.isActive).length;
  const requiredCount = categories.filter(c => c.linkMode === 'required').length;
  const optionalCount = categories.filter(c => c.linkMode === 'optional').length;
  const noneCount = categories.filter(c => c.linkMode === 'none').length;
  const canSaveNew = newForm.label.trim().length > 0 && linkRuleIsValid(newForm.linkMode, newForm.linkTypes);
  const canSaveEdit = editForm.label.trim().length > 0 && linkRuleIsValid(editForm.linkMode, editForm.linkTypes);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
        從資料庫載入中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-3.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium">啟用類別</span>
          <div className="text-[22px] font-bold text-teal-600 mt-1">{activeCount}</div>
          <span className="text-[11px] text-muted-foreground">/ {categories.length} 總數</span>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-3.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1"><Check size={10} className="text-amber-600" />必填</span>
          <div className="text-[22px] font-bold text-amber-600 mt-1">{requiredCount}</div>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-3.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1"><Tag size={10} className="text-teal-600" />選填</span>
          <div className="text-[22px] font-bold text-teal-600 mt-1">{optionalCount}</div>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-3.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1"><FolderOpen size={10} className="text-gray-500" />不關聯</span>
          <div className="text-[22px] font-bold text-gray-600 mt-1">{noneCount}</div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg border border-teal-100 p-4 flex items-start gap-3">
        <Info size={16} className="text-teal-600 mt-0.5 shrink-0" />
        <div>
          <h4 className="text-[13px] font-bold text-teal-800">工作類型關聯規則</h4>
          <p className="text-[12px] text-teal-700 mt-1">
            每個工作類型分開設定兩件事：要不要選項目，以及可以選哪些項目。同事在匯報選擇工作類別時，系統會依此顯示項目清單。
          </p>
          <ul className="text-[12px] text-teal-700 mt-1 space-y-0.5 list-disc list-inside">
            <li><strong>必填</strong>：必須從已選類型中選一個項目</li>
            <li><strong>選填</strong>：可以選，也可以留空</li>
            <li><strong>不關聯</strong>：不顯示項目選擇（適合培訓、學習等）</li>
          </ul>
          <p className="text-[12px] text-teal-700 mt-2">
            項目類型可多選：網站或系統、客戶項目、影片頻道。只選一種時，匯報只能關聯該類型。
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border/50 bg-muted/20 flex items-center justify-between">
          <h3 className="text-[14px] font-bold flex items-center gap-2"><Tag size={14} className="text-teal-600" />工作類型列表</h3>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">{activeCount} 啟用 / {categories.length} 總數</span>
            <button
              onClick={() => setShowAddNew(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[12px] font-bold hover:bg-teal-700 transition-colors shadow-sm"
            >
              <Plus size={13} />新增工作類型
            </button>
          </div>
        </div>

        {showAddNew && (
          <div className="px-5 py-4 border-b border-teal-200 bg-teal-50/30">
            <div className="flex items-center gap-2 mb-3">
              <Plus size={14} className="text-teal-600" />
              <h4 className="text-[13px] font-bold text-teal-800">新增工作類型</h4>
            </div>
            <div className="space-y-3 pl-5">
              <div className="flex items-start gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">圖示</label>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {availableIcons.map(icon => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setNewForm({ ...newForm, icon })}
                        className={cn(
                          'w-7 h-7 rounded flex items-center justify-center text-[14px] border transition-colors',
                          newForm.icon === icon ? 'border-teal-400 bg-teal-100' : 'border-border/40 hover:border-teal-300'
                        )}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">名稱 *</label>
                  <input
                    value={newForm.label}
                    onChange={(e) => setNewForm({ ...newForm, label: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                    placeholder="輸入工作類型名稱..."
                  />
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5 mt-2">描述</label>
                  <input
                    value={newForm.description}
                    onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                    placeholder="工作類型描述..."
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">顏色標籤</label>
                <div className="flex flex-wrap gap-1.5">
                  {availableColors.map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setNewForm({ ...newForm, color: c.color, bg: c.bg })}
                      className={cn(
                        'w-7 h-7 rounded-full border-2 transition-all',
                        c.bg,
                        newForm.color === c.color ? 'border-teal-500 scale-110 ring-2 ring-teal-200' : 'border-transparent hover:scale-105'
                      )}
                    />
                  ))}
                </div>
              </div>
              <LinkRuleFields
                mode={newForm.linkMode}
                types={newForm.linkTypes}
                onChange={(linkMode, linkTypes) => setNewForm({ ...newForm, linkMode, linkTypes })}
              />
              <div className="flex items-center gap-2 pt-1">
                <button onClick={addNewCategory} disabled={!canSaveNew} className="flex items-center gap-1.5 px-5 py-2 bg-teal-600 text-white rounded-md text-[13px] font-bold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                  <Save size={13} />新增儲存
                </button>
                <button onClick={() => setShowAddNew(false)} className="flex items-center gap-1 px-4 py-2 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors">
                  <X size={12} />取消
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[12px] font-semibold text-muted-foreground px-4 py-2.5 w-[220px]">工作類型</th>
                <th className="text-left text-[12px] font-semibold text-muted-foreground px-4 py-2.5">描述</th>
                <th className="text-left text-[12px] font-semibold text-muted-foreground px-4 py-2.5 w-[120px]">關聯方式</th>
                <th className="text-left text-[12px] font-semibold text-muted-foreground px-4 py-2.5 w-[180px]">關聯項目</th>
                <th className="text-right text-[12px] font-semibold text-muted-foreground px-4 py-2.5 w-[140px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const isEditing = editingId === cat.id;
                const modeConfig = linkModeConfig[cat.linkMode] ?? linkModeConfig.none;
                const ModeIcon = modeConfig.icon;
                return (
                  <tr key={cat.id} className={cn('border-b border-border/30 transition-colors align-middle', isEditing ? 'bg-amber-50/50' : 'hover:bg-muted/10', !cat.isActive && 'opacity-50')}>
                    {isEditing ? (
                      <td colSpan={5} className="px-5 py-3">
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-[16px]', editForm.bg)}>{editForm.icon}</span>
                            <div className="flex-1">
                              <input
                                value={editForm.label}
                                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                                className="text-[14px] font-bold border-b border-teal-300 bg-transparent outline-none focus:border-teal-500 w-full max-w-[200px]"
                                placeholder="類型名稱..."
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={saveEditing} disabled={!canSaveEdit} className="flex items-center gap-1 px-4 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm">
                                <Save size={12} />更新儲存
                              </button>
                              <button onClick={() => setEditingId(null)} className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors">
                                <X size={12} />取消
                              </button>
                            </div>
                          </div>
                          <div className="pl-11 space-y-3">
                            <div>
                              <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">圖示</label>
                              <div className="flex flex-wrap gap-1">
                                {availableIcons.map(icon => (
                                  <button
                                    key={icon}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, icon })}
                                    className={cn(
                                      'w-7 h-7 rounded flex items-center justify-center text-[14px] border transition-colors',
                                      editForm.icon === icon ? 'border-teal-400 bg-teal-100' : 'border-border/40 hover:border-teal-300'
                                    )}
                                  >
                                    {icon}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">顏色標籤</label>
                              <div className="flex flex-wrap gap-1.5">
                                {availableColors.map(c => (
                                  <button
                                    key={c.color}
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, color: c.color, bg: c.bg })}
                                    className={cn(
                                      'w-6 h-6 rounded-full border-2 transition-all',
                                      c.bg,
                                      editForm.color === c.color ? 'border-teal-500 scale-110 ring-2 ring-teal-200' : 'border-transparent hover:scale-105'
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                            <LinkRuleFields
                              mode={editForm.linkMode}
                              types={editForm.linkTypes}
                              onChange={(linkMode, linkTypes) => setEditForm({ ...editForm, linkMode, linkTypes })}
                            />
                            <div>
                              <label className="text-[12px] font-semibold text-muted-foreground block mb-1">描述</label>
                              <input
                                value={editForm.description}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                                placeholder="工作類型描述..."
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <GripVertical size={14} className="text-muted-foreground/40 cursor-grab shrink-0" />
                            <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-[16px] shrink-0', cat.bg)}>{cat.icon}</span>
                            <span className="text-[13px] font-bold">{cat.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[12px] text-muted-foreground leading-relaxed">{cat.description || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', modeConfig.bg, modeConfig.color)}>
                            <ModeIcon size={10} />
                            {modeConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <LinkTypeChips types={cat.linkTypes} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => toggleActive(cat.id)} className={cn('w-9 h-5 rounded-full transition-colors relative', cat.isActive ? 'bg-teal-500' : 'bg-gray-300')} title={cat.isActive ? '點擊停用' : '點擊啟用'}>
                              <span className={cn('absolute w-3.5 h-3.5 rounded-full bg-white top-[3px] transition-transform shadow-sm', cat.isActive ? 'left-[18px]' : 'left-[3px]')} />
                            </button>
                            <button onClick={() => startEditing(cat)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors text-blue-700 text-[11px] font-medium border border-blue-200" title="編輯此類型">
                              <Edit2 size={12} />編輯
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border/50 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
          <h3 className="text-[14px] font-bold flex items-center gap-2">
            <Globe size={14} className="text-blue-600" />
            關聯項目總覽
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            每個項目類型下列出有勾選它的啟用工作類型
          </p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {LINK_PROJECT_TYPES.map(key => {
            const config = linkProjectTypeConfig[key];
            const Icon = config.icon;
            const linkedCategories = categories.filter(c => c.isActive && c.linkTypes.includes(key));
            return (
              <div key={key} className={cn('p-4 rounded-lg border', config.bg)}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-white/70', config.color)}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <h4 className={cn('text-[13px] font-bold', config.color)}>{config.label}</h4>
                    <span className="text-[10px] text-muted-foreground">{linkedCategories.length} 個類型</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {linkedCategories.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">暫無關聯類型</p>
                  ) : (
                    linkedCategories.map(cat => (
                      <div key={cat.id} className="flex items-center gap-2 py-1">
                        <span className="text-[13px]">{cat.icon}</span>
                        <span className="text-[12px] font-medium">{cat.label}</span>
                        <span className="text-[10px] text-muted-foreground">{linkModeConfig[cat.linkMode]?.label}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border/50 bg-gradient-to-r from-teal-50/50 to-white">
          <h3 className="text-[14px] font-bold flex items-center gap-2">
            <Tag size={14} className="text-teal-600" />
            關聯方式說明
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            項目選項來自同步後的 projects 主表（網站或系統、客戶項目、影片頻道）
          </p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-2">
          {(Object.entries(linkModeConfig) as [LinkMode, typeof linkModeConfig['none']][]).map(([key, config]) => {
            const Icon = config.icon;
            const count = key === 'required' ? requiredCount : key === 'optional' ? optionalCount : noneCount;
            return (
              <div key={key} className={cn('flex items-start gap-2 p-3 rounded-lg border', config.bg)}>
                <Icon size={14} className={cn('mt-0.5 shrink-0', config.color)} />
                <div>
                  <span className={cn('text-[12px] font-bold block', config.color)}>{config.label} · {count}</span>
                  <span className="text-[11px] text-muted-foreground">{config.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
