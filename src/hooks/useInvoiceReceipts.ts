import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  INCOMES_TABLE,
  isIncomePaymentStatus,
  optionalIsoDate,
  type IncomePaymentStatus,
} from '@/lib/quotationIncomes';
import {
  INVOICE_FLOOR_ERROR,
  INVOICE_LINE_ITEMS_TABLE,
  INVOICES_TABLE,
  RECEIPT_LINE_ITEMS_TABLE,
  RECEIPTS_TABLE,
  buildMainItemName,
  companyToBrandingSource,
  defaultCompanyListId,
  invoiceGrossTotal,
  invoiceMainAmount,
  invoiceMeetsFloor,
  invoiceNetTotal,
  isReceiptPaymentMethod,
  lineAmount,
  nextInvoiceNo,
  nextReceiptNo,
  resolveCustomerName,
  todayIsoDate,
  DEFAULT_INVOICE_NOTE,
  DEFAULT_RECEIPT_NOTE,
  type IncomeDocumentSnippet,
  type InvoiceForm,
  type InvoiceLineItem,
  type ReceiptForm,
  type SavedInvoice,
  type SavedReceipt,
} from '@/lib/invoiceReceipts';
import { brandingFromCompany, parsePdfBranding, type CompanyBrandingSource, type PdfBranding } from '@/lib/pdfBranding';
import { QUOTATION_CLIENT_PROJECT_TABLE } from '@/hooks/useQuotationClientProjects';

type IncomeDbRow = {
  id: string;
  quotation_client_project_id: string;
  type: string;
  installment_number: number | null;
  billed_amount: number | string | null;
  due_date: string | null;
  payment_date: string | null;
  payment_status: string | null;
};

type InvoiceDbRow = {
  id: string;
  income_id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  bill_to_name: string | null;
  project_name: string | null;
  main_item_name: string | null;
  main_item_qty: number | string | null;
  main_item_price: number | string | null;
  main_item_amount: number | string | null;
  enable_discount: boolean | null;
  discount_description: string | null;
  discount_amount: number | string | null;
  total_amount: number | string | null;
  note: string | null;
  company_id: string | null;
  pdf_branding: unknown;
  created_at: string;
  updated_at: string;
};

type ReceiptDbRow = {
  id: string;
  income_id: string;
  invoice_id: string | null;
  receipt_no: string | null;
  receipt_date: string | null;
  payment_date: string | null;
  received_from_name: string | null;
  project_name: string | null;
  amount_received: number | string | null;
  payment_method: string | null;
  notes: string | null;
  enable_price_difference: boolean | null;
  price_difference: number | string | null;
  price_difference_description: string | null;
  company_id: string | null;
  pdf_branding: unknown;
  created_at: string;
  updated_at: string;
};

type LineDbRow = {
  id: string;
  item_name: string | null;
  quantity: number | string | null;
  price: number | string | null;
  amount: number | string | null;
};

type CompanyDbRow = {
  id: string;
  uuid: string | null;
  company_code: string;
  company_name_zh: string;
  company_name_en: string;
  bank_name: string | null;
  bank_account: string | null;
  address: string | null;
  logo_url: string | null;
  chop_url: string | null;
  bank_notes: string | null;
  contact_phone: string | null;
};

type ProjectEmbed = {
  id: string;
  display_name: string;
  pitching_code: string | null;
  client_id: string | null;
  client_name: string | null;
  project_types: string[] | null;
  quotation_client_list?: {
    company_name_zh: string | null;
    company_name_en: string | null;
    address: string | null;
  } | Array<{
    company_name_zh: string | null;
    company_name_en: string | null;
    address: string | null;
  }> | null;
};

