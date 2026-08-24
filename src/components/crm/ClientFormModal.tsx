import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useBrands } from '@/hooks/useBrands';
import {
  applyClientDisplayNameAutofill,
  composeClientDisplayName,
  emptyQuotationClientInput,
  seedClientDisplayName,
  type QuotationClient,
  type QuotationClientInput,
} from '@/data/quotationClientList';

type Props = {
  open: boolean;
  onClose: () => void;
  editingClient?: QuotationClient | null;
  onSave: (input: QuotationClientInput) => Promise<QuotationClient | null>;
  saving?: boolean;
  overlayClassName?: string;
};

export function ClientFormModal({
  open,
  onClose,
  editingClient,
  onSave,
  saving = false,
  overlayClassName,
}: Props) {
  const { brands, loading: brandsLoading } = useBrands();
  const [formData, setFormData] = useState<QuotationClientInput>(emptyQuotationClientInput());

  const brandOptions = brands.filter((b) => b.isActive || formData.brandIds.includes(b.id));
  const isCreate = !editingClient;

  useEffect(() => {
    if (!open) return;
    if (editingClient) {
      setFormData(seedClientDisplayName({
        displayName: editingClient.displayName,
        companyNameZh: editingClient.companyNameZh,
        companyNameEn: editingClient.companyNameEn,
        brandIds: editingClient.brandIds,
        contactPerson: editingClient.contactPerson,
        phone: editingClient.phone,
        email: editingClient.email,
        address: editingClient.address,
        inquiryDate: editingClient.inquiryDate,
        status: editingClient.status,
        notes: editingClient.notes,
      }));
    } else {
      setFormData(seedClientDisplayName(emptyQuotationClientInput()));
    }
  }, [open, editingClient]);

  const updateForm = (field: keyof QuotationClientInput, value: string) => {
    setFormData((prev) => applyClientDisplayNameAutofill(prev, field, value));
  };

  const toggleBrand = (brandId: string) => {
    setFormData((prev) => ({
      ...prev,
      brandIds: prev.brandIds.includes(brandId)
        ? prev.brandIds.filter((id) => id !== brandId)
        : [...prev.brandIds, brandId],
    }));
  };

  const handleSubmit = async () => {
    const displayName = formData.displayName.trim() || composeClientDisplayName(formData);
    if (formData.brandIds.length === 0 || !formData.contactPerson.trim() || !displayName) {
      toast.error('請填寫必填欄位（所屬品牌、聯絡人、顯示名稱）');
      return;
    }
    const saved = await onSave({
      ...formData,
      displayName,
      brandIds: [...new Set(formData.brandIds)],
    });
    if (saved) {
      toast.success(editingClient ? '客戶資料已更新' : '客戶已新增');
      onClose();
    }
  };

  if (!open) return null;

  const selectedBrandLabels = brandOptions
    .filter((b) => formData.brandIds.includes(b.id))
    .map((b) => b.displayName || b.brandCode);

  return (
    <div className={cn('fixed inset-0 m-0 bg-black/50 flex items-center justify-center z-[100]', overlayClassName)}>
      <div className="bg-white rounded-md w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="text-[18px] font-bold">{editingClient ? '編輯客戶' : '新增客戶'}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬品牌 *</label>
            <div className="flex flex-wrap gap-2">
              {brandsLoading && (
                <span className="text-[12px] text-muted-foreground">載入品牌…</span>
              )}
              {brandOptions.map((b) => {
                const selected = formData.brandIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBrand(b.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors',
                      selected
                        ? 'bg-teal-50 border-teal-300 text-teal-800'
                        : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    {b.displayName} ({b.brandCode})
                  </button>
                );
              })}
            </div>
            {selectedBrandLabels.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">已選：{selectedBrandLabels.join('、')}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">公司名稱（中文）</label>
              <Input
                value={formData.companyNameZh}
                onChange={(e) => updateForm('companyNameZh', e.target.value)}
                placeholder="例：新創科技有限公司"
                className="h-9 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">公司名稱（英文）</label>
              <Input
                value={formData.companyNameEn}
                onChange={(e) => updateForm('companyNameEn', e.target.value)}
                placeholder="e.g. TechStart Inc"
                className="h-9 text-[13px]"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">聯絡人 *</label>
            <Input
              value={formData.contactPerson}
              onChange={(e) => updateForm('contactPerson', e.target.value)}
              placeholder="聯絡人姓名"
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">電話</label>
            <Input
              value={formData.phone}
              onChange={(e) => updateForm('phone', e.target.value)}
              placeholder="+852 9123 4567"
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">顯示名稱 *</label>
            <Input
              value={formData.displayName}
              onChange={(e) => updateForm('displayName', e.target.value)}
              placeholder="預設為公司名稱、聯絡人與電話"
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">電郵</label>
            <Input
              value={formData.email}
              onChange={(e) => updateForm('email', e.target.value)}
              placeholder="email@example.com"
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">地址</label>
            <Input
              value={formData.address}
              onChange={(e) => updateForm('address', e.target.value)}
              placeholder="客戶地址"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">查詢日期</label>
              <Input
                type="date"
                value={formData.inquiryDate}
                onChange={(e) => updateForm('inquiryDate', e.target.value)}
                className="h-9 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">客戶狀態</label>
              <select
                value={formData.status}
                onChange={(e) => updateForm('status', e.target.value)}
                className="w-full h-9 px-3 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="prospect">潛在客戶</option>
                <option value="active">合作中</option>
                <option value="inactive">已停止</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => updateForm('notes', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none bg-white"
              rows={3}
              placeholder="任何備註..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-3 border-t border-border shrink-0 bg-white">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? '儲存中…' : editingClient ? '儲存變更' : '確認新增'}
          </Button>
        </div>
      </div>
    </div>
  );
}
