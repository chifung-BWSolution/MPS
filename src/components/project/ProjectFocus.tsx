import { useState, useMemo } from 'react';
import { TrendingUp, Clock, DollarSign, Eye, UserPlus, FileText, Flame, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { companies, brands, statusConfig } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import { useDataStore } from '@/context/DataStore';
import { ProjectCategoryBadge } from '@/components/ui/project-category-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ProjectFocus({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  const { selectedCompanyId, selectedBrandId } = useApp();
  const { projects: allProjects } = useDataStore();
  const [timeRange, setTimeRange] = useState<string>('14');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');

  // Sample projects intentionally hidden from 近期焦點
  const HIDDEN_PROJECT_NAMES = new Set([
    'ZFT 品牌官網開發',
    'BW Google Ads 投放',
    'ACI 微信公眾號營運',
    'BSC 企業形象影片',
    'BW SEO 全面升級',
    'FCC 紅酒品鑑會',
    'ACI 品牌推廣活動',
  ]);

  // Only show incomplete (active / planning / on_hold) projects
  const incompleteProjects = useMemo(() => {
    return allProjects.filter(p => {
      if (HIDDEN_PROJECT_NAMES.has(p.name)) return false;
      if (p.status === 'completed' || p.status === 'cancelled') return false;
      if (selectedCompanyId && p.companyId !== selectedCompanyId) return false;
      if (selectedBrandId && p.brandId !== selectedBrandId) return false;
      if (categoryFilter !== 'all' && p.projectCategory !== categoryFilter) return false;
      return true;
    });
  }, [allProjects, selectedCompanyId, selectedBrandId, categoryFilter]);

  // Simulate man-hour growth based on selected time range
  const projectsWithGrowth = useMemo(() => {
    const daysFactor = parseInt(timeRange) / 14;
    return incompleteProjects.map(p => {
      const seed = p.id.charCodeAt(0) + p.id.charCodeAt(1);
      const growth = Math.round(((seed % 38) + 2) * daysFactor);
      const totalHours = Math.round((p.budgetUsed || 0) / 150 * 8 + growth * 2);
      const budgetUsagePercent = p.budgetTotal ? Math.round(((p.budgetUsed || 0) / p.budgetTotal) * 100) : 0;
      const lastUpdateDays = (seed % 5);
      const lastUpdateDate = new Date();
      lastUpdateDate.setDate(lastUpdateDate.getDate() - lastUpdateDays);
      return {
        ...p,
        growth,
        totalHours,
        budgetUsagePercent,
        isHighActivity: totalHours > 50,
        lastUpdate: lastUpdateDate.toLocaleDateString('zh-HK'),
      };
    }).sort((a, b) => b.growth - a.growth);
  }, [incompleteProjects, timeRange]);

  const getCompanyName = (companyId: string) => companies.find(c => c.id === companyId)?.companyNameZh || '—';
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.brandNameZh || '—';

  return (
    <div className="space-y-5">
      {/* Category Quick Switch Tabs */}
      <div className="flex items-center gap-1.5">
        {(['all', 'internal', 'client'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
              categoryFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {cat === 'all' ? '全部' : cat === 'internal' ? '內部項目' : '客戶項目'}
          </button>
        ))}
      </div>

      {/* Summary Stats + Time Range Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">進行中項目</span>
            <p className="text-[18px] font-bold">{projectsWithGrowth.length}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">{timeRange}天總工時增長</span>
            <p className="text-[18px] font-bold text-teal-600">
              +{projectsWithGrowth.reduce((s, p) => s + p.growth, 0)}h
            </p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">預算警告</span>
            <p className="text-[18px] font-bold text-amber-600">
              {projectsWithGrowth.filter(p => p.budgetUsagePercent >= 80).length}
            </p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">🔥 高活躍</span>
            <p className="text-[18px] font-bold text-orange-600">
              {projectsWithGrowth.filter(p => p.isHighActivity).length}
            </p>
          </div>
        </div>

        {/* Time Range Filter */}
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="h-8 text-[12px] w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">過去 7 天</SelectItem>
            <SelectItem value="14">過去 14 天</SelectItem>
            <SelectItem value="30">過去 30 天</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project List sorted by growth */}
      <div className="space-y-3">
        {projectsWithGrowth.map((project) => {
          const sConfig = statusConfig[project.status] || statusConfig.active;
          const budgetColor = project.budgetUsagePercent >= 100 ? 'text-red-600' :
            project.budgetUsagePercent >= 80 ? 'text-amber-600' : 'text-teal-600';

          return (
            <div
              key={project.id}
              className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 hover:shadow-card-hover transition-all duration-200 cursor-pointer group"
              onClick={() => onSelectProject?.(project.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-[14px] font-bold">{project.name}</h4>
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded', sConfig.bgColor, sConfig.textColor)}>
                      {sConfig.label}
                    </span>
                    <ProjectCategoryBadge category={project.projectCategory} clientName={project.clientName} size="sm" />
                    {project.isHighActivity && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700 flex items-center gap-0.5">
                        <Flame size={10} /> 高活躍
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span>{getCompanyName(project.companyId)}</span>
                    <span>•</span>
                    <span>{getBrandName(project.brandId)}</span>
                    {project.clientName && (
                      <>
                        <span>•</span>
                        <span>客戶: {project.clientName}</span>
                      </>
                    )}
                  </div>
                  {/* Last update + Assignee */}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      最近更新: {project.lastUpdate}
                    </span>
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {project.assignedPm || '未分配'}
                    </span>
                  </div>
                </div>

                {/* Quick actions + Growth indicators */}
                <div className="flex items-center gap-3">
                  {/* Quick action buttons - visible on hover */}
                  <div className="hidden group-hover:flex items-center gap-1 mr-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectProject?.(project.id); }}
                      className="p-1.5 bg-white border border-border rounded shadow-sm hover:bg-muted transition-colors"
                      title="查看詳情"
                    >
                      <Eye size={12} className="text-teal-600" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); }}
                      className="p-1.5 bg-white border border-border rounded shadow-sm hover:bg-muted transition-colors"
                      title="分配任務"
                    >
                      <UserPlus size={12} className="text-blue-600" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); }}
                      className="p-1.5 bg-white border border-border rounded shadow-sm hover:bg-muted transition-colors"
                      title="提交工時"
                    >
                      <FileText size={12} className="text-purple-600" />
                    </button>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1 text-teal-600">
                      <TrendingUp size={12} />
                      <span className="text-[14px] font-bold">+{project.growth}h</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{timeRange}天增長</span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <Clock size={12} className="text-muted-foreground" />
                      <span className="text-[14px] font-bold">{project.totalHours}h</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">總工時</span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <DollarSign size={12} className={budgetColor} />
                      <span className={cn('text-[14px] font-bold', budgetColor)}>
                        {project.budgetUsagePercent}%
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">預算使用</span>
                  </div>
                </div>
              </div>

              {/* Budget progress bar */}
              <div className="mt-3">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      project.budgetUsagePercent >= 100 ? 'bg-red-500' :
                      project.budgetUsagePercent >= 80 ? 'bg-amber-500' : 'bg-teal-600'
                    )}
                    style={{ width: `${Math.min(project.budgetUsagePercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {projectsWithGrowth.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          沒有進行中的項目
        </div>
      )}
    </div>
  );
}
