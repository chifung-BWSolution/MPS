import { InternalPlans } from './InternalPlans';
import { PromoSchedule } from './PromoSchedule';
import { UpdateFrequency } from './UpdateFrequency';
import { KpiTargets } from './KpiTargets';
import { ManhourTemplates } from './ManhourTemplates';
import { AiEfficiency } from './AiEfficiency';
import { SalesGpTargets } from './SalesGpTargets';
import { TeamReports } from './TeamReports';

interface PlanningCenterModuleProps {
  subModule?: string;
}

export function PlanningCenterModule({ subModule }: PlanningCenterModuleProps) {
  switch (subModule) {
    case 'internal-plans':
      return <InternalPlans />;
    case 'promo-schedule':
      return <PromoSchedule />;
    case 'update-frequency':
      return <UpdateFrequency />;
    case 'kpi-targets':
      return <KpiTargets />;
    case 'manhour-templates':
      return <ManhourTemplates />;
    case 'ai-efficiency':
      return <AiEfficiency />;
    case 'sales-gp':
      return <SalesGpTargets />;
    case 'team-reports':
      return <TeamReports />;
    default:
      return <InternalPlans />;
  }
}
