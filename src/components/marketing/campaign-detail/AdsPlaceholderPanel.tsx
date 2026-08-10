import { Layers } from 'lucide-react';
import type { AdsPlaceholderSection } from './types';

export function AdsPlaceholderPanel({ section }: { section: AdsPlaceholderSection }) {
  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-4 min-h-[160px] flex flex-col">
      <h3 className="text-[14px] font-semibold">{section.title}</h3>
      <p className="text-[11px] text-muted-foreground mt-0.5">{section.description}</p>
      <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
        <div className="w-10 h-10 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center mb-2">
          <Layers size={18} className="text-slate-400" />
        </div>
        <div className="text-[13px] font-medium text-slate-600">資料尚未同步</div>
        <div className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">
          此區塊預留給後續同步的細項報表，目前僅提供 campaign 每日指標。
        </div>
      </div>
    </div>
  );
}
