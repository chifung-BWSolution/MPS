import { useState } from 'react';
import { Search, Star, Plus, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataStore, SupplierData } from '@/context/DataStore';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WebPageSupplierModule } from './WebPageSupplierModule';

const contractConfig = {
  active: { label: '活躍', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  expired: { label: '已到期', color: 'text-rose-700', bgColor: 'bg-rose-50' },
  pending: { label: '待確認', color: 'text-amber-700', bgColor: 'bg-amber-50' },
};

const categoryLabels: Record<string, string> = {
  seo: 'SEO',
  advertising: '廣告',
  printing: '印刷',
  photography: '攝影',
  videography: '攝錄',
  development: '開發',
  hosting: '主機',
  backlink: '外鏈',
  content_marketing: '內容營銷',
  technical_seo: '技術SEO',
  keyword_research: '關鍵字研究',
  google_business: 'Google Business',
  comprehensive_seo: '綜合SEO',
  other: '其他',
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={11}
          className={cn(
            star <= Math.floor(rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
          )}
        />
      ))}
      <span className="text-[12px] font-medium ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

const emptySupplier: Omit<SupplierData, 'id'> = {
  name: '',
  category: 'other',
  contactPerson: '',
  email: '',
  phone: '',
  website: '',
  contractStatus: 'pending',
  serviceType: '',
  feeRange: '',
  averageRating: 0,
  isRecommended: false,
  totalSpend: 0,
  notes: '',
  lastEngagement: new Date().toISOString().split('T')[0],
};

