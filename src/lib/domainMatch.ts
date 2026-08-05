/** Normalize a URL or domain for fuzzy matching. */
export function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\/+$/, '');
  s = s.split(/[/?#]/)[0] ?? '';
  return s;
}

/** Extract likely domain tokens from Google Ads account descriptive name. */
export function extractDomainsFromAccountName(name: string): string[] {
  const domains = new Set<string>();
  const normalized = name.toLowerCase();
  const matches = normalized.match(/[a-z0-9][-a-z0-9]*\.(?:com|com\.hk|hk|net|org|co\.uk)(?:\.[a-z]{2})?/gi);
  if (matches) {
    for (const m of matches) domains.add(normalizeDomain(m));
  }
  return [...domains];
}

export interface DomainMatchTarget {
  customerId: string;
  descriptiveName: string;
}

export interface DomainMatchResult {
  customerId: string;
  descriptiveName: string;
  matchedDomain: string;
}

/** Match an Excel domain to a Google Ads client account. */
export function matchDomainToGoogleAdsAccount(
  excelDomain: string,
  accounts: DomainMatchTarget[],
): DomainMatchResult | null {
  const needle = normalizeDomain(excelDomain);
  if (!needle) return null;

  const clientAccounts = accounts.filter((a) => a.descriptiveName);

  // Exact domain token in account name
  for (const account of clientAccounts) {
    const tokens = extractDomainsFromAccountName(account.descriptiveName);
    if (tokens.some((t) => t === needle || needle.endsWith(t) || t.endsWith(needle))) {
      return {
        customerId: account.customerId,
        descriptiveName: account.descriptiveName,
        matchedDomain: needle,
      };
    }
  }

  // Substring match on descriptive name (e.g. hkofficedesign.com in account label)
  const baseNeedle = needle.replace(/^www\./, '');
  for (const account of clientAccounts) {
    const hay = account.descriptiveName.toLowerCase();
    if (hay.includes(baseNeedle)) {
      return {
        customerId: account.customerId,
        descriptiveName: account.descriptiveName,
        matchedDomain: needle,
      };
    }
  }

  return null;
}
