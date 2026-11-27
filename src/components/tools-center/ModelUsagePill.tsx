import { useRef, useState } from 'react';
import { rankUsedAltModels, type AltModelUsagePoint } from '@/lib/altModels.ts';
import { connectedModelMenu, type TextLlmProvider } from '@/lib/llmProviderOrder';
import { cn } from '@/lib/utils';

export function ModelUsagePill({
  modelUsage,
  enabled = true,
  models,
}: {
  modelUsage: AltModelUsagePoint[];
  enabled?: boolean;
  /** 還沒呼叫過時，各供應商要顯示的具體型號。 */
  models?: Partial<Record<TextLlmProvider, string>>;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!enabled) {
    return (
      <span className="inline-flex rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-muted-foreground">
        已停用
      </span>
    );
  }

  const ranked = rankUsedAltModels(modelUsage);
  const menu = connectedModelMenu(modelUsage, models);
  const label = ranked.lastModel ?? '尚未使用';

  const showMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hideMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div className="relative" onMouseEnter={showMenu} onMouseLeave={hideMenu}>
      <span
        className="inline-flex h-7 max-w-[11rem] min-w-0 items-center gap-1 rounded-full border border-border bg-white px-2.5 text-[11px] text-muted-foreground"
        title={label}
        aria-label="實際使用的模型"
      >
        <span className="min-w-0 truncate">{label}</span>
      </span>
      {open ? (
        <div
          role="menu"
          aria-label="已接入的模型"
          className="absolute right-0 top-full z-[120] mt-1 w-max max-w-[90vw] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {menu.items.map((item) => (
            <div
              key={item.id}
              role="menuitem"
              className={cn(
                'whitespace-nowrap rounded-sm px-2 py-1.5 text-[12px]',
                item.muted ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {item.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
