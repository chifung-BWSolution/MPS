import { ProjectMasterList } from './ProjectMasterList';

export function ProjectInternalList({ onSelectProject }: { onSelectProject?: (projectId: string, event?: import('@/lib/appNavigation').ModifierClickEvent) => void }) {
  return (
    <ProjectMasterList
      relatedTypes={['webandsystem', 'vchannel']}
      onSelectProject={onSelectProject}
      showTypeFilter
    />
  );
}
