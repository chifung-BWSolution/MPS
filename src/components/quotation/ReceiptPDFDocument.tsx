import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { FINANCIAL_MASK, formatDocumentMoney, type InvoiceLineItem, type ReceiptForm } from '@/lib/invoiceReceipts';
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
  receiptTitle: { fontSize: 16, fontWeight: 'bold', color: '#059669', letterSpacing: 1 },
  receiptNumber: { fontSize: 8, color: '#888', marginTop: 3 },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  infoLeft: { flex: 1 },
  infoRight: { flex: 1, alignItems: 'flex-end' },
  infoLabel: { fontSize: 6.5, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { fontSize: 9, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 2 },
  infoValueSm: { fontSize: 8, color: '#555', marginBottom: 1 },
  bodyBlock: { backgroundColor: '#f5f5f5', borderRadius: 6, padding: 12, marginBottom: 12 },
  bodyLabel: { fontSize: 6.5, fontWeight: 'bold', color: '#888', letterSpacing: 0.6, marginBottom: 10 },
  bodyAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bodyAmountLabel: { fontSize: 8, color: '#333' },
  bodyAmountValue: { fontSize: 16, fontWeight: 'bold', color: '#059669' },
  subTableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 4, paddingHorizontal: 4 },
  subTableRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  subColItem: { flex: 4, fontSize: 7.5 },
  subColQty: { flex: 1, textAlign: 'center', fontSize: 7.5 },
  subColPrice: { flex: 1.5, textAlign: 'right', fontSize: 7.5 },
  subColAmount: { flex: 1.5, textAlign: 'right', fontSize: 7.5 },
  subColHeaderText: { fontSize: 6.5, fontWeight: 'bold', color: '#555' },
  priceDiffBlock: { marginTop: 8 },
  priceDiffRow: { flexDirection: 'row', justifyContent: 'space-between' },
  priceDiffLabel: { fontSize: 7.5, color: '#EF4444' },
  priceDiffValue: { fontSize: 7.5, color: '#EF4444', fontWeight: 'bold' },
  totalsBlock: { alignItems: 'flex-end', marginTop: 10, marginBottom: 14 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', width: 200, marginBottom: 3 },
  totalsLabel: { fontSize: 7.5, color: '#666' },
  totalsValue: { fontSize: 7.5, fontWeight: 'bold' },
  totalsGrandLabel: { fontSize: 10, fontWeight: 'bold', color: '#1a1a1a' },
  totalsGrandValue: { fontSize: 11, fontWeight: 'bold', color: '#059669' },
  totalsDivider: { width: 200, borderBottomWidth: 1, borderBottomColor: '#d1d5db', marginVertical: 4 },
  ackBlock: {
    backgroundColor: '#ecfdf5',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#86efac',
    padding: 10,
    marginBottom: 16,
  },
  ackText: { fontSize: 8, color: '#047857', lineHeight: 1.5, textAlign: 'center' },
  signatureBlock: { alignItems: 'flex-end', marginBottom: 20 },
  signatureBoxCenter: { width: 120, alignItems: 'center' },
  chopImgCenter: { width: 70, height: 70, objectFit: 'contain', marginBottom: -10 },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: '#333', width: '100%', height: 24, marginBottom: 4 },
  signatureLabel: { fontSize: 7, color: '#666', textAlign: 'center' },
  noteBlock: { backgroundColor: '#f3f4f6', borderRadius: 3, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10 },
  noteTitle: { fontSize: 6.5, fontWeight: 'bold', color: '#888', marginBottom: 3 },
  noteContent: { fontSize: 7, color: '#555', lineHeight: 1.5 },
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

