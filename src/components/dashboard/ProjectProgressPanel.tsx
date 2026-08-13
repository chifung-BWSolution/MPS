import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useProjects, relatedTypeLabels } from '@/hooks/useProjects';
import { useProjectHours } from '@/hooks/useProjectHours';
import { useProjectOrgLabels } from '@/hooks/useProjectOrgLabels';

export function ProjectProgressPanel() {
  const { navigateTo, selectedCompanyId, selectedBrandId } = useApp();
  const { projects, loading: projectsLoading } = useProjects({ activeOnly: true });
  const { data: hoursMap, loading: hoursLoading } = useProjectHours(30);
  const { orgLine } = useProjectOrgLabels();

  const rows = useMemo(() => {
    return projects
      .filter((p) => {
        if (selectedCompanyId && p.companyListId !== selectedCompanyId) return false;
        if (selectedBrandId && p.brandListId !== selectedBrandId) return false;
        return true;
      })
      .map((p) => {
        const stat = hoursMap[p.id];
        const teamHours = Math.round((stat?.totalHours ?? 0) * 10) / 10;
        const myHours = Math.round((stat?.myHours ?? 0) * 10) / 10;
        return {
          ...p,
          teamHours,
          myHours,
          growthHours: Math.round(stat?.growthHours ?? 0),
          mySharePct: teamHours > 0 ? Math.round((myHours / teamHours) * 100) : 0,
          lastUpdate: stat?.lastUpdate
            ? new Date(stat.lastUpdate).toLocaleDateString('zh-HK')
            : '—',
        };
      })
      .filter((p) => p.teamHours > 0)
      .sort((a, b) => b.teamHours - a.teamHours)
      .slice(0, 6);
  }, [projects, hoursMap, selectedCompanyId, selectedBrandId]);

  const loading = projectsLoading || hoursLoading;

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[18px] font-bold">即時專案進度</h3>
        <button
          onClick={() => navigateTo('project', 'progress')}
          className="text-[13px] text-teal-600 font-medium hover:underline"
        >
          查看全部
        </button>
      </div>
      {loading ? (
        <div className="text-center py-8 text-[13px] text-muted-foreground">載入工時進度中…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-muted-foreground">尚無工時進度資料</div>
      ) : (
        <div className="space-y-4">
          {rows.map((project) => {
            const meta = [relatedTypeLabels[project.relatedType], orgLine(project.companyListId, project.brandListId)]
              .filter(Boolean)
              .join(' · ');
            return (
              <div
                key={project.id}
                className="space-y-1.5 cursor-pointer group"
                onClick={() => navigateTo('project', 'progress')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-medium group-hover:text-teal-600 transition-colors truncate">
                      {project.name}
                    </span>
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-sm bg-teal-50 text-teal-700 shrink-0">
                      有工時
                    </span>
                  </div>
                  <span className="text-[12px] font-semibold text-foreground shrink-0 tabular-nums">
                    {project.mySharePct}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500 bg-teal-600')}
                      style={{ width: `${project.mySharePct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-teal-600 w-[7.5rem] text-right shrink-0 tabular-nums">
                    {project.myHours}h / {project.teamHours}h
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{meta || '—'}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Clock size={11} /> 最近匯報：{project.lastUpdate}
                    {project.growthHours > 0 ? ` · +${project.growthHours}h / 30天` : ''}
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
