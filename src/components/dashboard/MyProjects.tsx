import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Folder } from 'lucide-react';
import { useDataStore } from '@/context/DataStore';
import { useApp } from '@/context/AppContext';
import { useMemo } from 'react';
import { companies, brands } from '@/data/mockData';

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: '進行中', color: 'bg-teal-100 text-teal-700' },
  on_hold: { label: '暫停', color: 'bg-amber-100 text-amber-700' },
  completed: { label: '已完成', color: 'bg-slate-100 text-slate-600' },
  planning: { label: '規劃中', color: 'bg-blue-100 text-blue-700' },
  cancelled: { label: '已取消', color: 'bg-rose-100 text-rose-600' },
};

const typeLabels: Record<string, string> = {
  web_design: '網站設計',
  marketing: '市場推廣',
  system: '系統開發',
  video: '影片製作',
  seo_upgrade: 'SEO 升級',
  event: '活動策劃',
  branding: '品牌設計',
  graphic_design: '平面設計',
  social_media: '社交媒體',
  edm: 'EDM',
  paid_ads: '付費廣告',
  wine: '葡萄酒',
  other: '其他',
};

export function MyProjects() {
  const { projects } = useDataStore();
  const { navigateTo } = useApp();

  const activeProjects = useMemo(() => projects.filter(p => p.status === 'active'), [projects]);
  const planningProjects = useMemo(() => projects.filter(p => p.status === 'planning'), [projects]);
  const onHoldProjects = useMemo(() => projects.filter(p => p.status === 'on_hold'), [projects]);
  const completedProjects = useMemo(() => projects.filter(p => p.status === 'completed'), [projects]);

  const displayProjects = useMemo(() => {
    return projects.filter(p => p.status !== 'cancelled').slice(0, 6);
  }, [projects]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">我的項目</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          查看您目前負責及參與的所有項目進度
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-[13px] text-muted-foreground">進行中</div>
            <div className="text-[28px] font-bold text-teal-600 mt-1">{activeProjects.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[13px] text-muted-foreground">規劃中</div>
            <div className="text-[28px] font-bold text-blue-600 mt-1">{planningProjects.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[13px] text-muted-foreground">暫停</div>
            <div className="text-[28px] font-bold text-amber-600 mt-1">{onHoldProjects.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[13px] text-muted-foreground">已完成</div>
            <div className="text-[28px] font-bold text-slate-600 mt-1">{completedProjects.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Project Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayProjects.map((project) => {
          const brand = brands.find(b => b.id === project.brandId);
          const company = companies.find(c => c.id === project.companyId);
          return (
            <Card
              key={project.id}
              className="hover:shadow-md transition-shadow duration-200 cursor-pointer"
              onClick={() => navigateTo('project', 'focus')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-teal-50 flex items-center justify-center">
                      <Folder className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <CardTitle className="text-[15px] font-semibold leading-tight">
                        {project.name}
                      </CardTitle>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {brand?.displayName || company?.companyNameZh || project.clientName || '—'}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-[11px] ${(statusConfig[project.status] || statusConfig.active).color}`}
                  >
                    {(statusConfig[project.status] || statusConfig.active).label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">
                      {typeLabels[project.projectType] || project.projectType}
                    </span>
                    <span className="text-muted-foreground">
                      預算: HK${project.budgetUsed.toLocaleString()} / ${project.budgetTotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground">完成度</span>
                      <span className="font-medium">{project.progress}%</span>
                    </div>
                    <Progress value={project.progress} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {displayProjects.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[14px]">
          暫無項目。
          <button
            onClick={() => navigateTo('project', 'new')}
            className="ml-2 text-teal-600 font-medium hover:underline"
          >
            立即新增
          </button>
        </div>
      )}
    </div>
  );
}
