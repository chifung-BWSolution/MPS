import { ProjectPlanning } from './ProjectPlanning';
import { useCompanyProjects } from '@/hooks/useCompanyProjects';

export function ProjectInternalList({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  const { projects, loading, updateProject, deleteProject } = useCompanyProjects();

  return (
    <ProjectPlanning
      onSelectProject={onSelectProject}
      forcedCategory="internal"
      projects={projects}
      loading={loading}
      updateProject={updateProject}
      deleteProject={deleteProject}
    />
  );
}
