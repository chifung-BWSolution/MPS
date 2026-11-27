import { Activity, History, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModelUsagePill } from '@/components/tools-center/ModelUsagePill';
import type { AltModelUsagePoint } from '@/lib/altModels.ts';
import type { AltSettingsRow, AltUsageSummary } from '@/lib/altTypes.ts';
import { formatAltQuota } from '@/lib/altQuota.ts';
import type { WebsiteProfileFull } from '@/types/app';
import { PageAnalyzeForm } from './PageAnalyzeForm';

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
          {settings ? (
            <span className="hidden sm:inline-flex">
              <ModelUsagePill
                enabled={settings.enabled}
                modelUsage={modelUsage}
                models={{
                  ...(settings.model.toLowerCase().startsWith('grok') ? { grok: settings.model } : {}),
                }}
              />
            </span>
          ) : null}
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
