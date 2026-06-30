export type PlatformStatusKind = 'url' | 'opened' | 'pending' | 'n/a' | 'unknown';

export interface PlatformStatusValue {
  kind: PlatformStatusKind;
  raw_text?: string;
  url?: string;
  operator_hint?: string;
}

export type PlatformKey =
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'xiaohongshu'
  | 'wechat_channels'
  | 'douyin'
  | 'threads'
  | 'linkedin';

export const PLATFORM_KEYS: PlatformKey[] = [
  'youtube',
  'instagram',
  'facebook',
  'xiaohongshu',
  'wechat_channels',
  'douyin',
  'threads',
  'linkedin',
];

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
  youtube: 'YouTube',
  instagram: 'IG Page',
  facebook: 'Facebook Page',
  xiaohongshu: '小紅書',
  wechat_channels: '微信視頻號',
  douyin: '抖音',
  threads: 'Threads',
  linkedin: 'LinkedIn',
};

/** Excel summary column → JSON key */
export const EXCEL_PLATFORM_MAP: Record<string, PlatformKey> = {
  youtube: 'youtube',
  'IG Page': 'instagram',
  'Facebook Page': 'facebook',
  '小紅書': 'xiaohongshu',
  '微信視頻號': 'wechat_channels',
  '抖音': 'douyin',
  Threads: 'threads',
  Linkedin: 'linkedin',
};

export function parsePlatformStatus(raw: string | undefined | null): PlatformStatusValue {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'pending', raw_text: '' };
  if (text === '-' || text === '—') return { kind: 'n/a', raw_text: text };
  if (text === 'XXX' || text === '??') return { kind: 'unknown', raw_text: text };

  const urlLike =
    /^https?:\/\//i.test(text) ||
    /^www\./i.test(text) ||
    /youtube\.com|facebook\.com|instagram\.com|youtu\.be/i.test(text);

  if (urlLike) {
    const url = text.startsWith('http') ? text : `https://${text.replace(/^\/\//, '')}`;
    return { kind: 'url', url, raw_text: text };
  }

  if (/^Y$|^yes$/i.test(text)) return { kind: 'opened', raw_text: text };

  if (/^M$/i.test(text) && text.length === 1) return { kind: 'opened', raw_text: text };

  if (/已開|已有|已註冊|已绑定|已綁定|连結|連結|開賬|開帳|開通|profile\.php/i.test(text)) {
    const paren = text.match(/[（(]([^）)]+)[）)]/);
    const operator = text.match(/\b[MF]\d{2}\b/)?.[0] ?? paren?.[1];
    return { kind: 'opened', raw_text: text, operator_hint: operator };
  }

  if (/^cfb\.creative$/i.test(text)) return { kind: 'opened', raw_text: text };

  return { kind: 'unknown', raw_text: text };
}

export function platformStatusSummary(value: PlatformStatusValue | undefined): string {
  if (!value) return '—';
  switch (value.kind) {
    case 'url':
      return value.url ?? value.raw_text ?? 'URL';
    case 'opened':
      return value.operator_hint ? `已開通 (${value.operator_hint})` : '已開通';
    case 'pending':
      return '待定';
    case 'n/a':
      return '不適用';
    case 'unknown':
      return value.raw_text || '未知';
    default:
      return '—';
  }
}

export const STATUS_KIND_LABELS: Record<PlatformStatusKind, string> = {
  url: 'URL',
  opened: '已開通',
  pending: '待定',
  'n/a': '不適用',
  unknown: '未知',
};

export const STATUS_KIND_COLORS: Record<PlatformStatusKind, string> = {
  url: 'bg-blue-100 text-blue-700',
  opened: 'bg-teal-100 text-teal-700',
  pending: 'bg-amber-100 text-amber-700',
  'n/a': 'bg-slate-100 text-slate-500',
  unknown: 'bg-orange-100 text-orange-700',
};
