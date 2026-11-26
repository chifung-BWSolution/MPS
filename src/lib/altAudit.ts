/**
 * ALT Pilot · 單頁 ALT 盤點（純函式）
 *
 * 批次盤點與之後的站點報告共用同一套口徑：
 *   - 缺 ALT：非裝飾圖且 currentAlt 為空
 *   - 重複：同頁正規化後相同的 currentAlt（只計多出的）
 *   - 過長：>125 字元
 */

import { countChars, normalizeForCompare } from './altText.ts';
import type { AltImageCandidate } from './altTypes.ts';

export interface AltPageAudit {
  imageCount: number;
  missing: number;
  duplicates: number;
  tooLong: number;
  decorative: number;
  missingImages: AltImageCandidate[];
}

export function auditAltImages(images: readonly AltImageCandidate[]): AltPageAudit {
  const missingImages = images.filter(
    (image) => !image.decorative && !String(image.currentAlt || '').trim(),
  );
  const seen = new Map<string, number>();
  for (const image of images) {
    const normalized = normalizeForCompare(image.currentAlt || '');
    if (!normalized) continue;
    seen.set(normalized, (seen.get(normalized) || 0) + 1);
  }

  return {
    imageCount: images.length,
    missing: missingImages.length,
    duplicates: Array.from(seen.values()).reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
    tooLong: images.filter((image) => countChars(image.currentAlt || '') > 125).length,
    decorative: images.filter((image) => image.decorative).length,
    missingImages,
  };
}
