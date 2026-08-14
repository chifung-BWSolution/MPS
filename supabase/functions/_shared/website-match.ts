/** Shared domain normalize / match helpers for Ads ↔ webandsystem_list linking */

export type WebsiteRow = {
  id: string;
  domain_url: string | null;
  website_name: string | null;
  status?: string | null;
  google_ads_customer_id?: string | null;
};

export type DomainMatch = {
  website_profile_id: string;
  matched_domain: string;
};

export type AdsSourceRef = {
  platform: "google" | "facebook";
  accountId: string;
  accountName: string;
  campaignId?: string | null;
  campaignName?: string | null;
  /** Facebook Page (fan page) that owns the website URL */
  pageId?: string | null;
  pageName?: string | null;
};

export type DiscoveredDomainInput = {
  normalized_domain: string;
  sample_url: string | null;
  source: "google" | "facebook";
  website_profile_id?: string | null;
  source_ref?: AdsSourceRef | null;
};

function sourceRefKey(ref: AdsSourceRef): string {
  return [
    ref.platform,
    ref.accountId || "",
    ref.campaignId || "",
    ref.pageId || "",
  ].join("|");
}

/** Merge source refs; prefer richer names; cap list size. */
export function mergeSourceRefs(
  existing: unknown,
  incoming: AdsSourceRef[],
  max = 40,
): AdsSourceRef[] {
  const map = new Map<string, AdsSourceRef>();
  const push = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const platform = r.platform === "facebook" ? "facebook" : r.platform === "google" ? "google" : null;
    const accountId = String(r.accountId || "").trim();
    if (!platform || !accountId) return;
    const ref: AdsSourceRef = {
      platform,
      accountId,
      accountName: String(r.accountName || accountId),
      campaignId: r.campaignId != null && String(r.campaignId) ? String(r.campaignId) : null,
      campaignName: r.campaignName != null && String(r.campaignName)
        ? String(r.campaignName)
        : null,
      pageId: r.pageId != null && String(r.pageId) ? String(r.pageId) : null,
      pageName: r.pageName != null && String(r.pageName) ? String(r.pageName) : null,
    };
    const key = sourceRefKey(ref);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, ref);
      return;
    }
    map.set(key, {
      ...prev,
      accountName: prev.accountName || ref.accountName,
      campaignName: prev.campaignName || ref.campaignName,
      pageName: prev.pageName || ref.pageName,
    });
  };
  if (Array.isArray(existing)) {
    for (const item of existing) push(item);
  }
  for (const item of incoming) push(item);
  return [...map.values()].slice(0, max);
}

export type GoogleCampaignWebsiteRow = {
  customer_id: string;
  campaign_id: string;
  website_profile_id: string;
  campaign_row_id: string;
  matched_domain: string;
  sample_final_url: string | null;
  match_source: "final_url" | "landing_page" | "name";
  last_seen_at: string;
  updated_at: string;
};

export type AdsLinkSummary = {
  websites_linked: number;
  domains_discovered: number;
  domains_unmatched: number;
  campaigns_with_links?: number;
  pmax_campaigns_scanned?: number;
  pmax_campaigns_with_links?: number;
  link_errors: string[];
};

/** Normalize a URL or domain to a bare hostname (no www). */
export function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\/+$/, "");
  return s.split(/[/?#]/)[0] || "";
}

/** Collect unique normalized hostnames from URL strings. */
export function extractDomainsFromUrls(urls: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    const d = normalizeDomain(u);
    if (d && d.includes(".")) out.add(d);
  }
  return [...out];
}

/** Longest multi-part TLDs first so "brandingworks.com.hk" is not truncated to ".com". */
const MULTI_PART_TLDS = [
  "com.hk",
  "com.au",
  "com.sg",
  "com.tw",
  "com.cn",
  "com.my",
  "co.uk",
  "co.jp",
  "co.nz",
  "co.za",
  "co.in",
  "org.hk",
  "net.hk",
  "edu.hk",
  "gov.hk",
];
const SINGLE_TLDS = [
  "com",
  "hk",
  "net",
  "org",
  "edu",
  "gov",
  "io",
  "ai",
  "app",
  "shop",
  "asia",
  "info",
  "biz",
  "cc",
];
const KNOWN_TLDS = [...MULTI_PART_TLDS, ...SINGLE_TLDS];

function registrableDomainFromHost(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join(".");
    if (KNOWN_TLDS.includes(suffix)) {
      return parts.slice(i - 1).join(".");
    }
  }
  return "";
}

