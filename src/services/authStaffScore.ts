export function scoreWhitelistCandidate(opts: {
  staffActive: boolean;
  systemActive: boolean;
  googleEmailMatch?: boolean;
  emailMatch?: boolean;
}): number {
  let score = 0;
  if (opts.staffActive) score += 100;
  if (opts.systemActive) score += 10;
  if (opts.googleEmailMatch) score += 20;
  if (opts.emailMatch) score += 10;
  return score;
}

export function pickPreferredWhitelistRow<T>(
  rows: T[],
  scoreOf: (row: T) => number,
): T | null {
  if (rows.length === 0) return null;
  const scored = rows.map((row) => ({ row, score: scoreOf(row) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.row ?? null;
}
