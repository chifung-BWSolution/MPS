import { useState } from 'react';
import { Filter, AlertTriangle, CheckCircle, Clock, MinusCircle, CreditCard, Plus, Upload, X, Save, DollarSign, Building2, Eye, EyeOff, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Invoice {
  id: string;
  invoiceNumber: string;
  company: string;
  client: string;
  quotationRef: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue' | 'partial';
  paidAmount: number;
  receiptUrl?: string;
}

interface Payment {
  id: string;
  invoiceRef: string;
  company: string;
  client: string;
  amount: number;
  paidDate: string;
  method: string;
  notes?: string;
}

interface CreditCardEntry {
  id: string;
  companyName: string;
  lastFour: string;
  bank: string;
  expiryDate: string;
  purpose: string;
  cardHolder: string;
  custodian: string;
  isActive: boolean;
  isExpiringSoon: boolean;
}

const invoiceStatusConfig = {
  paid: { label: '已付', color: 'text-teal-700', bgColor: 'bg-teal-50', icon: CheckCircle },
  pending: { label: '待付', color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Clock },
  overdue: { label: '逾期', color: 'text-rose-700', bgColor: 'bg-rose-50', icon: AlertTriangle },
  partial: { label: '部分', color: 'text-blue-700', bgColor: 'bg-blue-50', icon: MinusCircle },
};

const initialInvoices: Invoice[] = [
  { id: '1', invoiceNumber: 'INV-2024-045', company: 'BWDesign Centre', client: 'TechStart Inc', quotationRef: 'QT-2024-029', amount: 85000, dueDate: '2025-01-10', status: 'pending', paidAmount: 0 },
  { id: '2', invoiceNumber: 'INV-2024-044', company: 'BWDesign Centre', client: 'Green Living', quotationRef: 'QT-2024-028', amount: 32000, dueDate: '2024-12-20', status: 'overdue', paidAmount: 0 },
  { id: '3', invoiceNumber: 'INV-2024-043', company: 'ACI Global', client: 'FoodCraft', quotationRef: 'QT-2024-026', amount: 95000, dueDate: '2024-12-31', status: 'partial', paidAmount: 47500 },
  { id: '4', invoiceNumber: 'INV-2024-042', company: 'ACI Global', client: 'Bella Wines', quotationRef: 'QT-2024-025', amount: 65000, dueDate: '2024-12-05', status: 'paid', paidAmount: 65000 },
  { id: '5', invoiceNumber: 'INV-2024-041', company: 'FCC Media', client: 'SportMax', quotationRef: 'QT-2024-024', amount: 42000, dueDate: '2024-11-30', status: 'paid', paidAmount: 42000 },
  { id: '6', invoiceNumber: 'INV-2024-040', company: 'BWDesign Centre', client: 'Acme Corp', quotationRef: 'QT-2024-023', amount: 58000, dueDate: '2024-12-15', status: 'overdue', paidAmount: 0 },
];

const initialPayments: Payment[] = [
  { id: '1', invoiceRef: 'INV-2024-042', company: 'ACI Global', client: 'Bella Wines', amount: 65000, paidDate: '2024-12-04', method: '銀行轉帳' },
  { id: '2', invoiceRef: 'INV-2024-041', company: 'FCC Media', client: 'SportMax', amount: 42000, paidDate: '2024-11-28', method: '支票' },
  { id: '3', invoiceRef: 'INV-2024-043', company: 'ACI Global', client: 'FoodCraft', amount: 47500, paidDate: '2024-12-15', method: '銀行轉帳', notes: '第一期付款 (50%)' },
];

const initialCreditCards: CreditCardEntry[] = [
  { id: '1', companyName: 'BWDesign Centre', lastFour: '4521', bank: 'HSBC', expiryDate: '2025-03', purpose: 'Google Ads', cardHolder: '張偉明', custodian: '李芳', isActive: true, isExpiringSoon: true },
  { id: '2', companyName: 'BWDesign Centre', lastFour: '8834', bank: 'Bank of China', expiryDate: '2026-08', purpose: 'Facebook Ads', cardHolder: '張偉明', custodian: '王志明', isActive: true, isExpiringSoon: false },
  { id: '3', companyName: 'ACI Global', lastFour: '2267', bank: 'DBS', expiryDate: '2025-01', purpose: '插件訂閱', cardHolder: '張偉明', custodian: '陳小華', isActive: true, isExpiringSoon: true },
  { id: '4', companyName: 'FCC Media', lastFour: '9901', bank: 'Citibank', expiryDate: '2026-12', purpose: '一般業務', cardHolder: '李大偉', custodian: '李大偉', isActive: false, isExpiringSoon: false },
];

const companyOptions = ['BWDesign Centre', 'ACI Global', 'FCC Media', 'BSC Holdings', 'ChiFung Ltd'];

// ===== Invoice List =====
function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [paymentModal, setPaymentModal] = useState<Invoice | null>(null);
  const [receiptModal, setReceiptModal] = useState<Invoice | null>(null);

  const filtered = invoices.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false;
    if (filterCompany !== 'all' && i.company !== filterCompany) return false;
    return true;
  });

  const totalOutstanding = filtered.filter(i => i.status !== 'paid').reduce((sum, i) => sum + (i.amount - i.paidAmount), 0);
  const totalOverdue = filtered.filter(i => i.status === 'overdue').reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = filtered.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.paidAmount, 0);

  const handleRecordPayment = (invoiceId: string, payAmount: number) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const newPaidAmount = inv.paidAmount + payAmount;
      const newStatus = newPaidAmount >= inv.amount ? 'paid' as const : 'partial' as const;
      return { ...inv, paidAmount: newPaidAmount, status: newStatus };
    }));
    setPaymentModal(null);
  };

  const handleUploadReceipt = (invoiceId: string) => {
    setInvoices(prev => prev.map(inv =>
      inv.id === invoiceId ? { ...inv, receiptUrl: `receipt_${invoiceId}.pdf` } : inv
    ));
    setReceiptModal(null);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-muted-foreground" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600">
            <option value="all">全部狀態</option>
            <option value="pending">待付</option>
            <option value="overdue">逾期</option>
            <option value="partial">部分付款</option>
            <option value="paid">已付</option>
          </select>
        </div>
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部公司</option>
          {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground">總應收</span>
          <span className="text-[22px] font-bold block mt-1">${totalOutstanding.toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground">逾期金額</span>
          <span className="text-[22px] font-bold block mt-1 text-rose-500">${totalOverdue.toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground">已收款</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">${totalPaid.toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground">本月發票</span>
          <span className="text-[22px] font-bold block mt-1">{filtered.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">發票 #</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">客戶</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">報價參考</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">金額</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">到期日</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">已付</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((invoice) => {
              const config = invoiceStatusConfig[invoice.status];
              const StatusIcon = config.icon;
              return (
                <tr key={invoice.id} className={cn('border-b border-border/50 hover:bg-muted/20 transition-colors duration-200', invoice.status === 'overdue' && 'bg-rose-50/30')}>
                  <td className="px-4 py-3 text-[14px] font-medium">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">{invoice.company}</td>
                  <td className="px-4 py-3 text-[14px]">{invoice.client}</td>
                  <td className="px-4 py-3 text-[13px] text-teal-600">{invoice.quotationRef}</td>
                  <td className="px-4 py-3 text-[14px] font-medium">${invoice.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[14px] text-muted-foreground">{invoice.dueDate}</td>
                  <td className="px-4 py-3 text-[14px]">${invoice.paidAmount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>
                      <StatusIcon size={10} />{config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {invoice.status !== 'paid' && (
                        <button onClick={() => setPaymentModal(invoice)} className="text-[12px] text-teal-600 font-medium hover:underline">記錄付款</button>
                      )}
                      {invoice.status === 'paid' && (
                        <button onClick={() => setReceiptModal(invoice)} className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <Upload size={10} />{invoice.receiptUrl ? '已上傳' : '收據'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[13px] text-muted-foreground">沒有符合條件的發票</div>
        )}
      </div>

      {/* Payment Modal */}
      {paymentModal && (
        <PaymentRecordModal invoice={paymentModal} onSave={handleRecordPayment} onClose={() => setPaymentModal(null)} />
      )}

      {/* Receipt Modal */}
      {receiptModal && (
        <ReceiptUploadModal invoice={receiptModal} onUpload={handleUploadReceipt} onClose={() => setReceiptModal(null)} />
      )}
    </div>
  );
}

// ===== Payment Record Modal =====
function PaymentRecordModal({ invoice, onSave, onClose }: { invoice: Invoice; onSave: (invoiceId: string, amount: number) => void; onClose: () => void }) {
  const remaining = invoice.amount - invoice.paidAmount;
  const [amount, setAmount] = useState<string>(remaining.toString());
  const [method, setMethod] = useState('銀行轉帳');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0 || payAmount > remaining) return;
    onSave(invoice.id, payAmount);
  };

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[450px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[18px] font-bold">記錄付款</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="bg-muted/30 rounded-md p-3 text-[13px] space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">發票</span><span className="font-medium">{invoice.invoiceNumber}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">客戶</span><span>{invoice.client}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">總額</span><span className="font-medium">${invoice.amount.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">已付</span><span>${invoice.paidAmount.toLocaleString()}</span></div>
            <div className="flex justify-between font-bold text-teal-600"><span>待付</span><span>${remaining.toLocaleString()}</span></div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">付款金額 (HKD) *</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} max={remaining} min={1} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
            {parseFloat(amount) > remaining && <p className="text-[11px] text-rose-500 mt-1">付款金額不能超過待付款項</p>}
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">付款方式</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600">
              <option value="銀行轉帳">銀行轉帳</option>
              <option value="支票">支票</option>
              <option value="現金">現金</option>
              <option value="信用卡">信用卡</option>
              <option value="FPS">FPS 轉數快</option>
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">備註</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none" rows={2} placeholder="如：第一期付款..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/50">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors">取消</button>
          <button onClick={handleSubmit} disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > remaining} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Save size={13} /> 確認付款
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Receipt Upload Modal =====
function ReceiptUploadModal({ invoice, onUpload, onClose }: { invoice: Invoice; onUpload: (invoiceId: string) => void; onClose: () => void }) {
  const [fileName, setFileName] = useState('');

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[400px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[18px] font-bold">上傳收據</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="text-[13px] text-muted-foreground mb-4">發票：{invoice.invoiceNumber} | 客戶：{invoice.client}</p>
        <div className="border-2 border-dashed border-border rounded-md p-8 text-center cursor-pointer hover:border-teal-400 transition-colors" onClick={() => setFileName(`receipt_${invoice.invoiceNumber}.pdf`)}>
          <Upload size={24} className="mx-auto text-muted-foreground mb-2" />
          {fileName ? (<p className="text-[13px] text-teal-600 font-medium">{fileName}</p>) : (<p className="text-[13px] text-muted-foreground">點擊選擇檔案（模擬上傳）</p>)}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/50">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors">取消</button>
          <button onClick={() => onUpload(invoice.id)} disabled={!fileName} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Upload size={13} /> 確認上傳
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Payment Tracker =====
function PaymentTracker() {
  const [payments] = useState<Payment[]>(initialPayments);
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const filtered = payments.filter(p => filterCompany === 'all' || p.company === filterCompany);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Filter size={13} className="text-muted-foreground" />
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部公司</option>
          {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <h4 className="text-[15px] font-bold mb-4">付款記錄</h4>
        <div className="space-y-3">
          {filtered.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-md border border-border/50">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center"><CheckCircle size={14} className="text-teal-600" /></div>
                <div>
                  <span className="text-[13px] font-medium block">{p.client}</span>
                  <span className="text-[11px] text-muted-foreground">{p.invoiceRef} • {p.method} • {p.company}</span>
                  {p.notes && <span className="text-[10px] text-muted-foreground block">{p.notes}</span>}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[14px] font-bold text-teal-600 block">${p.amount.toLocaleString()}</span>
                <span className="text-[11px] text-muted-foreground">{p.paidDate}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center py-6 text-[13px] text-muted-foreground">沒有符合條件的付款記錄</div>}
        </div>
      </div>
    </div>
  );
}

// ===== Credit Card Management =====
function CreditCardManagement() {
  const [cards, setCards] = useState<CreditCardEntry[]>(initialCreditCards);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCardEntry | null>(null);
  const expiringCards = cards.filter(c => c.isExpiringSoon && c.isActive);

  const handleSave = (formData: Partial<CreditCardEntry>) => {
    if (editingCard) {
      setCards(prev => prev.map(c => c.id === editingCard.id ? { ...c, ...formData } : c));
    } else {
      const isExpiring = formData.expiryDate ? new Date(formData.expiryDate + '-01') <= new Date(new Date().setMonth(new Date().getMonth() + 2)) : false;
      const newCard: CreditCardEntry = {
        id: `cc${Date.now()}`, companyName: formData.companyName || '', lastFour: formData.lastFour || '',
        bank: formData.bank || '', expiryDate: formData.expiryDate || '', purpose: formData.purpose || '',
        cardHolder: formData.cardHolder || '', custodian: formData.custodian || '', isActive: true, isExpiringSoon: isExpiring,
      };
      setCards(prev => [...prev, newCard]);
    }
    setIsModalOpen(false);
    setEditingCard(null);
  };

  const handleToggleActive = (cardId: string) => setCards(prev => prev.map(c => c.id === cardId ? { ...c, isActive: !c.isActive } : c));
  const handleDelete = (cardId: string) => setCards(prev => prev.filter(c => c.id !== cardId));

  return (
    <div className="space-y-6">
      {expiringCards.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={14} className="text-amber-600" /><span className="text-[13px] font-bold text-amber-800">信用卡即將到期提醒</span></div>
          <div className="space-y-1">{expiringCards.map(c => <p key={c.id} className="text-[12px] text-amber-700">{c.companyName} •••• {c.lastFour} ({c.bank}) — 到期日：{c.expiryDate} — 用途：{c.purpose}</p>)}</div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(card => (
          <div key={card.id} className={cn('bg-white rounded-md border shadow-card p-5 transition-all group relative', card.isExpiringSoon ? 'border-amber-300' : 'border-[rgba(13,26,45,0.08)]', !card.isActive && 'opacity-60')}>
            <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditingCard(card); setIsModalOpen(true); }} className="text-teal-600 hover:text-teal-700 p-1 rounded hover:bg-teal-50"><Edit size={13} /></button>
              <button onClick={() => handleToggleActive(card.id)} className={cn('p-1 rounded', card.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-teal-600 hover:bg-teal-50')} title={card.isActive ? '停用' : '啟用'}>{card.isActive ? <EyeOff size={13} /> : <Eye size={13} />}</button>
              <button onClick={() => handleDelete(card.id)} className="text-rose-500 hover:text-rose-600 p-1 rounded hover:bg-rose-50"><Trash2 size={13} /></button>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><CreditCard size={16} className="text-teal-600" /><span className="text-[14px] font-bold">{card.companyName}</span></div>
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', card.isActive ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-600')}>{card.isActive ? '使用中' : '已停用'}</span>
            </div>
            <div className="flex items-center gap-2 mb-3"><span className="text-[18px] font-mono tracking-wider">•••• •••• •••• {card.lastFour}</span></div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div><span className="text-muted-foreground block">銀行</span><span className="font-medium">{card.bank}</span></div>
              <div><span className="text-muted-foreground block">到期日</span><span className={cn('font-medium', card.isExpiringSoon && 'text-amber-600')}>{card.expiryDate} {card.isExpiringSoon && '⚠️'}</span></div>
              <div><span className="text-muted-foreground block">用途</span><span className="font-medium">{card.purpose}</span></div>
              <div><span className="text-muted-foreground block">持卡人</span><span className="font-medium">{card.cardHolder}</span></div>
              <div><span className="text-muted-foreground block">保管人</span><span className="font-medium">{card.custodian}</span></div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => { setEditingCard(null); setIsModalOpen(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]">
        <Plus size={14} />新增信用卡
      </button>
      {isModalOpen && <CreditCardFormModal card={editingCard} onSave={handleSave} onClose={() => { setIsModalOpen(false); setEditingCard(null); }} />}
    </div>
  );
}

// ===== Credit Card Form Modal =====
function CreditCardFormModal({ card, onSave, onClose }: { card: CreditCardEntry | null; onSave: (data: Partial<CreditCardEntry>) => void; onClose: () => void }) {
  const [formData, setFormData] = useState<Partial<CreditCardEntry>>({
    companyName: card?.companyName || '', lastFour: card?.lastFour || '', bank: card?.bank || '',
    expiryDate: card?.expiryDate || '', purpose: card?.purpose || '', cardHolder: card?.cardHolder || '', custodian: card?.custodian || '',
  });
  const [showCardNumber, setShowCardNumber] = useState(false);
  const bankOptions = ['HSBC', 'Bank of China', 'Hang Seng', 'DBS', 'Standard Chartered', 'Citibank', 'Other'];

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[500px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[18px] font-bold">{card ? '編輯信用卡' : '新增信用卡'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">所屬公司 *</label>
              <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}>
                <option value="">選擇公司</option>
                {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">銀行 *</label>
              <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" value={formData.bank} onChange={(e) => setFormData({ ...formData, bank: e.target.value })}>
                <option value="">選擇銀行</option>
                {bankOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">卡號末四位 *</label>
              <div className="relative">
                <input type={showCardNumber ? 'text' : 'password'} maxLength={4} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" value={formData.lastFour} onChange={(e) => setFormData({ ...formData, lastFour: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="0000" />
                <button type="button" onClick={() => setShowCardNumber(!showCardNumber)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showCardNumber ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">到期日 (YYYY-MM) *</label>
              <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" value={formData.expiryDate} onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })} placeholder="2025-12" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">用途</label>
            <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" value={formData.purpose} onChange={(e) => setFormData({ ...formData, purpose: e.target.value })} placeholder="例：廣告投放、工具訂閱" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">卡主</label>
              <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" value={formData.cardHolder} onChange={(e) => setFormData({ ...formData, cardHolder: e.target.value })} placeholder="持卡人名稱" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">保管人</label>
              <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" value={formData.custodian} onChange={(e) => setFormData({ ...formData, custodian: e.target.value })} placeholder="保管人名稱" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/50">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors">取消</button>
          <button onClick={() => onSave(formData)} disabled={!formData.companyName || !formData.lastFour || !formData.bank} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Save size={13} /> {card ? '儲存' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== By Company View =====
function ByCompanyView() {
  const [invoices] = useState<Invoice[]>(initialInvoices);
  const companies = [...new Set(invoices.map(i => i.company))];

  return (
    <div className="space-y-6">
      {companies.map(companyName => {
        const companyInvoices = invoices.filter(i => i.company === companyName);
        const totalAmount = companyInvoices.reduce((s, i) => s + i.amount, 0);
        const totalPaid = companyInvoices.reduce((s, i) => s + i.paidAmount, 0);
        const totalOverdue = companyInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
        return (
          <div key={companyName} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-teal-50 flex items-center justify-center"><Building2 size={16} className="text-teal-600" /></div>
                  <div><h4 className="text-[15px] font-bold">{companyName}</h4><span className="text-[11px] text-muted-foreground">{companyInvoices.length} 張發票</span></div>
                </div>
                <div className="flex items-center gap-6 text-[12px]">
                  <div className="text-right"><span className="text-muted-foreground block">總額</span><span className="font-bold">${totalAmount.toLocaleString()}</span></div>
                  <div className="text-right"><span className="text-muted-foreground block">已收</span><span className="font-bold text-teal-600">${totalPaid.toLocaleString()}</span></div>
                  <div className="text-right"><span className="text-muted-foreground block">逾期</span><span className={cn('font-bold', totalOverdue > 0 ? 'text-rose-500' : 'text-muted-foreground')}>${totalOverdue.toLocaleString()}</span></div>
                  <div className="text-right"><span className="text-muted-foreground block">收款率</span><span className="font-bold">{totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0}%</span></div>
                </div>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-5 py-2">發票 #</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-5 py-2">客戶</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-5 py-2">金額</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-5 py-2">已付</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-5 py-2">到期日</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-5 py-2">狀態</th>
                </tr>
              </thead>
              <tbody>
                {companyInvoices.map(inv => {
                  const config = invoiceStatusConfig[inv.status];
                  const StatusIcon = config.icon;
                  return (
                    <tr key={inv.id} className={cn('border-b border-border/30 hover:bg-muted/10', inv.status === 'overdue' && 'bg-rose-50/20')}>
                      <td className="px-5 py-2.5 text-[13px] font-medium">{inv.invoiceNumber}</td>
                      <td className="px-5 py-2.5 text-[13px]">{inv.client}</td>
                      <td className="px-5 py-2.5 text-[13px] font-medium">${inv.amount.toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-[13px]">${inv.paidAmount.toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-[13px] text-muted-foreground">{inv.dueDate}</td>
                      <td className="px-5 py-2.5"><span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}><StatusIcon size={9} />{config.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ===== Main Module =====
export function FinanceModule({ subModule }: { subModule?: string }) {
  const getTitle = () => {
    switch (subModule) {
      case 'invoices': return { title: '發票列表', subtitle: '查看及管理所有發票記錄。' };
      case 'payments': return { title: '付款追蹤', subtitle: '追蹤付款狀態及收款進度。' };
      case 'credit-cards': return { title: '信用卡管理', subtitle: '管理公司信用卡及到期提醒。' };
      case 'by-company': return { title: '按公司查看', subtitle: '按公司分開查看財務報告。' };
      default: return { title: '發票列表', subtitle: '查看及管理所有發票記錄。' };
    }
  };

  const { title, subtitle } = getTitle();

  const renderContent = () => {
    switch (subModule) {
      case 'invoices': return <InvoiceList />;
      case 'payments': return <PaymentTracker />;
      case 'credit-cards': return <CreditCardManagement />;
      case 'by-company': return <ByCompanyView />;
      default: return <InvoiceList />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {renderContent()}
    </div>
  );
}