export function ReceiptPDFDocument({
  form,
  lines = [],
  company,
  subItemsTotal = 0,
  netTotal,
  canViewFinancialValues = true,
  branding,
}: {
  form: ReceiptForm;
  lines?: InvoiceLineItem[];
  company: CompanyBrandingSource | null;
  subItemsTotal?: number;
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
  const logoUrl = resolved.companyLogo.value.url || '';
  const companyDisplay = resolved.companyName.value.display || company?.display || '';
  const companyChinese = resolved.companyName.value.chineseDisplay || company?.chineseDisplay;
  const chopUrl = resolved.companyChop.value.url;
  const address = company?.address?.trim() || '';
  const showHeaderCompany = showCompanyName || showCompanyLogo;
  const amountReceived = form.amountReceived || 0;
  const hideMainAmount = amountReceived === 0;
  const receivedSubtotal = amountReceived + (subItemsTotal || 0);

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
            <Text style={styles.receiptTitle}>RECEIPT 收據</Text>
            <Text style={styles.receiptNumber}>#REC: {form.receiptNo || '-'}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoLeft}>
            <Text style={styles.infoLabel}>收款自 RECEIVED FROM</Text>
            <Text style={styles.infoValue}>{form.receivedFromName || '-'}</Text>
            <Text style={styles.infoValueSm}>項目: {form.projectName || '-'}</Text>
          </View>
          <View style={styles.infoRight}>
            <Text style={styles.infoValueSm}>收據日期: {formatDateStr(form.receiptDate)}</Text>
            <Text style={styles.infoValueSm}>付款日期: {formatDateStr(form.paymentDate)}</Text>
            {form.paymentMethod ? (
              <Text style={styles.infoValueSm}>付款方式: {form.paymentMethod}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.bodyBlock}>
          <Text style={styles.bodyLabel}>付款詳情 PAYMENT DETAILS</Text>
          {!hideMainAmount ? (
            <View style={styles.bodyAmountRow}>
              <Text style={styles.bodyAmountLabel}>收到金額 Amount Received</Text>
              <Text style={styles.bodyAmountValue}>{formatMoney(form.amountReceived)}</Text>
            </View>
          ) : null}
          {lines.length > 0 ? (
            <View>
              <View style={styles.subTableHeader}>
                <Text style={[styles.subColItem, styles.subColHeaderText]}>項目 Item</Text>
                <Text style={[styles.subColQty, styles.subColHeaderText]}>數量 Qty</Text>
                <Text style={[styles.subColPrice, styles.subColHeaderText]}>單價 Price</Text>
                <Text style={[styles.subColAmount, styles.subColHeaderText]}>金額 Amount</Text>
              </View>
              {lines.map((line, i) => (
                <View style={styles.subTableRow} key={line.id ?? i}>
                  <Text style={styles.subColItem}>{line.itemName || '-'}</Text>
                  <Text style={styles.subColQty}>{line.quantity}</Text>
                  <Text style={styles.subColPrice}>{formatMoney(line.price)}</Text>
                  <Text style={styles.subColAmount}>{formatMoney(line.amount)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {form.enablePriceDifference && form.priceDifference !== 0 ? (
            <View style={styles.priceDiffBlock}>
              <View style={styles.priceDiffRow}>
                <Text style={styles.priceDiffLabel}>
                  差額 Price Difference{form.priceDifferenceDescription ? ` (${form.priceDifferenceDescription})` : ''}
                </Text>
                <Text style={styles.priceDiffValue}>{formatMoney(form.priceDifference)}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.totalsBlock}>
          {!hideMainAmount ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>收到金額 Received</Text>
              <Text style={styles.totalsValue}>{formatMoney(form.amountReceived)}</Text>
            </View>
          ) : null}
          {lines.length > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{hideMainAmount ? '小計 Subtotal' : '附加項目 Sub Items'}</Text>
              <Text style={styles.totalsValue}>{formatMoney(subItemsTotal)}</Text>
            </View>
          ) : null}
          {!hideMainAmount && lines.length > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>小計 Subtotal</Text>
              <Text style={styles.totalsValue}>{formatMoney(receivedSubtotal)}</Text>
            </View>
          ) : null}
          {form.enablePriceDifference && form.priceDifference !== 0 ? (
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsLabel, { color: '#EF4444' }]}>差額 Diff</Text>
              <Text style={[styles.totalsValue, { color: '#EF4444' }]}>{formatMoney(form.priceDifference)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalsGrandLabel}>實收合計 Net Total</Text>
            <Text style={styles.totalsGrandValue}>{formatMoney(netTotal)}</Text>
          </View>
        </View>

        <View style={styles.ackBlock}>
          <Text style={styles.ackText}>
            茲確認收到上述款項。{'\n'}
            We hereby acknowledge receipt of the above payment.
          </Text>
        </View>

        <View style={styles.signatureBlock}>
          <View style={styles.signatureBoxCenter}>
            {showCompanyChop && chopUrl ? <Image src={chopUrl} style={styles.chopImgCenter} /> : null}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>公司印章 Company Chop</Text>
          </View>
        </View>

        <View style={styles.footerSection}>
          {form.notes ? (
            <View style={styles.noteBlock}>
              <Text style={styles.noteTitle}>備註 Note:</Text>
              <Text style={styles.noteContent}>{form.notes}</Text>
            </View>
          ) : null}
          <Text style={styles.footerCopyright}>
            This is a computer generated receipt. | {companyDisplay} © {new Date().getFullYear()}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
