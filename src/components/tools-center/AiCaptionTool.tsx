import { useState, useRef } from 'react';
import { Upload, Sparkles, Copy, Check, Image, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CaptionResult {
  altText: string;
  caption: string;
  seoDescription: string;
}

const mockResults: CaptionResult[] = [
  {
    altText: '香港商業攝影 - 專業企業環境中的商務人士',
    caption: '我們的專業團隊為您提供全面的品牌顧問及設計服務，助您在競爭市場中脫穎而出。',
    seoDescription: '香港頂尖品牌設計公司，提供企業形象設計、商業攝影及整合營銷方案，多年服務香港中小企業。',
  },
  {
    altText: '現代辦公室設計 - 開放式工作空間與創意協作環境',
    caption: '打造以人為本的辦公空間，激發員工創造力與工作效率，實現企業可持續發展。',
    seoDescription: '香港辦公室設計公司，專業辦公空間規劃及室內設計服務，創建符合企業文化的工作環境。',
  },
];

export function AiCaptionTool() {
  const [dragOver, setDragOver] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<CaptionResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleGenerate = () => {
    if (!imagePreview) return;
    setGenerating(true);
    setTimeout(() => {
      const idx = Math.floor(Math.random() * mockResults.length);
      setResult(mockResults[idx]);
      setGenerating(false);
    }, 2200);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleClear = () => {
    setImagePreview(null);
    setImageName('');
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Area */}
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Image size={18} className="text-teal-600" />
            <h3 className="text-[16px] font-bold">上傳圖片</h3>
          </div>

          {!imagePreview ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200',
                dragOver ? 'border-teal-500 bg-teal-50' : 'border-border hover:border-teal-400 hover:bg-muted/30'
              )}
            >
              <Upload size={32} className="text-muted-foreground" />
              <div className="text-center">
                <p className="text-[14px] font-medium">拖放圖片或點擊上傳</p>
                <p className="text-[12px] text-muted-foreground mt-1">支持 JPG、PNG、WebP 格式</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={imagePreview} alt="Preview" className="w-full object-contain max-h-[240px]" />
                <button
                  onClick={handleClear}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-[12px] text-muted-foreground truncate">{imageName}</p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-md text-[14px] font-medium hover:bg-teal-700 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <><Loader2 size={16} className="animate-spin" />AI 分析中...</>
                ) : (
                  <><Sparkles size={16} />生成說明文字</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={18} className="text-teal-600" />
            <h3 className="text-[16px] font-bold">生成結果</h3>
          </div>

          {!result && !generating && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Image size={36} className="mb-3 opacity-30" />
              <p className="text-[13px]">上傳圖片後點擊「生成說明文字」</p>
              <p className="text-[12px] mt-1">AI 將自動生成 Alt Text、圖片說明及 SEO 描述</p>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 size={36} className="animate-spin text-teal-600 mb-3" />
              <p className="text-[13px] font-medium">AI 分析圖片中...</p>
              <p className="text-[12px] text-muted-foreground mt-1">正在提取視覺特徵並生成文字描述</p>
            </div>
          )}

          {result && !generating && (
            <div className="space-y-4">
              {[
                { key: 'alt', label: 'Alt Text（無障礙描述）', value: result.altText, description: '用於圖片標籤的 alt 屬性' },
                { key: 'caption', label: '圖片說明（Caption）', value: result.caption, description: '顯示在圖片下方的說明文字' },
                { key: 'seo', label: 'SEO 描述', value: result.seoDescription, description: '用於頁面 meta description 或文章摘要' },
              ].map((item) => (
                <div key={item.key} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-[13px] font-semibold">{item.label}</span>
                      <span className="text-[11px] text-muted-foreground ml-2">{item.description}</span>
                    </div>
                    <button
                      onClick={() => handleCopy(item.value, item.key)}
                      className={cn(
                        'flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md transition-all duration-200',
                        copied === item.key
                          ? 'bg-teal-50 text-teal-700'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {copied === item.key ? <Check size={11} /> : <Copy size={11} />}
                      {copied === item.key ? '已複製' : '複製'}
                    </button>
                  </div>
                  <p className="text-[13px] text-[#0d1a2d] leading-relaxed">{item.value}</p>
                </div>
              ))}

              <button
                onClick={handleGenerate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors duration-200"
              >
                <Sparkles size={13} className="text-teal-600" />重新生成
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Usage Tips */}
      <div className="bg-blue-50 border border-blue-100 rounded-md p-4">
        <h4 className="text-[13px] font-semibold text-blue-800 mb-2">使用提示</h4>
        <ul className="text-[12px] text-blue-700 space-y-1">
          <li>• <strong>Alt Text</strong>：複製後貼入 WordPress 圖片的「替代文字」欄位，有助 SEO 及無障礙功能</li>
          <li>• <strong>圖片說明</strong>：可用作 Instagram/Facebook 帖子說明文字或網站圖片 Caption</li>
          <li>• <strong>SEO 描述</strong>：適合用作網頁 Meta Description 或文章摘要，長度約 150 字元</li>
        </ul>
      </div>
    </div>
  );
}
