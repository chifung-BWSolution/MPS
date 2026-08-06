/** Shared domain normalize / match helpers for Ads ↔ webandsystem_list linking */

export type WebsiteRow = {
  id: string;
  domain_url: string | null;
  website_name: string | null;
  google_ads_customer_id?: string | null;
  facebook_ads_ad_account_id?: string | null;
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

export type FacebookAccountWebsiteRow = {
  ad_account_id: string;
  website_profile_id: string;
  matched_domain: string;
  sample_final_url: string | null;
  match_source: "page_website" | "name";
  last_seen_at: string;
  updated_at: string;
};

export type AdsLinkSummary = {
  websites_linked: number;
  domains_discovered: number;
  domains_unmatched: number;
  campaigns_with_links?: number;
  accounts_with_links?: number;
  pages_scanned?: number;
  pages_with_website?: number;
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

/** Extract likely domain tokens from an account/campaign name (fallback only). */
export function extractDomainsFromName(name: string | null | undefined): string[] {
  if (!name) return [];
  const domains = new Set<string>();
  const matches = String(name)
    .toLowerCase()
    .match(/[a-z0-9][-a-z0-9]*\.(?:com|com\.hk|hk|net|org|co\.uk|io|ai|app|shop)(?:\.[a-z]{2})?/gi);
  if (matches) {
    for (const m of matches) {
      const d = normalizeDomain(m);
      if (d) domains.add(d);
    }
  }
  return [...domains];
}

/** Match candidate domains to webandsystem_list (exact / subdomain either-way). */
export function matchDomainsToWebsites(
  domains: string[],
  websites: WebsiteRow[],
): DomainMatch[] {
  const matches: DomainMatch[] = [];
  const seenWebsite = new Set<string>();

  for (const raw of domains) {
    const key = normalizeDomain(raw);
    if (!key) continue;
    for (const w of websites) {
      const d = normalizeDomain(w.domain_url);
      if (!d) continue;
      if (d === key || d.endsWith("." + key) || key.endsWith("." + d)) {
        if (seenWebsite.has(w.id)) continue;
        seenWebsite.add(w.id);
        matches.push({ website_profile_id: w.id, matched_domain: d });
      }
    }
  }
  return matches;
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
    .select("id, domain_url, website_name");
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

/** Replace junction rows for the given ad accounts with the new set. */
export async function replaceFacebookAccountWebsiteLinks(
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
  adAccountIds: string[],
  rows: FacebookAccountWebsiteRow[],
): Promise<number> {
  for (let i = 0; i < adAccountIds.length; i += 200) {
    const chunk = adAccountIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const { error } = await supabase
      .from("facebook_ads_account_websites")
      .delete()
      .in("ad_account_id", chunk);
    if (error) throw new Error(`Facebook account website delete failed: ${error.message}`);
  }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (!chunk.length) continue;
    const { error } = await supabase
      .from("facebook_ads_account_websites")
      .upsert(chunk, { onConflict: "ad_account_id,website_profile_id" });
    if (error) throw new Error(`Facebook account website upsert failed: ${error.message}`);
  }
  return rows.length;
}
