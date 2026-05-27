import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { ProjectPlanning } from './ProjectPlanning';
import { ProjectNewWizard } from './ProjectNewWizard';
import { ProjectNewClientWizard } from './ProjectNewClientWizard';
import { ProjectDetail } from './ProjectDetail';
import { ProjectProgress } from './ProjectProgress';
import { ProjectFocus } from './ProjectFocus';
import { ProjectInternalList } from './ProjectInternalList';
import { ProjectClientList } from './ProjectClientList';
import { useProjects } from '@/hooks/useProjects';

export function ProjectModule({ subModule }: { subModule?: string }) {
  const { navigateTo } = useApp();
  const { projects: allProjects, loading: allLoading, updateProject: allUpdate, deleteProject: allDelete } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [previousListSubModule, setPreviousListSubModule] = useState<string>('focus');

  const handleSelectProject = (projectId: string) => {
    // Remember which list we came from
    if (subModule === 'internal') setPreviousListSubModule('internal');
    else if (subModule === 'client') setPreviousListSubModule('client');
    else setPreviousListSubModule('focus');
    setSelectedProjectId(projectId);
    navigateTo('project', 'detail');
  };

  const handleBackToList = () => {
    setSelectedProjectId(null);
    navigateTo('project', previousListSubModule);
  };

  const handleBackToClientList = () => {
    setSelectedProjectId(null);
    navigateTo('project', 'client');
  };

  const renderContent = () => {
    switch (subModule) {
      case 'focus':
        return <ProjectFocus onSelectProject={handleSelectProject} />;
      case 'new':
        return <ProjectNewWizard onBack={handleBackToList} />;
      case 'new-client':
        return <ProjectNewClientWizard onBack={handleBackToClientList} />;
      case 'internal':
        return <ProjectInternalList onSelectProject={handleSelectProject} />;
      case 'client':
        return <ProjectClientList onSelectProject={handleSelectProject} />;
      case 'progress':
        return <ProjectProgress />;
      case 'planning':
        return <ProjectPlanning projects={allProjects} loading={allLoading} updateProject={allUpdate} deleteProject={allDelete} />;
      case 'detail':
        return <ProjectDetail projectId={selectedProjectId || undefined} onBack={handleBackToList} />;
      default:
        return <ProjectFocus onSelectProject={handleSelectProject} />;
    }
  };

  const getTitle = () => {
    switch (subModule) {
      case 'focus': return { title: '近期焦點', subtitle: '按14天工時增長排序，快速掌握活躍項目。' };
      case 'new': return { title: '新增項目', subtitle: '三步驟新增項目（公司 → 品牌 → 項目資料）。' };
      case 'new-client': return { title: '新增客戶項目', subtitle: '客戶專屬流程（公司與品牌 → 客戶資料 → 項目詳情與收費模式）。' };
      case 'internal': return { title: '內部項目列表', subtitle: '管理所有內部發展項目。' };
      case 'client': return { title: '客戶項目列表', subtitle: '管理所有客戶項目。' };
      case 'progress': return { title: '項目進度', subtitle: '看板與甘特圖視圖管理任務進度。' };
      case 'planning': return { title: '年度計劃', subtitle: '設定年度目標及追蹤達成率。' };
      case 'detail': return { title: '項目詳情', subtitle: '項目詳情與進度追蹤。' };
      default: return { title: '近期焦點', subtitle: '按14天工時增長排序，快速掌握活躍項目。' };
    }
  };

  const { title, subtitle } = getTitle();

  return (
    <div className="space-y-6">
      {subModule !== 'detail' && subModule !== 'new' && subModule !== 'new-client' && (
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
      )}
      {renderContent()}
    </div>
  );
}
