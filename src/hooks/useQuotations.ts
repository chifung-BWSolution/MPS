import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { ClientRequirementsForm } from '@/data/clientRequirementsQuestionnaire';
import type {
  CostStructure,
  PaymentStage,
  QuotationEntry,
  QuotationServiceItem,
} from '@/data/quotationData';

export const QUOTATION_ENTRY_TABLE = 'quotation_entry';

export type QuotationWizardPayload = {
  isComprehensive: boolean;
  selectedTypeId: string | null;
  selectedTypes: string[];
  selectedPitchingId: string;
  clientName: string;
  requirementsText: string;
  clientRequirementsForm: ClientRequirementsForm;
  costStructure: CostStructure;
  integratedSummary: string;
  services: QuotationServiceItem[];
  terms: string;
  paymentArrangement: PaymentStage[];
  overallDiscount: number;
  overallDiscountType: 'percentage' | 'fixed';
};

export type QuotationSaveInput = {
  id?: string;
  quoteCode?: string;
  clientName: string;
  pitchingRecordId?: string | null;
  quotationTypeId?: string | null;
  quotationMode: 'single' | 'comprehensive';
  status?: QuotationEntry['status'];
  amount: number;
  costTotal: number;
  grossProfit: number;
  grossMargin: number;
  wizardPayload: QuotationWizardPayload;
  integratedSummary?: string;
  createdBy?: string;
};

type DbRow = {
  id: string;
  quote_code: string;
  client_name: string;
  pitching_record_id: string | null;
  quotation_type_id: string | null;
  quotation_mode: string;
  status: string;
  amount: number | string;
  cost_total: number | string;
  gross_profit: number | string;
  gross_margin: number | string;
  wizard_payload: QuotationWizardPayload | null;
  integrated_summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v) || 0;
}

export function mapQuotationRow(row: DbRow): QuotationEntry {
  const payload = row.wizard_payload ?? ({} as QuotationWizardPayload);
  const costStructure = payload.costStructure ?? {
    totalRevenue: num(row.amount),
    laborCost: 0,
    supplierCost: 0,
    outsourcingCost: 0,
    otherCost: num(row.cost_total),
    grossProfit: num(row.gross_profit),
    grossMargin: num(row.gross_margin),
  };

  return {
    id: row.id,
    quoteId: row.quote_code,
    client: row.client_name,
    clientId: payload.selectedPitchingId || '',
    companyId: '',
    brandId: '',
    projectType: '',
    quotationType: row.quotation_type_id || payload.selectedTypeId || '',
    quotationMode: row.quotation_mode === 'comprehensive' ? 'comprehensive' : 'single',
    amount: num(row.amount),
    costTotal: num(row.cost_total),
    grossProfit: num(row.gross_profit),
    grossMargin: num(row.gross_margin),
    status: (row.status as QuotationEntry['status']) || 'draft',
    createdDate: String(row.created_at).slice(0, 10),
    terms: payload.terms || '',
    paymentArrangement: payload.paymentArrangement || [],
    services: payload.services || [],
    costStructure,
    overallDiscount: payload.overallDiscount ?? 0,
    overallDiscountType: payload.overallDiscountType ?? 'percentage',
    createdBy: row.created_by || '—',
  };
}

export function quotationToSaveRow(input: QuotationSaveInput) {
  return {
    quote_code: input.quoteCode,
    client_name: input.clientName,
    pitching_record_id: input.pitchingRecordId || null,
    quotation_type_id: input.quotationTypeId || null,
    quotation_mode: input.quotationMode,
    status: input.status ?? 'draft',
    amount: input.amount,
    cost_total: input.costTotal,
    gross_profit: input.grossProfit,
    gross_margin: input.grossMargin,
    wizard_payload: input.wizardPayload,
    integrated_summary: input.integratedSummary ?? input.wizardPayload.integratedSummary ?? null,
    created_by: input.createdBy ?? null,
    updated_at: new Date().toISOString(),
  };
}

function generateQuoteCode(existingCodes: string[]): string {
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;
  const sameYear = existingCodes
    .filter((c) => c.startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = sameYear.length ? Math.max(...sameYear) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export function useQuotations() {
  const { session, systemUser } = useAuth();
  const [records, setRecords] = useState<QuotationEntry[]>([]);
  const [payloadById, setPayloadById] = useState<Record<string, QuotationWizardPayload>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from(QUOTATION_ENTRY_TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      setRecords([]);
      setPayloadById({});
    } else {
      setError(null);
      const rows = (data as DbRow[] | null) ?? [];
      const payloads: Record<string, QuotationWizardPayload> = {};
      rows.forEach((row) => {
        if (row.wizard_payload) payloads[row.id] = row.wizard_payload;
      });
      setPayloadById(payloads);
      setRecords(rows.map(mapQuotationRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const saveQuotation = useCallback(
    async (input: QuotationSaveInput): Promise<{ id: string; quoteCode: string } | null> => {
      const creator =
        input.createdBy ||
        systemUser?.display_name ||
        session?.user?.email ||
        '—';

      if (input.id) {
        const row = quotationToSaveRow({ ...input, createdBy: creator });
        const { quote_code: _code, ...updateRow } = row;
        const { data, error: err } = await supabase
          .from(QUOTATION_ENTRY_TABLE)
          .update(updateRow)
          .eq('id', input.id)
          .select('id, quote_code')
          .single();
        if (err) {
          setError(err.message);
          return null;
        }
        await refresh();
        return { id: data.id, quoteCode: data.quote_code };
      }

      const { data: existing } = await supabase.from(QUOTATION_ENTRY_TABLE).select('quote_code');
      const quoteCode = generateQuoteCode(((existing as { quote_code: string }[] | null) ?? []).map((r) => r.quote_code));
      const row = quotationToSaveRow({ ...input, quoteCode, createdBy: creator });
      const { data, error: err } = await supabase
        .from(QUOTATION_ENTRY_TABLE)
        .insert(row)
        .select('id, quote_code')
        .single();
      if (err) {
        setError(err.message);
        return null;
      }
      await refresh();
      return { id: data.id, quoteCode: data.quote_code };
    },
    [refresh, session, systemUser],
  );

  const getPayload = useCallback(
    (id: string) => payloadById[id] ?? null,
    [payloadById],
  );

  return {
    records,
    loading,
    error,
    refresh,
    saveQuotation,
    getPayload,
  };
}
