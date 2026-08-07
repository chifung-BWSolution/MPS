import { useState } from 'react';
import { Search, Plus, Tag, Globe, Lock, Copy, Trash2, Edit2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Prompt {
  id: string;
  title: string;
  category: string;
  promptText: string;
  tags: string[];
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
}

const CATEGORIES = ['全部', 'SEO', '文案撰寫', '社交媒體', '廣告', '圖片', '影片', '客服', '其他'];

const mockPrompts: Prompt[] = [
  {
    id: '1',
    title: 'SEO 文章標題生成',
    category: 'SEO',
    promptText: '根據以下關鍵字生成 10 個 SEO 優化的文章標題，每個標題控制在 60 字元以內，包含主要關鍵字，並具有吸引力。關鍵字：[關鍵字]',
    tags: ['SEO', '標題', '關鍵字'],
    isPublic: true,
    createdBy: '張小明',
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    title: 'Facebook 廣告文案',
    category: '廣告',
    promptText: '為以下產品撰寫一則吸引人的 Facebook 廣告文案，包含：1) 吸引眼球的開場句 2) 產品核心優勢 3) 明確的行動號召。字數控制在 150 字以內。產品：[產品名稱]，目標受眾：[受眾描述]',
    tags: ['Facebook', '廣告', '文案'],
    isPublic: true,
    createdBy: '李美華',
    createdAt: '2024-01-20',
  },
  {
    id: '3',
    title: 'Instagram 貼文說明',
    category: '社交媒體',
    promptText: '為 Instagram 撰寫一則引人入勝的貼文說明，包含：1) 吸引人的開場 2) 品牌故事或產品特點 3) 互動問題 4) 5-8 個相關 hashtag。語調：[活潑/專業/溫馨]。主題：[主題描述]',
    tags: ['Instagram', '社交媒體', 'Hashtag'],
    isPublic: false,
    createdBy: '王大明',
    createdAt: '2024-02-01',
  },
  {
    id: '4',
    title: '圖片 Alt Text 優化',
    category: '圖片',
    promptText: '為以下圖片生成 SEO 優化的 Alt Text，要求：1) 簡潔描述圖片內容 2) 自然地包含目標關鍵字 3) 控制在 125 字元以內 4) 不要使用"圖片"或"照片"開頭。關鍵字：[關鍵字]，圖片描述：[描述]',
    tags: ['圖片', 'SEO', 'Alt Text'],
    isPublic: true,
    createdBy: '張小明',
    createdAt: '2024-02-10',
  },
  {
    id: '5',
    title: '客服回覆模板',
    category: '客服',
    promptText: '以專業且友善的語調回覆以下客戶投訴，需要：1) 表達歉意 2) 說明原因（若適用）3) 提供解決方案 4) 表達後續跟進承諾。客戶投訴內容：[投訴內容]',
    tags: ['客服', '回覆', '投訴處理'],
    isPublic: false,
    createdBy: '陳志偉',
    createdAt: '2024-02-15',
  },
];

export function PromptLibrary() {
  const [prompts, setPrompts] = useState<Prompt[]>(mockPrompts);
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [newPrompt, setNewPrompt] = useState({
    title: '',
    category: 'SEO',
    promptText: '',
    tags: '',
    isPublic: true,
  });

  const filtered = prompts.filter(p => {
    const matchCat = selectedCategory === '全部' || p.category === selectedCategory;
    const matchSearch = searchQuery === '' ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.promptText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  const handleCopy = (prompt: Prompt) => {
    navigator.clipboard.writeText(prompt.promptText);
    setCopiedId(prompt.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
    setPrompts(prev => prev.filter(p => p.id !== id));
  };

  const handleAdd = () => {
    if (!newPrompt.title || !newPrompt.promptText) return;
    const prompt: Prompt = {
      id: Date.now().toString(),
      title: newPrompt.title,
      category: newPrompt.category,
      promptText: newPrompt.promptText,
      tags: newPrompt.tags.split(',').map(t => t.trim()).filter(Boolean),
      isPublic: newPrompt.isPublic,
      createdBy: '當前用戶',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setPrompts(prev => [prompt, ...prev]);
    setNewPrompt({ title: '', category: 'SEO', promptText: '', tags: '', isPublic: true });
    setShowAddModal(false);
  };

  const handleSaveEdit = () => {
    if (!editingPrompt) return;
    setPrompts(prev => prev.map(p => p.id === editingPrompt.id ? editingPrompt : p));
    setEditingPrompt(null);
  };

  return (
    <div className="space-y-4">
      {/* Search + Add */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索 Prompt..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0D9488] text-white rounded-md text-sm font-medium hover:bg-[#0b8076] transition-colors"
        >
          <Plus size={14} />新增 Prompt
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              selectedCategory === cat
                ? 'bg-[#0D9488] text-white border-[#0D9488]'
                : 'bg-white text-muted-foreground border-border hover:border-[#0D9488] hover:text-[#0D9488]'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Prompt Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(prompt => (
          <div key={prompt.id} className="bg-white rounded-md border border-border p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-[#0d1a2d] truncate">{prompt.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-[#f0fdf4] text-[#0D9488] rounded-full border border-[#0D9488]/20">{prompt.category}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {prompt.isPublic ? <Globe size={11} /> : <Lock size={11} />}
                    {prompt.isPublic ? '公開' : '私人'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleCopy(prompt)}
                  className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-[#0D9488]"
                  title="複製 Prompt"
                >
                  {copiedId === prompt.id ? <Check size={14} className="text-[#0D9488]" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => setEditingPrompt(prompt)}
                  className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-[#0D9488]"
                  title="編輯"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(prompt.id)}
                  className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-500"
                  title="刪除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed bg-[#f5f8fc] rounded p-2 font-mono">
              {prompt.promptText}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-1">
                {prompt.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                    <Tag size={9} />{tag}
                  </span>
                ))}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{prompt.createdBy} · {prompt.createdAt}</span>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-16 text-muted-foreground">
            <p className="text-sm">沒有找到符合的 Prompt</p>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 m-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg w-full max-w-lg p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold">新增 Prompt</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">標題</label>
                <input
                  type="text"
                  value={newPrompt.title}
                  onChange={e => setNewPrompt(p => ({ ...p, title: e.target.value }))}
                  placeholder="Prompt 標題"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">分類</label>
                <select
                  value={newPrompt.category}
                  onChange={e => setNewPrompt(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                >
                  {CATEGORIES.filter(c => c !== '全部').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Prompt 內容</label>
                <textarea
                  value={newPrompt.promptText}
                  onChange={e => setNewPrompt(p => ({ ...p, promptText: e.target.value }))}
                  placeholder="輸入 Prompt 內容..."
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[#0D9488] resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">標籤（用逗號分隔）</label>
                <input
                  type="text"
                  value={newPrompt.tags}
                  onChange={e => setNewPrompt(p => ({ ...p, tags: e.target.value }))}
                  placeholder="SEO, 文案, 廣告"
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={newPrompt.isPublic}
                  onChange={e => setNewPrompt(p => ({ ...p, isPublic: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="isPublic" className="text-sm flex items-center gap-1">
                  <Globe size={13} />公開給團隊
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                className="px-4 py-2 text-sm bg-[#0D9488] text-white rounded-md hover:bg-[#0b8076] transition-colors"
              >
                新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingPrompt && (
        <div className="fixed inset-0 m-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg w-full max-w-lg p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold">編輯 Prompt</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">標題</label>
                <input
                  type="text"
                  value={editingPrompt.title}
                  onChange={e => setEditingPrompt(p => p ? { ...p, title: e.target.value } : p)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">分類</label>
                <select
                  value={editingPrompt.category}
                  onChange={e => setEditingPrompt(p => p ? { ...p, category: e.target.value } : p)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                >
                  {CATEGORIES.filter(c => c !== '全部').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Prompt 內容</label>
                <textarea
                  value={editingPrompt.promptText}
                  onChange={e => setEditingPrompt(p => p ? { ...p, promptText: e.target.value } : p)}
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[#0D9488] resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">標籤（用逗號分隔）</label>
                <input
                  type="text"
                  value={editingPrompt.tags.join(', ')}
                  onChange={e => setEditingPrompt(p => p ? { ...p, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) } : p)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[#0D9488]"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editIsPublic"
                  checked={editingPrompt.isPublic}
                  onChange={e => setEditingPrompt(p => p ? { ...p, isPublic: e.target.checked } : p)}
                  className="rounded"
                />
                <label htmlFor="editIsPublic" className="text-sm flex items-center gap-1">
                  <Globe size={13} />公開給團隊
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingPrompt(null)}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-sm bg-[#0D9488] text-white rounded-md hover:bg-[#0b8076] transition-colors"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
