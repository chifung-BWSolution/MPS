import { FileText } from 'lucide-react';
import { ProjectMasterList } from './ProjectMasterList';

export function ProjectClientList({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText size={14} className="text-teal-600" />
        <span className="text-[12px] text-muted-foreground">
          來自報價客戶項目（quotation_client_project）同步；點擊可查看工時與團隊匯報
        </span>
      </div>
      <ProjectMasterList
        relatedTypes={['quotation_client']}
        onSelectProject={onSelectProject}
      />
    </div>
  );
}
