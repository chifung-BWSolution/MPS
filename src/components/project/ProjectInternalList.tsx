import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { ProjectPlanning } from './ProjectPlanning';
import { useCompanyProjects } from '@/hooks/useCompanyProjects';

export function ProjectInternalList({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  const { navigateTo } = useApp();
  const { projects, loading, updateProject, deleteProject } = useCompanyProjects();

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 text-[13px] transition-all duration-200 active:scale-[0.97]"
          onClick={() => navigateTo('project', 'new')}
        >
          <Plus size={14} />
          新增內部項目
        </Button>
      </div>
      <ProjectPlanning
        onSelectProject={onSelectProject}
        forcedCategory="internal"
        projects={projects}
        loading={loading}
        updateProject={updateProject}
        deleteProject={deleteProject}
      />
    </div>
  );
}
