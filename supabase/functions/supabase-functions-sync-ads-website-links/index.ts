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
  loadCredentials,
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

function mapSourceRefs(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const platform = r.platform === "facebook"
        ? "facebook"
        : r.platform === "google"
        ? "google"
        : null;
      const accountId = String(r.accountId || "").trim();
      if (!platform || !accountId) return null;
      return {
        platform,
        accountId,
        accountName: String(r.accountName || accountId),
        campaignId: r.campaignId != null && String(r.campaignId)
          ? String(r.campaignId)
          : null,
        campaignName: r.campaignName != null && String(r.campaignName)
          ? String(r.campaignName)
          : null,
        pageId: r.pageId != null && String(r.pageId) ? String(r.pageId) : null,
        pageName: r.pageName != null && String(r.pageName)
          ? String(r.pageName)
          : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

async function loadUnmatched(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("ads_discovered_domains")
    .select(
      "normalized_domain, sample_url, sources, status, website_profile_id, first_seen_at, last_seen_at, source_refs",
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
    sourceRefs: mapSourceRefs(r.source_refs),
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
    pages_scanned: 0,
    pages_with_website: 0,
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
      pagesScanned: facebookSummary.pages_scanned,
      pagesWithWebsite: facebookSummary.pages_with_website,
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

    if (action === "debug_meta") {
      const credentials = loadCredentials();
      const reports = [];
      for (const cred of credentials) {
        const report: Record<string, unknown> = {
          id: cred.id,
          name: cred.name,
          app_id: cred.app_id || null,
          api_version: cred.api_version,
        };
        try {
          // Inspect token scopes (no token value returned)
          if (cred.app_id && cred.app_secret) {
            const appToken = `${cred.app_id}|${cred.app_secret}`;
            const debugUrl = new URL(
              `https://graph.facebook.com/${cred.api_version}/debug_token`,
            );
            debugUrl.searchParams.set("input_token", cred.access_token);
            debugUrl.searchParams.set("access_token", appToken);
            const debugRes = await fetch(debugUrl.toString());
            const debugJson = await debugRes.json();
            const data = (debugJson?.data || {}) as Record<string, unknown>;
            report.token_valid = data.is_valid ?? null;
            report.token_type = data.type ?? null;
            report.scopes = data.scopes ?? data.granular_scopes ?? null;
            report.expires_at = data.expires_at ?? null;
            report.debug_error = debugJson?.error?.message ?? null;
          } else {
            report.debug_error = "missing app_id/app_secret for debug_token";
          }
        } catch (e) {
          report.debug_error = e instanceof Error ? e.message : String(e);
        }
        try {
          const meUrl = new URL(
            `https://graph.facebook.com/${cred.api_version}/me/accounts`,
          );
          meUrl.searchParams.set("access_token", cred.access_token);
          meUrl.searchParams.set("fields", "id,name,website");
          meUrl.searchParams.set("limit", "5");
          const meRes = await fetch(meUrl.toString());
          const meJson = await meRes.json();
          const rows = Array.isArray(meJson?.data) ? meJson.data : [];
          report.managed_pages_sample = rows.map((r: Record<string, unknown>) => ({
            id: r.id,
            name: r.name,
            website: r.website ?? null,
          }));
          report.managed_pages_error = meJson?.error?.message ?? null;
        } catch (e) {
          report.managed_pages_error = e instanceof Error ? e.message : String(e);
        }
        try {
          // Probe one promote_pages / ads page read
          const accUrl = new URL(
            `https://graph.facebook.com/${cred.api_version}/me/adaccounts`,
          );
          accUrl.searchParams.set("access_token", cred.access_token);
          accUrl.searchParams.set("fields", "id,name");
          accUrl.searchParams.set("limit", "1");
          const accRes = await fetch(accUrl.toString());
          const accJson = await accRes.json();
          const adAccountId = accJson?.data?.[0]?.id;
          report.sample_ad_account = adAccountId || null;
          if (adAccountId) {
            const adsUrl = new URL(
              `https://graph.facebook.com/${cred.api_version}/${adAccountId}/ads`,
            );
            adsUrl.searchParams.set("access_token", cred.access_token);
            adsUrl.searchParams.set(
              "fields",
              "creative{object_story_spec{page_id},actor_id}",
            );
            adsUrl.searchParams.set("limit", "5");
            const adsRes = await fetch(adsUrl.toString());
            const adsJson = await adsRes.json();
            let pageId: string | null = null;
            for (const ad of adsJson?.data || []) {
              const c = ad?.creative || {};
              const pid = c?.object_story_spec?.page_id || c?.actor_id;
              if (pid && /^\d{5,}$/.test(String(pid))) {
                pageId = String(pid);
                break;
              }
            }
            report.sample_page_id = pageId;
            if (pageId) {
              const pageUrl = new URL(
                `https://graph.facebook.com/${cred.api_version}/${pageId}`,
              );
              pageUrl.searchParams.set("access_token", cred.access_token);
              pageUrl.searchParams.set("fields", "id,name,website");
              const pageRes = await fetch(pageUrl.toString());
              const pageJson = await pageRes.json();
              report.sample_page = {
                id: pageJson?.id ?? pageId,
                name: pageJson?.name ?? null,
                website: pageJson?.website ?? null,
                error: pageJson?.error?.message ?? null,
              };
            }
          }
        } catch (e) {
          report.probe_error = e instanceof Error ? e.message : String(e);
        }
        reports.push(report);
      }
      return json({ success: true, credentials: reports });
    }

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
