export function normalizeLoginEmail(email: string | null | undefined): string {
  return (email || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .toLowerCase()
    .trim();
}

export function scoreWhitelistCandidate(opts: {
  staffActive: boolean;
  emailMatch?: boolean;
}): number {
  let score = 0;
  if (opts.staffActive) score += 100;
  if (opts.emailMatch) score += 30;
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
