import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Layers,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { FramerIrSection } from '@/types/readdyFramer';

interface LayersPanelProps {
  sections: FramerIrSection[];
  hoveredSectionId: string | null;
  selectedSectionId: string | null;
  syncingAll: boolean;
  onHoverSection: (id: string | null) => void;
  onSelectSection: (id: string) => void;
  onSyncSingleSection: (stepIndex: number) => void;
}

export function LayersPanel({
  sections,
  hoveredSectionId,
  selectedSectionId,
  syncingAll,
  onHoverSection,
  onSelectSection,
  onSyncSingleSection,
}: LayersPanelProps) {
  const [expandedJsonIds, setExpandedJsonIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleJson = (id: string) => {
    setExpandedJsonIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyJson = async (section: FramerIrSection) => {
    await navigator.clipboard.writeText(JSON.stringify(section, null, 2));
    setCopiedId(section.id);
    toast.success(`已複製「${section.name}」IR JSON`);
    setTimeout(() => setCopiedId((cur) => (cur === section.id ? null : cur)), 1800);
  };

  return (
    <div className="flex flex-col h-full min-h-[420px] xl:min-h-0 rounded-xl border border-slate-200/90 bg-slate-50/40 overflow-hidden">
      {/* Sub-header */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
        <span className="text-[12px] font-bold text-[#101B2D]">
          Layers · 分步區塊 ({sections.length})
        </span>
        <span className="text-[11px] text-slate-400">懸停聯動右側畫布中框</span>
      </div>

      {/* Body */}
      {sections.length === 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-8 text-center">
          <div className="w-11 h-11 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center mb-3">
            <Layers size={18} className="text-slate-400" />
          </div>
          <p className="text-[13px] font-semibold text-[#101B2D]">暫無解析圖層</p>
          <p className="text-[11.5px] text-slate-400 mt-1.5 max-w-[240px] leading-relaxed">
            支援從 GitHub 導入、上傳代碼文件或貼上源碼後，點擊左側「解析代碼並生成結構化區塊」
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 max-h-[680px] xl:max-h-none">
          {sections.map((section, idx) => {
            const isHovered = hoveredSectionId === section.id;
            const isSelected = selectedSectionId === section.id;
            const isExpanded = Boolean(expandedJsonIds[section.id]);
            const isSyncing = section.syncStatus === 'syncing';
            const isSynced = section.syncStatus === 'synced';
            const isFailed = section.syncStatus === 'failed';
            const progressVal = isSynced ? 100 : isSyncing ? 55 : 0;

            return (
              <div
                key={section.id}
                onMouseEnter={() => onHoverSection(section.id)}
                onMouseLeave={() => onHoverSection(null)}
                onClick={() => onSelectSection(section.id)}
                className={cn(
                  'rounded-lg border bg-white p-3.5 transition-all cursor-pointer space-y-2.5',
                  isHovered || isSelected
                    ? 'border-[#0BB59B] ring-2 ring-[#0BB59B]/15 shadow-sm'
                    : 'border-slate-200/90 hover:border-slate-300',
                )}
              >
                {/* Card Top Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[#101B2D] text-white font-mono text-[11px] font-bold shrink-0">
                      {String(section.step || idx + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-bold text-[#101B2D] truncate">
                          {section.name}
                        </span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold',
                            section.framerType === 'Grid'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                              : 'bg-teal-50 text-[#08967F] border border-teal-200/70',
                          )}
                        >
                          {section.framerType}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                        {section.gridSpan} · Gap {section.gap}px
                      </p>
                    </div>
                  </div>

                  {/* Single Step Sync Button */}
                  <button
                    type="button"
                    disabled={syncingAll || isSyncing}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSyncSingleSection(section.step || idx + 1);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors shrink-0 disabled:opacity-50',
                      isSynced
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        : isFailed
                          ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                          : 'bg-white border-slate-200 text-[#101B2D] hover:border-[#0BB59B] hover:text-[#08967F]',
                    )}
                  >
                    {isSyncing ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : isSynced ? (
                      <Check size={11} />
                    ) : isFailed ? (
                      <RefreshCw size={11} />
                    ) : (
                      <Play size={10} />
                    )}
                    <span>
                      {isSyncing
                        ? '寫入中'
                        : isSynced
                          ? '已同步'
                          : isFailed
                            ? '重試'
                            : '同步'}
                    </span>
                  </button>
                </div>

                {/* Interactive placeholder note if detected */}
                {section.interactivePlaceholders.length > 0 && (
                  <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded bg-amber-50 border border-amber-200/80 text-[10.5px] text-amber-800">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-600" />
                    <span>{section.interactivePlaceholders.join(' · ')}</span>
                  </div>
                )}

                {/* Per-Section Progress Bar */}
                <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      isFailed ? 'bg-rose-500' : 'bg-[#0BB59B]',
                    )}
                    style={{ width: `${progressVal}%` }}
                  />
                </div>

                {/* Collapsible IR JSON Inspector */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleJson(section.id);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#08967F] font-medium transition-colors"
                  >
                    <span>查看結構代碼</span>
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {isExpanded && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 rounded-lg border border-slate-200 bg-[#0B1322] text-slate-200 overflow-hidden"
                    >
                      <div className="px-2.5 py-1.5 bg-[#101B2D] border-b border-white/10 flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-400">Framer IR JSON</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyJson(section)}
                          className="inline-flex items-center gap-1 text-[#34E4C8] hover:text-white"
                        >
                          {copiedId === section.id ? <Check size={11} /> : <Copy size={11} />}
                          <span>{copiedId === section.id ? '已複製' : '複製 JSON'}</span>
                        </button>
                      </div>
                      <pre className="p-2.5 text-[10.5px] leading-relaxed font-mono overflow-x-auto max-h-56 text-slate-200">
                        {JSON.stringify(section, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
