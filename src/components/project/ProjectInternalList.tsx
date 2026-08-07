import { ProjectMasterList } from './ProjectMasterList';

export function ProjectInternalList({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  return (
    <ProjectMasterList
      relatedTypes={['webandsystem', 'vchannel']}
      onSelectProject={onSelectProject}
      showTypeFilter
    />
  );
}
