/**
 * 文字模型順序。前一個失敗（包含帳戶欠費）就試下一個。
 * Grok → Gemini → OpenCode。
 */
export const TEXT_LLM_ORDER = ['grok', 'gemini', 'opencode'] as const;

export type TextLlmProvider = (typeof TEXT_LLM_ORDER)[number];

/** 下拉固定顯示的已接入模型。OpenCode 的實際模型名是 deepseek-*。 */
export const CONNECTED_MODEL_LABELS: { id: TextLlmProvider; label: string }[] = [
  { id: 'grok', label: 'Grok' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'opencode', label: 'OpenCode' },
];

export function modelProviderId(model: string): TextLlmProvider | null {
  const value = model.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith('grok')) return 'grok';
  if (value.startsWith('gemini')) return 'gemini';
  if (value.startsWith('deepseek') || value.includes('opencode')) return 'opencode';
  return null;
}

/**
 * 三個已接入模型都列出。只有最近一次成功的那個是正常色，
 * 沒跑過、或最近一次沒走到它，都是灰色。
 */
export function connectedModelMenu(points: { model: string; createdAt: string }[]): {
  items: { id: TextLlmProvider; label: string; muted: boolean }[];
} {
  const ordered = points
    .map((point, index) => ({ model: point.model.trim(), createdAt: point.createdAt, index }))
    .filter((point) => point.model.length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.index - b.index);
  const latest = ordered[ordered.length - 1];
  const active = latest ? modelProviderId(latest.model) : null;

  return {
    items: CONNECTED_MODEL_LABELS.map((item) => ({
      id: item.id,
      label: item.label,
      muted: item.id !== active,
    })),
  };
}
