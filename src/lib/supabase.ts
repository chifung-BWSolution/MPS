import { createClient } from '@supabase/supabase-js';

/** MPS Supabase project — Marketing Project System */
const MPS_HOST = 'kwcevjcmdjadhrygjyfp.supabase.co';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.');
} else if (!supabaseUrl.includes(MPS_HOST)) {
  console.warn(
    `[Supabase] VITE_SUPABASE_URL is not the MPS project (${MPS_HOST}). ` +
      `Got: ${supabaseUrl}. Set MPS_URL + MPS_ANON (Cloud Agent) or VITE_SUPABASE_* to MPS.`,
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (...args) => fetch(...args).catch((err) => {
      console.warn('[Supabase] Network error:', err.message);
      throw err;
    }),
  },
});
