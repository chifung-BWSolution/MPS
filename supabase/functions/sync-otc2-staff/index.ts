import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";

// OTC2 is readable via anon (open_select). Secrets override the defaults.
const OTC2_SUPABASE_URL =
  Deno.env.get("OTC2_SUPABASE_URL") || "https://zwhbfphavcxncfmcrwrr.supabase.co";
const OTC2_ANON_KEY =
  Deno.env.get("OTC2_ANON_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3aGJmcGhhdmN4bmNmbWNyd3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODg4MjIsImV4cCI6MjA5NTk2NDgyMn0.pxdK15j23OklXl6fQNECaNkxE9mmQggrWw13BJMvaDI";

const STAFF_SYNC_SELECT = [
  "id",
  "staff_id",
  "display_name",
  "full_name",
  "chinese_name",
  "position",
  "role",
  "status",
  "work_email",
  "private_email",
  "private_phone",
  "company_phone",
  "image_url",
  "base_location",
  "team_name",
  "company",
  "company_id",
  "brand_ids",
  "entry_date",
  "termination_date",
].join(",");

interface Otc2StaffSync {
  id: string | null;
  staff_id: string | number | null;
  display_name: string | null;
  full_name: string | null;
  chinese_name: string | null;
  position: string | null;
  role: string | null;
  user_role?: string | null;
  status: string | null;
  work_email: string | null;
  private_email: string | null;
  private_phone: string | null;
  company_phone: string | null;
  image_url: string | null;
  base_location: string | null;
  team_name: string | null;
  company: string | null;
  company_id: number | string | null;
  brand_ids: string[] | string | null;
  entry_date: string | null;
  termination_date: string | null;
}

interface CompanyListRow {
  uuid: string;
  company_code: string | null;
}

interface BrandListRow {
  id: string;
  otc_id: string | null;
  brand_code: string | null;
}

/** Allowed staffs write columns only. Never include local `id`. */
interface StaffsUpsertRow {
  otc_staff_sync_id: string;
  display_name: string;
  full_name: string | null;
  chinese_name: string | null;
  position: string | null;
  user_role: string | null;
  status: "active" | "inactive";
  work_email: string | null;
  private_email: string | null;
  work_phone: string | null;
  private_phone: string | null;
  profile_pic_url: string | null;
  base_location: string | null;
  team_name: string | null;
  company_list_id: string | null;
  brand_list_id: string | null;
  entry_date: string | null;
  termination_date: string | null;
  synced_at: string;
  updated_at: string;
}

function toDateString(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().split("T")[0];
}

function isActiveStatus(status: string | null | undefined): boolean {
  return status === "Active";
}

function normalizeBrandIds(value: Otc2StaffSync["brand_ids"]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((id) => String(id).trim()).filter(Boolean);
  }
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id).trim()).filter(Boolean);
      }
    } catch {
      // fall through to comma-split
    }
  }
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

function resolveCompanyListId(
  company: string | null | undefined,
  companies: CompanyListRow[],
): string | null {
  const needle = (company || "").trim().toLowerCase();
  if (!needle) return null;
  const match = companies.find(
    (row) => (row.company_code || "").trim().toLowerCase() === needle,
  );
  return match?.uuid ?? null;
}

function resolveBrandListId(
  brandIds: Otc2StaffSync["brand_ids"],
  brands: BrandListRow[],
): string | null {
  const otcToLocalId = new Map<string, string>();
  for (const brand of brands) {
    if (!brand.otc_id) continue;
    otcToLocalId.set(brand.otc_id.toLowerCase(), brand.id);
  }
  for (const brandId of normalizeBrandIds(brandIds)) {
    const localId = otcToLocalId.get(brandId.toLowerCase());
    if (localId) return localId;
  }
  return null;
}

function mapStaffSyncRow(
  staff: Otc2StaffSync,
  companies: CompanyListRow[],
  brands: BrandListRow[],
  now: string,
): StaffsUpsertRow | null {
  if (!staff.id) return null;

  return {
    otc_staff_sync_id: staff.id,
    display_name: staff.display_name ?? "",
    full_name: staff.full_name,
    chinese_name: staff.chinese_name,
    position: staff.position,
    user_role: staff.user_role || staff.role || null,
    status: isActiveStatus(staff.status) ? "active" : "inactive",
    work_email: staff.work_email,
    private_email: staff.private_email,
    work_phone: staff.company_phone,
    private_phone: staff.private_phone,
    profile_pic_url: staff.image_url,
    base_location: staff.base_location,
    team_name: staff.team_name,
    company_list_id: resolveCompanyListId(staff.company, companies),
    brand_list_id: resolveBrandListId(staff.brand_ids, brands),
    entry_date: toDateString(staff.entry_date),
    termination_date: toDateString(staff.termination_date),
    synced_at: now,
    updated_at: now,
  };
}

