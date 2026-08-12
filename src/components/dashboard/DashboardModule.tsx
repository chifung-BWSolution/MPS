import { KPIStatsGrid } from './KPIStatsGrid';
import { ProjectProgressPanel } from './ProjectProgressPanel';
import { QuickActions } from './QuickActions';
import { RecentActivity } from './RecentActivity';
import { MyProjects } from './MyProjects';
import { ProjectMessages } from './ProjectMessages';
import { OutputUpdates } from './OutputUpdates';
import { useApp } from '@/context/AppContext';

interface DashboardModuleProps {
  subModule?: string;
}

function DashboardOverview() {
  const { user } = useApp();

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">儀表板</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          歡迎回來，{user.name}。以下是您的專案總覽。
        </p>
      </div>

      {/* KPI Stats */}
      <KPIStatsGrid />

      {/* Quick Actions */}
      <QuickActions />

      {/* Project Progress (full width) */}
      <ProjectProgressPanel />

      {/* Recent Activity */}
      <RecentActivity />
    </div>
  );
}

export function DashboardModule({ subModule }: DashboardModuleProps) {
  switch (subModule) {
    case 'my-projects':
      return <MyProjects />;
    case 'messages':
      return <ProjectMessages />;
    case 'updates':
      return <OutputUpdates />;
    case 'overview':
    default:
      return <DashboardOverview />;
  }
}
