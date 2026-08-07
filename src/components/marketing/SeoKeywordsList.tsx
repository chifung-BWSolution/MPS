import { useState, useMemo } from 'react';
import { Plus, Search, Sparkles, Target, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SeoKeyword } from '@/types/app';
import { getAllSeoKeywords } from '@/data/marketingData';

const levelConfig = {
  level_1: { label: 'S1', description: '核心品牌詞', color: 'text-rose-700', bg: 'bg-rose-100' },
  level_2: { label: 'S2', description: '產品/服務詞', color: 'text-amber-700', bg: 'bg-amber-100' },
  level_3: { label: 'S3', description: '長尾詞', color: 'text-teal-700', bg: 'bg-teal-100' },
};

const statusConfig = {
  monitoring: { label: '監控中', color: 'text-blue-700', bg: 'bg-blue-100' },
  optimizing: { label: '優化中', color: 'text-amber-700', bg: 'bg-amber-100' },
  achieved: { label: '已達標', color: 'text-teal-700', bg: 'bg-teal-100' },
  paused: { label: '已暫停', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export function SeoKeywordsList() {
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAiGenerator, setShowAiGenerator] = useState(false);

  // Use unified data from websiteDetailData
  const allKeywords = useMemo(() => getAllSeoKeywords(), []);

  const filteredKeywords = allKeywords.filter((kw) => {
    if (filterLevel !== 'all' && kw.level !== filterLevel) return false;
    if (searchQuery && !kw.keyword.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* AI Generator Panel */}
      {showAiGenerator && (
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-md border border-teal-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-teal-600" />
            <h3 className="text-[15px] font-bold">AI 關鍵字生成器</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">選擇網站</label>
              <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                <option>BW Wine Collection</option>
                <option>ACI Events</option>
                <option>BWDesign Centre</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">行業/主題</label>
              <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="例如：紅酒、活動策劃..." />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">種子關鍵字</label>
              <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="用逗號分隔多個關鍵字" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">
              <Sparkles size={12} />
              一鍵生成 (20-50個)
            </button>
            <button onClick={() => setShowAiGenerator(false)} className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
              關閉
            </button>
          </div>
        </div>
      )}

      {/* Level Summary */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(levelConfig).map(([key, config]) => {
          const count = allKeywords.filter(kw => kw.level === key).length;
          return (
            <div key={key} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('text-[12px] font-bold px-2 py-0.5 rounded', config.bg, config.color)}>{config.label}</span>
                <span className="text-[11px] text-muted-foreground">{config.description}</span>
              </div>
              <p className="text-[22px] font-bold">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋關鍵字..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'level_1', 'level_2', 'level_3'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilterLevel(level)}
              className={cn(
                'px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
                filterLevel === level ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {level === 'all' ? '全部' : levelConfig[level].label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowAiGenerator(!showAiGenerator)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded text-[12px] font-medium hover:from-teal-700 hover:to-emerald-700 transition-all duration-200"
          >
            <Sparkles size={12} />
            AI 生成
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
            <Plus size={12} />
            新增關鍵字
          </button>
        </div>
      </div>

      {/* Keywords Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-[13px] min-w-[800px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">關鍵字</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">等級</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">搜尋量</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">目前排名</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">目標排名</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">難度</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">目標頁面</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
            </tr>
          </thead>
          <tbody>
            {filteredKeywords.map((kw) => {
              const lConfig = levelConfig[kw.level];
              const sConfig = statusConfig[kw.status];
              const rankDiff = kw.currentRanking && kw.targetRanking ? kw.currentRanking - kw.targetRanking : 0;
              return (
                <tr key={kw.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{kw.keyword}</span>
                      {kw.aiGenerated && (
                        <Sparkles size={10} className="text-teal-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded', lConfig.bg, lConfig.color)}>{lConfig.label}</span>
                  </td>
                  <td className="px-4 py-3">{kw.searchVolume?.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Target size={12} className="text-muted-foreground" />
                      <span className="font-medium">#{kw.currentRanking}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-teal-600 font-medium">#{kw.targetRanking}</span>
                    {rankDiff > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(↑{rankDiff})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', (kw.difficultyScore || 0) > 70 ? 'bg-rose-500' : (kw.difficultyScore || 0) > 40 ? 'bg-amber-500' : 'bg-teal-500')}
                          style={{ width: `${kw.difficultyScore}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{kw.difficultyScore}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{kw.targetPage}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>
                      {sConfig.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
