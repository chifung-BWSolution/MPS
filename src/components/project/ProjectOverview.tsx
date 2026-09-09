import { useMemo, useState, type ReactNode } from 'react';
import {
  Globe, Server, Users, Video, FolderKanban, Plus, Search, Pencil, Trash2, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { useProjectHours } from '@/hooks/useProjectHours';
import { useProjectOrgLabels } from '@/hooks/useProjectOrgLabels';
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
} from '@/hooks/useProjects';
import { ProjectCategoryBadge } from '@/components/ui/project-category-badge';
import { BrandFieldBadge, CompanyFieldBadge, EmptyDash, StatusFieldBadge } from '@/components/ui/nullable-badge';
import { DeleteConfirmModal } from '@/components/ui/crud-modal';
import { ProjectSourceDialog } from '@/components/project/ProjectSourceDialog';

type KindFilter = 'all' | Exclude<ProjectKind, 'manual'>;

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

const kindTabs: { key: KindFilter; label: string; icon?: ReactNode }[] = [
  { key: 'all', label: '全部' },
  { key: 'website', label: '網站', icon: <Globe size={11} /> },
  { key: 'system', label: '系統', icon: <Server size={11} /> },
  { key: 'quotation_client', label: '客戶項目', icon: <Users size={11} /> },
  { key: 'vchannel', label: '影片頻道', icon: <Video size={11} /> },
];

function statusDisplay(status: string) {
  const mapped = statusLabelMap[status];
  if (mapped) return mapped;
  if (!status?.trim()) return null;
  return {
    label: status,
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
  if (!config) return <EmptyDash />;
  return (
    <span className={cn('text-[10px] font-bold rounded-sm border inline-flex items-center gap-1 px-1.5 py-0.5', config.className)}>
      {config.icon}
      {projectKindLabel(kind)}
    </span>
  );
}

function LevelBadge({ level }: { level?: ProjectLevel | null }) {
  const config = level != null ? levelConfig[level] : undefined;
  if (!config) return <EmptyDash />;
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 font-bold rounded-sm border inline-flex items-center gap-0.5', config.className)}>
      {level === 1 && <Star size={10} className="fill-amber-400 text-amber-500" />}
      L{level} {config.label}
    </span>
  );
}

export function ProjectOverview({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  const { selectedCompanyId, selectedBrandId } = useApp();
  const { projects, loading, reload, deleteProject } = useProjects();
  const { companies, brands, companyLabel, brandLabel } = useProjectOrgLabels();
  const { data: hoursMap } = useProjectHours(30);

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState<ProjectLevel[]>([]);
  const [dialog, setDialog] = useState<{ mode: 'add' } | { mode: 'edit'; project: MasterProject } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MasterProject | null>(null);

  const uniqueCompanies = useMemo(() => {
    const ids = new Set(projects.map(p => p.companyListId).filter((id): id is string => !!id));
    return companies
      .filter(c => ids.has(c.uuid) || ids.has(c.id))
      .sort((a, b) => a.companyCode.localeCompare(b.companyCode, 'zh-HK'));
  }, [projects, companies]);
  const uniqueBrands = useMemo(() => {
    const ids = new Set(projects.map(p => p.brandListId).filter((id): id is string => !!id));
    return brands
      .filter(b => ids.has(b.id))
      .filter(b => companyFilter === 'all' || b.companyId === companyFilter)
      .sort((a, b) => a.brandCode.localeCompare(b.brandCode, 'zh-HK'));
  }, [projects, brands, companyFilter]);
  const uniqueStatuses = useMemo(
    () => Array.from(new Set(projects.map(p => p.status).filter(Boolean))).sort(),
    [projects],
  );

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (selectedCompanyId && p.companyListId !== selectedCompanyId) return false;
      if (selectedBrandId && p.brandListId !== selectedBrandId) return false;
      if (kindFilter !== 'all' && projectKindOf(p) !== kindFilter) return false;
      if (companyFilter !== 'all' && p.companyListId !== companyFilter) return false;
      if (brandFilter !== 'all' && p.brandListId !== brandFilter) return false;
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
          || companyLabel(p.companyListId).toLowerCase().includes(q)
          || brandLabel(p.brandListId).toLowerCase().includes(q)
          || (p.clientName || '').toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      const ha = hoursMap[a.id]?.totalHours ?? 0;
      const hb = hoursMap[b.id]?.totalHours ?? 0;
      return hb - ha || a.name.localeCompare(b.name, 'zh-HK');
    });
  }, [projects, hoursMap, kindFilter, companyFilter, brandFilter, statusFilter, levelFilter, searchQuery, selectedCompanyId, selectedBrandId, companyLabel, brandLabel]);

  const toggleLevelFilter = (lvl: ProjectLevel) => {
    setLevelFilter(prev => prev.includes(lvl) ? prev.filter(x => x !== lvl) : [...prev, lvl]);
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
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">項目總覽</h1>
            <p className="text-[14px] text-muted-foreground mt-1">所有項目的統一管理。</p>
          </div>
          <button
            type="button"
            onClick={() => setDialog({ mode: 'add' })}
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
            {uniqueCompanies.map(c => (
              <option key={c.uuid || c.id} value={c.uuid || c.id}>{c.companyCode}</option>
            ))}
          </select>
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
          >
            <option value="all">所有品牌</option>
            {uniqueBrands.map(b => (
              <option key={b.id} value={b.id}>{b.brandCode}</option>
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
                        <LevelBadge level={level} />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        <BrandFieldBadge value={brandLabel(project.brandListId)} />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        <CompanyFieldBadge value={companyLabel(project.companyListId)} />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        <StatusFieldBadge config={status} />
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium cursor-pointer" onClick={() => onSelectProject?.(project.id)}>
                        {hours}h
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setDialog({ mode: 'edit', project })}
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

      {dialog && (
        <ProjectSourceDialog
          mode={dialog.mode}
          project={dialog.mode === 'edit' ? dialog.project : null}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await reload();
            setDialog(null);
          }}
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
