import { cn } from '@/lib/utils';
import { AppLink } from '@/components/AppLink';
import { useRecentActivity } from '@/hooks/useRecentActivity';

export function RecentActivity() {
  const { items, loading } = useRecentActivity();

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[18px] font-bold">近期活動</h3>
        <AppLink
          module="report"
          subModule="performance"
          className="text-[13px] text-teal-600 font-medium hover:underline"
        >
          查看全部
        </AppLink>
      </div>
      <div className="space-y-0">
        {loading ? (
          <div className="py-6 text-center text-[12px] text-muted-foreground">載入中…</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-muted-foreground">暫無近期活動</div>
        ) : (
          items.map((item, idx) => {
            const rowClass = cn(
              'flex items-center gap-3 py-2.5 hover:bg-muted/30 rounded transition-colors px-1 no-underline text-inherit',
              item.navModule && 'cursor-pointer',
              idx < items.length - 1 && 'border-b border-border/50',
            );
            const body = (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[13px]">
                    <span className="font-medium">{item.user}</span>
                    <span className="text-muted-foreground"> {item.action}</span>
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">{item.time}</span>
              </>
            );
            if (item.navModule) {
              return (
                <AppLink
                  key={item.id}
                  module={item.navModule}
                  subModule={item.navSubModule}
                  className={rowClass}
                >
                  {body}
                </AppLink>
              );
            }
            return (
              <div key={item.id} className={rowClass}>
                {body}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
