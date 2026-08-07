import { supabase } from '@/lib/supabase';
import type { PitchingRecord } from '@/data/pitchingData';
import type { QuotationServiceItem } from '@/data/quotationData';

export type QuotationAiProvider = 'grok' | 'gemini';

export const QUOTATION_AI_MODEL_OPTIONS: {
  id: QuotationAiProvider;
  label: string;
  modelId: string;
}[] = [
  { id: 'grok', label: 'Grok', modelId: 'grok-4.5' },
  { id: 'gemini', label: 'Gemini', modelId: 'gemini-2.0-flash' },
];

export function getQuotationAiModelId(provider: QuotationAiProvider): string {
  return QUOTATION_AI_MODEL_OPTIONS.find((opt) => opt.id === provider)?.modelId ?? provider;
}

export type GenerateQuotationServicesInput = {
  provider: QuotationAiProvider;
  quotationTypeName?: string;
  isComprehensive: boolean;
  selectedTypeNames: string[];
  pitchingRecord?: Pick<PitchingRecord, 'clientName' | 'displayName' | 'description' | 'projectTypes' | 'notes' | 'pitchingId'>;
  requirements: string;
  catalogItems: QuotationAiCatalogItem[];
};

export type QuotationAiCatalogItem = {
  id: string;
  name: string;
  defaultPrice: number;
  defaultCost: number;
  supplierName: string;
  category: string;
};

export type GenerateQuotationServicesResult = {
  services: QuotationServiceItem[];
  provider: QuotationAiProvider | 'fallback';
  model?: string;
  fallback: boolean;
  error?: string;
};

type EdgeFunctionResponse = {
  services?: Array<Record<string, unknown>>;
  provider?: string;
  model?: string;
  fallback?: boolean;
  error?: string;
};

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
  error?: string,
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
    if (text.includes('website') && item.category === 'qt1') score += 2;
    if (text.includes('logo') && item.category === 'qt3') score += 2;
    if (text.includes('packaging') && item.category === 'qt3') score += 2;
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

  return {
    services,
    provider: 'fallback',
    model: getQuotationAiModelId(input.provider),
    fallback: true,
    error,
  };
}

export async function generateQuotationServices(
  input: GenerateQuotationServicesInput,
): Promise<GenerateQuotationServicesResult> {
  const requestedModel = getQuotationAiModelId(input.provider);

  const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
    'generate-quotation-services',
    {
      body: {
        provider: input.provider,
        model: requestedModel,
        quotationTypeName: input.quotationTypeName,
        isComprehensive: input.isComprehensive,
        selectedTypeNames: input.selectedTypeNames,
        pitchingRecord: input.pitchingRecord,
        requirements: input.requirements,
        catalogItems: input.catalogItems,
      },
    },
  );

  if (error) {
    throw new Error(error.message || 'AI 服務呼叫失敗');
  }

  const response = data ?? {};
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

  if (response.fallback || response.provider === 'fallback' || !services.length) {
    return generateQuotationServicesFallback(
      input,
      response.error || 'AI 未能返回有效服務項目，已改用本地規則生成',
    );
  }

  return {
    services,
    provider: (response.provider as QuotationAiProvider) || input.provider,
    model: response.model || requestedModel,
    fallback: false,
  };
}
