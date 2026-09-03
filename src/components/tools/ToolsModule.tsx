import { useState } from 'react';
import { Sparkles, Search, Check, Loader2, FileText, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

function SeoKeywordAI() {
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [seedKeywords, setSeedKeywords] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<{ keyword: string; level: string; volume: number; difficulty: number; selected: boolean }[]>([]);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setResults([
        { keyword: '香港網頁設計', level: 'S1', volume: 2400, difficulty: 72, selected: false },
        { keyword: '網站製作公司', level: 'S1', volume: 1800, difficulty: 65, selected: false },
        { keyword: 'WordPress 網站設計', level: 'S2', volume: 880, difficulty: 45, selected: false },
        { keyword: '響應式網頁設計', level: 'S2', volume: 720, difficulty: 42, selected: false },
        { keyword: '網站改版服務', level: 'S2', volume: 590, difficulty: 38, selected: false },
        { keyword: 'Shopify 網店設計 香港', level: 'S3', volume: 320, difficulty: 25, selected: false },
        { keyword: '中小企網站設計方案', level: 'S3', volume: 210, difficulty: 22, selected: false },
        { keyword: '公司網站改版費用', level: 'S3', volume: 180, difficulty: 18, selected: false },
        { keyword: '電商網站開發價格', level: 'S3', volume: 150, difficulty: 20, selected: false },
        { keyword: '品牌官網建設', level: 'S2', volume: 450, difficulty: 35, selected: false },
      ]);
      setGenerating(false);
    }, 2000);
  };

  const toggleSelect = (idx: number) => {
    const newResults = [...results];
    newResults[idx].selected = !newResults[idx].selected;
    setResults(newResults);
  };

  const selectedCount = results.filter(r => r.selected).length;

  const levelColors: Record<string, string> = {
    S1: 'bg-rose-100 text-rose-700',
    S2: 'bg-amber-100 text-amber-700',
    S3: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-teal-600" />
          <h3 className="text-[18px] font-bold">AI 關鍵字生成器</h3>
        </div>
        <p className="text-[13px] text-muted-foreground mb-4">輸入網站主題及行業，系統將自動生成建議關鍵字並分為三級 (S1/S2/S3)。</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">目標網站</label>
            <select value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white">
              <option value="">選擇網站...</option>
              <option>BW Design Centre</option>
              <option>ACI Global</option>
              <option>FCC Media</option>
              <option>BSC Tech</option>
            </select>
          </div>
          <div>
            <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">行業/主題</label>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-sm" placeholder="例：網頁設計、數碼營銷" />
          </div>
          <div>
            <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">種子關鍵字</label>
            <input value={seedKeywords} onChange={(e) => setSeedKeywords(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-sm" placeholder="例：網站設計, WordPress" />
          </div>
        </div>

        <button onClick={handleGenerate} disabled={generating} className={cn('flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]', generating && 'opacity-70 cursor-wait')}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {generating ? '生成中...' : '一鍵生成關鍵字'}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[15px] font-bold">生成結果 ({results.length} 個關鍵字)</h4>
            {selectedCount > 0 && (
              <button className="px-3 py-1.5 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700">
                確認加入 ({selectedCount})
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">選取</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">關鍵字</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">等級</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">月搜尋量</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">難度</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={idx} className={cn('border-b border-border/50 hover:bg-muted/20 transition-colors', r.selected && 'bg-teal-50/30')}>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleSelect(idx)} className={cn('w-5 h-5 rounded border flex items-center justify-center transition-colors', r.selected ? 'bg-teal-600 border-teal-600 text-white' : 'border-border')}>
                        {r.selected && <Check size={12} />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-[13px] font-medium">{r.keyword}</td>
                    <td className="px-3 py-2"><span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', levelColors[r.level])}>{r.level}</span></td>
                    <td className="px-3 py-2 text-[13px]">{r.volume.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', r.difficulty > 60 ? 'bg-rose-500' : r.difficulty > 35 ? 'bg-amber-500' : 'bg-green-500')} style={{ width: `${r.difficulty}%` }} />
                        </div>
                        <span className="text-[11px]">{r.difficulty}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SeoTitleAI() {
  const [keyword, setKeyword] = useState('');
  const [generating, setGenerating] = useState(false);
  const [titles, setTitles] = useState<string[]>([]);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setTitles([
        '2024 香港網頁設計公司推薦：10 間最佳選擇比較',
        '網站設計費用全攻略：中小企如何控制預算',
        '響應式網頁設計的 5 大好處｜為什麼你的網站必須升級',
        'WordPress vs Shopify：哪個平台更適合你的生意？',
        '網站改版前必讀：避免 SEO 排名下跌的 7 個步驟',
      ]);
      setGenerating(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-teal-600" />
          <h3 className="text-[18px] font-bold">AI SEO 標題生成器</h3>
        </div>
        <p className="text-[13px] text-muted-foreground mb-4">輸入目標關鍵字，AI 將生成 SEO 友善的文章標題建議。</p>

        <div className="flex gap-3">
          <div className="flex-1">
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-sm" placeholder="輸入目標關鍵字，例：網頁設計" />
          </div>
          <button onClick={handleGenerate} disabled={generating} className={cn('flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 active:scale-[0.97]', generating && 'opacity-70')}>
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            生成標題
          </button>
        </div>
      </div>

      {titles.length > 0 && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
          <h4 className="text-[15px] font-bold mb-4">生成標題建議</h4>
          <div className="space-y-3">
            {titles.map((title, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-muted/20 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
                <span className="text-[13px] font-medium flex-1">{title}</span>
                <div className="flex items-center gap-2 ml-3">
                  <button className="p-1.5 rounded hover:bg-white text-muted-foreground hover:text-foreground transition-colors" title="複製">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateLibrary() {
  const templates = [
    { id: '1', name: '網頁設計報價模板', type: '報價單', description: '標準網頁設計報價，含 UI/UX、前端、後端項目', category: 'quotation' },
    { id: '2', name: '活動策劃報價模板', type: '報價單', description: '企業活動策劃報價，含場地、物流、人力', category: 'quotation' },
    { id: '3', name: 'SEO 月報模板', type: '報告', description: '每月 SEO 表現報告，含排名、流量變化', category: 'report' },
    { id: '4', name: '社媒內容日曆模板', type: '排程', description: '社交媒體月度內容排期表', category: 'planning' },
    { id: '5', name: '影片製作 Brief 模板', type: '簡介', description: '影片製作需求文件模板', category: 'brief' },
    { id: '6', name: '客戶需求收集表', type: '表單', description: '新客戶項目需求收集模板', category: 'form' },
  ];

  const catColors: Record<string, string> = {
    quotation: 'bg-teal-50 text-teal-700',
    report: 'bg-blue-50 text-blue-700',
    planning: 'bg-purple-50 text-purple-700',
    brief: 'bg-amber-50 text-amber-700',
    form: 'bg-green-50 text-green-700',
  };

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted-foreground">常用模板庫，快速開始工作。</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 hover:shadow-card-hover transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', catColors[t.category])}>{t.type}</span>
            </div>
            <h4 className="text-[14px] font-bold mb-1">{t.name}</h4>
            <p className="text-[12px] text-muted-foreground">{t.description}</p>
            <button className="mt-3 text-[12px] text-teal-600 font-medium hover:underline">使用模板 →</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToolsModule({ subModule }: { subModule?: string }) {
  const renderContent = () => {
    switch (subModule) {
      case 'seo-keyword-ai': return <SeoKeywordAI />;
      case 'seo-title-ai': return <SeoTitleAI />;
      case 'templates': return <TemplateLibrary />;
      default: return <SeoKeywordAI />;
    }
  };

  return (
    <div className="space-y-6">
      {renderContent()}
    </div>
  );
}
