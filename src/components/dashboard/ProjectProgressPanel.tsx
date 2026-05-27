import { cn } from '@/lib/utils';
import { useDataStore } from '@/context/DataStore';
import { useApp } from '@/context/AppContext';
import { useMemo } from 'react';
import { brands } from '@/data/mockData';

const statusConfig = {
  on_track: { label: '正常', color: 'bg-teal-600', textColor: 'text-teal-700', bgColor: 'bg-teal-50' },
  at_risk: { label: '有風險', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50' },
  delayed: { label: '延遲', color: 'bg-rose-500', textColor: 'text-rose-700', bgColor: 'bg-rose-50' },
  completed: { label: '已完成', color: 'bg-slate-500', textColor: 'text-slate-700', bgColor: 'bg-slate-50' },
  planning: { label: '規劃中', color: 'bg-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50' },
  on_hold: { label: '暫停', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50' },
};

function getDisplayStatus(p: { status: string; progress: number; budgetUsed: number; budgetTotal: number }) {
  if (p.status === 'completed') return 'completed';
  if (p.status === 'planning') return 'planning';
  if (p.status === 'on_hold') return 'on_hold';
  const budgetRate = p.budgetTotal > 0 ? p.budgetUsed / p.budgetTotal : 0;
  if (budgetRate >= 1 || p.progress < 25) return 'delayed';
  if (budgetRate >= 0.8) return 'at_risk';
  return 'on_track';
}

export function ProjectProgressPanel() {
  const { projects } = useDataStore();
  const { navigateTo, selectedCompanyId, selectedBrandId } = useApp();

  const filteredProjects = useMemo(() => {
    return projects
      .filter(p => {
        if (p.status === 'cancelled') return false;
        if (selectedCompanyId && p.companyId !== selectedCompanyId) return false;
        if (selectedBrandId && p.brandId !== selectedBrandId) return false;
        return true;
      })
      .slice(0, 6);
  }, [projects, selectedCompanyId, selectedBrandId]);

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[18px] font-bold">即時專案進度</h3>
        <button
          onClick={() => navigateTo('project', 'focus')}
          className="text-[13px] text-teal-600 font-medium hover:underline"
        >
          查看全部
        </button>
      </div>
      {filteredProjects.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-muted-foreground">暫無符合條件的項目</div>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map((project) => {
            const displayStatus = getDisplayStatus(project);
            const config = statusConfig[displayStatus as keyof typeof statusConfig] || statusConfig.on_track;
            const brand = brands.find(b => b.id === project.brandId);
            return (
              <div
                key={project.id}
                className="space-y-1.5 cursor-pointer group"
                onClick={() => navigateTo('project', 'focus')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium group-hover:text-teal-600 transition-colors">{project.name}</span>
                    <span className={cn(
                      'text-[11px] font-medium px-1.5 py-0.5 rounded-sm',
                      config.bgColor, config.textColor
                    )}>
                      {config.label}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {brand?.brandCode || project.assignedPm || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', config.color)}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-medium text-muted-foreground w-8 text-right">
                    {project.progress}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
