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

interface Otc2Staff {
  id: number;
  bubble_id: string | null;
  display_name: string | null;
  full_name: string | null;
  chinese_name: string | null;
  position: string | null;
  o_user_role: string | null;
  o_status: string | null;
  o_status_text: string | null;
  work_email: string | null;
  private_email: string | null;
  linked_user_email: string | null;
  work_phone: string | null;
  private_phone: string | null;
  direct_phone: string | null;
  login_mobile: string | null;
  o_base_location: string | null;
  base_location: string | null;
  birthday: string | null;
  entry_date: string | null;
  termination_date: string | null;
  o_probation: string | null;
  al_quota: number | null;
  n_bu: string | null;
  bu_name: string | null;
  n_team: string | null;
  team_name: string | null;
  n_team_role: string | null;
  team_role_name: string | null;
  brands: unknown;
  profile_pic: string | null;
  voov_id: number | null;
  bubble_created_date: string | null;
  bubble_modified_date: string | null;
}

function isActiveStaff(staff: Otc2Staff): boolean {
  return staff.o_status === "Active" || staff.o_status_text === "Active";
}

function toDateString(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().split("T")[0];
}

function resolveOffice(staff: Otc2Staff): string | null {
  const loc = (staff.base_location || staff.o_base_location || "").trim();
  return loc || null;
}

async function fetchAllOtc2Staff(otc2: ReturnType<typeof createClient>): Promise<Otc2Staff[]> {
  const pageSize = 1000;
  let from = 0;
  const all: Otc2Staff[] = [];

  while (true) {
    const { data, error } = await otc2
      .from("staff")
      .select(
        [
          "id",
          "bubble_id",
          "display_name",
          "full_name",
          "chinese_name",
          "position",
          "o_user_role",
          "o_status",
          "o_status_text",
          "work_email",
          "private_email",
          "linked_user_email",
          "work_phone",
          "private_phone",
          "direct_phone",
          "login_mobile",
          "o_base_location",
          "base_location",
          "birthday",
          "entry_date",
          "termination_date",
          "o_probation",
          "al_quota",
          "n_bu",
          "bu_name",
          "n_team",
          "team_name",
          "n_team_role",
          "team_role_name",
          "brands",
          "profile_pic",
          "voov_id",
          "bubble_created_date",
          "bubble_modified_date",
        ].join(",")
      )
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`OTC2 staff fetch failed: ${error.message}`);
    }

    const batch = (data || []) as Otc2Staff[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
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

    console.log("[sync-otc2-staff] Fetching staff from OTC2...");
    const otc2Staff = await fetchAllOtc2Staff(otc2);
    const syncable = otc2Staff.filter((s) => !!s.bubble_id);

    if (syncable.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No staff with bubble_id found in OTC2",
          environment: "OTC2",
          full_refresh: false,
          stats: { total: 0, created: 0, updated: 0, active: 0, inactive: 0, teams: 0 },
          synced_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Upsert merge: keep existing rows (including manual_*), update/insert OTC2 records only.
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("staff_directory")
      .select("bubble_staff_id");

    if (existingError) {
      throw new Error(`Failed to load existing staff_directory: ${existingError.message}`);
    }

    const existingIds = new Set((existingRows || []).map((r: { bubble_staff_id: string }) => r.bubble_staff_id));
    let created = 0;
    let updated = 0;

    const upsertData = syncable.map((staff) => {
      const bubbleStaffId = staff.bubble_id as string;
      if (existingIds.has(bubbleStaffId)) updated += 1;
      else created += 1;

      const active = isActiveStaff(staff);
      const office = resolveOffice(staff);
      const entryDate = toDateString(staff.entry_date);

      return {
        bubble_staff_id: bubbleStaffId,
        display_name: staff.display_name || staff.full_name || staff.chinese_name || "",
        full_name: staff.full_name || staff.chinese_name || null,
        position: staff.position || null,
        user_role: staff.o_user_role || null,
        status: active ? "active" : "inactive",
        work_email: staff.work_email || staff.linked_user_email || null,
        private_email: staff.private_email || null,
        work_phone: staff.work_phone || staff.direct_phone || staff.login_mobile || null,
        private_phone: staff.private_phone || null,
        base_location: office,
        // Confirmed: overwrite office from OTC2 base location; do not touch department.
        office,
        birthday: staff.birthday || null,
        entry_date: entryDate,
        joining_date: entryDate,
        termination_date: toDateString(staff.termination_date),
        probation_status: staff.o_probation || null,
        al_quota: staff.al_quota != null ? Number(staff.al_quota) : null,
        // Prefer human-readable names for UI filters; fall back to OTC2 reference ids.
        team_id: staff.team_name || staff.n_team || null,
        team_role: staff.team_role_name || staff.n_team_role || null,
        business_unit: staff.bu_name || staff.n_bu || null,
        brands: staff.brands ?? null,
        profile_pic_url: staff.profile_pic || null,
        voov_id: staff.voov_id != null ? String(staff.voov_id) : null,
        bubble_created_date: staff.bubble_created_date || null,
        bubble_modified_date: staff.bubble_modified_date || null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    // Batch upsert (PostgREST payload limit ~1MB; 225 rows is fine in one shot)
    console.log(`[sync-otc2-staff] Upserting ${upsertData.length} records...`);
    const { error: upsertError } = await supabaseAdmin
      .from("staff_directory")
      .upsert(upsertData, {
        onConflict: "bubble_staff_id",
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

    const activeCount = syncable.filter(isActiveStaff).length;
    const inactiveCount = syncable.length - activeCount;
    const teams = new Set(syncable.map((s) => s.team_name || s.n_team).filter(Boolean));

    // Keep system_users profile fields in sync when bubble_staff_id matches.
    const { data: systemUsers } = await supabaseAdmin
      .from("system_users")
      .select("id, bubble_staff_id");

    if (systemUsers && systemUsers.length > 0) {
      const byBubbleId = new Map(syncable.map((s) => [s.bubble_id as string, s]));
      for (const sysUser of systemUsers) {
        const match = byBubbleId.get(sysUser.bubble_staff_id);
        if (!match) continue;
        await supabaseAdmin
          .from("system_users")
          .update({
            display_name: match.display_name || match.full_name || "",
            email: match.work_email || match.linked_user_email || "",
            position: match.position || null,
            profile_pic_url: match.profile_pic || null,
            is_active: isActiveStaff(match),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sysUser.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${syncable.length} staff records from OTC2`,
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
          skipped_no_bubble_id: otc2Staff.length - syncable.length,
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
