import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUBBLE_API_URL = Deno.env.get('BUBBLE_API_URL') || 'https://chifung.net/api/1.1/obj';
const BUBBLE_API_KEY = Deno.env.get('BUBBLE_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
// Try both possible secret names for the service role key
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY') || '';

interface BubbleStaff {
  _id: string;
  'Display Name': string;
  'Full Name'?: string;
  'Position': string;
  'O_User Role': string;
  'O_Status': string;
  'O_Status_Text': string;
  'Work Email': string;
  'Private Email'?: string;
  'Work Phone'?: number;
  'Private Phone'?: number;
  'O_Base Location'?: string;
  'Birthday'?: string;
  'Entry Date'?: string;
  'Joining Date'?: string;
  'Termination Date'?: string;
  'O_Probation'?: string;
  'AL Quota'?: number;
  'N_BU'?: string;
  'N_Team'?: string;
  'N_Team Role'?: string;
  'Profile Pic'?: string;
  'Voov ID'?: number;
  'New Work Phone'?: string;
  'Created By': string;
  'Created Date': string;
  'Modified Date': string;
}

async function fetchAllBubbleStaff(): Promise<BubbleStaff[]> {
  const allResults: BubbleStaff[] = [];
  let cursor = 0;
  const pageSize = 100;

  console.log('[sync-bubble-staff] Starting fetch from Bubble.io');
  console.log('[sync-bubble-staff] BUBBLE_API_URL:', BUBBLE_API_URL);
  console.log('[sync-bubble-staff] BUBBLE_API_KEY present:', !!BUBBLE_API_KEY, '| length:', BUBBLE_API_KEY.length);

  while (true) {
    const url = `${BUBBLE_API_URL}/Staff?limit=${pageSize}&cursor=${cursor}`;
    console.log(`[sync-bubble-staff] Fetching: ${url} (cursor=${cursor})`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${BUBBLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`[sync-bubble-staff] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sync-bubble-staff] ERROR - Status: ${response.status}, Body: ${errorText}`);
      
      let errorDetail: string;
      if (response.status === 401 || response.status === 403) {
        errorDetail = `Authentication failed (HTTP ${response.status}) — your BUBBLE_API_KEY may be invalid or expired. Response: ${errorText}`;
      } else if (response.status === 404) {
        errorDetail = `Endpoint not found (HTTP 404) — check that BUBBLE_API_URL is correct and the "Staff" data type exists in Bubble.io. Requested URL: ${url}. Response: ${errorText}`;
      } else {
        errorDetail = `Bubble API error (HTTP ${response.status}): ${errorText}`;
      }
      throw new Error(errorDetail);
    }

    const data = await response.json();
    const results = data.response?.results || [];
    const remaining = data.response?.remaining ?? 'unknown';
    console.log(`[sync-bubble-staff] Got ${results.length} results, remaining: ${remaining}`);
    
    allResults.push(...results);

    if (data.response?.remaining === 0 || results.length === 0) break;
    cursor += pageSize;
  }

  console.log(`[sync-bubble-staff] Total staff fetched: ${allResults.length}`);
  return allResults;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    // Diagnostic: check which secrets are available
    console.log('[sync-bubble-staff] === Secret Diagnostics ===');
    console.log('[sync-bubble-staff] BUBBLE_API_KEY present:', !!BUBBLE_API_KEY);
    console.log('[sync-bubble-staff] BUBBLE_API_URL:', BUBBLE_API_URL);
    console.log('[sync-bubble-staff] SUPABASE_URL:', SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : 'MISSING');
    console.log('[sync-bubble-staff] SUPABASE_SERVICE_ROLE_KEY present:', !!SUPABASE_SERVICE_ROLE_KEY);

    const missingSecrets: string[] = [];
    if (!BUBBLE_API_KEY) missingSecrets.push('BUBBLE_API_KEY');
    if (!SUPABASE_URL) missingSecrets.push('SUPABASE_URL');
    if (!SUPABASE_SERVICE_ROLE_KEY) missingSecrets.push('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY');

    if (missingSecrets.length > 0) {
      console.error('[sync-bubble-staff] Missing secrets:', missingSecrets);
      return new Response(
        JSON.stringify({ 
          error: `Missing secrets: ${missingSecrets.join(', ')}. Please configure them in Supabase Dashboard → Edge Functions → Secrets.`,
          missing: missingSecrets,
          hint: 'BUBBLE_API_KEY is your Bubble.io Data API key. SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is your Supabase service role key found in Project Settings → API.',
          diagnostics: {
            bubble_api_url: BUBBLE_API_URL || null,
            supabase_url_set: !!SUPABASE_URL,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Fetch all staff from Bubble.io
    const bubbleStaff = await fetchAllBubbleStaff();

    if (bubbleStaff.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No staff found in Bubble.io',
          stats: { total: 0, created: 0, updated: 0, active: 0, inactive: 0, teams: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Step 2: Full refresh - clear existing data then re-sync from Live
    // This ensures no stale test-mode data remains
    // IMPORTANT: Preserve manually-added records (bubble_staff_id starting with 'manual_')
    console.log('[sync-bubble-staff] Performing FULL REFRESH — clearing existing staffs records (preserving manual entries)...');
    const { error: deleteError, count: deletedCount } = await supabaseAdmin
      .from('staffs')
      .delete({ count: 'exact' })
      .not('bubble_staff_id', 'like', 'manual_%')
      .neq('bubble_staff_id', '');  // Delete all non-manual records

    if (deleteError && deleteError.code !== 'PGRST116') {
      console.error('[sync-bubble-staff] Error clearing existing records:', deleteError);
    } else {
      console.log(`[sync-bubble-staff] Cleared ${deletedCount ?? 0} existing records for fresh sync`);
    }

    // All records will be created fresh
    const existingIds = new Set<string>();

    // Step 3: Upsert all staff records
    let created = 0;
    let updated = 0;

    const upsertData = bubbleStaff.map((staff) => {
      const isExisting = existingIds.has(staff._id);
      if (isExisting) {
        updated++;
      } else {
        created++;
      }

      return {
        bubble_staff_id: staff._id,
        display_name: staff['Display Name'] || '',
        full_name: staff['Full Name'] || null,
        position: staff['Position'] || null,
        user_role: staff['O_User Role'] || null,
        status: (staff['O_Status'] === 'Active' || staff['O_Status_Text'] === 'Active') ? 'active' : 'inactive',
        work_email: staff['Work Email'] || null,
        private_email: staff['Private Email'] || null,
        work_phone: staff['Work Phone']?.toString() || staff['New Work Phone'] || null,
        private_phone: staff['Private Phone']?.toString() || null,
        base_location: staff['O_Base Location'] || null,
        birthday: staff['Birthday'] || null,
        entry_date: staff['Entry Date'] ? new Date(staff['Entry Date']).toISOString().split('T')[0] : null,
        joining_date: staff['Joining Date'] || null,
        termination_date: staff['Termination Date'] || null,
        probation_status: staff['O_Probation'] || null,
        al_quota: staff['AL Quota'] || null,
        team_id: staff['N_Team'] || null,
        team_role: staff['N_Team Role'] || null,
        business_unit: staff['N_BU'] || null,
        profile_pic_url: staff['Profile Pic'] || null,
        voov_id: staff['Voov ID']?.toString() || null,
        bubble_created_date: staff['Created Date'] || null,
        bubble_modified_date: staff['Modified Date'] || null,
        synced_at: new Date().toISOString(),
      };
    });

    // Batch upsert
    console.log(`[sync-bubble-staff] Upserting ${upsertData.length} records to staffs...`);
    const { error: upsertError } = await supabaseAdmin
      .from('staffs')
      .upsert(upsertData, { 
        onConflict: 'bubble_staff_id',
        ignoreDuplicates: false 
      });

    if (upsertError) {
      console.error('[sync-bubble-staff] Upsert error:', upsertError);
      return new Response(
        JSON.stringify({ 
          error: `Database upsert failed: ${upsertError.message}`,
          code: upsertError.code,
          details: upsertError.details,
          hint: upsertError.hint,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    console.log('[sync-bubble-staff] Upsert successful!');

    // Step 4: Calculate stats
    const activeCount = bubbleStaff.filter(
      s => s['O_Status'] === 'Active' || s['O_Status_Text'] === 'Active'
    ).length;
    const inactiveCount = bubbleStaff.length - activeCount;
    const teams = new Set(bubbleStaff.map(s => s['N_Team']).filter(Boolean));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${bubbleStaff.length} staff records from Bubble.io LIVE environment`,
        environment: 'LIVE',
        api_url: BUBBLE_API_URL,
        full_refresh: true,
        stats: {
          total: bubbleStaff.length,
          created,
          updated,
          active: activeCount,
          inactive: inactiveCount,
          teams: teams.size,
        },
        synced_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[sync-bubble-staff] FATAL ERROR:', error.message);
    console.error('[sync-bubble-staff] Stack:', error.stack);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
