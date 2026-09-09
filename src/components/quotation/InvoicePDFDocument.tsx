import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FINANCIAL_MASK, formatDocumentMoney, type InvoiceForm, type InvoiceLineItem } from '@/lib/invoiceReceipts';
import { resolvePdfBranding, type CompanyBrandingSource, type PdfBranding } from '@/lib/pdfBranding';

function registerFonts() {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  Font.register({
    family: 'NotoSansSC',
    fonts: [
      { src: `${base}/fonts/NotoSansSC-Regular.ttf`, fontWeight: 'normal' },
      { src: `${base}/fonts/NotoSansSC-Bold.ttf`, fontWeight: 'bold' },
    ],
  });
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 40,
    fontSize: 8,
    fontFamily: 'NotoSansSC',
    color: '#1a1a1a',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  logoImg: { width: 100, height: 36, objectFit: 'contain', marginBottom: 6 },
  companyName: { fontSize: 9, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 1 },
  companyNameChinese: { fontSize: 8.5, color: '#333', marginBottom: 2 },
  companyAddress: { fontSize: 6.5, color: '#666', lineHeight: 1.4 },
  titleBlock: { alignItems: 'flex-end' },
  invoiceTitle: { fontSize: 16, fontWeight: 'bold', color: '#2563EB', letterSpacing: 1 },
  invoiceNumber: { fontSize: 8, color: '#888', marginTop: 3 },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  infoLeft: { flex: 1 },
  infoRight: { flex: 1, alignItems: 'flex-end' },
  infoLabel: { fontSize: 6.5, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { fontSize: 9, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 2 },
  infoValueSm: { fontSize: 8, color: '#555', marginBottom: 1 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderTopWidth: 0.8,
    borderBottomWidth: 0.8,
    borderTopColor: '#d1d5db',
    borderBottomColor: '#d1d5db',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  colItem: { flex: 4, fontSize: 7.5 },
  colQty: { flex: 1, textAlign: 'center', fontSize: 7.5 },
  colPrice: { flex: 1.5, textAlign: 'right', fontSize: 7.5 },
  colAmount: { flex: 1.5, textAlign: 'right', fontSize: 7.5, fontWeight: 'bold' },
  colHeaderText: { fontSize: 6.5, fontWeight: 'bold', color: '#555' },
  totalsBlock: { alignItems: 'flex-end', marginTop: 10, marginBottom: 14 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', width: 200, marginBottom: 3 },
  totalsLabel: { fontSize: 7.5, color: '#666' },
  totalsValue: { fontSize: 7.5, fontWeight: 'bold' },
  totalsGrandLabel: { fontSize: 10, fontWeight: 'bold', color: '#1a1a1a' },
  totalsGrandValue: { fontSize: 11, fontWeight: 'bold', color: '#2563EB' },
  contactLine: { fontSize: 6.5, color: '#888', marginTop: 6 },
  totalsDivider: { width: 200, borderBottomWidth: 1, borderBottomColor: '#d1d5db', marginVertical: 4 },
  discountText: { color: '#EF4444' },
  noteBlock: { backgroundColor: '#f9fafb', borderRadius: 4, padding: 8, marginBottom: 10 },
  noteTitle: { fontSize: 6.5, fontWeight: 'bold', color: '#888', marginBottom: 3 },
  noteContent: { fontSize: 7, color: '#555', lineHeight: 1.5 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  paymentBlock: { flex: 1, padding: 8, paddingRight: 12 },
  paymentTitle: { fontSize: 6.5, fontWeight: 'bold', color: '#888', marginBottom: 3 },
  paymentContent: { fontSize: 7, color: '#333', lineHeight: 1.4 },
  chopBox: { width: 90, alignItems: 'center', paddingBottom: 2 },
  chopImg: { width: 70, height: 70, objectFit: 'contain', marginBottom: -10 },
  chopLine: { borderBottomWidth: 1, borderBottomColor: '#333', marginBottom: 4, height: 30, width: '100%' },
  chopLabel: { fontSize: 7, color: '#666', textAlign: 'center' },
  footerSection: { position: 'absolute', bottom: 20, left: 40, right: 40 },
  footerCopyright: {
    textAlign: 'center',
    fontSize: 6,
    color: '#aaa',
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
});

function formatPdfMoney(v: number | null | undefined, canView = true): string {
  if (!canView) return FINANCIAL_MASK;
  if (v == null) return '-';
  return formatDocumentMoney(v);
}

function formatDateStr(d: string | null | undefined): string {
  if (!d) return '-';
  const date = new Date(`${d.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function InvoicePDFDocument({
  form,
  lines,
  company,
  mainAmount,
  subItemsTotal: _subItemsTotal,
  grossTotal,
  discountVal,
  netTotal,
  canViewFinancialValues = true,
  branding,
}: {
  form: InvoiceForm;
  lines: InvoiceLineItem[];
  company: CompanyBrandingSource | null;
  mainAmount: number;
  subItemsTotal: number;
  grossTotal: number;
  discountVal: number;
  netTotal: number;
  canViewFinancialValues?: boolean;
  branding?: PdfBranding | null;
}) {
  registerFonts();
  const formatMoney = (v: number | null | undefined) => formatPdfMoney(v, canViewFinancialValues);
  const resolved = resolvePdfBranding(company, branding);
  const showCompanyName = resolved.companyName.visible;
  const showCompanyLogo = resolved.companyLogo.visible;
  const showCompanyChop = resolved.companyChop.visible;
  const showPaymentInfo = resolved.paymentInfo.visible;
  const logoUrl = resolved.companyLogo.value.url || '';
  const companyDisplay = resolved.companyName.value.display || company?.display || '';
  const companyChinese = resolved.companyName.value.chineseDisplay || company?.chineseDisplay;
  const bankNotes = resolved.paymentInfo.value.bankNotes;
  const chopUrl = resolved.companyChop.value.url;
  const address = company?.address?.trim() || '';
  const showHeaderCompany = showCompanyName || showCompanyLogo;
  const showPaymentRow = (showPaymentInfo && !!bankNotes) || (showCompanyChop && !!chopUrl);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {showHeaderCompany ? (
              <View>
                {showCompanyLogo && logoUrl ? <Image src={logoUrl} style={styles.logoImg} /> : null}
                {showCompanyName ? <Text style={styles.companyName}>{companyDisplay}</Text> : null}
                {showCompanyName && companyChinese ? (
                  <Text style={styles.companyNameChinese}>{companyChinese}</Text>
                ) : null}
                {address ? <Text style={styles.companyAddress}>{address}</Text> : null}
              </View>
            ) : null}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.invoiceTitle}>INVOICE 發票</Text>
            <Text style={styles.invoiceNumber}>#INV: {form.invoiceNo || '-'}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoLeft}>
            <Text style={styles.infoLabel}>致 BILL TO</Text>
            <Text style={styles.infoValue}>{form.billToName || '-'}</Text>
            <Text style={styles.infoValueSm}>項目: {form.projectName || '-'}</Text>
          </View>
          <View style={styles.infoRight}>
            <Text style={styles.infoValueSm}>發票日期 Date: {formatDateStr(form.invoiceDate)}</Text>
            <Text style={styles.infoValueSm}>到期日 Due Date: {formatDateStr(form.dueDate)}</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.colItem, styles.colHeaderText]}>項目 Item</Text>
          <Text style={[styles.colQty, styles.colHeaderText]}>數量 Qty</Text>
          <Text style={[styles.colPrice, styles.colHeaderText]}>單價 Price</Text>
          <Text style={[styles.colAmount, styles.colHeaderText]}>金額 Amount</Text>
        </View>

        <View style={styles.tableRow}>
          <View style={[styles.colItem, { fontWeight: 'bold' }]}>
            {(form.mainItemName || '-').split('\n').map((line, idx) => (
              <Text key={idx} style={idx === 0 ? { fontWeight: 'bold' } : { fontWeight: 'normal', fontSize: 8 }}>
                {line}
              </Text>
            ))}
          </View>
          <Text style={styles.colQty}>{mainAmount === 0 ? '' : form.mainItemQty}</Text>
          <Text style={styles.colPrice}>{mainAmount === 0 ? '' : formatMoney(form.mainItemPrice)}</Text>
          <Text style={styles.colAmount}>{mainAmount === 0 ? '' : formatMoney(mainAmount)}</Text>
        </View>

        {lines.map((line, i) => (
          <View style={styles.tableRow} key={line.id ?? i}>
            <Text style={[styles.colItem, { color: '#444' }]}>{line.itemName || '-'}</Text>
            <Text style={[styles.colQty, { color: '#666' }]}>{line.quantity}</Text>
            <Text style={[styles.colPrice, { color: '#666' }]}>{formatMoney(line.price)}</Text>
            <Text style={styles.colAmount}>{formatMoney(line.amount)}</Text>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>小計 Subtotal</Text>
            <Text style={styles.totalsValue}>{formatMoney(grossTotal)}</Text>
          </View>
          {form.enableDiscount && discountVal > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsLabel, styles.discountText]}>
                折扣 Discount{form.discountDescription ? ` (${form.discountDescription})` : ''}
              </Text>
              <Text style={[styles.totalsValue, styles.discountText]}>-{formatMoney(discountVal)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalsGrandLabel}>合計 Total</Text>
            <Text style={styles.totalsGrandValue}>{formatMoney(netTotal)}</Text>
          </View>
        </View>

        <View style={styles.footerSection}>
          {form.note ? (
            <View style={styles.noteBlock}>
              <Text style={styles.noteTitle}>備註 Note:</Text>
              <Text style={styles.noteContent}>{form.note}</Text>
            </View>
          ) : null}
          {showPaymentRow ? (
            <View style={styles.paymentRow}>
              {showPaymentInfo && bankNotes ? (
                <View style={styles.paymentBlock}>
                  <Text style={styles.paymentTitle}>付款資料 Payment Information:</Text>
                  <Text style={styles.paymentContent}>{bankNotes}</Text>
                </View>
              ) : (
                <View style={styles.paymentBlock} />
              )}
              {showCompanyChop && chopUrl ? (
                <View style={styles.chopBox}>
                  <Image src={chopUrl} style={styles.chopImg} />
                  <View style={styles.chopLine} />
                  <Text style={styles.chopLabel}>公司印章 Company Chop</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {company?.phone ? <Text style={styles.contactLine}>{company.phone}</Text> : null}
          <Text style={styles.footerCopyright}>
            This is a computer generated invoice. | {companyDisplay} © {new Date().getFullYear()}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
