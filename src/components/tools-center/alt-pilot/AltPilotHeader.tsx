import { Activity, ChevronDown, History, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { rankUsedAltModels, type AltModelUsagePoint } from '@/lib/altModels.ts';
import type { AltSettingsRow, AltUsageSummary } from '@/lib/altTypes.ts';
import { formatAltQuota } from '@/lib/altQuota.ts';
import type { WebsiteProfileFull } from '@/types/app';
import { PageAnalyzeForm } from './PageAnalyzeForm';

function AltModelPill({
  enabled,
  modelUsage,
}: {
  enabled: boolean;
  modelUsage: AltModelUsagePoint[];
}) {
  if (!enabled) {
    return (
      <span className="hidden rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
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
          className="hidden h-7 max-w-[11rem] min-w-0 items-center gap-1 rounded-full border border-border bg-white px-2.5 text-[11px] text-muted-foreground sm:inline-flex"
          title={label}
          aria-label="實際使用的模型"
        >
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown size={12} className="shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[120] w-56">
        {ranked.models.length === 0 ? (
          <DropdownMenuItem disabled>尚未有生成紀錄</DropdownMenuItem>
        ) : (
          ranked.models.map((item) => (
            <DropdownMenuItem
              key={item.model}
              className="min-w-0 text-[12px]"
              title={item.model}
            >
              <span className="min-w-0 truncate">{item.model}</span>
              <span className="shrink-0">{item.mark}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface AltPilotHeaderProps {
  sites: WebsiteProfileFull[];
  sitesLoading: boolean;
  siteId: string;
  onSiteIdChange: (siteId: string) => void;
  url: string;
  onUrlChange: (url: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  usage: AltUsageSummary | null;
  settings: AltSettingsRow | null;
  /** 這次（或最近一次）生成實際呼叫過的模型，依時間排序。 */
  modelUsage?: AltModelUsagePoint[];
  onHistory: () => void;
  disabled?: boolean;
}

export function AltPilotHeader({
  sites,
  sitesLoading,
  siteId,
  onSiteIdChange,
  url,
  onUrlChange,
  onAnalyze,
  analyzing,
  usage,
  settings,
  modelUsage = [],
  onHistory,
  disabled = false,
}: AltPilotHeaderProps) {
  return (
    <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 border-b border-[rgba(13,26,45,0.06)] bg-[#f5f8fc]/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0D9488]/10 text-[#0D9488]">
              <ScanSearch size={16} />
            </span>
            <h1 className="text-[32px] font-bold leading-none tracking-tight">ALT Pilot</h1>
          </div>
          <p className="mt-1 text-[14px] text-muted-foreground">
            用整頁文案與圖片畫面生成 ALT，匯出後貼進 Framer。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-medium text-teal-700"
            title={usage ? `AI 生成 ${formatAltQuota(usage.today, usage.limit)}` : undefined}
          >
            <Activity size={12} />
            今日已分析 {usage ? (usage.analyses ?? usage.today) : '—'}
          </span>
          {settings ? <AltModelPill enabled={settings.enabled} modelUsage={modelUsage} /> : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onHistory}
            className="h-8 gap-1.5 bg-white"
          >
            <History size={14} />
            歷史紀錄
          </Button>
        </div>
      </div>

      <PageAnalyzeForm
        sites={sites}
        sitesLoading={sitesLoading}
        siteId={siteId}
        onSiteIdChange={onSiteIdChange}
        url={url}
        onUrlChange={onUrlChange}
        onAnalyze={onAnalyze}
        analyzing={analyzing}
        disabled={disabled}
      />


    </div>
  );
}
