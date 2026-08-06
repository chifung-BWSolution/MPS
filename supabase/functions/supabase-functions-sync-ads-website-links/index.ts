import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders as googleCors,
  fetchAccounts,
  getAccessToken,
  linkGoogleCampaignWebsites,
} from "../_shared/google-ads.ts";
import {
  fetchAllAccounts,
  linkFacebookAccountWebsites,
} from "../_shared/meta-ads.ts";
import { normalizeDomain } from "../_shared/website-match.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

const corsHeaders = googleCors;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadUnmatched(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("ads_discovered_domains")
    .select(
      "normalized_domain, sample_url, sources, status, website_profile_id, first_seen_at, last_seen_at",
    )
    .eq("status", "unmatched")
    .order("last_seen_at", { ascending: false });
  if (error) throw new Error(`Load unmatched failed: ${error.message}`);
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    normalizedDomain: String(r.normalized_domain || ""),
    sampleUrl: (r.sample_url as string) || null,
    sources: Array.isArray(r.sources) ? r.sources : [],
    status: String(r.status || "unmatched"),
    websiteProfileId: (r.website_profile_id as string) || null,
    firstSeenAt: (r.first_seen_at as string) || undefined,
    lastSeenAt: (r.last_seen_at as string) || undefined,
  }));
}

/** Run Google + Facebook destination URL discovery and junction linking. */
async function runLinkPass(supabase: ReturnType<typeof createClient>) {
  const nowIso = new Date().toISOString();
  const linkErrors: string[] = [];

  let googleSummary = {
    websites_linked: 0,
    domains_discovered: 0,
    domains_unmatched: 0,
    campaigns_with_links: 0,
    link_errors: [] as string[],
  };
  let facebookSummary = {
    websites_linked: 0,
    domains_discovered: 0,
    domains_unmatched: 0,
    accounts_with_links: 0,
    link_errors: [] as string[],
  };

  try {
    const accessToken = await getAccessToken();
    const accounts = await fetchAccounts(accessToken, nowIso);
    await supabase.from("google_ads_accounts").upsert(accounts, {
      onConflict: "customer_id",
    });
    const enabledIds = accounts
      .filter((a) => !a.is_manager && a.status.toUpperCase() === "ENABLED")
      .map((a) => a.customer_id);
    const nameMap = new Map(
      accounts.map((a) => [a.customer_id, a.descriptive_name]),
    );
    googleSummary = await linkGoogleCampaignWebsites(
      supabase,
      accessToken,
      enabledIds,
      nameMap,
      nowIso,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    linkErrors.push(`google: ${msg.slice(0, 220)}`);
  }

  try {
    const { credentials, accounts } = await fetchAllAccounts(nowIso);
    await supabase.from("facebook_ads_accounts").upsert(accounts, {
      onConflict: "ad_account_id",
    });
    facebookSummary = await linkFacebookAccountWebsites(
      supabase,
      credentials,
      accounts,
      nowIso,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    linkErrors.push(`facebook: ${msg.slice(0, 220)}`);
  }

  const unmatched = await loadUnmatched(supabase);
  return {
    google: {
      websitesLinked: googleSummary.websites_linked,
      domainsDiscovered: googleSummary.domains_discovered,
      domainsUnmatched: googleSummary.domains_unmatched,
      campaignsWithLinks: googleSummary.campaigns_with_links,
      linkErrors: googleSummary.link_errors,
    },
    facebook: {
      websitesLinked: facebookSummary.websites_linked,
      domainsDiscovered: facebookSummary.domains_discovered,
      domainsUnmatched: facebookSummary.domains_unmatched,
      accountsWithLinks: facebookSummary.accounts_with_links,
      linkErrors: facebookSummary.link_errors,
    },
    unmatched,
    linkErrors: [
      ...linkErrors,
      ...googleSummary.link_errors.slice(0, 10),
      ...facebookSummary.link_errors.slice(0, 10),
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "sync");

    if (action === "list_unmatched") {
      const unmatched = await loadUnmatched(supabase);
      return json({ success: true, unmatched });
    }

    if (action === "dismiss") {
      const domain = normalizeDomain(String(body.domain || ""));
      if (!domain) throw new Error("domain required");
      const { error } = await supabase
        .from("ads_discovered_domains")
        .update({
          status: "dismissed",
          updated_at: new Date().toISOString(),
        })
        .eq("normalized_domain", domain);
      if (error) throw new Error(error.message);
      const unmatched = await loadUnmatched(supabase);
      return json({ success: true, unmatched });
    }

    if (action === "mark_linked") {
      const domain = normalizeDomain(String(body.domain || ""));
      const websiteProfileId = String(body.websiteProfileId || "");
      if (!domain || !websiteProfileId) {
        throw new Error("domain and websiteProfileId required");
      }
      const { error } = await supabase
        .from("ads_discovered_domains")
        .update({
          status: "linked",
          website_profile_id: websiteProfileId,
          updated_at: new Date().toISOString(),
        })
        .eq("normalized_domain", domain);
      if (error) throw new Error(error.message);
      // Re-run full link so junctions pick up the new website
      const result = await runLinkPass(supabase);
      return json({ success: true, ...result });
    }

    if (action === "sync" || action === "relink") {
      const result = await runLinkPass(supabase);
      return json({ success: true, ...result });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: msg }, 500);
  }
});
