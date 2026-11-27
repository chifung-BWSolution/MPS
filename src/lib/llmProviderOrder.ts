/**
 * 文字模型順序。前一個失敗（包含帳戶欠費）就試下一個。
 * Grok → Gemini。
 */
export const TEXT_LLM_ORDER = ['grok', 'gemini'] as const;

export type TextLlmProvider = (typeof TEXT_LLM_ORDER)[number];

/** 尚未呼叫過時顯示的具體型號。各工具可再傳入自己的設定值。 */
export const DEFAULT_CONNECTED_MODELS: Record<TextLlmProvider, string> = {
  grok: 'grok-4.5',
  gemini: 'gemini-2.5-flash',
};

export function modelProviderId(model: string): TextLlmProvider | null {
  const value = model.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith('grok')) return 'grok';
  if (value.startsWith('gemini')) return 'gemini';
  return null;
}

/**
 * 已接入模型都列出。只有最近一次成功的那個是正常色，
 * 沒跑過、或最近一次沒走到它，都是灰色。
 */
export function connectedModelMenu(
  points: { model: string; createdAt: string }[],
  models: Partial<Record<TextLlmProvider, string>> = {},
): {
  items: { id: TextLlmProvider; label: string; muted: boolean }[];
} {
  const ordered = points
    .map((point, index) => ({ model: point.model.trim(), createdAt: point.createdAt, index }))
    .filter((point) => point.model.length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.index - b.index);
  const seen = new Map<TextLlmProvider, string>();
  for (const point of ordered) {
    const id = modelProviderId(point.model);
    if (id) seen.set(id, point.model);
  }
  const latest = ordered[ordered.length - 1];
  const active = latest ? modelProviderId(latest.model) : null;
  const names = { ...DEFAULT_CONNECTED_MODELS, ...models };

  return {
    items: TEXT_LLM_ORDER.map((id) => ({
      id,
      label: seen.get(id) || names[id],
      muted: id !== active,
    })),
  };
}