async function fetchAllOtc2StaffSync(
  otc2: ReturnType<typeof createClient>,
): Promise<Otc2StaffSync[]> {
  const pageSize = 1000;
  let from = 0;
  const all: Otc2StaffSync[] = [];

  while (true) {
    const { data, error } = await otc2
      .from("staff_sync")
      .select(STAFF_SYNC_SELECT)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`OTC2 staff_sync fetch failed: ${error.message}`);
    }

    const batch = (data || []) as Otc2StaffSync[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function loadCompanyList(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<CompanyListRow[]> {
  const pageSize = 1000;
  let from = 0;
  const all: CompanyListRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("company_list")
      .select("uuid, company_code")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load company_list: ${error.message}`);
    }

    const batch = (data || []) as CompanyListRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function loadBrandList(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<BrandListRow[]> {
  const pageSize = 1000;
  let from = 0;
  const all: BrandListRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("brand_list")
      .select("id, otc_id, brand_code")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load brand_list: ${error.message}`);
    }

    const batch = (data || []) as BrandListRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function loadExistingSyncIds(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Set<string>> {
  const pageSize = 1000;
  let from = 0;
  const ids = new Set<string>();

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("staffs")
      .select("otc_staff_sync_id")
      .not("otc_staff_sync_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load existing staffs: ${error.message}`);
    }

    const batch = (data || []) as { otc_staff_sync_id: string | null }[];
    for (const row of batch) {
      if (row.otc_staff_sync_id) ids.add(row.otc_staff_sync_id);
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const missingSecrets: string[] = [];
    if (!SUPABASE_URL) missingSecrets.push("SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      missingSecrets.push("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY");
    }
    if (!OTC2_SUPABASE_URL) missingSecrets.push("OTC2_SUPABASE_URL");
    if (!OTC2_ANON_KEY) missingSecrets.push("OTC2_ANON_KEY");

    if (missingSecrets.length > 0) {
      return new Response(
        JSON.stringify({
          error: `Missing secrets: ${missingSecrets.join(", ")}`,
          missing: missingSecrets,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const otc2 = createClient(OTC2_SUPABASE_URL, OTC2_ANON_KEY);

    console.log("[sync-otc2-staff] Fetching staff_sync from OTC2...");
    const otc2Staff = await fetchAllOtc2StaffSync(otc2);
    const syncable = otc2Staff.filter((s) => !!s.id);

    if (syncable.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No staff_sync records with id found in OTC2",
          environment: "OTC2",
          full_refresh: false,
          stats: { total: 0, created: 0, updated: 0, active: 0, inactive: 0, teams: 0 },
          synced_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log("[sync-otc2-staff] Loading company_list / brand_list for FK resolve...");
    const [companies, brands, existingIds] = await Promise.all([
      loadCompanyList(supabaseAdmin),
      loadBrandList(supabaseAdmin),
      loadExistingSyncIds(supabaseAdmin),
    ]);

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;

    const upsertData: StaffsUpsertRow[] = [];
    for (const staff of syncable) {
      const row = mapStaffSyncRow(staff, companies, brands, now);
      if (!row) continue;
      if (existingIds.has(row.otc_staff_sync_id)) updated += 1;
      else created += 1;
      upsertData.push(row);
    }

    const upsertPageSize = 200;
    console.log(`[sync-otc2-staff] Upserting ${upsertData.length} staff_sync records...`);
    for (let i = 0; i < upsertData.length; i += upsertPageSize) {
      const batch = upsertData.slice(i, i + upsertPageSize);
      const { error: upsertError } = await supabaseAdmin
        .from("staffs")
        .upsert(batch, {
          onConflict: "otc_staff_sync_id",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        return new Response(
          JSON.stringify({
            error: `Database upsert failed: ${upsertError.message}`,
            code: upsertError.code,
            details: upsertError.details,
            hint: upsertError.hint,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }
    }

    const activeCount = syncable.filter((s) => isActiveStatus(s.status)).length;
    const inactiveCount = syncable.length - activeCount;
    const teams = new Set(syncable.map((s) => s.team_name).filter(Boolean));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${syncable.length} staff_sync records from OTC2`,
        environment: "OTC2",
        api_url: OTC2_SUPABASE_URL,
        full_refresh: false,
        stats: {
          total: syncable.length,
          created,
          updated,
          active: activeCount,
          inactive: inactiveCount,
          teams: teams.size,
          skipped_no_id: otc2Staff.length - syncable.length,
        },
        synced_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[sync-otc2-staff] FATAL ERROR:", err.message);
    return new Response(
      JSON.stringify({
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
