import { useState } from 'react';
import { Edit2, Check, X, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface ManhourTemplate {
  id: string;
  taskType: string;
  category: string;
  standardHours: number;
  aiHours: number;
  aiReduction: number;
  unit: string;
  notes: string;
}

const mockTemplates: ManhourTemplate[] = [
  { id: '1', taskType: '撰寫 SEO 文章 (800-1200字)', category: '文案', standardHours: 4, aiHours: 2, aiReduction: 50, unit: '篇', notes: '含關鍵字研究、大綱、撰寫、排版' },
  { id: '2', taskType: '社交媒體貼文設計', category: '設計', standardHours: 1.5, aiHours: 0.8, aiReduction: 47, unit: '篇', notes: '含文案 + 圖片設計' },
  { id: '3', taskType: '海報設計 (A4)', category: '設計', standardHours: 4, aiHours: 2.5, aiReduction: 38, unit: '張', notes: '含概念、設計、修改' },
  { id: '4', taskType: '影片剪輯 (3-5分鐘)', category: '影片', standardHours: 12, aiHours: 8, aiReduction: 33, unit: '條', notes: '含剪輯、字幕、配樂' },
  { id: '5', taskType: '影片剪輯 (1分鐘 Reel)', category: '影片', standardHours: 4, aiHours: 2.5, aiReduction: 38, unit: '條', notes: '短影片剪輯' },
  { id: '6', taskType: 'eDM 設計與發送', category: '行銷', standardHours: 3, aiHours: 1.5, aiReduction: 50, unit: '封', notes: '含設計、文案、測試、發送' },
  { id: '7', taskType: 'SEO 關鍵字研究', category: 'SEO', standardHours: 2, aiHours: 0.5, aiReduction: 75, unit: '組', notes: '10個關鍵字為一組' },
  { id: '8', taskType: '網頁設計 (Landing Page)', category: '設計', standardHours: 8, aiHours: 5, aiReduction: 38, unit: '頁', notes: '含設計、切版' },
  { id: '9', taskType: '客戶會議記錄', category: '專案管理', standardHours: 1, aiHours: 0.3, aiReduction: 70, unit: '次', notes: '含記錄、整理、跟進事項' },
  { id: '10', taskType: '數據分析報告', category: '分析', standardHours: 3, aiHours: 1, aiReduction: 67, unit: '份', notes: '含數據收集、分析、圖表' },
  { id: '11', taskType: 'AI 圖片生成 + 修圖', category: '設計', standardHours: 2, aiHours: 0.5, aiReduction: 75, unit: '張', notes: 'AI 生成 + 後期調整' },
  { id: '12', taskType: '品牌提案簡報製作', category: '專案管理', standardHours: 6, aiHours: 3.5, aiReduction: 42, unit: '份', notes: '含研究、設計、內容' },
];

export function ManhourTemplates() {
  const [useAi, setUseAi] = useState(false);
  const [templates, setTemplates] = useState(mockTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ standardHours: number; aiHours: number } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ManhourTemplate | null>(null);

  const openEdit = (t: ManhourTemplate) => {
    setEditingTemplate({ ...t });
    setShowEditModal(true);
  };

  const saveEdit = () => {
    if (editingTemplate) {
      setTemplates(templates.map(t => t.id === editingTemplate.id ? editingTemplate : t));
    }
    setShowEditModal(false);
    setEditingTemplate(null);
  };

  const categories = [...new Set(templates.map(t => t.category))];

  const avgReduction = Math.round(templates.reduce((s, t) => s + t.aiReduction, 0) / templates.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0d1a2d]">Man-Hour 標準模板</h1>
          <p className="text-sm text-muted-foreground mt-1">各類工作的標準工時參考，支援 AI 工具效率切換</p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-border">
          <Clock size={16} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">標準模式</span>
          <Switch checked={useAi} onCheckedChange={setUseAi} />
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Zap size={14} className="text-amber-500" /> AI 模式
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-[#0d1a2d]">{templates.length}</div>
            <div className="text-xs text-muted-foreground mt-1">工作類型模板</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-teal-600">{categories.length}</div>
            <div className="text-xs text-muted-foreground mt-1">工作分類</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-2">
            <Zap size={20} className="text-amber-500" />
            <div>
              <div className="text-2xl font-bold text-amber-600">{avgReduction}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">平均 AI 效率提升</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-[#f5f8fc]">
                  <th className="text-left p-3 font-medium text-muted-foreground">工作類型</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">分類</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">
                    {useAi ? (
                      <span className="flex items-center justify-center gap-1"><Zap size={12} className="text-amber-500" /> AI 工時</span>
                    ) : '標準工時'}
                  </th>
                  <th className="text-center p-3 font-medium text-muted-foreground">單位</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">AI 效率提升</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">備註</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className="border-b border-border hover:bg-[#f5f8fc]/50 transition-colors">
                    <td className="p-3 font-medium text-[#0d1a2d]">{t.taskType}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`font-bold text-lg ${useAi ? 'text-amber-600' : 'text-[#0d1a2d]'}`}>
                        {useAi ? t.aiHours : t.standardHours}h
                      </span>
                    </td>
                    <td className="p-3 text-center text-muted-foreground">/{t.unit}</td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                        <Zap size={10} className="mr-0.5" /> -{t.aiReduction}%
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{t.notes}</td>
                    <td className="p-3 text-center">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="h-7 w-7 p-0 text-muted-foreground hover:text-teal-600">
                        <Edit2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>編輯工時標準</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>工作類型</Label>
                <Input value={editingTemplate.taskType} onChange={e => setEditingTemplate({ ...editingTemplate, taskType: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>標準工時 (小時)</Label>
                  <Input type="number" step="0.5" value={editingTemplate.standardHours} onChange={e => setEditingTemplate({ ...editingTemplate, standardHours: +e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>AI 工時 (小時)</Label>
                  <Input type="number" step="0.5" value={editingTemplate.aiHours} onChange={e => setEditingTemplate({ ...editingTemplate, aiHours: +e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>分類</Label>
                  <Input value={editingTemplate.category} onChange={e => setEditingTemplate({ ...editingTemplate, category: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>單位</Label>
                  <Input value={editingTemplate.unit} onChange={e => setEditingTemplate({ ...editingTemplate, unit: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>備註</Label>
                <Input value={editingTemplate.notes} onChange={e => setEditingTemplate({ ...editingTemplate, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>取消</Button>
            <Button onClick={saveEdit} className="bg-teal-600 hover:bg-teal-700">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
