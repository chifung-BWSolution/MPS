import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { ProjectFocus } from './ProjectFocus';
import { ProjectDetail } from './ProjectDetail';
import { ProjectProgress } from './ProjectProgress';
import { ProjectInternalList } from './ProjectInternalList';
import { ProjectClientList } from './ProjectClientList';

const SELECTED_PROJECT_KEY = 'mps_selected_project_id';
const PREVIOUS_LIST_KEY = 'mps_previous_list_submodule';

const readSession = (key: string) => {
  try { return sessionStorage.getItem(key); } catch { return null; }
};
const writeSession = (key: string, value: string | null) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch { /* ignore */ }
};

export function ProjectModule({ subModule }: { subModule?: string }) {
  const { navigateTo } = useApp();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => readSession(SELECTED_PROJECT_KEY));
  const [previousListSubModule, setPreviousListSubModule] = useState<string>(() => readSession(PREVIOUS_LIST_KEY) || 'focus');

  useEffect(() => { writeSession(SELECTED_PROJECT_KEY, selectedProjectId); }, [selectedProjectId]);
  useEffect(() => { writeSession(PREVIOUS_LIST_KEY, previousListSubModule); }, [previousListSubModule]);

  const handleSelectProject = (projectId: string) => {
    if (subModule === 'internal') setPreviousListSubModule('internal');
    else if (subModule === 'client') setPreviousListSubModule('client');
    else if (subModule === 'progress') setPreviousListSubModule('progress');
    else setPreviousListSubModule('focus');
    setSelectedProjectId(projectId);
    navigateTo('project', 'detail');
  };

  const handleBackToList = () => {
    setSelectedProjectId(null);
    navigateTo('project', previousListSubModule);
  };

  const renderContent = () => {
    switch (subModule) {
      case 'focus':
        return <ProjectFocus onSelectProject={handleSelectProject} />;
      case 'new':
      case 'new-client':
        return (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-6 space-y-3 max-w-xl">
            <h2 className="text-[16px] font-bold">項目由來源模組維護</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              `projects` 主表為自動同步投影，請到對應模組新增或更新來源資料：
            </p>
            <ul className="text-[13px] space-y-1.5 list-disc pl-5 text-muted-foreground">
              <li>網站/系統 → 網站+系統模組（webandsystem_list）</li>
              <li>客戶項目 → 客戶報價模組（quotation_client_project）</li>
              <li>影片頻道 → 影片頻道模組（vchannels）</li>
            </ul>
            <button
              type="button"
              onClick={handleBackToList}
              className="mt-2 text-[13px] font-medium text-teal-700 hover:underline"
            >
              返回項目列表
            </button>
          </div>
        );
      case 'internal':
        return <ProjectInternalList onSelectProject={handleSelectProject} />;
      case 'client':
        return <ProjectClientList onSelectProject={handleSelectProject} />;
      case 'progress':
        return <ProjectProgress onSelectProject={handleSelectProject} />;
      case 'planning':
        return <ProjectFocus onSelectProject={handleSelectProject} />;
      case 'detail':
        return <ProjectDetail projectId={selectedProjectId || undefined} onBack={handleBackToList} />;
      default:
        return <ProjectFocus onSelectProject={handleSelectProject} />;
    }
  };

  const getTitle = () => {
    switch (subModule) {
      case 'focus': return { title: '近期焦點', subtitle: '依 day report 工時增長排序，快速掌握活躍項目。' };
      case 'new':
      case 'new-client': return { title: '新增項目', subtitle: '請至來源模組建立；此處僅顯示同步後的 projects。' };
      case 'internal': return { title: '內部焦點項目', subtitle: '網站/系統與影片頻道（同步自來源表）。' };
      case 'client': return { title: '客戶項目列表', subtitle: '已確認的客戶報價項目。' };
      case 'progress': return { title: '項目進度', subtitle: '以 day report 工時檢視各項目進度。' };
      case 'planning': return { title: '年度計劃', subtitle: '改以近期焦點檢視工時活躍項目。' };
      case 'detail': return { title: '項目詳情', subtitle: '工時活動與團隊貢獻（來自 day_report_entries）。' };
      default: return { title: '近期焦點', subtitle: '依 day report 工時增長排序，快速掌握活躍項目。' };
    }
  };

  const { title, subtitle } = getTitle();

  return (
    <div className="space-y-6">
      {subModule !== 'detail' && (
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
      )}
      {renderContent()}
    </div>
  );
}
