/**
 * 文字模型順序。前一個失敗（包含帳戶欠費）就試下一個。
 * Grok → Gemini → OpenCode。
 */
export const TEXT_LLM_ORDER = ['grok', 'gemini', 'opencode'] as const;

export type TextLlmProvider = (typeof TEXT_LLM_ORDER)[number];
