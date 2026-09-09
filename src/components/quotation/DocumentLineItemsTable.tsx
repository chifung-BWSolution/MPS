import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { editorInputClass } from '@/components/quotation/InvoiceReceiptEditorShell';
import { emptyLine, formatDocumentMoney, lineAmount, type InvoiceLineItem } from '@/lib/invoiceReceipts';
import { cn } from '@/lib/utils';

export function DocumentLineItemsTable({
  lines,
  onChange,
}: {
  lines: InvoiceLineItem[];
  onChange: (lines: InvoiceLineItem[]) => void;
}) {
  const patch = (index: number, updates: Partial<InvoiceLineItem>) => {
    onChange(lines.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...updates };
      next.amount = lineAmount(next.quantity, next.price);
      return next;
    }));
  };

  if (lines.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground py-2">
        暫無附加項目。點擊「新增項目」添加。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left font-medium py-2 pr-2">項目</th>
            <th className="text-right font-medium py-2 w-24">數量</th>
            <th className="text-right font-medium py-2 w-28">單價</th>
            <th className="text-right font-medium py-2 w-28">金額</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id ?? index} className="border-b border-border/50">
              <td className="py-2 pr-2">
                <Input
                  className={editorInputClass}
                  value={line.itemName}
                  onChange={(e) => patch(index, { itemName: e.target.value })}
                  placeholder="附加項目"
                />
              </td>
              <td className="py-2">
                <Input
                  type="number"
                  className={cn(editorInputClass, 'text-right')}
                  value={line.quantity}
                  onChange={(e) => patch(index, { quantity: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="py-2">
                <Input
                  type="number"
                  className={cn(editorInputClass, 'text-right')}
                  value={line.price}
                  onChange={(e) => patch(index, { price: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="py-2 text-right tabular-nums">{formatDocumentMoney(line.amount)}</td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                  aria-label="刪除項目"
                >
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AddLineItemButton({
  onClick,
  accent = 'blue',
}: {
  onClick: () => void;
  accent?: 'blue' | 'emerald';
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1 text-[13px]',
        accent === 'emerald' ? 'text-emerald-600 hover:text-emerald-700' : 'text-blue-600 hover:text-blue-700',
      )}
      onClick={onClick}
    >
      <Plus size={14} /> 新增項目
    </button>
  );
}

export function addEmptyLine(lines: InvoiceLineItem[]): InvoiceLineItem[] {
  return [...lines, emptyLine()];
}
