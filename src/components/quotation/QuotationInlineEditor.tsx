import { useState, useRef, useEffect } from 'react';
import { GripVertical, Plus, Trash2, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface QuotationLineItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  subtotal: number;
  sortOrder: number;
}

interface InlineEditorProps {
  quotationId?: string;
  currency?: string;
  onTotalChange?: (total: number) => void;
}

// Initial sample line items
const sampleLineItems: QuotationLineItem[] = [
  { id: 'qi1', name: 'UI/UX 介面設計', description: '首頁及內頁設計共8頁，包含響應式設計', quantity: 1, unitPrice: 18000, discount: 0, discountType: 'percentage', subtotal: 18000, sortOrder: 1 },
  { id: 'qi2', name: '前端開發（響應式）', description: 'React + Tailwind 前端開發，支援手機和平板', quantity: 1, unitPrice: 25000, discount: 0, discountType: 'percentage', subtotal: 25000, sortOrder: 2 },
  { id: 'qi3', name: '後端系統整合', description: 'API 開發及數據庫連接', quantity: 1, unitPrice: 15000, discount: 0, discountType: 'percentage', subtotal: 15000, sortOrder: 3 },
  { id: 'qi4', name: '內容管理系統 (CMS)', description: 'WordPress 或自定義 CMS 設置', quantity: 1, unitPrice: 8000, discount: 10, discountType: 'percentage', subtotal: 7200, sortOrder: 4 },
  { id: 'qi5', name: 'SEO 基礎優化', description: '基礎 Meta、Sitemap、Schema 設置', quantity: 1, unitPrice: 5000, discount: 0, discountType: 'percentage', subtotal: 5000, sortOrder: 5 },
  { id: 'qi6', name: 'QA 測試及上線部署', description: '全面功能測試及伺服器部署', quantity: 1, unitPrice: 6000, discount: 0, discountType: 'percentage', subtotal: 6000, sortOrder: 6 },
];

function calculateSubtotal(item: QuotationLineItem): number {
  const base = item.quantity * item.unitPrice;
  if (item.discountType === 'percentage') {
    return base * (1 - item.discount / 100);
  }
  return base - item.discount;
}

