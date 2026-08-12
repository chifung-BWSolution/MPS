import { AppProvider, useApp } from '@/context/AppContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardModule } from '@/components/dashboard/DashboardModule';
import { DayReportModule } from '@/components/day-report/DayReportModule';
import { QuotationModule } from '@/components/quotation/QuotationModule';
import { ProjectModule } from '@/components/project/ProjectModule';
import { PlanningCenterModule } from '@/components/planning-center/PlanningCenterModule';
import { WebsiteModule } from '@/components/website/WebsiteModule';
import { ArticlesModule } from '@/components/articles/ArticlesModule';
import { MarketingModule } from '@/components/marketing/MarketingModule';
import { VideoModule } from '@/components/video/VideoModule';
import { TalentModule } from '@/components/talent/TalentModule';
import { SupplierModule } from '@/components/supplier/SupplierModule';
import { ReportModule } from '@/components/report/ReportModule';
import { ToolsCenterModule } from '@/components/tools-center/ToolsCenterModule';
import { FinanceModule } from '@/components/finance/FinanceModule';
import { SettingsModule } from '@/components/settings/SettingsModule';

function ModuleRouter() {
  const { currentModule, currentSubModule } = useApp();

  switch (currentModule) {
    case 'dashboard':
      return <DashboardModule subModule={currentSubModule} />;
    case 'day-report':
      return <DayReportModule subModule={currentSubModule} />;
    case 'quotation':
      return <QuotationModule subModule={currentSubModule} />;
    case 'project':
      return <ProjectModule subModule={currentSubModule} />;
    case 'planning-center':
      return <PlanningCenterModule subModule={currentSubModule} />;
    case 'website':
      return <WebsiteModule subModule={currentSubModule} />;
    case 'articles':
      return <ArticlesModule />;
    case 'marketing':
      return <MarketingModule subModule={currentSubModule} />;
    case 'video':
      return <VideoModule subModule={currentSubModule} />;
    case 'talent':
      return <TalentModule subModule={currentSubModule} />;
    case 'supplier':
      return <SupplierModule subModule={currentSubModule} />;
    case 'report':
      return <ReportModule subModule={currentSubModule} />;
    case 'tools-center':
      return <ToolsCenterModule subModule={currentSubModule} />;
    case 'finance':
      return <FinanceModule subModule={currentSubModule} />;
    case 'settings':
      return <SettingsModule subModule={currentSubModule} />;
    default:
      return <DashboardModule />;
  }
}

function Home() {
  return (
    <AppProvider>
      <AppLayout>
        <ModuleRouter />
      </AppLayout>
    </AppProvider>
  );
}

export default Home;
