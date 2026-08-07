import React, { useRef, useState, useCallback } from 'react';
import { X, Printer, Download, Loader2, CheckCircle2, Edit3, Save, Plus, Trash2, GripVertical, FileText, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  QuotationEntry,
  QuotationServiceItem,
  PaymentStage,
  quotationTypes,
  termsTemplates,
} from '@/data/quotationData';

interface QuotationPreviewProps {
  quote: QuotationEntry;
  onClose: () => void;
  onUpdateQuote?: (updatedQuote: QuotationEntry) => void;
}

export function QuotationPreview({ quote: initialQuote, onClose, onUpdateQuote }: QuotationPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [quote, setQuote] = useState<QuotationEntry>({ ...initialQuote });
  const [isEditing, setIsEditing] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfGenerated, setPdfGenerated] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showTermsSelector, setShowTermsSelector] = useState(false);

  const qType = quotationTypes.find(t => t.id === quote.quotationType);
  const canGeneratePdf = quote.status === 'approved' || quote.status === 'won';

  // Get available terms templates for this quotation type
  const availableTermsTemplates = termsTemplates.filter(
    t => t.quotationTypeId === quote.quotationType || t.quotationTypeId === 'all'
  );

  // === Calculation helpers ===
  const getServiceSubtotal = (svc: QuotationServiceItem) => {
    let itemTotal = svc.price * svc.quantity;
    if (svc.discount > 0) {
      if (svc.discountType === 'percentage') {
        itemTotal = itemTotal * (1 - svc.discount / 100);
      } else {
        itemTotal = itemTotal - svc.discount;
      }
    }
    return Math.round(itemTotal);
  };

  const getDiscountText = (svc: QuotationServiceItem) => {
    if (svc.discount <= 0) return '-';
    if (svc.discountType === 'percentage') return `${svc.discount}%`;
    return `$${svc.discount.toLocaleString()}`;
  };

  const calculateTotal = useCallback((services: QuotationServiceItem[], overallDiscount: number, overallDiscountType: 'percentage' | 'fixed') => {
    const subtotal = services.filter(s => s.isSelected).reduce((acc, svc) => {
      let itemTotal = svc.price * svc.quantity;
      if (svc.discount > 0) {
        if (svc.discountType === 'percentage') {
          itemTotal = itemTotal * (1 - svc.discount / 100);
        } else {
          itemTotal = itemTotal - svc.discount;
        }
      }
      return acc + Math.round(itemTotal);
    }, 0);
    if (overallDiscount > 0) {
      if (overallDiscountType === 'percentage') {
        return Math.round(subtotal * (1 - overallDiscount / 100));
      }
      return subtotal - overallDiscount;
    }
    return subtotal;
  }, []);

  const selectedServices = quote.services.filter(s => s.isSelected);

  // === Edit handlers ===
  const handleServiceChange = (idx: number, field: keyof QuotationServiceItem, value: any) => {
    const updated = [...quote.services];
    const serviceIdx = quote.services.findIndex(s => s.id === selectedServices[idx].id);
    (updated[serviceIdx] as any)[field] = value;
    const newTotal = calculateTotal(updated, quote.overallDiscount, quote.overallDiscountType);
    setQuote({ ...quote, services: updated, amount: newTotal });
  };

  const handleAddService = () => {
    const newService: QuotationServiceItem = {
      id: `svc_new_${Date.now()}`,
      name: '新服務項目',
      price: 0,
      cost: 0,
      supplierName: '',
      quantity: 1,
      discount: 0,
      discountType: 'fixed',
      isVisible: true,
      isSelected: true,
    };
    const updated = [...quote.services, newService];
    setQuote({ ...quote, services: updated });
  };

  const handleRemoveService = (idx: number) => {
    const serviceId = selectedServices[idx].id;
    const updated = quote.services.filter(s => s.id !== serviceId);
    const newTotal = calculateTotal(updated, quote.overallDiscount, quote.overallDiscountType);
    setQuote({ ...quote, services: updated, amount: newTotal });
  };

  const handlePaymentChange = (idx: number, field: keyof PaymentStage, value: any) => {
    const updated = [...quote.paymentArrangement];
    (updated[idx] as any)[field] = value;
    setQuote({ ...quote, paymentArrangement: updated });
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const items = [...selectedServices];
    const [moved] = items.splice(dragIdx, 1);
    items.splice(idx, 0, moved);
    const nonSelected = quote.services.filter(s => !s.isSelected);
    setQuote({ ...quote, services: [...items, ...nonSelected] });
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  const handleSaveEdits = () => {
    const newTotal = calculateTotal(quote.services, quote.overallDiscount, quote.overallDiscountType);
    const updatedQuote = { ...quote, amount: newTotal };
    setQuote(updatedQuote);
    setIsEditing(false);
    onUpdateQuote?.(updatedQuote);
    toast.success('報價單內容已更新');
  };

  // === PDF via browser print (supports Chinese characters natively) ===
  const handleGeneratePDF = async () => {
    setPdfGenerating(true);
    setPdfGenerated(false);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));

      const printContent = printRef.current;
      if (!printContent) throw new Error('No content');

      const printWindow = window.open('', '_blank', 'width=900,height=1200');
      if (!printWindow) throw new Error('Popup blocked');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${quote.quoteId} - 報價單</title>
          <style>
            @page {
              size: A4;
              margin: 15mm 18mm 15mm 18mm;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans TC", "Noto Sans SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif;
              font-size: 10pt;
              color: #0d1a2d;
              line-height: 1.5;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page {
              width: 100%;
              max-width: 210mm;
              margin: 0 auto;
            }
            .header {
              background-color: #0D9488;
              color: white;
              padding: 16px 24px;
              margin: -15mm -18mm 0 -18mm;
              padding: 18mm 18mm 12px 18mm;
            }
            .header h1 {
              font-size: 20pt;
              font-weight: 700;
              margin-bottom: 2px;
            }
            .header .subtitle {
              font-size: 9pt;
              opacity: 0.9;
            }
            .quote-info {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-top: 20px;
              margin-bottom: 12px;
            }
            .quote-info h2 {
              font-size: 16pt;
              font-weight: 700;
            }
            .quote-meta {
              text-align: right;
              color: #64748b;
              font-size: 9pt;
            }
            .client-box {
              background-color: #f5f8fc;
              padding: 12px 16px;
              margin-bottom: 18px;
              border-radius: 4px;
            }
            .client-box .row {
              display: flex;
              gap: 8px;
              margin-bottom: 4px;
            }
            .client-box .label {
              font-weight: 700;
              min-width: 80px;
            }
            .section-title {
              font-size: 11pt;
              font-weight: 700;
              margin-bottom: 6px;
              margin-top: 16px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 8px;
            }
            table th {
              background-color: #0D9488;
              color: white;
              font-size: 9pt;
              font-weight: 600;
              padding: 8px 10px;
              text-align: left;
            }
            table th.right { text-align: right; }
            table th.center { text-align: center; }
            table td {
              padding: 8px 10px;
              font-size: 9pt;
              border-bottom: 1px solid #e2e8f0;
            }
            table td.right { text-align: right; }
            table td.center { text-align: center; }
            table tr:nth-child(even) td {
              background-color: #f8fafc;
            }
            .total-bar {
              display: flex;
              justify-content: flex-end;
              margin-top: 8px;
              margin-bottom: 18px;
            }
            .total-box {
              background-color: #0D9488;
              color: white;
              padding: 8px 20px;
              font-size: 12pt;
              font-weight: 700;
              border-radius: 4px;
            }
            .discount-note {
              text-align: right;
              color: #64748b;
              font-size: 9pt;
              margin-bottom: 4px;
            }
            .payment-table th {
              background-color: #64748b;
            }
            .terms-list {
              list-style: none;
              padding: 0;
            }
            .terms-list li {
              font-size: 9pt;
              color: #475569;
              margin-bottom: 4px;
              padding-left: 8px;
            }
            .footer {
              margin-top: 24px;
              padding-top: 10px;
              border-top: 1px solid #cbd5e1;
            }
            .footer p {
              font-size: 8pt;
              color: #94a3b8;
            }
            .footer .row {
              display: flex;
              justify-content: space-between;
            }
            .edit-input, .edit-controls, .drag-handle, .add-btn, .remove-btn {
              display: none !important;
            }
            @media print {
              .header {
                margin: -15mm -18mm 0 -18mm;
                padding: 14mm 18mm 12px 18mm;
              }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
            };
          <\/script>
        </body>
        </html>
      `);

      printWindow.document.close();
      setPdfGenerated(true);
      toast.success('PDF 預覽已開啟！', {
        description: `請在瀏覽器列印對話框中選擇「儲存為 PDF」以下載完整中文報價單。`,
        duration: 5000,
      });
      setTimeout(() => setPdfGenerated(false), 3000);
    } catch (err) {
      toast.error('PDF 生成失敗，請檢查是否已允許彈出視窗。');
    } finally {
      setPdfGenerating(false);
    }
  };

  const handlePrint = () => {
    handleGeneratePDF();
  };

  // Get current services for display
  const displayServices = quote.services.filter(s => s.isSelected);

  return (
    <div className="fixed inset-0 m-0 z-[9999] bg-black/60 flex flex-col">
      {/* Top toolbar */}
      <div className="bg-white border-b border-border flex items-center justify-between px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">報價單預覽</h3>
          <span className="text-xs text-muted-foreground">{quote.quoteId}</span>
          {isEditing && (
            <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
              編輯模式
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-4 py-2 border border-amber-200 text-amber-700 rounded-md text-sm font-medium hover:bg-amber-50 transition-colors"
              >
                <Edit3 size={14} />
                編輯內容
              </button>
              {canGeneratePdf && (
                <button
                  onClick={handleGeneratePDF}
                  disabled={pdfGenerating}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {pdfGenerating ? (
                    <><Loader2 size={14} className="animate-spin" />正在生成 PDF...</>
                  ) : pdfGenerated ? (
                    <><CheckCircle2 size={14} />已開啟</>
                  ) : (
                    <><Download size={14} />生成 PDF</>
                  )}
                </button>
              )}
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 border border-teal-200 text-teal-600 rounded-md text-sm font-medium hover:bg-teal-50 transition-colors"
              >
                <Printer size={14} />
                列印 / 儲存 PDF
              </button>
            </>
          ) : (
            <button
              onClick={handleSaveEdits}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Save size={14} />
              儲存變更
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
          >
            <X size={14} />
            關閉
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto bg-gray-200 p-8 flex justify-center">
        <div className="bg-white shadow-2xl w-full max-w-[210mm] min-h-[297mm]" style={{ fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans TC", sans-serif' }}>
          {/* Printable content */}
          <div ref={printRef}>
            <div className="page">
              {/* Header */}
              <div style={{ backgroundColor: '#0D9488', color: 'white', padding: '20px 28px', marginBottom: '0' }}>
                <h1 style={{ fontSize: '20pt', fontWeight: 700, marginBottom: '2px' }}>BWDesign Centre</h1>
                <p style={{ fontSize: '9pt', opacity: 0.9 }}>
                  {qType ? `${qType.name} | ${qType.nameEn}` : '報價單'}
                </p>
              </div>

              <div style={{ padding: '24px 28px 28px 28px' }}>
                {/* Quote Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <h2 style={{ fontSize: '16pt', fontWeight: 700 }}>QUOTATION</h2>
                  <div style={{ textAlign: 'right', color: '#64748b', fontSize: '9pt' }}>
                    <p>Quote No: {quote.quoteId}</p>
                    <p>Date: {quote.createdDate}</p>
                    {quote.approvedDate && <p>Approved: {quote.approvedDate}</p>}
                  </div>
                </div>

                {/* Client Box */}
                <div style={{ backgroundColor: '#f5f8fc', padding: '12px 16px', borderRadius: '4px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, minWidth: '80px' }}>Client:</span>
                    {isEditing ? (
                      <input
                        className="edit-input border border-amber-300 rounded px-2 py-0.5 text-[9pt] w-48 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        value={quote.client}
                        onChange={e => setQuote({ ...quote, client: e.target.value })}
                      />
                    ) : (
                      <span>{quote.client}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ fontWeight: 700, minWidth: '80px' }}>Project Type:</span>
                    <span>{qType?.name || '-'}</span>
                  </div>
                </div>

                {/* Service Items */}
                <h3 style={{ fontSize: '11pt', fontWeight: 700, marginBottom: '6px' }}>服務項目 Service Items</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
                  <thead>
                    <tr>
                      {isEditing && <th className="edit-controls" style={{ backgroundColor: '#0D9488', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 6px', textAlign: 'center', width: '30px' }}></th>}
                      <th style={{ backgroundColor: '#0D9488', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'left' }}>服務項目 Service</th>
                      <th style={{ backgroundColor: '#0D9488', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'center' }}>數量 Qty</th>
                      <th style={{ backgroundColor: '#0D9488', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'right' }}>單價 Unit Price</th>
                      <th style={{ backgroundColor: '#0D9488', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'center' }}>折扣 Discount</th>
                      <th style={{ backgroundColor: '#0D9488', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'right' }}>小計 Subtotal</th>
                      {isEditing && <th className="edit-controls" style={{ backgroundColor: '#0D9488', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 6px', textAlign: 'center', width: '30px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayServices.map((svc, idx) => (
                      <tr
                        key={svc.id}
                        style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : 'transparent' }}
                        draggable={isEditing}
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                      >
                        {isEditing && (
                          <td className="edit-controls drag-handle" style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center', cursor: 'grab' }}>
                            <GripVertical size={14} className="text-gray-400 mx-auto" />
                          </td>
                        )}
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0' }}>
                          {isEditing ? (
                            <input
                              className="edit-input border border-amber-300 rounded px-2 py-0.5 text-[9pt] w-full focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={svc.name}
                              onChange={e => handleServiceChange(idx, 'name', e.target.value)}
                            />
                          ) : (
                            svc.name
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                          {isEditing ? (
                            <input
                              type="number"
                              className="edit-input border border-amber-300 rounded px-2 py-0.5 text-[9pt] w-16 text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={svc.quantity}
                              onChange={e => handleServiceChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                            />
                          ) : (
                            svc.quantity
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                          {isEditing ? (
                            <input
                              type="number"
                              className="edit-input border border-amber-300 rounded px-1 py-0.5 text-[9pt] w-24 text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={svc.price}
                              onChange={e => handleServiceChange(idx, 'price', parseInt(e.target.value) || 0)}
                            />
                          ) : (
                            `$${svc.price.toLocaleString()}`
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                          {isEditing ? (
                            <input
                              type="number"
                              className="edit-input border border-amber-300 rounded px-1 py-0.5 text-[9pt] w-16 text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={svc.discount}
                              onChange={e => handleServiceChange(idx, 'discount', parseInt(e.target.value) || 0)}
                            />
                          ) : (
                            getDiscountText(svc)
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600 }}>
                          ${getServiceSubtotal(svc).toLocaleString()}
                        </td>
                        {isEditing && (
                          <td className="edit-controls remove-btn" style={{ padding: '4px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                            <button
                              onClick={() => handleRemoveService(idx)}
                              className="text-red-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Add service button (edit mode only) */}
                {isEditing && (
                  <div className="edit-controls add-btn" style={{ marginBottom: '8px' }}>
                    <button
                      onClick={handleAddService}
                      className="flex items-center gap-1.5 text-[11px] text-teal-600 hover:text-teal-700 font-medium px-2 py-1 border border-dashed border-teal-300 rounded hover:bg-teal-50 transition-colors"
                    >
                      <Plus size={12} />
                      新增服務項目
                    </button>
                  </div>
                )}

                {/* Overall discount note */}
                {quote.overallDiscount > 0 && (
                  <p style={{ textAlign: 'right', color: '#64748b', fontSize: '9pt', marginBottom: '4px' }}>
                    {quote.overallDiscountType === 'percentage'
                      ? `整體折扣 Overall Discount: ${quote.overallDiscount}%`
                      : `整體折扣 Overall Discount: $${quote.overallDiscount.toLocaleString()}`}
                  </p>
                )}

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', marginBottom: '20px' }}>
                  <div style={{ backgroundColor: '#0D9488', color: 'white', padding: '8px 20px', fontSize: '12pt', fontWeight: 700, borderRadius: '4px' }}>
                    Total: ${quote.amount.toLocaleString()}
                  </div>
                </div>

                {/* Payment Arrangement */}
                <h3 style={{ fontSize: '11pt', fontWeight: 700, marginBottom: '6px' }}>付款安排 Payment Arrangement</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px' }}>
                  <thead>
                    <tr>
                      <th style={{ backgroundColor: '#64748b', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'left' }}>階段 Stage</th>
                      <th style={{ backgroundColor: '#64748b', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'center' }}>%</th>
                      <th style={{ backgroundColor: '#64748b', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'right' }}>金額 Amount</th>
                      <th style={{ backgroundColor: '#64748b', color: 'white', fontSize: '9pt', fontWeight: 600, padding: '8px 10px', textAlign: 'left' }}>說明 Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.paymentArrangement.map((stage, idx) => (
                      <tr key={stage.id} style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : 'transparent' }}>
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0' }}>
                          {isEditing ? (
                            <input
                              className="edit-input border border-amber-300 rounded px-2 py-0.5 text-[9pt] w-24 focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={stage.label}
                              onChange={e => handlePaymentChange(idx, 'label', e.target.value)}
                            />
                          ) : (
                            stage.label
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                          {isEditing ? (
                            <input
                              type="number"
                              className="edit-input border border-amber-300 rounded px-1 py-0.5 text-[9pt] w-14 text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={stage.percentage}
                              onChange={e => handlePaymentChange(idx, 'percentage', parseInt(e.target.value) || 0)}
                            />
                          ) : (
                            `${stage.percentage}%`
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                          ${Math.round(quote.amount * stage.percentage / 100).toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '9pt', borderBottom: '1px solid #e2e8f0' }}>
                          {isEditing ? (
                            <input
                              className="edit-input border border-amber-300 rounded px-2 py-0.5 text-[9pt] w-full focus:outline-none focus:ring-1 focus:ring-amber-400"
                              value={stage.description}
                              onChange={e => handlePaymentChange(idx, 'description', e.target.value)}
                            />
                          ) : (
                            stage.description
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Terms & Conditions */}
                <h3 style={{ fontSize: '11pt', fontWeight: 700, marginBottom: '6px' }}>條款及細則 Terms & Conditions</h3>
                <div style={{ paddingLeft: '8px' }}>
                  {isEditing ? (
                    <div className="space-y-2">
                      {/* Template Selector */}
                      <div className="relative">
                        <button
                          onClick={() => setShowTermsSelector(!showTermsSelector)}
                          className="edit-input flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border border-teal-300 rounded bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors"
                        >
                          <FileText size={12} />
                          選擇條款範本
                          <ChevronDown size={11} className={`ml-1 transition-transform ${showTermsSelector ? 'rotate-180' : ''}`} />
                        </button>
                        {showTermsSelector && (
                          <div className="edit-input absolute left-0 top-full mt-1 w-[320px] bg-white border border-border rounded-md shadow-lg z-20 max-h-[200px] overflow-y-auto">
                            {availableTermsTemplates.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-muted-foreground">暫無可用範本</div>
                            ) : (
                              availableTermsTemplates.map(template => (
                                <button
                                  key={template.id}
                                  onClick={() => {
                                    setQuote({ ...quote, terms: template.content });
                                    setShowTermsSelector(false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-[rgba(13,26,45,0.04)] last:border-b-0 transition-colors"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-medium text-foreground">{template.name}</span>
                                    {template.isDefault && (
                                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">預設</span>
                                    )}
                                    {template.quotationTypeId === 'all' && (
                                      <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">通用</span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1">{template.content.split('\n')[0]}</p>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {/* Editable textarea */}
                      <textarea
                        className="edit-input border border-amber-300 rounded px-3 py-2 text-[9pt] w-full min-h-[120px] focus:outline-none focus:ring-1 focus:ring-amber-400 leading-relaxed"
                        value={quote.terms}
                        onChange={e => setQuote({ ...quote, terms: e.target.value })}
                        placeholder="輸入條款內容，或從上方選擇範本..."
                      />
                      <p className="edit-input text-[9px] text-muted-foreground">提示：可從範本選擇後再自行修改，或直接手動輸入。</p>
                    </div>
                  ) : (
                    (quote.terms || qType?.defaultTerms || '').split('\n').map((line, idx) => (
                      <p key={idx} style={{ fontSize: '9pt', color: '#475569', marginBottom: '4px' }}>{line}</p>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div style={{ marginTop: '28px', paddingTop: '10px', borderTop: '1px solid #cbd5e1' }}>
                  <p style={{ fontSize: '8pt', color: '#94a3b8', marginBottom: '4px' }}>
                    This quotation is valid for 30 days from the date of issue.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '8pt', color: '#94a3b8' }}>BWDesign Centre | www.bwdesign.com.hk</p>
                    <p style={{ fontSize: '8pt', color: '#94a3b8' }}>Generated: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
