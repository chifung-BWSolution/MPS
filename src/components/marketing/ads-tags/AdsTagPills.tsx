import { adsTagColorClass } from '@/types/adsTags';
import type { AdsTag } from '@/types/adsTags';
import { cn } from '@/lib/utils';

export function AdsTagPills({
  tags,
  empty = '—',
}: {
  tags: AdsTag[];
  empty?: string;
}) {
  if (tags.length === 0) {
    return <span className="text-muted-foreground">{empty}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium',
            adsTagColorClass(tag.color),
            !tag.isActive && 'opacity-60',
          )}
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
}
