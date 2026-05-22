import { useState } from 'react';
import { Save, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface FrequencyRow {
  id: string;
  brandName: string;
  websiteName: string;
  monthlyArticles: number;
  weeklySocialPosts: number;
  monthlyEdm: number;
  quarterlyVideos: number;
  hoursPerArticle: number;
  hoursPerPost: number;
  hoursPerEdm: number;
  hoursPerVideo: number;
}

const mockData: FrequencyRow[] = [
  { id: '1', brandName: 'BW 志豐企業', websiteName: 'bwdesign.hk', monthlyArticles: 8, weeklySocialPosts: 5, monthlyEdm: 2, quarterlyVideos: 6, hoursPerArticle: 4, hoursPerPost: 1.5, hoursPerEdm: 3, hoursPerVideo: 12 },
  { id: '2', brandName: 'ACI 亞洲信譽', websiteName: 'asiacredibility.com', monthlyArticles: 4, weeklySocialPosts: 3, monthlyEdm: 1, quarterlyVideos: 3, hoursPerArticle: 4, hoursPerPost: 1.5, hoursPerEdm: 3, hoursPerVideo: 12 },
  { id: '4', brandName: 'BSC 商業服務', websiteName: 'bsc-service.com', monthlyArticles: 2, weeklySocialPosts: 2, monthlyEdm: 1, quarterlyVideos: 1, hoursPerArticle: 4, hoursPerPost: 1.5, hoursPerEdm: 3, hoursPerVideo: 12 },
];

export function UpdateFrequency() {
  const [data, setData] = useState(mockData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<FrequencyRow | null>(null);

  const startEdit = (row: FrequencyRow) => {
    setEditingId(row.id);
    setEditValues({ ...row });
  };

  const saveEdit = () => {
    if (editValues) {
      setData(data.map(d => d.id === editValues.id ? editValues : d));
    }
    setEditingId(null);
    setEditValues(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues(null);
  };

  const calculateMonthlyHours = (row: FrequencyRow) => {
    const articleHours = row.monthlyArticles * row.hoursPerArticle;
    const socialHours = row.weeklySocialPosts * 4 * row.hoursPerPost; // 4 weeks per month
    const edmHours = row.monthlyEdm * row.hoursPerEdm;
    const videoHours = (row.quarterlyVideos / 3) * row.hoursPerVideo; // monthly from quarterly
    return Math.round(articleHours + socialHours + edmHours + videoHours);
  };

  const totalMonthlyHours = data.reduce((sum, row) => sum + calculateMonthlyHours(row), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0d1a2d]">更新頻率設定</h1>
          <p className="text-sm text-muted-foreground mt-1">設定各品牌/網站的內容更新頻率與工時預算</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-[#0d1a2d]">{data.reduce((s, r) => s + r.monthlyArticles, 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">每月文章總數</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{data.reduce((s, r) => s + r.weeklySocialPosts, 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">每週社交帖總數</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">{data.reduce((s, r) => s + r.monthlyEdm, 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">每月 eDM 總數</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-teal-600">{totalMonthlyHours}h</div>
            <div className="text-xs text-muted-foreground mt-1">每月總需工時</div>
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
                  <th className="text-left p-3 font-medium text-muted-foreground">品牌 / 網站</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">每月文章</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">每週社交帖</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">每月 eDM</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">每季影片</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">月需工時</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.map(row => {
                  const isEditing = editingId === row.id;
                  const current = isEditing && editValues ? editValues : row;

                  return (
                    <tr key={row.id} className="border-b border-border hover:bg-[#f5f8fc]/50 transition-colors">
                      <td className="p-3">
                        <div className="font-medium text-[#0d1a2d]">{row.brandName}</div>
                        <div className="text-xs text-muted-foreground">{row.websiteName}</div>
                      </td>
                      <td className="p-3 text-center">
                        {isEditing ? (
                          <Input type="number" className="w-16 h-8 text-center text-xs mx-auto" value={editValues?.monthlyArticles} onChange={e => setEditValues({ ...editValues!, monthlyArticles: +e.target.value })} />
                        ) : (
                          <span className="font-medium">{row.monthlyArticles}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isEditing ? (
                          <Input type="number" className="w-16 h-8 text-center text-xs mx-auto" value={editValues?.weeklySocialPosts} onChange={e => setEditValues({ ...editValues!, weeklySocialPosts: +e.target.value })} />
                        ) : (
                          <span className="font-medium">{row.weeklySocialPosts}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isEditing ? (
                          <Input type="number" className="w-16 h-8 text-center text-xs mx-auto" value={editValues?.monthlyEdm} onChange={e => setEditValues({ ...editValues!, monthlyEdm: +e.target.value })} />
                        ) : (
                          <span className="font-medium">{row.monthlyEdm}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isEditing ? (
                          <Input type="number" className="w-16 h-8 text-center text-xs mx-auto" value={editValues?.quarterlyVideos} onChange={e => setEditValues({ ...editValues!, quarterlyVideos: +e.target.value })} />
                        ) : (
                          <span className="font-medium">{row.quarterlyVideos}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 font-mono">
                          {calculateMonthlyHours(current)}h
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={saveEdit} className="h-7 w-7 p-0 text-green-600 hover:text-green-700">
                              <Check size={14} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700">
                              <X size={14} />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => startEdit(row)} className="h-7 w-7 p-0 text-muted-foreground hover:text-teal-600">
                            <Edit2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#f5f8fc] border-t-2 border-teal-200">
                  <td className="p-3 font-semibold text-[#0d1a2d]">合計</td>
                  <td className="p-3 text-center font-bold">{data.reduce((s, r) => s + r.monthlyArticles, 0)}</td>
                  <td className="p-3 text-center font-bold">{data.reduce((s, r) => s + r.weeklySocialPosts, 0)}</td>
                  <td className="p-3 text-center font-bold">{data.reduce((s, r) => s + r.monthlyEdm, 0)}</td>
                  <td className="p-3 text-center font-bold">{data.reduce((s, r) => s + r.quarterlyVideos, 0)}</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-teal-600 text-white font-mono">{totalMonthlyHours}h</Badge>
                  </td>
                  <td className="p-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
