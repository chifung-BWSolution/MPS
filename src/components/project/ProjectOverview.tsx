import { useMemo, useState, type ReactNode } from 'react';
import {
  Globe, Server, Users, Video, FolderKanban, Plus, Search, Pencil, Trash2, Star, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import { useProjectHours } from '@/hooks/useProjectHours';
import {
  useProjects,
  projectCategoryOf,
  projectKindLabel,
  projectKindOf,
  projectLevelOf,
  projectSubtitleOf,
  type MasterProject,
  type ProjectKind,
  type ProjectLevel,
  type ProjectWriteInput,
  type ProjectRelatedType,
} from '@/hooks/useProjects';
import { ProjectCategoryBadge } from '@/components/ui/project-category-badge';
import { DeleteConfirmModal } from '@/components/ui/crud-modal';

type KindFilter = 'all' | ProjectKind;
type CategoryFilter = 'all' | 'internal' | 'client';

const levelConfig: Record<ProjectLevel, { label: string; className: string }> = {
  1: { label: '主打', className: 'border-amber-500 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-800' },
  2: { label: '重要', className: 'border-blue-500 bg-blue-50 text-blue-700' },
  3: { label: '定期推廣', className: 'border-green-500 bg-green-50 text-green-700' },
  4: { label: '不主動', className: 'border-slate-400 bg-slate-50 text-slate-600' },
  5: { label: '已關閉', className: 'border-rose-500 bg-rose-50 text-rose-600 line-through' },
};

const statusLabelMap: Record<string, { label: string; color: string; bgColor: string }> = {
  planning: { label: '規劃中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  active: { label: '進行中', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  on_hold: { label: '暫停', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  completed: { label: '已完成', color: 'text-slate-700', bgColor: 'bg-slate-50' },
  cancelled: { label: '已取消', color: 'text-rose-700', bgColor: 'bg-rose-50' },
  development: { label: '開發中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  live: { label: '已上線', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  maintenance: { label: '維護中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  archived: { label: '已封存', color: 'text-slate-700', bgColor: 'bg-slate-50' },
  initial: { label: '初步提案', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  following_up: { label: '跟進中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  confirmed: { label: '確認項目', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  closed: { label: '已結案', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  paused: { label: '暫停', color: 'text-amber-700', bgColor: 'bg-amber-50' },
};

const statusOptionsByType: Record<ProjectRelatedType, { value: string; label: string }[]> = {
  manual: [
    { value: 'planning', label: '規劃中' },
    { value: 'active', label: '進行中' },
    { value: 'on_hold', label: '暫停' },
    { value: 'completed', label: '已完成' },
    { value: 'cancelled', label: '已取消' },
  ],
  webandsystem: [
    { value: 'development', label: '開發中' },
    { value: 'live', label: '已上線' },
    { value: 'maintenance', label: '維護中' },
    { value: 'archived', label: '已封存' },
  ],
  quotation_client: [
    { value: 'initial', label: '初步提案' },
    { value: 'following_up', label: '跟進中' },
    { value: 'confirmed', label: '確認項目' },
    { value: 'closed', label: '已結案' },
  ],
  vchannel: [
    { value: 'active', label: '進行中' },
    { value: 'paused', label: '暫停' },
    { value: 'archived', label: '已封存' },
  ],
};

const kindTabs: { key: KindFilter; label: string; icon?: ReactNode }[] = [
  { key: 'all', label: '全部' },
  { key: 'website', label: '網站', icon: <Globe size={11} /> },
  { key: 'system', label: '系統', icon: <Server size={11} /> },
  { key: 'quotation_client', label: '客戶項目', icon: <Users size={11} /> },
  { key: 'vchannel', label: '影片頻道', icon: <Video size={11} /> },
  { key: 'manual', label: '自訂', icon: <FolderKanban size={11} /> },
];

function statusDisplay(status: string) {
  return statusLabelMap[status] || {
    label: status || '—',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
  };
}

function KindBadge({ kind }: { kind: ProjectKind }) {
  const styles: Record<ProjectKind, { className: string; icon: ReactNode }> = {
    website: { className: 'bg-teal-50 text-teal-700 border-teal-200', icon: <Globe size={10} /> },
    system: { className: 'bg-purple-50 text-purple-700 border-purple-200', icon: <Server size={10} /> },
    quotation_client: { className: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Users size={10} /> },
    vchannel: { className: 'bg-violet-50 text-violet-700 border-violet-200', icon: <Video size={10} /> },
    manual: { className: 'bg-slate-100 text-slate-700 border-slate-200', icon: <FolderKanban size={10} /> },
  };
  const config = styles[kind];
  return (
    <span className={cn('text-[10px] font-bold rounded-sm border inline-flex items-center gap-1 px-1.5 py-0.5', config.className)}>
      {config.icon}
      {projectKindLabel(kind)}
    </span>
  );
}

function LevelBadge({ level }: { level: ProjectLevel }) {
  const config = levelConfig[level];
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 font-bold rounded-sm border inline-flex items-center gap-0.5', config.className)}>
      {level === 1 && <Star size={10} className="fill-amber-400 text-amber-500" />}
      L{level} {config.label}
    </span>
  );
}

type FormState = {
  name: string;
  clientName: string;
  status: string;
  companyListId: string;
  brandListId: string;
  projectCategory: 'internal' | 'client';
  level: ProjectLevel;
  notes: string;
};

const emptyForm = (): FormState => ({
  name: '',
  clientName: '',
  status: 'planning',
  companyListId: '',
  brandListId: '',
  projectCategory: 'internal',
  level: 3,
  notes: '',
});

function formFromProject(project: MasterProject): FormState {
  const options = statusOptionsByType[project.relatedType];
  const status = options.some(o => o.value === project.status) ? project.status : options[0].value;
  return {
    name: project.name,
    clientName: project.clientName || '',
    status,
    companyListId: project.companyListId || '',
    brandListId: project.brandListId || '',
    projectCategory: projectCategoryOf(project),
    level: projectLevelOf(project) ?? 3,
    notes: typeof project.meta.notes === 'string' ? project.meta.notes : '',
  };
}

function ProjectFormModal({
  mode,
  relatedType,
  initial,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  relatedType: ProjectRelatedType;
  initial: FormState;
  onClose: () => void;
  onSave: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const statusOptions = statusOptionsByType[relatedType];
  const selectedCompany = companies.find(c => c.uuid === form.companyListId || c.id === form.companyListId);
  const availableBrands = brands.filter(b => {
    if (!b.isActive) return false;
    if (!form.companyListId) return true;
    return b.companyId === form.companyListId || b.companyId === selectedCompany?.uuid || b.companyId === selectedCompany?.id;
  });
  const showClientFields = relatedType === 'manual' || relatedType === 'quotation_client' || form.projectCategory === 'client';
  const showCategory = relatedType === 'manual' || relatedType === 'webandsystem';
  const showLevel = relatedType !== 'quotation_client';

  const handleChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">{mode === 'add' ? '新增項目' : '編輯項目'}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {showCategory && (
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">項目類型 *</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('projectCategory', 'internal')}
                  className={cn('flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-medium transition-all', form.projectCategory === 'internal' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-border text-muted-foreground hover:bg-muted/50')}
                >
                  <FolderKanban size={13} /> 內部項目
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('projectCategory', 'client')}
                  className={cn('flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-medium transition-all', form.projectCategory === 'client' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-border text-muted-foreground hover:bg-muted/50')}
                >
                  <Users size={13} /> 客戶項目
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">項目名稱 *</label>
            <input
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              placeholder="輸入項目名稱"
            />
          </div>

          {showClientFields && (
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">客戶名稱</label>
              <input
                value={form.clientName}
                onChange={e => handleChange('clientName', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                placeholder="（選填）"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬公司</label>
              <select
                value={form.companyListId}
                onChange={e => {
                  handleChange('companyListId', e.target.value);
                  handleChange('brandListId', '');
                }}
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
                onChange={e => handleChange('brandListId', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="">選擇品牌</option>
                {availableBrands.map(b => (
                  <option key={b.id} value={b.id}>{b.brandCode} — {b.displayName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={cn('grid gap-4', showLevel ? 'grid-cols-2' : 'grid-cols-1')}>
            {showLevel && (
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">Level 等級</label>
                <select
                  value={form.level}
                  onChange={e => handleChange('level', Number(e.target.value) as ProjectLevel)}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                >
                  <option value={1}>L1 主打</option>
                  <option value={2}>L2 重要</option>
                  <option value={3}>L3 定期推廣</option>
                  <option value={4}>L4 不主動</option>
                  <option value={5}>L5 已關閉</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
              <select
                value={form.status}
                onChange={e => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                {statusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {relatedType === 'manual' && (
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
              <textarea
                value={form.notes}
                onChange={e => handleChange('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white resize-none"
                placeholder="（選填）"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80">
            取消
          </button>
          <button
            type="button"
            disabled={!form.name.trim()}
            onClick={() => onSave(form)}
            className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {mode === 'add' ? '新增' : '儲存變更'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectOverview({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  const { selectedCompanyId, selectedBrandId } = useApp();
  const { projects, loading, addProject, updateProject, deleteProject } = useProjects();
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const { data: hoursMap } = useProjectHours(30);

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState<ProjectLevel[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<MasterProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MasterProject | null>(null);

  const uniqueCompanies = useMemo(
    () => Array.from(new Set(projects.map(p => p.companyName || '').filter(Boolean))).sort(),
    [projects],
  );
  const uniqueBrands = useMemo(
    () => Array.from(new Set(projects.map(p => p.brandName || '').filter(Boolean))).sort(),
    [projects],
  );
  const uniqueStatuses = useMemo(
    () => Array.from(new Set(projects.map(p => p.status).filter(Boolean))).sort(),
    [projects],
  );

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (selectedCompanyId && p.companyListId !== selectedCompanyId) return false;
      if (selectedBrandId && p.brandListId !== selectedBrandId) return false;
      if (kindFilter !== 'all' && projectKindOf(p) !== kindFilter) return false;
      if (categoryFilter !== 'all' && projectCategoryOf(p) !== categoryFilter) return false;
      if (companyFilter !== 'all' && p.companyName !== companyFilter) return false;
      if (brandFilter !== 'all' && p.brandName !== brandFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (levelFilter.length > 0) {
        const level = projectLevelOf(p);
        if (!level || !levelFilter.includes(level)) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const subtitle = projectSubtitleOf(p).toLowerCase();
        return p.name.toLowerCase().includes(q)
          || subtitle.includes(q)
          || (p.brandName || '').toLowerCase().includes(q)
          || (p.companyName || '').toLowerCase().includes(q)
          || (p.clientName || '').toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      const ha = hoursMap[a.id]?.totalHours ?? 0;
      const hb = hoursMap[b.id]?.totalHours ?? 0;
      return hb - ha || a.name.localeCompare(b.name, 'zh-HK');
    });
  }, [projects, hoursMap, kindFilter, categoryFilter, companyFilter, brandFilter, statusFilter, levelFilter, searchQuery, selectedCompanyId, selectedBrandId]);

  const toggleLevelFilter = (lvl: ProjectLevel) => {
    setLevelFilter(prev => prev.includes(lvl) ? prev.filter(x => x !== lvl) : [...prev, lvl]);
  };

  const toWriteInput = (form: FormState): ProjectWriteInput => {
    const company = companies.find(c => c.uuid === form.companyListId || c.id === form.companyListId);
    const brand = brands.find(b => b.id === form.brandListId);
    return {
      name: form.name,
      clientName: form.clientName || null,
      status: form.status,
      companyListId: form.companyListId || null,
      brandListId: form.brandListId || null,
      companyName: company?.companyCode || null,
      brandName: brand?.brandCode || brand?.displayName || null,
      projectCategory: form.projectCategory,
      level: form.level,
      notes: form.notes || null,
    };
  };

  const handleAdd = async (form: FormState) => {
    const result = await addProject(toWriteInput(form));
    if (result.error) {
      toast.error('新增失敗', { description: result.error.message });
      return;
    }
    toast.success('項目已新增');
    setShowAddModal(false);
  };

  const handleEdit = async (form: FormState) => {
    if (!editing) return;
    const result = await updateProject(editing, toWriteInput(form));
    if (result.error) {
      toast.error('儲存失敗', { description: result.error.message });
      return;
    }
    toast.success('項目已更新');
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteProject(deleteTarget);
    if (result.error) {
      toast.error('刪除失敗', { description: result.error.message });
      return;
    }
    toast.success('項目已刪除');
    setDeleteTarget(null);
  };

  const deleteDescription = deleteTarget
    ? deleteTarget.relatedType === 'manual'
      ? `確定要刪除「${deleteTarget.name}」嗎？此操作無法撤銷。`
      : `「${deleteTarget.name}」來自來源模組（${projectKindLabel(projectKindOf(deleteTarget))}）。刪除後會一併從來源資料移除，且無法撤銷。`
    : '';

  return (
    <div>
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">項目總覽</h1>
            <p className="text-[14px] text-muted-foreground mt-1">所有項目的統一管理。</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
          >
            <Plus size={14} />新增項目
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {kindTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setKindFilter(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200 flex items-center gap-1.5',
                kindFilter === tab.key
                  ? (tab.key === 'system' ? 'bg-purple-600 text-white' : 'bg-teal-600 text-white')
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {(['all', 'internal', 'client'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
                categoryFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {cat === 'all' ? '全部' : cat === 'internal' ? '內部項目' : '客戶項目'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[260px] bg-white">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
              placeholder="搜尋項目名稱..."
            />
          </div>
          <select
            value={companyFilter}
            onChange={e => { setCompanyFilter(e.target.value); setBrandFilter('all'); }}
            className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
          >
            <option value="all">所有公司</option>
            {uniqueCompanies.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
          >
            <option value="all">所有品牌</option>
            {uniqueBrands.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
          >
            <option value="all">所有狀態</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>{statusDisplay(status).label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-muted-foreground font-medium">Level 篩選：</span>
          {([1, 2, 3, 4, 5] as ProjectLevel[]).map(lvl => {
            const active = levelFilter.includes(lvl);
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => toggleLevelFilter(lvl)}
                className={cn(
                  'text-[11px] px-2 py-1 rounded-md border font-bold transition-all',
                  active ? `${levelConfig[lvl].className} shadow-sm` : 'border-border bg-white text-muted-foreground hover:border-slate-400',
                )}
              >
                L{lvl} {levelConfig[lvl].label}
              </button>
            );
          })}
          {levelFilter.length > 0 && (
            <button type="button" onClick={() => setLevelFilter([])} className="text-[11px] text-rose-500 hover:underline ml-1">
              清除篩選
            </button>
          )}
        </div>

        <div className="text-[12px] text-muted-foreground">
          {loading ? '載入中…' : `顯示 ${filtered.length} 個項目`}
        </div>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
            從資料庫載入中…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">名稱</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類型</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">項目類型</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">LEVEL</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">工時</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(project => {
                  const kind = projectKindOf(project);
                  const category = projectCategoryOf(project);
                  const level = projectLevelOf(project);
                  const subtitle = projectSubtitleOf(project);
                  const status = statusDisplay(project.status);
                  const hours = Math.round(hoursMap[project.id]?.totalHours ?? 0);
                  return (
                    <tr key={project.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td
                        className="px-4 py-3 cursor-pointer"
                        onClick={() => onSelectProject?.(project.id)}
                      >
                        <span className="text-[13px] font-medium block">{project.name}</span>
                        {subtitle ? <span className="text-[11px] text-teal-600">{subtitle}</span> : null}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        <KindBadge kind={kind} />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        <ProjectCategoryBadge category={category} clientName={project.clientName} size="sm" />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        {level ? <LevelBadge level={level} /> : <span className="text-[11px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        {project.brandName
                          ? <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{project.brandName}</span>
                          : <span className="text-[11px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        {project.companyName
                          ? <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{project.companyName}</span>
                          : <span className="text-[11px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', status.bgColor, status.color)}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        {hours}h
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setEditing(project)}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors"
                            title="編輯項目"
                          >
                            <Pencil size={13} className="text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(project)}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors"
                            title="刪除項目"
                          >
                            <Trash2 size={13} className="text-rose-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                      沒有符合條件的項目
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <ProjectFormModal
          mode="add"
          relatedType="manual"
          initial={emptyForm()}
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
        />
      )}
      {editing && (
        <ProjectFormModal
          mode="edit"
          relatedType={editing.relatedType}
          initial={formFromProject(editing)}
          onClose={() => setEditing(null)}
          onSave={handleEdit}
        />
      )}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { void handleDelete(); }}
        itemName={deleteTarget?.name || ''}
        canDelete
        description={deleteDescription}
      />
    </div>
  );
}
