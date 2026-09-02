import { cn } from '@/lib/utils';
import { EmptyDash } from '@/components/ui/nullable-badge';

export type ProjectCategoryType = 'internal' | 'client' | 'unknown';

interface ProjectCategoryBadgeProps {
  category: ProjectCategoryType;
  clientName?: string;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

const categoryConfig: Record<ProjectCategoryType, { label: string; badgeClass: string }> = {
  internal: {
    label: '內部',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-300',
  },
  client: {
    label: '客戶',
    badgeClass: 'bg-orange-50 text-orange-700 border-purple-300',
  },
  unknown: {
    label: '未關聯項目',
    badgeClass: 'bg-gray-50 text-gray-500 border-gray-300',
  },
};

export function ProjectCategoryBadge({ category, clientName, size = 'default', className }: ProjectCategoryBadgeProps) {
  const config = category ? categoryConfig[category] : undefined;
  if (!config) return <EmptyDash />;
  const sizeClasses = size === 'sm' ? 'text-[9px] px-1.5 py-0' : size === 'lg' ? 'text-[12px] px-2.5 py-1' : 'text-[10px] px-2 py-0.5';

  return (
    <span className={cn('font-bold rounded border inline-flex items-center gap-1', sizeClasses, config.badgeClass, className)}>
      {config.label}
      {category === 'client' && clientName && (
        <span className="font-medium opacity-80">• {clientName}</span>
      )}
    </span>
  );
}

/**
 * Helper to resolve projectCategory from a projectId.
 * Pass in the projects array from mockData.
 */
export function getProjectCategory(projectId: string | undefined, projects: { id: string; projectCategory: 'internal' | 'client'; clientName?: string }[]): { category: ProjectCategoryType; clientName?: string } {
  if (!projectId) return { category: 'unknown' };
  const project = projects.find(p => p.id === projectId);
  if (!project) return { category: 'unknown' };
  return { category: project.projectCategory, clientName: project.clientName };
}
