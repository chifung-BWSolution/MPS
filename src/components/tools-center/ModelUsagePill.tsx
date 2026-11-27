import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { rankUsedAltModels, type AltModelUsagePoint } from '@/lib/altModels.ts';

export function ModelUsagePill({
  modelUsage,
  enabled = true,
}: {
  modelUsage: AltModelUsagePoint[];
  enabled?: boolean;
}) {
  if (!enabled) {
    return (
      <span className="inline-flex rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-muted-foreground">
        已停用
      </span>
    );
  }

  const ranked = rankUsedAltModels(modelUsage);
  const label = ranked.lastModel ?? '尚未使用';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 max-w-[11rem] min-w-0 items-center gap-1 rounded-full border border-border bg-white px-2.5 text-[11px] text-muted-foreground"
          title={label}
          aria-label="實際使用的模型"
        >
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown size={12} className="shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[120] w-max max-w-[90vw]">
        {ranked.models.length === 0 ? (
          <DropdownMenuItem disabled className="whitespace-nowrap">尚未有生成紀錄</DropdownMenuItem>
        ) : (
          ranked.models.map((item) => (
            <DropdownMenuItem
              key={`${item.rank}-${item.model}`}
              className="w-full justify-between gap-3 whitespace-nowrap text-[12px]"
            >
              <span>{item.model}</span>
              <span className="shrink-0">{item.mark}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