export function QuotationInlineEditor({ quotationId, currency = 'HKD', onTotalChange }: InlineEditorProps) {
  const [items, setItems] = useState<QuotationLineItem[]>(sampleLineItems);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Totals
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = subtotal * (globalDiscount / 100);
  const total = subtotal - discountAmount;

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Start editing a cell
  const handleStartEdit = (id: string, field: string, currentValue: string | number) => {
    setEditingCell({ id, field });
    setEditValue(String(currentValue));
  };

  // Commit edit
  const handleCommitEdit = () => {
    if (!editingCell) return;
    setItems(prev => prev.map(item => {
      if (item.id !== editingCell.id) return item;
      const updated = { ...item };
      const field = editingCell.field as keyof QuotationLineItem;

      if (field === 'name' || field === 'description') {
        (updated as any)[field] = editValue;
      } else if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
        (updated as any)[field] = parseFloat(editValue) || 0;
      }

      updated.subtotal = calculateSubtotal(updated);
      return updated;
    }));
    setEditingCell(null);
    setEditValue('');
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Handle keyboard in edit mode
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCommitEdit();
    if (e.key === 'Escape') handleCancelEdit();
    if (e.key === 'Tab') {
      e.preventDefault();
      handleCommitEdit();
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (id: string) => {
    setDragItem(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverItem(id);
  };

  const handleDragEnd = () => {
    if (dragItem && dragOverItem && dragItem !== dragOverItem) {
      setItems(prev => {
        const newItems = [...prev];
        const dragIndex = newItems.findIndex(i => i.id === dragItem);
        const overIndex = newItems.findIndex(i => i.id === dragOverItem);
        const [removed] = newItems.splice(dragIndex, 1);
        newItems.splice(overIndex, 0, removed);
        return newItems.map((item, idx) => ({ ...item, sortOrder: idx + 1 }));
      });
    }
    setDragItem(null);
    setDragOverItem(null);
  };

  // Add new line item
  const handleAddLineItem = () => {
    const newItem: QuotationLineItem = {
      id: `qi-${Date.now()}`,
      name: '新項目',
      description: '',
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      discountType: 'percentage',
      subtotal: 0,
      sortOrder: items.length + 1,
    };
    setItems(prev => [...prev, newItem]);
    // Auto-focus the name of new item
    setTimeout(() => {
      handleStartEdit(newItem.id, 'name', '新項目');
    }, 100);
  };

  // Delete line item
  const handleDeleteLineItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id).map((item, idx) => ({ ...item, sortOrder: idx + 1 })));
  };

  // Render editable cell
  const renderEditableCell = (item: QuotationLineItem, field: string, value: string | number, width?: string, isNumber?: boolean) => {
    const isEditing = editingCell?.id === item.id && editingCell?.field === field;

    if (isEditing) {
      return (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCommitEdit}
          onKeyDown={handleKeyDown}
          type={isNumber ? 'number' : 'text'}
          className={cn('w-full px-2 py-1 border border-teal-300 rounded text-[13px] bg-teal-50 focus:outline-none focus:ring-1 focus:ring-teal-500', width)}
        />
      );
    }

    return (
      <div
        onClick={() => handleStartEdit(item.id, field, value)}
        className={cn(
          'px-2 py-1.5 rounded cursor-pointer hover:bg-teal-50 hover:ring-1 hover:ring-teal-200 transition-all duration-150 min-h-[32px] flex items-center',
          isNumber ? 'justify-end font-mono' : 'justify-start',
          width
        )}
      >
        <span className={cn('text-[13px]', !value && 'text-muted-foreground italic')}>
          {value || '點擊編輯'}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign size={16} className="text-teal-600" />
          <h3 className="text-[16px] font-bold">服務項目明細</h3>
          <span className="text-[12px] text-muted-foreground">（{items.length} 個項目）</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <GripVertical size={10} /> 拖拉排序
          </span>
          <span>•</span>
          <span>點擊即可編輯</span>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-10 px-2 py-3"></th>
              <th className="w-10 px-2 py-3 text-center text-[11px] font-medium text-muted-foreground">#</th>
              <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-3">項目名稱</th>
              <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-3 w-[200px]">描述</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-3 w-[80px]">數量</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-3 w-[100px]">單價</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-3 w-[80px]">折扣%</th>
              <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-3 w-[110px]">小計</th>
              <th className="w-10 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'border-b border-border/50 transition-all duration-150',
                  dragItem === item.id && 'opacity-50 bg-muted/20',
                  dragOverItem === item.id && dragItem !== item.id && 'border-t-2 border-t-teal-400',
                  'hover:bg-muted/10'
                )}
              >
                {/* Drag handle */}
                <td className="px-2 py-2.5 cursor-grab active:cursor-grabbing">
                  <GripVertical size={14} className="text-muted-foreground/50 mx-auto hover:text-teal-500 transition-colors" />
                </td>
                {/* Row number */}
                <td className="px-2 py-2.5 text-center">
                  <span className="text-[12px] font-mono text-muted-foreground">{idx + 1}</span>
                </td>
                {/* Name */}
                <td className="px-2 py-2.5">
                  {renderEditableCell(item, 'name', item.name)}
                </td>
                {/* Description */}
                <td className="px-2 py-2.5">
                  {renderEditableCell(item, 'description', item.description, 'w-full')}
                </td>
                {/* Quantity */}
                <td className="px-2 py-2.5">
                  {renderEditableCell(item, 'quantity', item.quantity, 'w-full', true)}
                </td>
                {/* Unit Price */}
                <td className="px-2 py-2.5">
                  {renderEditableCell(item, 'unitPrice', item.unitPrice, 'w-full', true)}
                </td>
                {/* Discount */}
                <td className="px-2 py-2.5">
                  {renderEditableCell(item, 'discount', item.discount, 'w-full', true)}
                </td>
                {/* Subtotal (read-only) */}
                <td className="px-2 py-2.5 text-right">
                  <span className="text-[13px] font-bold text-teal-700 font-mono">
                    ${item.subtotal.toLocaleString()}
                  </span>
                </td>
                {/* Delete */}
                <td className="px-2 py-2.5 text-center">
                  <button
                    onClick={() => handleDeleteLineItem(item.id)}
                    className="p-1 text-muted-foreground/50 hover:text-rose-500 hover:bg-rose-50 rounded transition-all duration-150"
                    title="刪除此項目"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add New Item Button */}
        <div className="border-t border-dashed border-border">
          <button
            onClick={handleAddLineItem}
            className="w-full flex items-center justify-center gap-1.5 py-3 text-[12px] text-muted-foreground hover:text-teal-600 hover:bg-teal-50 transition-colors duration-200"
          >
            <Plus size={13} /> 新增項目
          </button>
        </div>
      </div>

      {/* Footer: Subtotal / Discount / Total */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <div className="max-w-[400px] ml-auto space-y-3">
          {/* Subtotal */}
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">小計</span>
            <span className="font-mono font-medium">{currency} ${subtotal.toLocaleString()}</span>
          </div>

          {/* Global Discount */}
          <div className="flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">整體折扣</span>
              <div className="flex items-center">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={globalDiscount}
                  onChange={(e) => setGlobalDiscount(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  className="w-14 px-2 py-1 border border-border rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <span className="text-[11px] text-muted-foreground ml-1">%</span>
              </div>
            </div>
            <span className="font-mono text-rose-600">- ${discountAmount.toLocaleString()}</span>
          </div>

          {/* Divider */}
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold">總金額</span>
              <span className="text-[22px] font-bold text-teal-700 font-mono">{currency} ${total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
