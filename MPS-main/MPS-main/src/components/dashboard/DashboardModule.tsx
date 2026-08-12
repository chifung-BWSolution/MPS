import { KPIStatsGrid } from './KPIStatsGrid';
import { ProjectProgressPanel } from './ProjectProgressPanel';
import { NotificationCenter } from './NotificationCenter';
import { QuickActions } from './QuickActions';
import { RecentActivity } from './RecentActivity';
import { MyProjects } from './MyProjects';

interface DashboardModuleProps {
  subModule?: string;
}

function DashboardOverview() {
  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">儀表板</h1>
        <p className="text-[14px] text-muted-foreground mt-1">歡迎回來，偉明。以下是您的專案總覽。</p>
      </div>

      {/* KPI Stats */}
      <KPIStatsGrid />

      {/* Quick Actions */}
      <QuickActions />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Project Progress (2/3 width) */}
        <div className="lg:col-span-2">
          <ProjectProgressPanel />
        </div>
        {/* Right: Notifications (1/3 width) */}
        <div className="lg:col-span-1">
          <NotificationCenter />
        </div>
      </div>

      {/* Recent Activity */}
      <RecentActivity />
    </div>
  );
}

export function DashboardModule({ subModule }: DashboardModuleProps) {
  switch (subModule) {
    case 'my-projects':
      return <MyProjects />;
    case 'overview':
    default:
      return <DashboardOverview />;
  }
}