/** Extract likely domain tokens from an account/campaign name (fallback only). */
export function extractDomainsFromName(name: string | null | undefined): string[] {
  if (!name) return [];
  const domains = new Set<string>();
  const matches = String(name)
    .toLowerCase()
    .match(/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/gi);
  if (matches) {
    for (const m of matches) {
      const host = normalizeDomain(m);
      const d = registrableDomainFromHost(host);
      if (d) domains.add(d);
    }
  }
  return [...domains];
}

/** Match known website domains that appear as substrings in account/campaign names. */
export function matchWebsitesFromText(
  text: string | null | undefined,
  websites: WebsiteRow[],
): DomainMatch[] {
  const hay = String(text || "").toLowerCase();
  if (!hay.trim()) return [];
  const domains: string[] = [];
  for (const w of websites) {
    const d = normalizeDomain(w.domain_url);
    if (d && hay.includes(d)) domains.push(d);
  }
  return matchDomainsToWebsites(domains, websites);
}

/**
 * Last-resort name match: a long alphanumeric token that appears in exactly one
 * website domain (e.g. "Beauty100 Magazine" → beauty100-magazine.com).
 */
export function matchWebsitesFromUniqueNameToken(
  text: string | null | undefined,
  websites: WebsiteRow[],
): DomainMatch[] {
  const tokens = [...new Set(String(text || "").toLowerCase().match(/[a-z0-9]{8,}/g) ?? [])];
  if (!tokens.length) return [];
  const domains: string[] = [];
  for (const token of tokens) {
    const hits = websites
      .map((w) => normalizeDomain(w.domain_url))
      .filter((d) => d.includes(token));
    if (hits.length === 1) domains.push(hits[0]);
  }
  return matchDomainsToWebsites(domains, websites);
}

/** Match candidate domains to webandsystem_list (exact / subdomain either-way). */
export function matchDomainsToWebsites(
  domains: string[],
  websites: WebsiteRow[],
): DomainMatch[] {
  type Candidate = DomainMatch & { exact: boolean; live: boolean };
  const byWebsite = new Map<string, Candidate>();

  for (const raw of domains) {
    const key = normalizeDomain(raw);
    if (!key) continue;
    for (const w of websites) {
      const d = normalizeDomain(w.domain_url);
      if (!d) continue;
      const exact = d === key;
      const related = d.endsWith("." + key) || key.endsWith("." + d);
      if (!exact && !related) continue;
      const cand: Candidate = {
        website_profile_id: w.id,
        matched_domain: d,
        exact,
        live: String(w.status || "").toLowerCase() === "live",
      };
      const prev = byWebsite.get(w.id);
      if (!prev || (cand.exact && !prev.exact)) {
        byWebsite.set(w.id, cand);
      }
    }
  }

  const byDomain = new Map<string, Candidate>();
  for (const cand of byWebsite.values()) {
    const domainKey = normalizeDomain(cand.matched_domain);
    const prev = byDomain.get(domainKey);
    if (!prev) {
      byDomain.set(domainKey, cand);
      continue;
    }
    const prevScore = (prev.exact ? 2 : 0) + (prev.live ? 1 : 0);
    const nextScore = (cand.exact ? 2 : 0) + (cand.live ? 1 : 0);
    if (nextScore > prevScore) byDomain.set(domainKey, cand);
  }

  return [...byDomain.values()].map(({ website_profile_id, matched_domain }) => ({
    website_profile_id,
    matched_domain,
  }));
}

