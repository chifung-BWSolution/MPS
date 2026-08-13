import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { ProjectFocus } from './ProjectFocus';
import { ProjectDetail } from './ProjectDetail';
import { ProjectProgress } from './ProjectProgress';
import { ProjectInternalList } from './ProjectInternalList';
import { ProjectClientList } from './ProjectClientList';
import { ProjectOverview } from './ProjectOverview';

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
  const [previousListSubModule, setPreviousListSubModule] = useState<string>(() => readSession(PREVIOUS_LIST_KEY) || 'overview');

  useEffect(() => { writeSession(SELECTED_PROJECT_KEY, selectedProjectId); }, [selectedProjectId]);
  useEffect(() => { writeSession(PREVIOUS_LIST_KEY, previousListSubModule); }, [previousListSubModule]);

  const handleSelectProject = (projectId: string) => {
    if (subModule === 'internal') setPreviousListSubModule('internal');
    else if (subModule === 'client') setPreviousListSubModule('client');
    else if (subModule === 'progress') setPreviousListSubModule('progress');
    else if (subModule === 'focus') setPreviousListSubModule('focus');
    else setPreviousListSubModule('overview');
    setSelectedProjectId(projectId);
    navigateTo('project', 'detail');
  };

  const handleBackToList = () => {
    setSelectedProjectId(null);
    navigateTo('project', previousListSubModule);
  };

  const renderContent = () => {
    switch (subModule) {
      case 'overview':
        return <ProjectOverview onSelectProject={handleSelectProject} />;
      case 'focus':
        return <ProjectFocus onSelectProject={handleSelectProject} />;
      case 'new':
      case 'new-client':
        return (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-6 space-y-3 max-w-xl">
            <h2 className="text-[16px] font-bold">請到項目總覽新增</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              請使用「項目總覽」頁面新增、編輯或刪除項目。網站/系統、客戶報價與影片頻道仍可在來源模組維護，並會同步到此列表。
            </p>
            <ul className="text-[13px] space-y-1.5 list-disc pl-5 text-muted-foreground">
              <li>自訂項目 → 專案策劃／項目總覽</li>
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
        return <ProjectOverview onSelectProject={handleSelectProject} />;
    }
  };

  const getTitle = () => {
    switch (subModule) {
      case 'overview': return { title: '項目總覽', subtitle: '所有項目的統一管理。' };
      case 'focus': return { title: '近期焦點', subtitle: '依 day report 工時增長排序，快速掌握活躍項目。' };
      case 'new':
      case 'new-client': return { title: '新增項目', subtitle: '請至來源模組建立；此處僅顯示同步後的 projects。' };
      case 'internal': return { title: '內部焦點項目', subtitle: '網站/系統與影片頻道（同步自來源表）。' };
      case 'client': return { title: '客戶項目列表', subtitle: '已確認的客戶報價項目。' };
      case 'progress': return { title: '項目進度', subtitle: '以 day report 工時檢視各項目進度。' };
      case 'planning': return { title: '年度計劃', subtitle: '改以近期焦點檢視工時活躍項目。' };
      case 'detail': return { title: '項目詳情', subtitle: '工時活動與團隊貢獻（來自 day_report_entries）。' };
      default: return { title: '項目總覽', subtitle: '所有項目的統一管理。' };
    }
  };

  const { title, subtitle } = getTitle();

  return (
    <div className="space-y-6">
      {subModule !== 'detail' && subModule !== 'overview' && (
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
      )}
      {renderContent()}
    </div>
  );
}
