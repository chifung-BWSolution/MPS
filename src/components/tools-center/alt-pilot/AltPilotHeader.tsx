import { Activity, History, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
            用整頁文案與圖片畫面生成 ALT，半自動填入 Framer。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-medium text-teal-700">
            <Activity size={12} />
            今日 {usage ? formatAltQuota(usage.today, usage.limit) : '—'}
          </span>
          {settings ? (
            <span className="hidden rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
              {settings.enabled ? settings.model : '已停用'}
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

      <p className="text-[11px] text-muted-foreground">
        第一期只處理公開頁面的 <code className="rounded bg-white px-1 py-0.5">&lt;img&gt;</code>；背景圖、iframe、SVG 不支援。Framer 沒有公開的伺服器端 alt API，所以填入是「匯出對照表 → 人工貼上」。
      </p>
    </div>
  );
}
