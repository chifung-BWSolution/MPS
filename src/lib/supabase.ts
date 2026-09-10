import { createClient } from '@supabase/supabase-js';
import { installCachedAuthSession } from '@/lib/authSessionCache';
import { supabaseBoundedFetch } from '@/lib/supabaseFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Default navigator.locks keeps refresh-token rotation safe across tabs.
    // REST calls must not wait on that lock — installCachedAuthSession()
    // serves getSession() from memory when the JWT is still fresh.
  },
  global: {
    fetch: supabaseBoundedFetch,
  },
});

installCachedAuthSession(supabase, supabaseUrl);
