import { useState } from 'react';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Project } from '@/types/app';
import { useApp } from '@/context/AppContext';
import { companies, brands, projectTypeLabels, statusConfig, priorityConfig } from '@/data/mockData';
import { ProjectCategoryBadge } from '@/components/ui/project-category-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';

type ProjectPlanningProps = {
  onSelectProject?: (projectId: string) => void;
  forcedCategory?: 'internal' | 'client';
  projects: Project[];
  loading: boolean;
  updateProject: (id: string, updates: Partial<Project>) => Promise<unknown>;
  deleteProject: (id: string) => Promise<unknown>;
};

export function ProjectPlanning({ onSelectProject, forcedCategory, projects, loading: projectsLoading, updateProject, deleteProject }: ProjectPlanningProps) {
  const { navigateTo, selectedCompanyId, selectedBrandId } = useApp();
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; reasons: string[] }>({ canDelete: true, reasons: [] });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleEdit = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditingProject({ ...project });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (editingProject) {
      await updateProject(editingProject.id, editingProject);
      setShowEditModal(false);
      setEditingProject(null);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setDeleteTarget(project);
    setDeleteCheck({ canDelete: true, reasons: [] });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (deleteTarget) {
      await deleteProject(deleteTarget.id);
    }
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const filteredProjects = projects.filter(p => {
    // Forced category filter (from ProjectInternalList / ProjectClientList)
    if (forcedCategory && p.projectCategory !== forcedCategory) return false;
    // Global filter from TopNav
    if (selectedCompanyId && p.companyId !== selectedCompanyId) return false;
    if (selectedBrandId && p.brandId !== selectedBrandId) return false;
    // Local filters
    if (filterCompany !== 'all' && p.companyId !== filterCompany) return false;
    if (filterBrand !== 'all' && p.brandId !== filterBrand) return false;
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (!forcedCategory && filterCategory !== 'all' && p.projectCategory !== filterCategory) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const availableBrands = filterCompany !== 'all'
    ? brands.filter(b => b.companyId === filterCompany)
    : brands;

  const activeCount = filteredProjects.filter(p => p.status === 'active').length;
  const completedCount = filteredProjects.filter(p => p.status === 'completed').length;

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
        從資料庫載入中…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">進行中</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{activeCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">已完成</span>
          <span className="text-[22px] font-bold block mt-1">{completedCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">總項目數</span>
          <span className="text-[22px] font-bold block mt-1">{filteredProjects.length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">總預算</span>
          <span className="text-[22px] font-bold block mt-1">${(filteredProjects.reduce((s, p) => s + p.budgetTotal, 0) / 1000).toFixed(0)}K</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋項目..."
              className="pl-8 h-8 text-[13px] w-[180px]"
            />
          </div>
          <Select value={filterCompany} onValueChange={(val) => { setFilterCompany(val); setFilterBrand('all'); }}>
            <SelectTrigger className="h-8 text-[12px] w-[140px]">
              <SelectValue placeholder="公司" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有公司</SelectItem>
              {companies.filter(c => c.isActive).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.companyCode} - {c.companyNameZh}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="h-8 text-[12px] w-[130px]">
              <SelectValue placeholder="品牌" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有品牌</SelectItem>
              {availableBrands.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.brandCode} - {b.brandNameZh}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-[12px] w-[120px]">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有狀態</SelectItem>
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 text-[12px] w-[120px]">
              <SelectValue placeholder="類別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有類別</SelectItem>
              <SelectItem value="internal">內部發展</SelectItem>
              <SelectItem value="client">客戶項目</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
            onClick={() => navigateTo('project', forcedCategory === 'client' ? 'new-client' : 'new')}
          >
            <Plus size={14} />
            新增項目
          </Button>
        </div>
      </div>

      {/* Table View */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">項目名稱</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類別</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">服務類型及數量</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">交付時間</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">收費</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">PM</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">進度</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">優先</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project) => {
                const config = statusConfig[project.status];
                const budgetPercent = project.budgetTotal > 0 ? Math.round((project.budgetUsed / project.budgetTotal) * 100) : 0;
                const brandItem = brands.find(b => b.id === project.brandId);
                const companyItem = companies.find(c => c.id === project.companyId);
                // Service items summary
                const serviceItems = project.serviceItems || [];
                const serviceTypeSummary = serviceItems.length > 0
                  ? serviceItems.map(si => `${projectTypeLabels[si.serviceType] || si.serviceType} ×${si.quantity}`).join('、')
                  : (projectTypeLabels[project.projectType] || '-');
                // Delivery date: latest from serviceItems or endDate
                const deliveryDates = serviceItems.filter(si => si.deliveryDate).map(si => si.deliveryDate);
                const latestDelivery = deliveryDates.length > 0
                  ? deliveryDates.sort((a, b) => b.localeCompare(a))[0]
                  : project.endDate;
                const earliestDelivery = deliveryDates.length > 0
                  ? deliveryDates.sort((a, b) => a.localeCompare(b))[0]
                  : project.startDate;

                return (
                  <tr
                    key={project.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => onSelectProject?.(project.id)}
                  >
                    <td className="px-4 py-3">
                      <span className="text-[12px] font-medium text-muted-foreground">{companyItem?.companyCode || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: brandItem?.primaryColor }} />
                        <span className="text-[12px] font-medium">{project.brand}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] font-medium">{project.name}</span>
                      {project.clientName && (
                        <span className="text-[10px] text-muted-foreground block mt-0.5">客戶: {project.clientName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ProjectCategoryBadge category={project.projectCategory} clientName={project.clientName} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      {serviceItems.length > 0 ? (
                        <div className="space-y-0.5">
                          {serviceItems.slice(0, 3).map((si, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 font-medium whitespace-nowrap">
                                {projectTypeLabels[si.serviceType] || si.serviceType}
                              </span>
                              <span className="text-[10px] text-muted-foreground">×{si.quantity}{si.unit}</span>
                            </div>
                          ))}
                          {serviceItems.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{serviceItems.length - 3} 項...</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{projectTypeLabels[project.projectType] || '-'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {serviceItems.length > 0 && deliveryDates.length > 0 ? (
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-medium text-[#0d1a2d]">
                            {earliestDelivery === latestDelivery
                              ? earliestDelivery
                              : `${earliestDelivery} ~ ${latestDelivery}`}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {deliveryDates.length} 個交付節點
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground">
                          {project.startDate} → {project.endDate || '待定'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {project.billingModel ? (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', project.billingModel === 'one_time' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700')}>
                          {project.billingModel === 'one_time' ? '一次性' : project.billingFrequency === 'monthly' ? '每月' : project.billingFrequency === 'quarterly' ? '每季' : project.billingFrequency === 'semi_annual' ? '每半年' : '每年'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px]">{project.assignedPm}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', config.color)} style={{ width: `${project.progress}%` }} />
                        </div>
                        <span className="text-[11px] font-medium">{project.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', priorityConfig[project.priority].color)}>
                        {priorityConfig[project.priority].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.textColor)}>{config.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => handleEdit(e, project)} className="p-1 hover:bg-muted rounded transition-colors" title="編輯">
                          <Edit size={12} className="text-teal-600" />
                        </button>
                        <button onClick={(e) => handleDeleteClick(e, project)} className="p-1 hover:bg-muted rounded transition-colors" title="刪除">
                          <Trash2 size={12} className="text-rose-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      {/* Edit Modal */}
      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯項目" size="lg">
        {editingProject && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">項目名稱</label>
                <Input value={editingProject.name} onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">客戶名稱</label>
                <Input value={editingProject.clientName || ''} onChange={(e) => setEditingProject({ ...editingProject, clientName: e.target.value })} className="h-9 text-[13px]" placeholder="（選填）" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">公司</label>
                <Select value={editingProject.companyId} onValueChange={(val) => setEditingProject({ ...editingProject, companyId: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{companies.filter(c => c.isActive).map(c => <SelectItem key={c.id} value={c.id}>{c.companyCode} - {c.companyNameZh}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌</label>
                <Select value={editingProject.brandId} onValueChange={(val) => setEditingProject({ ...editingProject, brandId: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{brands.filter(b => b.companyId === editingProject.companyId).map(b => <SelectItem key={b.id} value={b.id}>{b.brandCode} - {b.brandNameZh}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
                <Select value={editingProject.status} onValueChange={(val: any) => setEditingProject({ ...editingProject, status: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(statusConfig).map(([key, cfg]) => <SelectItem key={key} value={key}>{cfg.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">優先級</label>
                <Select value={editingProject.priority} onValueChange={(val: any) => setEditingProject({ ...editingProject, priority: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(priorityConfig).map(([key, cfg]) => <SelectItem key={key} value={key}>{cfg.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">進度 (%)</label>
                <Input type="number" min={0} max={100} value={editingProject.progress} onChange={(e) => setEditingProject({ ...editingProject, progress: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">總預算 (HKD)</label>
                <Input type="number" value={editingProject.budgetTotal} onChange={(e) => setEditingProject({ ...editingProject, budgetTotal: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">已用預算 (HKD)</label>
                <Input type="number" value={editingProject.budgetUsed} onChange={(e) => setEditingProject({ ...editingProject, budgetUsed: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveEdit}>儲存變更</Button>
            </div>
          </div>
        )}
      </CrudModal>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.name || ''}
        canDelete={deleteCheck.canDelete}
        reasons={deleteCheck.reasons}
      />
    </div>
  );
}
