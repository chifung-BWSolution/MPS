import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdsAdvisorSnapshot } from '@/types/adsAdvisor';
import { AdsCampaignAdvisorChat } from './AdsCampaignAdvisorChat';

export type AdsCampaignAdvisorDockProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: AdsAdvisorSnapshot | null;
  disabled?: boolean;
  conversationKey: string;
};

export function AdsCampaignAdvisorDock({
  open,
  onOpenChange,
  snapshot,
  disabled,
  conversationKey,
}: AdsCampaignAdvisorDockProps) {
  return (
    <div
      className={
        open
          ? 'fixed top-[48px] right-0 bottom-0 z-40 flex w-[400px] max-w-[100vw] flex-col border-l border-[rgba(13,26,45,0.08)] bg-white shadow-lg'
          : 'hidden'
      }
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgba(13,26,45,0.08)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-teal-700">
            <Sparkles size={14} className="shrink-0" />
            AI 廣告顧問
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {snapshot?.campaignName ?? '尚未載入 campaign'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-slate-500 hover:text-slate-800"
          onClick={() => onOpenChange(false)}
          aria-label="關閉"
        >
          <X size={16} />
        </Button>
      </div>
      <AdsCampaignAdvisorChat
        snapshot={snapshot}
        disabled={disabled}
        conversationKey={conversationKey}
      />
    </div>
  );
}
