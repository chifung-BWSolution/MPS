import { supabase } from '@/lib/supabase';
import type { PitchingRecord } from '@/data/pitchingData';
import type { QuotationServiceItem } from '@/data/quotationData';

export type QuotationAiCatalogItem = {
  id: string;
  name: string;
  defaultPrice: number;
  defaultCost: number;
  supplierName: string;
  category: string;
};

export type QuotationAiProvider = 'grok' | 'gemini';

export const QUOTATION_AI_MODEL_OPTIONS: { id: QuotationAiProvider; label: string }[] = [
  { id: 'grok', label: 'Grok' },
  { id: 'gemini', label: 'Gemini' },
];

export type GenerateQuotationServicesInput = {
  provider: QuotationAiProvider;
  quotationTypeName?: string;
  isComprehensive: boolean;
  selectedTypeNames: string[];
  pitchingRecord?: Pick<PitchingRecord, 'clientName' | 'displayName' | 'description' | 'projectTypes' | 'notes' | 'pitchingId'>;
  requirements: string;
  catalogItems: QuotationAiCatalogItem[];
};

export type GenerateQuotationServicesResult = {
  services: QuotationServiceItem[];
  provider?: string;
  fallback?: boolean;
};

async function invokeFunction<T>(slug: string, body: Record<string, unknown>): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  const url = `${supabaseUrl}/functions/v1/${slug}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || json.error) {
    throw new Error(String(json.error || `${res.status} ${res.statusText}`));
  }
  return json;
}

function toServiceItems(
  raw: Array<{
    name?: string;
    price?: number;
    cost?: number;
    supplierName?: string;
    quantity?: number;
    discount?: number;
    isSelected?: boolean;
    isVisible?: boolean;
    catalogId?: string;
  }>,
  catalog: QuotationAiCatalogItem[],
): QuotationServiceItem[] {
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const catalogByName = new Map(catalog.map((item) => [item.name.toLowerCase(), item]));

  return raw
    .filter((item) => item.name?.trim())
    .map((item, idx) => {
      const matched =
        (item.catalogId ? catalogById.get(item.catalogId) : undefined) ||
        catalogByName.get(String(item.name).toLowerCase());
      return {
        id: `svc-ai-${Date.now()}-${idx}`,
        name: item.name!.trim(),
        price: Math.round(item.price ?? matched?.defaultPrice ?? 0),
        cost: Math.round(item.cost ?? matched?.defaultCost ?? 0),
        supplierName: item.supplierName || matched?.supplierName || '內部團隊',
        quantity: Math.max(1, Math.round(item.quantity ?? 1)),
        discount: Math.max(0, Math.round(item.discount ?? 0)),
        discountType: 'percentage' as const,
        isVisible: item.isVisible !== false,
        isSelected: item.isSelected !== false,
      };
    });
}

/** Local fallback when edge function / AI keys are unavailable. */
export function generateQuotationServicesFallback(
  input: GenerateQuotationServicesInput,
): GenerateQuotationServicesResult {
  const text = [
    input.requirements,
    input.pitchingRecord?.description,
    input.pitchingRecord?.notes,
    input.pitchingRecord?.displayName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scored = input.catalogItems.map((item) => {
    const tokens = item.name.toLowerCase().split(/[\s/（）()]+/).filter((t) => t.length > 1);
    let score = 0;
    for (const token of tokens) {
      if (text.includes(token)) score += 2;
    }
    if (text.includes('seo') && item.name.toLowerCase().includes('seo')) score += 3;
    if (text.includes('cms') && item.name.toLowerCase().includes('cms')) score += 3;
    if (text.includes('api') && item.name.toLowerCase().includes('api')) score += 3;
    if (text.includes('影片') && item.category === 'qt5') score += 2;
    if (text.includes('活動') && item.category === 'qt8') score += 2;
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const picked =
    scored.filter((s) => s.score > 0).slice(0, 6).map((s) => s.item).length > 0
      ? scored.filter((s) => s.score > 0).slice(0, 6).map((s) => s.item)
      : input.catalogItems.slice(0, Math.min(5, input.catalogItems.length));

  const services = picked.map((item, idx) => ({
    id: `svc-fallback-${Date.now()}-${idx}`,
    name: item.name,
    price: item.defaultPrice,
    cost: item.defaultCost,
    supplierName: item.supplierName,
    quantity: 1,
    discount: 0,
    discountType: 'percentage' as const,
    isVisible: true,
    isSelected: true,
  }));

  return { services, provider: 'fallback', fallback: true };
}

export async function generateQuotationServices(
  input: GenerateQuotationServicesInput,
): Promise<GenerateQuotationServicesResult> {
  try {
    const response = await invokeFunction<{
      services?: Array<Record<string, unknown>>;
      provider?: string;
    }>('generate-quotation-services', {
      provider: input.provider,
      quotationTypeName: input.quotationTypeName,
      isComprehensive: input.isComprehensive,
      selectedTypeNames: input.selectedTypeNames,
      pitchingRecord: input.pitchingRecord,
      requirements: input.requirements,
      catalogItems: input.catalogItems,
    });

    const services = toServiceItems(
      (response.services ?? []) as Array<{
        name?: string;
        price?: number;
        cost?: number;
        supplierName?: string;
        quantity?: number;
        discount?: number;
        isSelected?: boolean;
        isVisible?: boolean;
        catalogId?: string;
      }>,
      input.catalogItems,
    );

    if (!services.length) {
      return generateQuotationServicesFallback(input);
    }

    return { services, provider: response.provider, fallback: false };
  } catch {
    return generateQuotationServicesFallback(input);
  }
}
