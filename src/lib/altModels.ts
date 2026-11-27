/**
 * ALT Pilot · 實際呼叫過的模型。
 * 順位依同一批用量裡首次出現的順序（① 最先用到），藥丸顯示該批最後一次呼叫。
 */

export interface AltModelUsagePoint {
  model: string;
  createdAt: string;
  runId?: string | null;
}

export interface RankedAltModel {
  model: string;
  rank: number;
  mark: string;
  lastUsedAt: string;
}

export function altModelRankMark(rank: number): string {
  if (rank >= 1 && rank <= 20) return String.fromCodePoint(0x245f + rank);
  return String(rank);
}

export function rankUsedAltModels(points: AltModelUsagePoint[]): {
  models: RankedAltModel[];
  lastModel: string | null;
} {
  const ordered = points
    .map((point, index) => ({
      model: point.model.trim(),
      createdAt: point.createdAt,
      index,
    }))
    .filter((point) => point.model.length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.index - b.index);

  const order: string[] = [];
  const lastUsedAt = new Map<string, string>();
  for (const point of ordered) {
    if (!lastUsedAt.has(point.model)) order.push(point.model);
    lastUsedAt.set(point.model, point.createdAt);
  }

  const models = order.map((model, index) => ({
    model,
    rank: index + 1,
    mark: altModelRankMark(index + 1),
    lastUsedAt: lastUsedAt.get(model) || '',
  }));

  return {
    models,
    lastModel: ordered.length > 0 ? ordered[ordered.length - 1].model : null,
  };
}

/**
 * 有這次分析的用量就用這次；否則用最近一筆用量所屬的那次分析。
 * `recentRows` 必須是新到舊。
 */
export function pickCurrentModelUsage(
  preferredRunId: string | null | undefined,
  preferredRows: AltModelUsagePoint[],
  recentRows: AltModelUsagePoint[],
): AltModelUsagePoint[] {
  if (preferredRunId && preferredRows.length > 0) return preferredRows;
  if (recentRows.length === 0) return [];

  const newestRunId = (recentRows[0].runId || '').trim();
  if (!newestRunId) return recentRows.filter((row) => !(row.runId || '').trim());
  return recentRows.filter((row) => (row.runId || '').trim() === newestRunId);
}