function firstClientEmbed(embed: ProjectEmbed['quotation_client_list']) {
  if (!embed) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

export type WriteResult = { success: boolean; id?: string; error?: string };

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === 'object' && err && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function toAmount(value: number | string | null | undefined): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function optionalNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapIncome(row: IncomeDbRow): IncomeDocumentSnippet {
  return {
    id: row.id,
    amount: optionalNumber(row.billed_amount),
    installmentNo: row.installment_number ?? undefined,
    paymentStatus: isIncomePaymentStatus(row.payment_status) ? row.payment_status : row.payment_status ?? undefined,
    type: row.type,
  };
}

function mapLine(row: LineDbRow): InvoiceLineItem {
  const quantity = toAmount(row.quantity);
  const price = toAmount(row.price);
  return {
    id: row.id,
    itemName: row.item_name ?? '',
    quantity,
    price,
    amount: row.amount == null ? lineAmount(quantity, price) : toAmount(row.amount),
  };
}

export function mapCompanyRow(row: CompanyDbRow): CompanyBrandingSource {
  return companyToBrandingSource({
    uuid: row.uuid || row.id,
    companyCode: row.company_code,
    companyNameEn: row.company_name_en,
    companyNameZh: row.company_name_zh,
    logoUrl: row.logo_url,
    chopUrl: row.chop_url,
    bankNotes: row.bank_notes,
    bankName: row.bank_name,
    bankAccount: row.bank_account,
    address: row.address,
    contactPhone: row.contact_phone,
  });
}

function mapInvoice(
  row: InvoiceDbRow,
  lines: InvoiceLineItem[],
  income: IncomeDocumentSnippet,
): SavedInvoice {
  return {
    id: row.id,
    incomeId: row.income_id,
    invoiceNo: row.invoice_no ?? '',
    invoiceDate: optionalIsoDate(row.invoice_date) ?? '',
    dueDate: optionalIsoDate(row.due_date) ?? '',
    billToName: row.bill_to_name ?? '',
    projectName: row.project_name ?? '',
    mainItemName: row.main_item_name ?? '',
    mainItemQty: toAmount(row.main_item_qty) || 1,
    mainItemPrice: toAmount(row.main_item_price),
    mainItemAmount: toAmount(row.main_item_amount),
    enableDiscount: Boolean(row.enable_discount),
    discountDescription: row.discount_description ?? '',
    discountAmount: toAmount(row.discount_amount),
    totalAmount: toAmount(row.total_amount),
    note: row.note ?? '',
    companyId: row.company_id,
    pdfBranding: parsePdfBranding(row.pdf_branding),
    lines,
    income,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReceipt(
  row: ReceiptDbRow,
  lines: InvoiceLineItem[],
  income: IncomeDocumentSnippet,
): SavedReceipt {
  return {
    id: row.id,
    incomeId: row.income_id,
    invoiceId: row.invoice_id,
    receiptNo: row.receipt_no ?? '',
    receiptDate: optionalIsoDate(row.receipt_date) ?? '',
    paymentDate: optionalIsoDate(row.payment_date) ?? '',
    receivedFromName: row.received_from_name ?? '',
    projectName: row.project_name ?? '',
    amountReceived: toAmount(row.amount_received),
    paymentMethod: isReceiptPaymentMethod(row.payment_method) ? row.payment_method : '',
    notes: row.notes ?? '',
    enablePriceDifference: Boolean(row.enable_price_difference),
    priceDifference: toAmount(row.price_difference),
    priceDifferenceDescription: row.price_difference_description ?? '',
    companyId: row.company_id,
    pdfBranding: parsePdfBranding(row.pdf_branding),
    lines,
    income,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchCompaniesForBranding(): Promise<CompanyBrandingSource[]> {
  const { data, error } = await supabase
    .from('company_list')
    .select('id, uuid, company_code, company_name_zh, company_name_en, bank_name, bank_account, address, logo_url, chop_url, bank_notes, contact_phone')
    .order('company_code');
  if (error) throw error;
  return ((data as CompanyDbRow[] | null) ?? []).map(mapCompanyRow);
}

export async function fetchInvoiceByIncomeId(incomeId: string): Promise<SavedInvoice | null> {
  const { data, error } = await supabase
    .from(INVOICES_TABLE)
    .select('*')
    .eq('income_id', incomeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [linesRes, incomeRes] = await Promise.all([
    supabase.from(INVOICE_LINE_ITEMS_TABLE).select('*').eq('invoice_id', (data as InvoiceDbRow).id),
    supabase.from(INCOMES_TABLE).select('id, type, installment_number, billed_amount, payment_status').eq('id', incomeId).maybeSingle(),
  ]);
  if (linesRes.error) throw linesRes.error;
  if (incomeRes.error) throw incomeRes.error;
  const income = incomeRes.data
    ? mapIncome(incomeRes.data as IncomeDbRow)
    : { id: incomeId, amount: null, type: '' };
  return mapInvoice(data as InvoiceDbRow, ((linesRes.data as LineDbRow[] | null) ?? []).map(mapLine), income);
}

export async function fetchReceiptByIncomeId(incomeId: string): Promise<SavedReceipt | null> {
  const { data, error } = await supabase
    .from(RECEIPTS_TABLE)
    .select('*')
    .eq('income_id', incomeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [linesRes, incomeRes] = await Promise.all([
    supabase.from(RECEIPT_LINE_ITEMS_TABLE).select('*').eq('receipt_id', (data as ReceiptDbRow).id),
    supabase.from(INCOMES_TABLE).select('id, type, installment_number, billed_amount, payment_status').eq('id', incomeId).maybeSingle(),
  ]);
  if (linesRes.error) throw linesRes.error;
  if (incomeRes.error) throw incomeRes.error;
  const income = incomeRes.data
    ? mapIncome(incomeRes.data as IncomeDbRow)
    : { id: incomeId, amount: null, type: '' };
  return mapReceipt(data as ReceiptDbRow, ((linesRes.data as LineDbRow[] | null) ?? []).map(mapLine), income);
}

export async function countInvoices(): Promise<number> {
  const { count, error } = await supabase.from(INVOICES_TABLE).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function countReceipts(): Promise<number> {
  const { count, error } = await supabase.from(RECEIPTS_TABLE).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function fetchDocumentExistence(incomeIds: string[]): Promise<{
  invoices: Set<string>;
  receipts: Set<string>;
}> {
  const unique = [...new Set(incomeIds.filter(Boolean))];
  if (unique.length === 0) return { invoices: new Set(), receipts: new Set() };
  const [inv, rec] = await Promise.all([
    supabase.from(INVOICES_TABLE).select('income_id').in('income_id', unique),
    supabase.from(RECEIPTS_TABLE).select('income_id').in('income_id', unique),
  ]);
  if (inv.error) throw inv.error;
  if (rec.error) throw rec.error;
  return {
    invoices: new Set(((inv.data as { income_id: string }[] | null) ?? []).map((row) => row.income_id)),
    receipts: new Set(((rec.data as { income_id: string }[] | null) ?? []).map((row) => row.income_id)),
  };
}

function invoiceWriteRow(incomeId: string, form: InvoiceForm, lines: InvoiceLineItem[]) {
  const mainItemAmount = invoiceMainAmount(form.mainItemQty, form.mainItemPrice);
  const totalAmount = invoiceNetTotal(
    form.mainItemQty,
    form.mainItemPrice,
    lines,
    form.enableDiscount,
    form.discountAmount,
  );
  return {
    income_id: incomeId,
    invoice_no: form.invoiceNo.trim() || null,
    invoice_date: optionalIsoDate(form.invoiceDate) ?? null,
    due_date: optionalIsoDate(form.dueDate) ?? null,
    bill_to_name: form.billToName.trim() || null,
    project_name: form.projectName.trim() || null,
    main_item_name: form.mainItemName || null,
    main_item_qty: form.mainItemQty,
    main_item_price: form.mainItemPrice,
    main_item_amount: mainItemAmount,
    enable_discount: form.enableDiscount,
    discount_description: form.discountDescription.trim() || null,
    discount_amount: form.enableDiscount ? form.discountAmount : null,
    total_amount: totalAmount,
    note: form.note.trim() || null,
    company_id: form.companyId,
    pdf_branding: form.pdfBranding,
    updated_at: new Date().toISOString(),
  };
}

function receiptWriteRow(incomeId: string, form: ReceiptForm, lines: InvoiceLineItem[]) {
  return {
    income_id: incomeId,
    invoice_id: form.invoiceId,
    receipt_no: form.receiptNo.trim() || null,
    receipt_date: optionalIsoDate(form.receiptDate) ?? null,
    payment_date: optionalIsoDate(form.paymentDate) ?? null,
    received_from_name: form.receivedFromName.trim() || null,
    project_name: form.projectName.trim() || null,
    amount_received: form.amountReceived,
    payment_method: form.paymentMethod || null,
    notes: form.notes.trim() || null,
    enable_price_difference: form.enablePriceDifference,
    price_difference: form.enablePriceDifference ? form.priceDifference : null,
    price_difference_description: form.priceDifferenceDescription.trim() || null,
    company_id: form.companyId,
    pdf_branding: form.pdfBranding,
    updated_at: new Date().toISOString(),
  };
}

function lineWriteRows(parentKey: 'invoice_id' | 'receipt_id', parentId: string, lines: InvoiceLineItem[]) {
  return lines
    .filter((line) => line.itemName.trim() || line.price || line.quantity)
    .map((line) => ({
      [parentKey]: parentId,
      item_name: line.itemName.trim() || null,
      quantity: line.quantity,
      price: line.price,
      amount: lineAmount(line.quantity, line.price),
      updated_at: new Date().toISOString(),
    }));
}

function assertInvoiceFloor(form: InvoiceForm, lines: InvoiceLineItem[], incomeAmount: number | null | undefined) {
  const gross = invoiceGrossTotal(form.mainItemQty, form.mainItemPrice, lines);
  if (!invoiceMeetsFloor(gross, incomeAmount)) {
    throw new Error(INVOICE_FLOOR_ERROR);
  }
}

export async function createInvoice(
  incomeId: string,
  form: InvoiceForm,
  lines: InvoiceLineItem[],
  incomeAmount: number | null | undefined,
): Promise<WriteResult> {
  try {
    assertInvoiceFloor(form, lines, incomeAmount);
    const { data, error } = await supabase
      .from(INVOICES_TABLE)
      .insert(invoiceWriteRow(incomeId, form, lines))
      .select('id')
      .single();
    if (error || !data) return { success: false, error: error?.message ?? '儲存失敗' };
    const lineRows = lineWriteRows('invoice_id', data.id, lines);
    if (lineRows.length > 0) {
      const { error: lineError } = await supabase.from(INVOICE_LINE_ITEMS_TABLE).insert(lineRows);
      if (lineError) return { success: false, id: data.id, error: lineError.message };
    }
    return { success: true, id: data.id };
  } catch (err) {
    return { success: false, error: toErrorMessage(err, '儲存失敗') };
  }
}

export async function updateInvoice(
  id: string,
  incomeId: string,
  form: InvoiceForm,
  lines: InvoiceLineItem[],
  incomeAmount: number | null | undefined,
): Promise<WriteResult> {
  try {
    assertInvoiceFloor(form, lines, incomeAmount);
    const { error } = await supabase.from(INVOICES_TABLE).update(invoiceWriteRow(incomeId, form, lines)).eq('id', id);
    if (error) return { success: false, id, error: error.message };
    const { error: delError } = await supabase.from(INVOICE_LINE_ITEMS_TABLE).delete().eq('invoice_id', id);
    if (delError) return { success: false, id, error: delError.message };
    const lineRows = lineWriteRows('invoice_id', id, lines);
    if (lineRows.length > 0) {
      const { error: lineError } = await supabase.from(INVOICE_LINE_ITEMS_TABLE).insert(lineRows);
      if (lineError) return { success: false, id, error: lineError.message };
    }
    return { success: true, id };
  } catch (err) {
    return { success: false, id, error: toErrorMessage(err, '儲存失敗') };
  }
}

export async function deleteInvoice(id: string): Promise<WriteResult> {
  const { error } = await supabase.from(INVOICES_TABLE).delete().eq('id', id);
  return error ? { success: false, error: error.message } : { success: true, id };
}

export async function createReceipt(
  incomeId: string,
  form: ReceiptForm,
  lines: InvoiceLineItem[],
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from(RECEIPTS_TABLE)
    .insert(receiptWriteRow(incomeId, form, lines))
    .select('id')
    .single();
  if (error || !data) return { success: false, error: error?.message ?? '儲存失敗' };
  const lineRows = lineWriteRows('receipt_id', data.id, lines);
  if (lineRows.length > 0) {
    const { error: lineError } = await supabase.from(RECEIPT_LINE_ITEMS_TABLE).insert(lineRows);
    if (lineError) return { success: false, id: data.id, error: lineError.message };
  }
  return { success: true, id: data.id };
}

export async function updateReceipt(
  id: string,
  incomeId: string,
  form: ReceiptForm,
  lines: InvoiceLineItem[],
): Promise<WriteResult> {
  const { error } = await supabase.from(RECEIPTS_TABLE).update(receiptWriteRow(incomeId, form, lines)).eq('id', id);
  if (error) return { success: false, id, error: error.message };
  const { error: delError } = await supabase.from(RECEIPT_LINE_ITEMS_TABLE).delete().eq('receipt_id', id);
  if (delError) return { success: false, id, error: delError.message };
  const lineRows = lineWriteRows('receipt_id', id, lines);
  if (lineRows.length > 0) {
    const { error: lineError } = await supabase.from(RECEIPT_LINE_ITEMS_TABLE).insert(lineRows);
    if (lineError) return { success: false, id, error: lineError.message };
  }
  return { success: true, id };
}

export async function deleteReceipt(id: string): Promise<WriteResult> {
  const { error } = await supabase.from(RECEIPTS_TABLE).delete().eq('id', id);
  return error ? { success: false, error: error.message } : { success: true, id };
}

export type InvoicePrefillContext = {
  income: IncomeDocumentSnippet;
  projectName: string;
  customerName: string;
  siteAddress: string;
  projectTypes: string[];
  defaultCompanyListId: string;
  sameTypeSum: number;
  dueDate?: string;
  paymentDate?: string;
};

async function loadPrefillContext(incomeId: string): Promise<InvoicePrefillContext> {
  const { data: incomeRow, error: incomeError } = await supabase
    .from(INCOMES_TABLE)
    .select('id, quotation_client_project_id, type, installment_number, billed_amount, due_date, payment_date, payment_status')
    .eq('id', incomeId)
    .maybeSingle();
  if (incomeError) throw incomeError;
  if (!incomeRow) throw new Error('找不到收入紀錄');

  const income = mapIncome(incomeRow as IncomeDbRow);
  const projectId = (incomeRow as IncomeDbRow).quotation_client_project_id;

  const [{ data: projectRow, error: projectError }, { data: siblingRows }] = await Promise.all([
    supabase
      .from(QUOTATION_CLIENT_PROJECT_TABLE)
      .select('id, display_name, pitching_code, client_id, client_name, project_types, quotation_client_list ( company_name_zh, company_name_en, address )')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from(INCOMES_TABLE)
      .select('type, billed_amount')
      .eq('quotation_client_project_id', projectId)
      .eq('type', income.type),
  ]);
  if (projectError) throw projectError;

  const project = projectRow as unknown as ProjectEmbed | null;
  const client = firstClientEmbed(project?.quotation_client_list);
  const sameTypeSum = ((siblingRows as { billed_amount: number | string }[] | null) ?? []).reduce(
    (sum, row) => sum + toAmount(row.billed_amount),
    0,
  );

  return {
    income,
    projectName: project?.display_name?.trim() || project?.pitching_code?.trim() || '',
    customerName: resolveCustomerName({
      companyNameZh: client?.company_name_zh,
      companyNameEn: client?.company_name_en,
      clientName: project?.client_name,
    }),
    siteAddress: client?.address?.trim() || '',
    projectTypes: project?.project_types ?? [],
    defaultCompanyListId: defaultCompanyListId(),
    sameTypeSum,
    dueDate: optionalIsoDate((incomeRow as IncomeDbRow).due_date),
    paymentDate: optionalIsoDate((incomeRow as IncomeDbRow).payment_date),
  };
}

function resolveDefaultCompany(
  companies: CompanyBrandingSource[],
  companyRows: CompanyDbRow[],
  listId: string,
  fallbackUuid?: string | null,
): CompanyBrandingSource | null {
  const byListId = companyRows.find((row) => row.id === listId);
  if (byListId) return mapCompanyRow(byListId);
  if (fallbackUuid) return companies.find((row) => row.id === fallbackUuid) ?? null;
  return companies[0] ?? null;
}

export type InvoiceEditorState = {
  form: InvoiceForm;
  lines: InvoiceLineItem[];
  saved: SavedInvoice | null;
  income: IncomeDocumentSnippet;
  companies: CompanyBrandingSource[];
  companyRows: Array<{ listId: string; uuid: string }>;
};

export type ReceiptEditorState = {
  form: ReceiptForm;
  lines: InvoiceLineItem[];
  saved: SavedReceipt | null;
  income: IncomeDocumentSnippet;
  companies: CompanyBrandingSource[];
  companyRows: Array<{ listId: string; uuid: string }>;
};

export async function loadInvoiceEditor(incomeId: string): Promise<InvoiceEditorState> {
  const [saved, companiesRaw, prefill, count] = await Promise.all([
    fetchInvoiceByIncomeId(incomeId),
    supabase
      .from('company_list')
      .select('id, uuid, company_code, company_name_zh, company_name_en, bank_name, bank_account, address, logo_url, chop_url, bank_notes, contact_phone')
      .order('company_code'),
    loadPrefillContext(incomeId),
    countInvoices(),
  ]);
  if (companiesRaw.error) throw companiesRaw.error;
  const companyRows = (companiesRaw.data as CompanyDbRow[] | null) ?? [];
  const companies = companyRows.map(mapCompanyRow);
  const companyIdPairs = companyRows.map((row) => ({ listId: row.id, uuid: row.uuid || row.id }));

  if (saved) {
    return { form: saved, lines: saved.lines, saved, income: saved.income, companies, companyRows: companyIdPairs };
  }

  const company = resolveDefaultCompany(companies, companyRows, prefill.defaultCompanyListId);
  const amount = prefill.income.amount ?? 0;
  const form: InvoiceForm = {
    invoiceNo: nextInvoiceNo(count),
    invoiceDate: todayIsoDate(),
    dueDate: prefill.dueDate ?? '',
    billToName: prefill.customerName,
    projectName: prefill.projectName,
    mainItemName: buildMainItemName({
      typeLabel: prefill.income.type,
      installmentNo: prefill.income.installmentNo,
      incomeAmount: amount,
      sameTypeSum: prefill.sameTypeSum,
      siteAddress: prefill.siteAddress,
    }),
    mainItemQty: 1,
    mainItemPrice: amount,
    enableDiscount: false,
    discountDescription: '',
    discountAmount: 0,
    note: DEFAULT_INVOICE_NOTE,
    companyId: company?.id ?? null,
    pdfBranding: company ? brandingFromCompany(company) : null,
  };

  return { form, lines: [], saved: null, income: prefill.income, companies, companyRows: companyIdPairs };
}

export async function loadReceiptEditor(incomeId: string): Promise<ReceiptEditorState> {
  const [saved, companiesRaw, prefill, count, linkedInvoice] = await Promise.all([
    fetchReceiptByIncomeId(incomeId),
    supabase
      .from('company_list')
      .select('id, uuid, company_code, company_name_zh, company_name_en, bank_name, bank_account, address, logo_url, chop_url, bank_notes, contact_phone')
      .order('company_code'),
    loadPrefillContext(incomeId),
    countReceipts(),
    fetchInvoiceByIncomeId(incomeId),
  ]);
  if (companiesRaw.error) throw companiesRaw.error;
  const companyRows = (companiesRaw.data as CompanyDbRow[] | null) ?? [];
  const companies = companyRows.map(mapCompanyRow);
  const companyIdPairs = companyRows.map((row) => ({ listId: row.id, uuid: row.uuid || row.id }));

  if (saved) {
    const companyId = saved.companyId || linkedInvoice?.companyId || null;
    return {
      form: { ...saved, companyId, invoiceId: saved.invoiceId ?? linkedInvoice?.id ?? null },
      lines: saved.lines,
      saved,
      income: saved.income,
      companies,
      companyRows: companyIdPairs,
    };
  }

  const company = resolveDefaultCompany(
    companies,
    companyRows,
    prefill.defaultCompanyListId,
    linkedInvoice?.companyId,
  );
  const amount = prefill.income.amount ?? 0;
  const form: ReceiptForm = {
    receiptNo: nextReceiptNo(count),
    receiptDate: todayIsoDate(),
    paymentDate: prefill.paymentDate || todayIsoDate(),
    receivedFromName: prefill.customerName,
    projectName: prefill.projectName,
    amountReceived: amount,
    paymentMethod: '',
    notes: DEFAULT_RECEIPT_NOTE,
    enablePriceDifference: false,
    priceDifference: 0,
    priceDifferenceDescription: '',
    companyId: company?.id ?? linkedInvoice?.companyId ?? null,
    invoiceId: linkedInvoice?.id ?? null,
    pdfBranding: company ? brandingFromCompany(company) : linkedInvoice?.pdfBranding ?? null,
  };

  return { form, lines: [], saved: null, income: prefill.income, companies, companyRows: companyIdPairs };
}

export function useDocumentExistence(incomeIds: string[]) {
  const key = incomeIds.slice().sort().join(',');
  const [invoiceIds, setInvoiceIds] = useState<Set<string>>(new Set());
  const [receiptIds, setReceiptIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(incomeIds.length > 0);

  const refresh = useCallback(async () => {
    if (incomeIds.length === 0) {
      setInvoiceIds(new Set());
      setReceiptIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchDocumentExistence(incomeIds);
      setInvoiceIds(result.invoices);
      setReceiptIds(result.receipts);
    } catch {
      setInvoiceIds(new Set());
      setReceiptIds(new Set());
    }
    setLoading(false);
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { invoiceIds, receiptIds, loading, refresh };
}

export function useInvoiceEditor(incomeId: string | undefined) {
  const [state, setState] = useState<InvoiceEditorState | null>(null);
  const [loading, setLoading] = useState(Boolean(incomeId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!incomeId) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setState(await loadInvoiceEditor(incomeId));
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, '載入失敗'));
      setState(null);
    }
    setLoading(false);
  }, [incomeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, loading, error, refresh, setState };
}

export function useReceiptEditor(incomeId: string | undefined) {
  const [state, setState] = useState<ReceiptEditorState | null>(null);
  const [loading, setLoading] = useState(Boolean(incomeId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!incomeId) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setState(await loadReceiptEditor(incomeId));
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, '載入失敗'));
      setState(null);
    }
    setLoading(false);
  }, [incomeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, loading, error, refresh, setState };
}

export type { IncomePaymentStatus, PdfBranding };