export function SupplierModule({ subModule }: { subModule?: string }) {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useDataStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierData | null>(null);
  const [newSupplier, setNewSupplier] = useState<Omit<SupplierData, 'id'>>(emptySupplier);
  const [deleteTarget, setDeleteTarget] = useState<SupplierData | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<SupplierData | null>(null);

  const filteredSuppliers = suppliers.filter(s => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.contactPerson.toLowerCase().includes(q);
    }
    return true;
  });

  const handleAdd = () => {
    if (!newSupplier.name.trim()) return;
    addSupplier(newSupplier);
    setNewSupplier(emptySupplier);
    setShowAddModal(false);
  };

  const handleEdit = (supplier: SupplierData) => {
    setEditingSupplier({ ...supplier });
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (editingSupplier) {
      updateSupplier(editingSupplier.id, editingSupplier);
      setShowEditModal(false);
      setEditingSupplier(null);
    }
  };

  const handleDeleteClick = (supplier: SupplierData) => {
    setDeleteTarget(supplier);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteSupplier(deleteTarget.id);
    }
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const getTitle = () => {
    switch (subModule) {
      case 'list': return { title: '供應商列表', subtitle: '供應商目錄、合約及基本資料管理。' };
      case 'reviews': return { title: '供應商評價', subtitle: '查看及提交供應商績效評價。' };
      case 'web-suppliers': return { title: '網頁供應商', subtitle: '管理可購買反向連結的網站／供應商名單。' };
      default: return { title: '供應商列表', subtitle: '供應商目錄、合約及基本資料管理。' };
    }
  };

  const { title, subtitle } = getTitle();
  const isWebSuppliers = subModule === 'web-suppliers';
  const showAddSupplier = subModule === 'list' || !subModule;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {showAddSupplier && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
          >
            <Plus size={14} />
            新增供應商
          </button>
        )}
      </div>

      {isWebSuppliers && <WebPageSupplierModule />}
      {!isWebSuppliers && (
      <>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm max-w-[320px]">
        <Search size={14} className="text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
          placeholder="搜尋供應商..."
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">名稱</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類別</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">聯絡人</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">合約狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">最後合作</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">評分</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredSuppliers.map((supplier) => {
              const config = contractConfig[supplier.contractStatus];
              return (
                <tr key={supplier.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3 text-[14px] font-medium">{supplier.name}</td>
                  <td className="px-4 py-3 text-[14px]">{categoryLabels[supplier.category] || supplier.category}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">{supplier.contactPerson}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>
                      {config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[14px] text-muted-foreground">{supplier.lastEngagement || '—'}</td>
                  <td className="px-4 py-3"><RatingStars rating={supplier.averageRating} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setReviewTarget(supplier); setShowReview(true); }} className="text-[12px] text-teal-600 font-medium hover:underline">
                        評價
                      </button>
                      <button onClick={() => handleEdit(supplier)} className="p-1 hover:bg-muted rounded transition-colors" title="編輯">
                        <Edit size={12} className="text-teal-600" />
                      </button>
                      <button onClick={() => handleDeleteClick(supplier)} className="p-1 hover:bg-muted rounded transition-colors" title="刪除">
                        <Trash2 size={12} className="text-rose-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredSuppliers.length === 0 && (
          <div className="text-center py-8 text-[13px] text-muted-foreground">沒有符合條件的供應商</div>
        )}
      </div>

      {/* Review Form */}
      {showReview && reviewTarget && (
        <ReviewForm
          supplier={reviewTarget}
          onSubmit={(avgRating) => {
            updateSupplier(reviewTarget.id, { averageRating: avgRating });
            setShowReview(false);
            setReviewTarget(null);
          }}
          onCancel={() => { setShowReview(false); setReviewTarget(null); }}
        />
      )}

      {/* Add Modal */}
      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增供應商" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商名稱 *</label>
              <Input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">類別</label>
              <Select value={newSupplier.category} onValueChange={(val) => setNewSupplier({ ...newSupplier, category: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">聯絡人</label>
              <Input value={newSupplier.contactPerson} onChange={(e) => setNewSupplier({ ...newSupplier, contactPerson: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">電郵</label>
              <Input value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">電話</label>
              <Input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">網站</label>
              <Input value={newSupplier.website} onChange={(e) => setNewSupplier({ ...newSupplier, website: e.target.value })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">合約狀態</label>
              <Select value={newSupplier.contractStatus} onValueChange={(val: any) => setNewSupplier({ ...newSupplier, contractStatus: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">活躍</SelectItem>
                  <SelectItem value="expired">已到期</SelectItem>
                  <SelectItem value="pending">待確認</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">服務類型</label>
              <Input value={newSupplier.serviceType} onChange={(e) => setNewSupplier({ ...newSupplier, serviceType: e.target.value })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
            <textarea value={newSupplier.notes} onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAdd}>新增</Button>
          </div>
        </div>
      </CrudModal>

      {/* Edit Modal */}
      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯供應商" size="lg">
        {editingSupplier && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商名稱 *</label>
                <Input value={editingSupplier.name} onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">類別</label>
                <Select value={editingSupplier.category} onValueChange={(val) => setEditingSupplier({ ...editingSupplier, category: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">聯絡人</label>
                <Input value={editingSupplier.contactPerson} onChange={(e) => setEditingSupplier({ ...editingSupplier, contactPerson: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">電郵</label>
                <Input value={editingSupplier.email} onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })} className="h-9 text-[13px]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">電話</label>
                <Input value={editingSupplier.phone} onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">合約狀態</label>
                <Select value={editingSupplier.contractStatus} onValueChange={(val: any) => setEditingSupplier({ ...editingSupplier, contractStatus: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">活躍</SelectItem>
                    <SelectItem value="expired">已到期</SelectItem>
                    <SelectItem value="pending">待確認</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
              <textarea value={editingSupplier.notes} onChange={(e) => setEditingSupplier({ ...editingSupplier, notes: e.target.value })} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none" rows={2} />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveEdit}>儲存變更</Button>
            </div>
          </div>
        )}
      </CrudModal>

      {/* Delete Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.name || ''}
        canDelete={true}
        reasons={[]}
      />
      </>
      )}
    </div>
  );
}

// ===== Review Form Component =====
function ReviewForm({ supplier, onSubmit, onCancel }: {
  supplier: SupplierData;
  onSubmit: (avgRating: number) => void;
  onCancel: () => void;
}) {
  const dimensions = ['品質', '時效', '溝通', '價格', '可靠性'] as const;
  const [ratings, setRatings] = useState<Record<string, number>>({
    '品質': 0, '時效': 0, '溝通': 0, '價格': 0, '可靠性': 0,
  });
  const [hovering, setHovering] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleStarClick = (dim: string, star: number) => {
    setRatings(prev => ({ ...prev, [dim]: star }));
  };

  const allRated = Object.values(ratings).every(r => r > 0);
  const avgRating = allRated ? parseFloat((Object.values(ratings).reduce((a, b) => a + b, 0) / dimensions.length).toFixed(1)) : 0;

  const handleSubmit = () => {
    if (!allRated) return;
    setSubmitted(true);
    setTimeout(() => {
      onSubmit(avgRating);
    }, 800);
  };

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
      <h3 className="text-[18px] font-bold mb-4">評價供應商：{supplier.name}</h3>
      {submitted ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <Star size={24} className="fill-amber-400 text-amber-400" />
          </div>
          <p className="text-[15px] font-bold text-teal-700">評價已提交！</p>
          <p className="text-[13px] text-muted-foreground mt-1">平均評分：{avgRating} / 5</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            {dimensions.map((dim) => (
              <div key={dim} className="text-center">
                <span className="text-[12px] font-medium text-muted-foreground block mb-2">{dim}</span>
                <div className="flex justify-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const hoverVal = hovering[dim] || 0;
                    const isFilled = star <= (hoverVal || ratings[dim]);
                    return (
                      <Star
                        key={star}
                        size={18}
                        className={cn(
                          'cursor-pointer transition-colors duration-150',
                          isFilled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30 hover:text-amber-300'
                        )}
                        onMouseEnter={() => setHovering(prev => ({ ...prev, [dim]: star }))}
                        onMouseLeave={() => setHovering(prev => ({ ...prev, [dim]: 0 }))}
                        onClick={() => handleStarClick(dim, star)}
                      />
                    );
                  })}
                </div>
                {ratings[dim] > 0 && (
                  <span className="text-[11px] text-amber-600 mt-1 block">{ratings[dim]}/5</span>
                )}
              </div>
            ))}
          </div>
          {allRated && (
            <div className="text-center mb-4 py-2 bg-teal-50 rounded-md">
              <span className="text-[13px] font-medium text-teal-700">
                綜合評分：<span className="text-[16px] font-bold">{avgRating}</span> / 5
              </span>
            </div>
          )}
          <div>
            <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">評語</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none"
              rows={2}
              placeholder="額外回饋..."
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSubmit}
              disabled={!allRated}
              className="px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              提交評價
            </button>
            <button onClick={onCancel} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors duration-200">取消</button>
          </div>
        </>
      )}
    </div>
  );
}