/** Pick first sample URL whose host matches the normalized domain. */
export function pickSampleUrlForDomain(
  domain: string,
  urls: Array<string | null | undefined>,
): string | null {
  const key = normalizeDomain(domain);
  for (const u of urls) {
    if (!u) continue;
    if (normalizeDomain(u) === key || normalizeDomain(u).endsWith("." + key)) {
      return String(u);
    }
  }
  return urls.find((u) => !!u) ? String(urls.find((u) => !!u)) : null;
}

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> & {
      eq?: (col: string, val: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    upsert: (
      rows: unknown,
      opts?: { onConflict?: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
    delete: () => {
      eq: (col: string, val: string) => PromiseLike<{ error: { message: string } | null }> & {
        in: (col: string, vals: string[]) => PromiseLike<{ error: { message: string } | null }>;
      };
      in: (col: string, vals: string[]) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export async function loadWebsiteRows(supabase: {
  from: (t: string) => {
    select: (c: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}): Promise<WebsiteRow[]> {
  // Only select columns that exist on all envs. Optional Ads/GSC FK columns are
  // not required for domain matching and may be missing if those migrations
  // were not applied yet.
  const { data, error } = await supabase
    .from("webandsystem_list")
    .select("id, domain_url, website_name, status");
  if (error) throw new Error(`Load websites failed: ${error.message}`);
  return ((data as WebsiteRow[] | null) ?? []).filter((w) => w?.id);
}

/** Upsert discovered domains; merge sources; promote to linked when website matched. */
export async function upsertDiscoveredDomains(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        in: (
          col: string,
          vals: string[],
        ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
      upsert: (
        rows: unknown,
        opts?: { onConflict?: string },
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
  },
  inputs: DiscoveredDomainInput[],
  nowIso: string,
): Promise<{ discovered: number; unmatched: number }> {
  if (!inputs.length) return { discovered: 0, unmatched: 0 };

  type Agg = DiscoveredDomainInput & {
    sources: Set<string>;
    refs: AdsSourceRef[];
  };
  const byDomain = new Map<string, Agg>();
  for (const row of inputs) {
    const d = normalizeDomain(row.normalized_domain);
    if (!d) continue;
    const prev = byDomain.get(d);
    const ref = row.source_ref || null;
    if (!prev) {
      byDomain.set(d, {
        ...row,
        normalized_domain: d,
        sources: new Set([row.source]),
        refs: ref ? [ref] : [],
      });
    } else {
      prev.sources.add(row.source);
      if (!prev.sample_url && row.sample_url) prev.sample_url = row.sample_url;
      if (!prev.website_profile_id && row.website_profile_id) {
        prev.website_profile_id = row.website_profile_id;
      }
      if (ref) prev.refs.push(ref);
    }
  }

  const domains = [...byDomain.keys()];
  const { data: existing, error: selErr } = await supabase
    .from("ads_discovered_domains")
    .select(
      "normalized_domain, sources, status, website_profile_id, sample_url, first_seen_at, source_refs",
    )
    .in("normalized_domain", domains);
  if (selErr) throw new Error(`Load discovered domains failed: ${selErr.message}`);

  type Existing = {
    normalized_domain: string;
    sources: string[] | null;
    status: string;
    website_profile_id: string | null;
    sample_url: string | null;
    first_seen_at: string;
    source_refs?: unknown;
  };
  const existingMap = new Map(
    ((existing as Existing[] | null) ?? []).map((r) => [r.normalized_domain, r]),
  );

  const upserts = domains.map((d) => {
    const incoming = byDomain.get(d)!;
    const prev = existingMap.get(d);
    const sources = new Set([...(prev?.sources ?? []), ...incoming.sources]);
    const websiteId = incoming.website_profile_id || prev?.website_profile_id || null;
    let status = prev?.status || "unmatched";
    if (websiteId && status !== "dismissed") status = "linked";
    else if (!websiteId && status !== "dismissed") status = "unmatched";
    return {
      normalized_domain: d,
      sample_url: incoming.sample_url || prev?.sample_url || null,
      sources: [...sources],
      source_refs: mergeSourceRefs(prev?.source_refs, incoming.refs),
      first_seen_at: prev?.first_seen_at || nowIso,
      last_seen_at: nowIso,
      website_profile_id: websiteId,
      status,
      updated_at: nowIso,
    };
  });

  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500);
    const { error } = await supabase
      .from("ads_discovered_domains")
      .upsert(chunk, { onConflict: "normalized_domain" });
    if (error) throw new Error(`Discovered domain upsert failed: ${error.message}`);
  }

  const unmatched = upserts.filter((u) => u.status === "unmatched").length;
  return { discovered: upserts.length, unmatched };
}

/** Replace junction rows for the given campaign keys with the new set. */
export async function replaceGoogleCampaignWebsiteLinks(
  supabase: {
    from: (t: string) => {
      delete: () => {
        in: (col: string, vals: string[]) => PromiseLike<{ error: { message: string } | null }>;
      };
      upsert: (
        rows: unknown,
        opts?: { onConflict?: string },
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
  },
  campaignRowIds: string[],
  rows: GoogleCampaignWebsiteRow[],
): Promise<number> {
  // Delete in chunks for campaigns we refreshed
  for (let i = 0; i < campaignRowIds.length; i += 200) {
    const chunk = campaignRowIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const { error } = await supabase
      .from("google_ads_campaign_websites")
      .delete()
      .in("campaign_row_id", chunk);
    if (error) throw new Error(`Google campaign website delete failed: ${error.message}`);
  }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (!chunk.length) continue;
    const { error } = await supabase
      .from("google_ads_campaign_websites")
      .upsert(chunk, { onConflict: "customer_id,campaign_id,website_profile_id" });
    if (error) throw new Error(`Google campaign website upsert failed: ${error.message}`);
  }
  return rows.length;
}
