import type { CopyPlatform, CopyVariant } from '@/lib/crosspost';

export interface CrosspostGenerationState {
  /** 本次生成／載入的本地識別碼，用來避免非同步儲存結果套用到另一組 */
  token: string;
  variants: CopyVariant[];
  provider: 'grok' | 'gemini' | null;
  model: string | null;
  latencyMs: number | null;
  missingPlatforms: CopyPlatform[];
  savedId: string | null;
  savedAt: string | null;
  saveError: string | null;
}
