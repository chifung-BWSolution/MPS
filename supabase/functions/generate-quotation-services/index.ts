import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_GROK_MODEL = "grok-4.5";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

type CatalogItem = {
  id: string;
  name: string;
  defaultPrice: number;
  defaultCost: number;
  supplierName: string;
  category: string;
};

type AiService = {
  catalogId?: string;
  name: string;
  price: number;
  cost: number;
  supplierName: string;
  quantity: number;
  discount: number;
  isSelected: boolean;
  isVisible: boolean;
};

function buildPrompt(body: Record<string, unknown>): string {
  const catalog = (body.catalogItems as CatalogItem[]) ?? [];
  const pitching = body.pitchingRecord as Record<string, unknown> | undefined;
  const requirements = String(body.requirements ?? "");
  const typeName = body.isComprehensive
    ? (body.selectedTypeNames as string[] | undefined)?.join("、") || "綜合方案"
    : String(body.quotationTypeName ?? "報價");

  const catalogLines = catalog
    .map(
      (item) =>
        `- [${item.id}] ${item.name} | 售價 HKD ${item.defaultPrice} | 成本 HKD ${item.defaultCost} | 供應商: ${item.supplierName}`,
    )
    .join("\n");

  return `你是香港數碼營銷公司的報價顧問。請根據客戶需求，從以下預設服務目錄中挑選並調整合適的服務項目，組成報價單。

報價類型：${typeName}
Pitching 客戶：${pitching?.clientName ?? "—"}
Pitching 顯示名稱：${pitching?.displayName ?? "—"}
Pitching 描述：${pitching?.description ?? "—"}
Pitching 備註：${pitching?.notes ?? "—"}

客戶需求（用戶輸入）：
${requirements || "（未提供額外需求，請依 Pitching 資料推斷合理項目）"}

可選服務目錄（優先使用 catalogId 對應項目，可調整 quantity / discount，price 可微調但應接近預設）：
${catalogLines}

請只回傳 JSON，格式如下，不要 markdown：
{
  "services": [
    {
      "catalogId": "pi1",
      "name": "服務名稱",
      "price": 18000,
      "cost": 8000,
      "supplierName": "內部設計團隊",
      "quantity": 1,
      "discount": 0,
      "isSelected": true,
      "isVisible": true
    }
  ]
}

規則：
1. 選 3-8 項最相關服務，不要全選
2. name 必須與目錄一致或為合理自訂名稱
3. 全部用繁體中文回應項目名稱
4. 只輸出 JSON`;
}

function parseAiJson(text: string): AiService[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  const parsed = JSON.parse(jsonMatch[0]) as { services?: AiService[] };
  if (!Array.isArray(parsed.services)) return [];
  return parsed.services.filter((s) => s?.name?.trim());
}

async function callGemini(prompt: string, model: string): Promise<AiService[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 未設定");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini (${model}) error: ${err}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const services = parseAiJson(text);
  if (!services.length) {
    throw new Error(`Gemini (${model}) 回傳格式無法解析`);
  }
  return services;
}

async function callGrok(prompt: string, model: string): Promise<AiService[]> {
  const apiKey = Deno.env.get("XAI_API_KEY") || Deno.env.get("GROK_API_KEY");
  if (!apiKey) {
    throw new Error("XAI_API_KEY 未設定");
  }

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a quotation assistant. Reply with JSON only, no markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok (${model}) error: ${err}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const services = parseAiJson(text);
  if (!services.length) {
    throw new Error(`Grok (${model}) 回傳格式無法解析: ${text.slice(0, 200)}`);
  }
  return services;
}

function fallbackServices(catalog: CatalogItem[]): AiService[] {
  return catalog.slice(0, Math.min(5, catalog.length)).map((item) => ({
    catalogId: item.id,
    name: item.name,
    price: item.defaultPrice,
    cost: item.defaultCost,
    supplierName: item.supplierName,
    quantity: 1,
    discount: 0,
    isSelected: true,
    isVisible: true,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const body = await req.json();
    const catalog = (body.catalogItems as CatalogItem[]) ?? [];
    if (!catalog.length) {
      return new Response(JSON.stringify({ error: "catalogItems is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const provider = String(body.provider ?? "grok");
    const model = String(
      body.model ??
        (provider === "gemini"
          ? Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL
          : Deno.env.get("GROK_MODEL") || DEFAULT_GROK_MODEL),
    );
    const prompt = buildPrompt(body);
    let services: AiService[] = [];
    let lastError = "";

    if (provider === "gemini") {
      try {
        services = await callGemini(prompt, model);
      } catch (err) {
        lastError = String(err);
      }
    } else if (provider === "grok") {
      try {
        services = await callGrok(prompt, model);
      } catch (err) {
        lastError = String(err);
      }
    }

    if (!services.length) {
      services = fallbackServices(catalog);
      return new Response(JSON.stringify({
        services,
        provider: "fallback",
        model,
        fallback: true,
        error: lastError || "AI 未能返回有效服務項目",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({
      services,
      provider,
      model,
      fallback: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
