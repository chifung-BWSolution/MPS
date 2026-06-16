import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  QuotationEntry,
  quotationTypes,
} from '@/data/quotationData';

export function generateQuotationPDF(quote: QuotationEntry): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Find quotation type for Logo + T&C
  const qType = quotationTypes.find(t => t.id === quote.quotationType);

  // === HEADER: Company Logo area ===
  doc.setFillColor(13, 148, 136); // teal-600
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('BWDesign Centre', margin, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('志豐企業有限公司', margin, 23);
  doc.setFontSize(8);
  doc.text('BR No: 12345678 | Bank: HSBC 123-456789-001', margin, 29);
  doc.text(qType ? `${qType.name} | ${qType.nameEn}` : 'Quotation', margin, 35);

  // Quote number on right header
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(quote.quoteId, pageWidth - margin, 16, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('QUOTATION', pageWidth - margin, 23, { align: 'right' });

  y = 48;

  // === TITLE ===
  doc.setTextColor(13, 26, 45);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTATION', margin, y);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Date: ${quote.createdDate}`, pageWidth - margin, y - 6, { align: 'right' });
  if (quote.approvedDate) {
    doc.text(`Approved: ${quote.approvedDate}`, pageWidth - margin, y, { align: 'right' });
  }
  doc.text('Valid: 30 days', pageWidth - margin, y + 6, { align: 'right' });

  y += 14;

  // === CLIENT INFO BOX ===
  doc.setFillColor(245, 248, 252);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F');
  doc.setTextColor(13, 26, 45);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Client:', margin + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(quote.client, margin + 25, y + 8);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Project Type:', margin + 5, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(qType?.name || '-', margin + 38, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.text('Mode:', margin + 90, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(quote.quotationMode === 'comprehensive' ? 'Comprehensive' : 'Single', margin + 105, y + 16);

  if (quote.approvedBy) {
    doc.setFont('helvetica', 'bold');
    doc.text('Approved by:', margin + 90, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(quote.approvedBy, margin + 118, y + 8);
  }

  y += 30;

  // === SERVICE ITEMS TABLE ===
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 26, 45);
  doc.text('Service Items', margin, y);
  y += 5;

  const selectedServices = quote.services.filter(s => s.isSelected);
  const tableData = selectedServices.map((svc, idx) => {
    let itemTotal = svc.price * svc.quantity;
    let discountText = '-';
    if (svc.discount > 0) {
      if (svc.discountType === 'percentage') {
        discountText = `${svc.discount}%`;
        itemTotal = itemTotal * (1 - svc.discount / 100);
      } else {
        discountText = `$${svc.discount.toLocaleString()}`;
        itemTotal = itemTotal - svc.discount;
      }
    }
    return [
      (idx + 1).toString(),
      svc.name,
      svc.quantity.toString(),
      `$${svc.price.toLocaleString()}`,
      discountText,
      `$${Math.round(itemTotal).toLocaleString()}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Service', 'Qty', 'Unit Price', 'Discount', 'Subtotal']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [13, 148, 136],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [13, 26, 45],
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 30, halign: 'right' },
    },
  });

  y = (doc as any).lastAutoTable?.finalY ?? y + 40;
  y += 10;

  // === TOTALS SUMMARY ===
  const subtotalBeforeDisc = selectedServices.reduce((acc, svc) => {
    let t = svc.price * svc.quantity;
    if (svc.discount > 0) {
      t = svc.discountType === 'percentage' ? t * (1 - svc.discount / 100) : t - svc.discount;
    }
    return acc + t;
  }, 0);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal:', pageWidth - margin - 60, y);
  doc.text(`$${Math.round(subtotalBeforeDisc).toLocaleString()}`, pageWidth - margin, y, { align: 'right' });
  y += 6;

  // Overall discount
  if (quote.overallDiscount > 0) {
    const discLabel = quote.overallDiscountType === 'percentage'
      ? `Overall Discount (${quote.overallDiscount}%):`
      : `Overall Discount:`;
    doc.text(discLabel, pageWidth - margin - 60, y);
    const discAmount = quote.overallDiscountType === 'percentage'
      ? Math.round(subtotalBeforeDisc * quote.overallDiscount / 100)
      : quote.overallDiscount;
    doc.setTextColor(239, 68, 68);
    doc.text(`-$${discAmount.toLocaleString()}`, pageWidth - margin, y, { align: 'right' });
    y += 6;
  }

  // Total amount box
  y += 2;
  doc.setFillColor(13, 148, 136);
  doc.roundedRect(pageWidth - margin - 68, y - 2, 68, 14, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Total:', pageWidth - margin - 63, y + 7);
  doc.setFontSize(13);
  doc.text(`$${quote.amount.toLocaleString()}`, pageWidth - margin - 3, y + 7, { align: 'right' });

  y += 22;

  // Check if we need a new page
  if (y > 220) {
    doc.addPage();
    y = margin;
  }

  // === PAYMENT ARRANGEMENT ===
  doc.setTextColor(13, 26, 45);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Arrangement', margin, y);
  y += 5;

  const paymentData = quote.paymentArrangement.map(stage => [
    stage.label,
    `${stage.percentage}%`,
    `$${Math.round(quote.amount * stage.percentage / 100).toLocaleString()}`,
    stage.description,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Stage', '%', 'Amount', 'Description']],
    body: paymentData,
    theme: 'grid',
    headStyles: {
      fillColor: [71, 85, 105],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [13, 26, 45],
    },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 15, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 'auto' },
    },
  });

  y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  y += 14;

  // Check if we need a new page for T&C
  if (y > 200) {
    doc.addPage();
    y = margin;
  }

  // === TERMS & CONDITIONS ===
  doc.setTextColor(13, 26, 45);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Terms & Conditions', margin, y);
  y += 7;

  const termsText = qType?.defaultTerms || quote.terms;
  const termsLines = termsText.split('\n');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  termsLines.forEach(line => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = margin;
    }
    const splitLines = doc.splitTextToSize(line, contentWidth);
    doc.text(splitLines, margin, y);
    y += splitLines.length * 3.5 + 2;
  });

  y += 10;

  // === FOOTER ===
  if (y > pageHeight - 35) {
    doc.addPage();
    y = margin;
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(13, 148, 136);
  doc.setFont('helvetica', 'bold');
  doc.text('Thank you for your business!', margin, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('This quotation is valid for 30 days from the date of issue.', margin, y);
  y += 4;
  doc.text('Contact: info@bwdesign.com.hk | +852 2123 4567', margin, y);
  y += 4;
  doc.text('BWDesign Centre | www.bwdesign.com.hk', margin, y);

  // Page numbers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, pageHeight - 10);
  }

  // Download with proper filename
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`${quote.quoteId}_BWDesign_${dateStr}.pdf`);
}
