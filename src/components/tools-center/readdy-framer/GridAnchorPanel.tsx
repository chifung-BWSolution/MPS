import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GridConfig } from '@/types/readdyFramer';

interface GridAnchorPanelProps {
  gridConfig: GridConfig;
  onChangeGridConfig: (next: GridConfig) => void;
  gridConfirmed: boolean;
  onToggleConfirmed: () => void;
  highlightConfirmWarning: boolean;
}

export function GridAnchorPanel({
  gridConfig,
  onChangeGridConfig,
  gridConfirmed,
  onToggleConfirmed,
  highlightConfirmWarning,
}: GridAnchorPanelProps) {
  const updateField = (key: keyof GridConfig, raw: string) => {
    const num = Math.max(1, Number(raw.replace(/[^\d]/g, '')) || 0);
    onChangeGridConfig({ ...gridConfig, [key]: num });
  };

  return (
    <div className="rounded-lg border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-[#101B2D]">12 列網格基準設定</span>
          <span className="text-[11px] font-mono text-slate-400">
            Desktop {gridConfig.desktop_width} · Max {gridConfig.container_max_width} · Gap {gridConfig.gutter}px
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleConfirmed}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all',
            gridConfirmed
              ? 'bg-teal-50 border-[#0BB59B] text-[#08967F]'
              : highlightConfirmWarning
                ? 'bg-amber-50 border-amber-400 text-amber-700 ring-2 ring-amber-200'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300',
          )}
        >
          <span
            className={cn(
              'w-3.5 h-3.5 rounded flex items-center justify-center border',
              gridConfirmed
                ? 'bg-[#0BB59B] border-[#0BB59B] text-white'
                : 'bg-white border-slate-300',
            )}
          >
            {gridConfirmed && <Check size={10} strokeWidth={3} />}
          </span>
          <span>已確認格點</span>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-2.5">
          <span className="text-[12px] text-slate-500">桌面寬 (px)</span>
          <input
            type="number"
            min={320}
            max={3840}
            value={gridConfig.desktop_width}
            onChange={(e) => updateField('desktop_width', e.target.value)}
            className="w-28 bg-transparent text-right text-[14px] font-bold font-mono text-[#101B2D] outline-none tabular-nums"
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-2.5">
          <span className="text-[12px] text-slate-500">最大容器 (px)</span>
          <input
            type="number"
            min={320}
            max={2560}
            value={gridConfig.container_max_width}
            onChange={(e) => updateField('container_max_width', e.target.value)}
            className="w-28 bg-transparent text-right text-[14px] font-bold font-mono text-[#101B2D] outline-none tabular-nums"
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-2.5">
          <span className="text-[12px] text-slate-500">柵格列數</span>
          <input
            type="number"
            min={1}
            max={24}
            value={gridConfig.columns}
            onChange={(e) => updateField('columns', e.target.value)}
            className="w-28 bg-transparent text-right text-[14px] font-bold font-mono text-[#101B2D] outline-none tabular-nums"
          />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-2.5">
          <span className="text-[12px] text-slate-500">列間距 (px)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={gridConfig.gutter}
            onChange={(e) => updateField('gutter', e.target.value)}
            className="w-28 bg-transparent text-right text-[14px] font-bold font-mono text-[#101B2D] outline-none tabular-nums"
          />
        </label>
      </div>

      {!gridConfirmed && highlightConfirmWarning && (
        <p className="text-[11px] text-amber-600 font-medium">
          請先勾選「已確認格點」，鎖定 12 列基準後再開始解析。
        </p>
      )}
    </div>
  );
}
