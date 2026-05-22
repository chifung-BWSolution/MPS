import { useState } from 'react';
import { Plus, Edit2, Trash2, GripVertical, Globe, Building2, FolderOpen, Tag, Check, X, Info, Save, MonitorSmartphone, Megaphone, Video, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { categoryConfig, WorkCategory } from '@/data/dayReportDataV2';
import { projects } from '@/data/mockData';

// ============================
// Work Category Type Definition
// ============================
export type CategoryRelationType = 'project_website' | 'internal_project' | 'none';

// Project Module Groups — work categories associate with these
export type ProjectModuleGroup = 'website_system' | 'marketing' | 'video_production';

export const projectModuleGroupConfig: Record<ProjectModuleGroup, { label: string; icon: React.ElementType; color: string; bg: string; projectTypes: string[] }> = {
  website_system: {
    label: '網站+系統',
    icon: MonitorSmartphone,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    projectTypes: ['web_design', 'system'],
  },
  marketing: {
    label: '行銷管理',
    icon: Megaphone,
    color: 'text-pink-700',
    bg: 'bg-pink-50',
    projectTypes: ['marketing', 'social_media', 'edm', 'paid_ads', 'seo_upgrade', 'branding'],
  },
  video_production: {
    label: '影片製作',
    icon: Video,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    projectTypes: ['video'],
  },
};

export interface WorkCategoryConfig {
  id: string;
  category: WorkCategory | string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  relationType: CategoryRelationType;
  description: string;
  isActive: boolean;
  sortOrder: number;
  associatedModules: ProjectModuleGroup[];
}

// Default category-to-relation mapping
const defaultCategoryRelationMap: Record<WorkCategory, CategoryRelationType> = {
  website_design: 'project_website',
  website_dev: 'project_website',
  article_writing: 'project_website',
  video_shooting: 'project_website',
  video_editing: 'project_website',
  social_media: 'project_website',
  edm: 'project_website',
  paid_ads: 'project_website',
  seo: 'project_website',
  graphic_design: 'project_website',
  client_meeting: 'project_website',
  internal_meeting: 'internal_project',
  training: 'none',
};

// Default associated modules mapping
const defaultAssociatedModules: Record<WorkCategory, ProjectModuleGroup[]> = {
  website_design: ['website_system'],
  website_dev: ['website_system'],
  article_writing: ['marketing', 'website_system'],
  video_shooting: ['video_production'],
  video_editing: ['video_production'],
  social_media: ['marketing'],
  edm: ['marketing'],
  paid_ads: ['marketing'],
  seo: ['website_system', 'marketing'],
  graphic_design: ['marketing', 'website_system'],
  client_meeting: ['website_system', 'marketing', 'video_production'],
  internal_meeting: [],
  training: [],
};

const relationTypeLabels: Record<CategoryRelationType, { label: string; description: string; icon: React.ElementType; color: string; bg: string }> = {
  project_website: {
    label: '關聯項目及網站',
    description: '選擇時會顯示所有客戶項目和網站',
    icon: Globe,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  internal_project: {
    label: '關聯內部項目',
    description: '選擇時只顯示內部項目，不顯示客戶項目和網站',
    icon: Building2,
    color: 'text-teal-700',
    bg: 'bg-teal-50',
  },
  none: {
    label: '無需關聯',
    description: '不需要關聯任何項目或網站',
    icon: FolderOpen,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
  },
};

// Available emoji icons for new categories
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

// ============================
// Main Work Categories Manager
// ============================
export function WorkCategoriesManager() {
  const [categories, setCategories] = useState<WorkCategoryConfig[]>(
    Object.entries(categoryConfig).map(([key, config], idx) => ({
      id: key,
      category: key as WorkCategory,
      label: config.label,
      icon: config.icon,
      color: config.color,
      bg: config.bg,
      relationType: defaultCategoryRelationMap[key as WorkCategory],
      description: getDefaultDescription(key as WorkCategory),
      isActive: true,
      sortOrder: idx,
      associatedModules: defaultAssociatedModules[key as WorkCategory] || [],
    }))
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    label: string;
    relationType: CategoryRelationType;
    description: string;
    icon: string;
    color: string;
    bg: string;
    associatedModules: ProjectModuleGroup[];
  }>({ label: '', relationType: 'none', description: '', icon: '📋', color: 'text-blue-700', bg: 'bg-blue-100', associatedModules: [] });
  const [showAddNew, setShowAddNew] = useState(false);
  const [newForm, setNewForm] = useState({
    label: '',
    description: '',
    icon: '📋',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    relationType: 'project_website' as CategoryRelationType,
    associatedModules: [] as ProjectModuleGroup[],
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function getDefaultDescription(cat: WorkCategory): string {
    switch (cat) {
      case 'website_design': return '網站界面設計、UI/UX 更新';
      case 'website_dev': return '網站功能開發、程式修改';
      case 'article_writing': return '文章撰寫、部落格內容';
      case 'video_shooting': return '影片拍攝、取景';
      case 'video_editing': return '影片剪輯、後製';
      case 'social_media': return '社交媒體內容製作、發佈';
      case 'edm': return '電子郵件行銷內容';
      case 'paid_ads': return '付費廣告投放管理';
      case 'seo': return 'SEO 關鍵字優化、排名提升';
      case 'graphic_design': return '平面設計、海報、Banner';
      case 'client_meeting': return '客戶會議、提案、溝通';
      case 'internal_meeting': return '內部會議、團隊討論、規劃';
      case 'training': return '學習培訓、課程研習';
      default: return '';
    }
  }

  const startEditing = (cat: WorkCategoryConfig) => {
    setEditingId(cat.id);
    setEditForm({
      label: cat.label,
      relationType: cat.relationType,
      description: cat.description,
      icon: cat.icon,
      color: cat.color,
      bg: cat.bg,
      associatedModules: cat.associatedModules,
    });
  };

  const saveEditing = () => {
    if (!editingId) return;
    if (!editForm.label.trim()) return;
    setCategories(prev => prev.map(c => c.id === editingId ? {
      ...c,
      label: editForm.label,
      relationType: editForm.relationType,
      description: editForm.description,
      icon: editForm.icon,
      color: editForm.color,
      bg: editForm.bg,
      associatedModules: editForm.associatedModules,
    } : c));
    setEditingId(null);
    toast.success(`已更新「${editForm.label}」工作類型`, { description: '變更已儲存' });
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const toggleActive = (id: string) => {
    const cat = categories.find(c => c.id === id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c));
    if (cat) {
      toast.success(cat.isActive ? `已停用「${cat.label}」` : `已啟用「${cat.label}」`, {
        description: cat.isActive ? '此類型將不會顯示在匯報表單中' : '此類型已恢復顯示',
      });
    }
  };

  const addNewCategory = () => {
    if (!newForm.label.trim()) return;
    const newId = `custom_${Date.now()}`;
    const newLabel = newForm.label;
    setCategories(prev => [...prev, {
      id: newId,
      category: newId,
      label: newLabel,
      icon: newForm.icon,
      color: newForm.color,
      bg: newForm.bg,
      relationType: newForm.relationType,
      description: newForm.description,
      isActive: true,
      sortOrder: prev.length,
      associatedModules: newForm.associatedModules,
    }]);
    setNewForm({ label: '', description: '', icon: '📋', color: 'text-blue-700', bg: 'bg-blue-100', relationType: 'project_website', associatedModules: [] });
    setShowAddNew(false);
    toast.success(`已新增「${newLabel}」工作類型`, { description: '新類型已加入列表並預設啟用' });
  };

  const deleteCategory = (id: string) => {
    const cat = categories.find(c => c.id === id);
    setCategories(prev => prev.filter(c => c.id !== id));
    setDeleteConfirmId(null);
    if (cat) {
      toast.success(`已刪除「${cat.label}」工作類型`, { description: '此類型已從列表中移除' });
    }
  };

  const toggleModule = (modules: ProjectModuleGroup[], module: ProjectModuleGroup): ProjectModuleGroup[] => {
    return modules.includes(module) ? modules.filter(m => m !== module) : [...modules, module];
  };

  // Stats
  const activeCount = categories.filter(c => c.isActive).length;
  const internalCount = categories.filter(c => c.relationType === 'internal_project').length;
  const projectWebsiteCount = categories.filter(c => c.relationType === 'project_website').length;
  const noneCount = categories.filter(c => c.relationType === 'none').length;

  // Internal projects for preview
  const internalProjects = projects.filter(p => p.projectCategory === 'internal');

  return (
    <div className="space-y-5">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-3.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium">啟用類別</span>
          <div className="text-[22px] font-bold text-teal-600 mt-1">{activeCount}</div>
          <span className="text-[11px] text-muted-foreground">/ {categories.length} 總數</span>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-3.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1"><Globe size={10} className="text-blue-600" />關聯項目+網站</span>
          <div className="text-[22px] font-bold text-blue-600 mt-1">{projectWebsiteCount}</div>
          <span className="text-[11px] text-muted-foreground">顯示所有項目和網站</span>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-3.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1"><Building2 size={10} className="text-teal-600" />僅內部項目</span>
          <div className="text-[22px] font-bold text-teal-600 mt-1">{internalCount}</div>
          <span className="text-[11px] text-muted-foreground">只顯示內部項目</span>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-3.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1"><FolderOpen size={10} className="text-gray-500" />無需關聯</span>
          <div className="text-[22px] font-bold text-gray-600 mt-1">{noneCount}</div>
          <span className="text-[11px] text-muted-foreground">不顯示任何關聯</span>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg border border-teal-100 p-4 flex items-start gap-3">
        <Info size={16} className="text-teal-600 mt-0.5 shrink-0" />
        <div>
          <h4 className="text-[13px] font-bold text-teal-800">工作類型關聯規則</h4>
          <p className="text-[12px] text-teal-700 mt-1">
            在此管理每個工作類型的關聯方式。當同事在「快速匯報」選擇工作類別時，系統會根據以下規則：
          </p>
          <ul className="text-[12px] text-teal-700 mt-1 space-y-0.5 list-disc list-inside">
            <li><strong>關聯項目及網站</strong>：顯示所有項目和網站供選擇（適合客戶工作）</li>
            <li><strong>關聯內部項目</strong>：只顯示內部項目，不顯示客戶項目和網站（適合公司內部事務）</li>
            <li><strong>無需關聯</strong>：不需選擇項目/網站（適合培訓、學習等）</li>
          </ul>
          <p className="text-[12px] text-teal-700 mt-2">
            <strong>項目模塊關聯</strong>：每個工作類型可關聯到一個或多個項目模塊（網站+系統、行銷管理、影片製作），方便在各模塊統計工時和產出。
          </p>
        </div>
      </div>

      {/* Categories Table */}
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

        {/* Add New Form */}
        {showAddNew && (
          <div className="px-5 py-4 border-b border-teal-200 bg-teal-50/30">
            <div className="flex items-center gap-2 mb-3">
              <Plus size={14} className="text-teal-600" />
              <h4 className="text-[13px] font-bold text-teal-800">新增工作類型</h4>
            </div>
            <div className="space-y-3 pl-5">
              {/* Row 1: Icon + Label */}
              <div className="flex items-start gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">圖示</label>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {availableIcons.map(icon => (
                      <button
                        key={icon}
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
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                    placeholder="輸入工作類型名稱..."
                  />
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5 mt-2">描述</label>
                  <input
                    value={newForm.description}
                    onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                    placeholder="工作類型描述..."
                  />
                </div>
              </div>

              {/* Row 2: Color */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">顏色標籤</label>
                <div className="flex flex-wrap gap-1.5">
                  {availableColors.map(c => (
                    <button
                      key={c.color}
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

              {/* Row 3: Relation Type */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">關聯類型</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {(Object.entries(relationTypeLabels) as [CategoryRelationType, typeof relationTypeLabels['none']][]).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setNewForm({ ...newForm, relationType: key })}
                        className={cn(
                          'flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all',
                          newForm.relationType === key
                            ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-200'
                            : 'border-border/60 hover:border-teal-200 hover:bg-muted/20'
                        )}
                      >
                        <Icon size={13} className={cn('mt-0.5 shrink-0', newForm.relationType === key ? 'text-teal-600' : 'text-muted-foreground')} />
                        <div>
                          <span className={cn('text-[11px] font-bold block', newForm.relationType === key ? 'text-teal-700' : 'text-foreground')}>{config.label}</span>
                          <span className="text-[10px] text-muted-foreground">{config.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Associated Modules */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">關聯項目模塊</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(projectModuleGroupConfig) as [ProjectModuleGroup, typeof projectModuleGroupConfig['website_system']][]).map(([key, config]) => {
                    const Icon = config.icon;
                    const isSelected = newForm.associatedModules.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => setNewForm({ ...newForm, associatedModules: toggleModule(newForm.associatedModules, key) })}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all',
                          isSelected
                            ? 'border-teal-400 bg-teal-50 text-teal-700'
                            : 'border-border/60 text-muted-foreground hover:border-teal-200'
                        )}
                      >
                        <Icon size={13} />
                        {config.label}
                        {isSelected && <Check size={11} className="text-teal-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={addNewCategory} disabled={!newForm.label.trim()} className="flex items-center gap-1.5 px-5 py-2 bg-teal-600 text-white rounded-md text-[13px] font-bold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                  <Save size={13} />新增儲存
                </button>
                <button onClick={() => setShowAddNew(false)} className="flex items-center gap-1 px-4 py-2 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors">
                  <X size={12} />取消
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="divide-y divide-border/30">
          {categories.map((cat) => {
            const isEditing = editingId === cat.id;
            const relationConfig = relationTypeLabels[cat.relationType];
            const RelationIcon = relationConfig.icon;
            const isConfirmingDelete = deleteConfirmId === cat.id;

            return (
              <div key={cat.id} className={cn('px-5 py-3 transition-colors', isEditing ? 'bg-amber-50/50' : 'hover:bg-muted/10', !cat.isActive && 'opacity-50')}>
                {isEditing ? (
                  // Edit Mode
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
                        <button onClick={saveEditing} disabled={!editForm.label.trim()} className="flex items-center gap-1 px-4 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm">
                          <Save size={12} />更新儲存
                        </button>
                        <button onClick={cancelEditing} className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors">
                          <X size={12} />取消
                        </button>
                      </div>
                    </div>
                    <div className="pl-11 space-y-3">
                      {/* Icon Selector */}
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">圖示</label>
                        <div className="flex flex-wrap gap-1">
                          {availableIcons.map(icon => (
                            <button
                              key={icon}
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

                      {/* Color Selector */}
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">顏色標籤</label>
                        <div className="flex flex-wrap gap-1.5">
                          {availableColors.map(c => (
                            <button
                              key={c.color}
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

                      {/* Relation Type */}
                      <div>
                        <label className="text-[12px] font-semibold text-muted-foreground block mb-1.5">關聯類型</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {(Object.entries(relationTypeLabels) as [CategoryRelationType, typeof relationTypeLabels['none']][]).map(([key, config]) => {
                            const Icon = config.icon;
                            return (
                              <button
                                key={key}
                                onClick={() => setEditForm({ ...editForm, relationType: key })}
                                className={cn(
                                  'flex items-start gap-2 p-3 rounded-lg border text-left transition-all',
                                  editForm.relationType === key
                                    ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-200'
                                    : 'border-border/60 hover:border-teal-200 hover:bg-muted/20'
                                )}
                              >
                                <Icon size={14} className={cn('mt-0.5 shrink-0', editForm.relationType === key ? 'text-teal-600' : 'text-muted-foreground')} />
                                <div>
                                  <span className={cn('text-[12px] font-bold block', editForm.relationType === key ? 'text-teal-700' : 'text-foreground')}>{config.label}</span>
                                  <span className="text-[11px] text-muted-foreground">{config.description}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Associated Modules */}
                      <div>
                        <label className="text-[12px] font-semibold text-muted-foreground block mb-1.5">關聯項目模塊</label>
                        <div className="flex flex-wrap gap-2">
                          {(Object.entries(projectModuleGroupConfig) as [ProjectModuleGroup, typeof projectModuleGroupConfig['website_system']][]).map(([key, config]) => {
                            const Icon = config.icon;
                            const isSelected = editForm.associatedModules.includes(key);
                            return (
                              <button
                                key={key}
                                onClick={() => setEditForm({ ...editForm, associatedModules: toggleModule(editForm.associatedModules, key) })}
                                className={cn(
                                  'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-medium transition-all',
                                  isSelected
                                    ? 'border-teal-400 bg-teal-50 text-teal-700'
                                    : 'border-border/60 text-muted-foreground hover:border-teal-200'
                                )}
                              >
                                <Icon size={14} />
                                {config.label}
                                {isSelected && <Check size={12} className="text-teal-600" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="text-[12px] font-semibold text-muted-foreground block mb-1">描述</label>
                        <input
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                          placeholder="工作類型描述..."
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-center gap-3">
                    <GripVertical size={14} className="text-muted-foreground/40 cursor-grab shrink-0" />
                    <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-[16px] shrink-0', cat.bg)}>{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold truncate">{cat.label}</span>
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', relationConfig.bg, relationConfig.color)}>
                          <RelationIcon size={10} />
                          {relationConfig.label}
                        </span>
                        {/* Associated Module Badges */}
                        {cat.associatedModules.length > 0 && (
                          <div className="flex items-center gap-1">
                            {cat.associatedModules.map(mod => {
                              const modConfig = projectModuleGroupConfig[mod];
                              const ModIcon = modConfig.icon;
                              return (
                                <span key={mod} className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium', modConfig.bg, modConfig.color)}>
                                  <ModIcon size={9} />
                                  {modConfig.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{cat.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleActive(cat.id)} className={cn('w-9 h-5 rounded-full transition-colors relative', cat.isActive ? 'bg-teal-500' : 'bg-gray-300')} title={cat.isActive ? '點擊停用' : '點擊啟用'}>
                        <span className={cn('absolute w-3.5 h-3.5 rounded-full bg-white top-[3px] transition-transform shadow-sm', cat.isActive ? 'left-[18px]' : 'left-[3px]')} />
                      </button>
                      <button onClick={() => startEditing(cat)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors text-blue-700 text-[11px] font-medium border border-blue-200" title="編輯此類型">
                        <Edit2 size={12} />編輯
                      </button>
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => deleteCategory(cat.id)} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors text-[11px] font-medium border border-rose-200" title="確認刪除">
                            <Check size={11} />確認
                          </button>
                          <button onClick={() => setDeleteConfirmId(null)} className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-[11px] font-medium border border-gray-200" title="取消">
                            <X size={11} />取消
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirmId(cat.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md hover:bg-rose-50 transition-colors text-muted-foreground hover:text-rose-600 text-[11px] font-medium border border-border/40 hover:border-rose-200" title="刪除此類型">
                          <Trash2 size={12} />刪除
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Module Association Summary */}
      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border/50 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
          <h3 className="text-[14px] font-bold flex items-center gap-2">
            <MonitorSmartphone size={14} className="text-blue-600" />
            項目模塊關聯總覽
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            以下顯示每個項目模塊所關聯的工作類型，方便管理各模塊工時歸屬
          </p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.entries(projectModuleGroupConfig) as [ProjectModuleGroup, typeof projectModuleGroupConfig['website_system']][]).map(([key, config]) => {
            const Icon = config.icon;
            const linkedCategories = categories.filter(c => c.associatedModules.includes(key) && c.isActive);
            return (
              <div key={key} className={cn('p-4 rounded-lg border', config.bg, 'border-opacity-60')}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.bg)}>
                    <Icon size={16} className={config.color} />
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
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-border/30">
                  <span className="text-[10px] text-muted-foreground">對應項目類型：</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {config.projectTypes.map(pt => (
                      <span key={pt} className="text-[10px] px-1.5 py-0.5 rounded bg-white/70 border border-border/30 font-medium">{pt}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Internal Projects Preview Panel */}
      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border/50 bg-gradient-to-r from-teal-50/50 to-white">
          <h3 className="text-[14px] font-bold flex items-center gap-2">
            <Building2 size={14} className="text-teal-600" />
            內部項目列表預覽
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            當同事選擇「關聯內部項目」類型的工作類別時，將會看到以下項目列表
          </p>
        </div>
        <div className="p-4">
          {internalProjects.length === 0 ? (
            <p className="text-[13px] text-muted-foreground text-center py-6">暫無內部項目</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {internalProjects.map((proj) => (
                <div key={proj.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/5 hover:border-teal-200 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium block truncate">{proj.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">{(proj as any).brand || '—'}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        proj.status === 'active' ? 'bg-teal-100 text-teal-700' :
                        proj.status === 'planning' ? 'bg-blue-100 text-blue-700' :
                        proj.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                        'bg-amber-100 text-amber-700'
                      )}>
                        {proj.status === 'active' ? '進行中' : proj.status === 'planning' ? '規劃中' : proj.status === 'completed' ? '已完成' : '暫停'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export the relation map so the QuickSubmitForm can use it
export { defaultCategoryRelationMap };
