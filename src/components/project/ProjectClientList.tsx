import { Plus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { ProjectPlanning } from './ProjectPlanning';
import { useClientProjects } from '@/hooks/useClientProjects';

export function ProjectClientList({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  const { navigateTo } = useApp();
  const { projects, loading, updateProject, deleteProject } = useClientProjects();

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-teal-600" />
          <span className="text-[12px] text-muted-foreground">
            表格整合「服務類型及數量」與「交付時間表」，點擊項目可查看完整詳情
          </span>
        </div>
        <Button
          size="sm"
          className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 text-[13px] transition-all duration-200 active:scale-[0.97]"
          onClick={() => navigateTo('project', 'new-client')}
        >
          <Plus size={14} />
          新增客戶項目
        </Button>
      </div>
      <ProjectPlanning
        onSelectProject={onSelectProject}
        forcedCategory="client"
        projects={projects}
        loading={loading}
        updateProject={updateProject}
        deleteProject={deleteProject}
      />
    </div>
  );
}
