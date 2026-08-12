import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Folder, Clock, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import {
  useMyProjectsFromDayReports,
  type MyProjectRow,
} from '@/hooks/useMyProjectsFromDayReports';
import { relatedTypeLabels, type ProjectRelatedType } from '@/hooks/useProjects';

const SELECTED_PROJECT_KEY = 'mps_selected_project_id';

function writeSelectedProject(projectId: string) {
  try {
    sessionStorage.setItem(SELECTED_PROJECT_KEY, projectId);
  } catch {
    /* ignore */
  }
}

function HoursShareBar({ myHours, teamHours }: { myHours: number; teamHours: number }) {
  const pct = teamHours > 0 ? Math.min(100, Math.round((myHours / teamHours) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground">
          我的工時 {myHours}h / 項目總工時 {teamHours}h
        </span>
        <span className="font-medium tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-teal-600 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: MyProjectRow;
  onOpen: (id: string) => void;
}) {
  const meta = [project.brandName || project.companyName, project.clientName]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card
      className="hover:shadow-md transition-shadow duration-200 cursor-pointer"
      onClick={() => onOpen(project.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded bg-teal-50 flex items-center justify-center shrink-0">
              <Folder className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-[15px] font-semibold leading-tight truncate">
                {project.name}
              </CardTitle>
              <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                {meta || '—'}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-sm bg-teal-50 text-teal-700 shrink-0">
            {project.relatedTypeLabel}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <HoursShareBar myHours={project.myHours} teamHours={project.teamHours} />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{project.contributorCount} 人參與 · {project.myEntryCount} 筆我的紀錄</span>
          <span className="flex items-center gap-1 shrink-0">
            <Clock size={11} />
            最近匯報：
            {project.myLastReportDate
              ? new Date(project.myLastReportDate).toLocaleDateString('zh-HK')
              : '—'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function MyProjects() {
  const { navigateTo, selectedCompanyId, selectedBrandId } = useApp();
  const { projects, loading, error, stats } = useMyProjectsFromDayReports();
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectRelatedType>('all');

  const displayProjects = useMemo(() => {
    return projects.filter((p) => {
      if (typeFilter !== 'all' && p.relatedType !== typeFilter) return false;
      if (selectedCompanyId && p.companyListId !== selectedCompanyId) return false;
      if (selectedBrandId && p.brandListId !== selectedBrandId) return false;
      return true;
    });
  }, [projects, typeFilter, selectedCompanyId, selectedBrandId]);

  const openProject = (projectId: string) => {
    writeSelectedProject(projectId);
    navigateTo('project', 'detail');
  };

  return (
    <div className="space-y-5">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-1 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">我的項目</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            依日報工時顯示您參與的項目，並對比個人與項目總工時
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'webandsystem', 'quotation_client', 'vchannel'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setTypeFilter(cat)}
              className={cn(
                'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
                typeFilter === cat
                  ? 'bg-teal-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {cat === 'all' ? '全部' : relatedTypeLabels[cat]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="text-[12px] text-muted-foreground">參與項目</div>
              <div className="text-[24px] font-bold text-teal-600 mt-0.5 tabular-nums">
                {stats.projectCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[12px] text-muted-foreground">我的總工時</div>
              <div className="text-[24px] font-bold text-foreground mt-0.5 tabular-nums">
                {stats.myTotalHours}h
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[12px] text-muted-foreground">項目總工時</div>
              <div className="text-[24px] font-bold text-foreground mt-0.5 tabular-nums">
                {stats.teamTotalHours}h
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[12px] text-muted-foreground">近 30 天我的工時</div>
              <div className="text-[24px] font-bold text-teal-700 mt-0.5 tabular-nums">
                {stats.myRecentHours}h
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
          載入我的項目工時中…
        </div>
      ) : error ? (
        <div className="text-center py-12 text-[13px] text-rose-600">
          載入失敗：{error}
        </div>
      ) : displayProjects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-[14px]">
          尚無日報工時關聯的項目。
          <button
            type="button"
            onClick={() => navigateTo('day-report', 'submit')}
            className="ml-2 text-teal-600 font-medium hover:underline"
          >
            前往提交日報
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayProjects.map((project) => (
            <ProjectCard key={project.id} project={project} onOpen={openProject} />
          ))}
        </div>
      )}
    </div>
  );
}
