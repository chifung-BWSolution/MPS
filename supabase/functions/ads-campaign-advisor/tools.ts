/**
 * Frozen v1 advisor tool contract.
 *
 * Keep names + args identical to `src/types/adsAdvisor.ts`.
 * Implementations are Wave 3 — this file is schema only.
 *
 * Frozen tool names:
 * - search_campaigns
 * - get_campaign_metrics
 * - compare_campaigns
 * - get_campaigns_by_tag
 * - get_campaign_breakdowns
 *
 * Frozen args:
 * - search_campaigns: query, platform? google|facebook|both, status?, tag?, limit?
 * - get_campaign_metrics: platform, accountId, campaignId, dateFrom?, dateTo?
 * - compare_campaigns: campaigns[{platform,accountId,campaignId}], dateFrom?, dateTo?
 * - get_campaigns_by_tag: tag, platform?, limit?
 * - get_campaign_breakdowns: platform, accountId, campaignId, dateFrom?, dateTo?, channelType?
 */

export const ADVISOR_TOOL_NAMES = [
  "search_campaigns",
  "get_campaign_metrics",
  "compare_campaigns",
  "get_campaigns_by_tag",
  "get_campaign_breakdowns",
] as const;

export type AdvisorToolName = (typeof ADVISOR_TOOL_NAMES)[number];

export type AdvisorToolDefinition = {
  type: "function";
  function: {
    name: AdvisorToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
};

export const ADVISOR_TOOL_DEFINITIONS: AdvisorToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_campaigns",
      description:
        "以關鍵字搜尋廣告活動。可選平台（google / facebook / both）、狀態、標籤與筆數上限。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "活動名稱或其他搜尋字串",
          },
          platform: {
            type: "string",
            enum: ["google", "facebook", "both"],
            description: "平台篩選；省略則不限",
          },
          status: {
            type: "string",
            description: "活動狀態篩選，例如 ENABLED / PAUSED",
          },
          tag: {
            type: "string",
            description: "標籤篩選",
          },
          limit: {
            type: "number",
            description: "回傳筆數上限",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaign_metrics",
      description:
        "讀取單一活動在指定日期區間的 KPI（花費、曝光、點擊、轉換、CPA 等）。",
      parameters: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["google", "facebook"],
            description: "廣告平台",
          },
          accountId: {
            type: "string",
            description: "廣告帳戶 ID",
          },
          campaignId: {
            type: "string",
            description: "活動 ID",
          },
          dateFrom: {
            type: "string",
            description: "開始日期 YYYY-MM-DD",
          },
          dateTo: {
            type: "string",
            description: "結束日期 YYYY-MM-DD",
          },
        },
        required: ["platform", "accountId", "campaignId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_campaigns",
      description: "並排比較多個活動在同一日期區間的 KPI。",
      parameters: {
        type: "object",
        properties: {
          campaigns: {
            type: "array",
            description: "要比較的活動清單",
            items: {
              type: "object",
              properties: {
                platform: {
                  type: "string",
                  enum: ["google", "facebook"],
                },
                accountId: { type: "string" },
                campaignId: { type: "string" },
              },
              required: ["platform", "accountId", "campaignId"],
            },
          },
          dateFrom: {
            type: "string",
            description: "開始日期 YYYY-MM-DD",
          },
          dateTo: {
            type: "string",
            description: "結束日期 YYYY-MM-DD",
          },
        },
        required: ["campaigns"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaigns_by_tag",
      description: "依標籤列出廣告活動，可選平台與筆數上限。",
      parameters: {
        type: "object",
        properties: {
          tag: {
            type: "string",
            description: "標籤名稱",
          },
          platform: {
            type: "string",
            enum: ["google", "facebook", "both"],
            description: "平台篩選；省略則不限",
          },
          limit: {
            type: "number",
            description: "回傳筆數上限",
          },
        },
        required: ["tag"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaign_breakdowns",
      description:
        "讀取活動拆解（廣告群組、關鍵字、素材、版位等），可依 channelType 篩選。",
      parameters: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["google", "facebook"],
            description: "廣告平台",
          },
          accountId: {
            type: "string",
            description: "廣告帳戶 ID",
          },
          campaignId: {
            type: "string",
            description: "活動 ID",
          },
          dateFrom: {
            type: "string",
            description: "開始日期 YYYY-MM-DD",
          },
          dateTo: {
            type: "string",
            description: "結束日期 YYYY-MM-DD",
          },
          channelType: {
            type: "string",
            description: "頻道／活動類型篩選，例如 SEARCH、PMAX、OUTCOME_SALES",
          },
        },
        required: ["platform", "accountId", "campaignId"],
      },
    },
  },
];
