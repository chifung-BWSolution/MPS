import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSiteOrigin } from '@/lib/siteUrl';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

interface SystemUserProfile {
  id: string;
  auth_user_id: string | null;
  bubble_staff_id: string;
  display_name: string;
  email: string;
  role: string;
  department: string | null;
  position: string | null;
  phone: string | null;
  profile_pic_url: string | null;
  is_active: boolean | null;
  google_email: string | null;
}

interface UserInfoProfile {
  id: string;
  staff_id: string;
  role_tag: string | null;
  system_status: string;
  classification: string;
  display_name: string | null;
  email: string | null;
  google_email: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: SupabaseUser | null;
  systemUser: SystemUserProfile | null;
  userInfo: UserInfoProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  devBypassLogin: (email: string) => Promise<void>;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Flexible whitelist lookup: case-insensitive check across google_email and email columns
 * in BOTH system_users and user_info tables. Returns the first active match found.
 *
 * Uses parallel .ilike() queries instead of PostgREST `.or()` because the latter mis-parses
 * email values containing "." and "@" — that caused 4s hangs / 400 errors before.
 */
async function findSystemUserByEmail(email: string): Promise<{ data: SystemUserProfile | null; error: any }> {
  const normalizedEmail = email.toLowerCase().trim();
  console.log('[Auth:findSystemUserByEmail] Starting lookup for:', normalizedEmail);

  if (!normalizedEmail) {
    return { data: null, error: new Error('Empty email after normalization') };
  }

  // Master timeout — bumped to 8s because PostgREST cold-start on Vercel can take
  // 4-6s for the first query of the session. Clears itself on success so we don't
  // print a misleading "timeout reached" log after auth has already succeeded.
  const MASTER_TIMEOUT_MS = 8000;
  let masterTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const masterTimeoutPromise = new Promise<{ data: null; error: Error }>((resolve) => {
    masterTimer = setTimeout(() => {
      timedOut = true;
      console.warn(`[Auth:findSystemUserByEmail] ⏰ Master ${MASTER_TIMEOUT_MS}ms timeout reached. Falling back.`);
      resolve({ data: null, error: new Error(`findSystemUserByEmail: Master timeout (${MASTER_TIMEOUT_MS}ms) reached`) });
    }, MASTER_TIMEOUT_MS);
  });

  const lookupInTable = async (table: 'system_users' | 'user_info') => {
    // Run google_email + email lookups in parallel; return whichever hits first.
    const [byGoogle, byEmail] = await Promise.all([
      supabase.from(table).select('*').ilike('google_email', normalizedEmail).limit(1).maybeSingle(),
      supabase.from(table).select('*').ilike('email', normalizedEmail).limit(1).maybeSingle(),
    ]);
    return {
      data: byGoogle.data || byEmail.data || null,
      error: byGoogle.error || byEmail.error || null,
    };
  };

  const lookupLogic = async (): Promise<{ data: SystemUserProfile | null; error: any }> => {
    try {
      // Attempt 1: system_users
      const { data: sysMatch, error: err1 } = await lookupInTable('system_users');
      console.log('[Auth:findSystemUserByEmail] Attempt 1 (system_users):', { found: !!sysMatch, error: err1?.message || null });
      if (sysMatch) return { data: sysMatch as SystemUserProfile, error: null };
      if (timedOut) return { data: null, error: new Error('Timed out') };

      // Attempt 2: user_info
      const { data: uiMatch, error: err2 } = await lookupInTable('user_info');
      console.log('[Auth:findSystemUserByEmail] Attempt 2 (user_info):', { found: !!uiMatch, staff_id: (uiMatch as any)?.staff_id, error: err2?.message || null });

      if (uiMatch?.staff_id) {
        if (timedOut) return { data: null, error: new Error('Timed out') };
        const { data: sysUserFromUI } = await supabase
          .from('system_users')
          .select('*')
          .eq('bubble_staff_id', uiMatch.staff_id)
          .limit(1)
          .maybeSingle();
        if (sysUserFromUI) return { data: sysUserFromUI as SystemUserProfile, error: null };
        return { data: bootstrapSystemUserFromUserInfo(uiMatch, normalizedEmail), error: null };
      }

      if (uiMatch) {
        return { data: bootstrapSystemUserFromUserInfo(uiMatch, normalizedEmail), error: null };
      }

      console.warn('[Auth:findSystemUserByEmail] ❌ All attempts failed for:', normalizedEmail);
      return { data: null, error: err1 || err2 || new Error('Not found in any lookup path') };
    } catch (err) {
      console.warn('[Auth:findSystemUserByEmail] Query error:', err);
      return { data: null, error: err };
    }
  };

  try {
    return await Promise.race([lookupLogic(), masterTimeoutPromise]);
  } finally {
    if (masterTimer) clearTimeout(masterTimer);
  }
}

/**
 * Maps various role strings (Chinese, English, mixed) to standardized internal role values.
 */
function mapRoleToInternal(roleTag: string | null | undefined, classification?: string | null): string {
  if (!roleTag && !classification) return 'staff';
  
  const raw = (roleTag || classification || '').toLowerCase().trim();
  
  // Management / Admin mappings
  if (raw.includes('admin') || raw.includes('管理') || raw === 'super admin' || raw === 'management') {
    return 'management';
  }
  // Project Manager
  if (raw.includes('pm') || raw.includes('project manager') || raw.includes('項目經理')) {
    return 'project_manager';
  }
  // Designer
  if (raw.includes('design') || raw.includes('設計')) {
    return 'designer';
  }
  // Accountant
  if (raw.includes('account') || raw.includes('會計') || raw.includes('finance')) {
    return 'accountant';
  }
  // Copywriter
  if (raw.includes('copy') || raw.includes('文案') || raw.includes('writer')) {
    return 'copywriter';
  }
  // Video Editor
  if (raw.includes('video') || raw.includes('影片') || raw.includes('editor')) {
    return 'video_editor';
  }
  // Marketing
  if (raw.includes('market') || raw.includes('營銷') || raw.includes('推廣')) {
    return 'marketing';
  }
  // System user / staff as default
  if (raw.includes('系統使用者') || raw.includes('system') || raw.includes('staff') || raw.includes('在職')) {
    return 'staff';
  }
  
  return 'staff';
}

/**
 * Maps role to a display role_tag string for the UI
 */
function mapRoleTagDisplay(roleTag: string | null | undefined, classification?: string | null): string {
  const internalRole = mapRoleToInternal(roleTag, classification);
  const roleTagMap: Record<string, string> = {
    'management': 'Administrator',
    'project_manager': 'Project Manager',
    'designer': 'Designer',
    'accountant': 'Accountant',
    'copywriter': 'Copywriter',
    'video_editor': 'Video Editor',
    'marketing': 'Marketing',
    'staff': 'Staff',
  };
  return roleTagMap[internalRole] || 'Staff';
}

/**
 * Bootstrap a SystemUserProfile from a user_info record alone.
 * Used when user_info exists but there's no matching system_users row.
 */
function bootstrapSystemUserFromUserInfo(uiRecord: any, email: string): SystemUserProfile {
  const role = mapRoleToInternal(uiRecord.role_tag, uiRecord.classification);
  console.log('[Auth:bootstrap] Creating SystemUserProfile from user_info:', {
    staff_id: uiRecord.staff_id,
    display_name: uiRecord.display_name,
    role_tag: uiRecord.role_tag,
    classification: uiRecord.classification,
    system_status: uiRecord.system_status,
    mapped_role: role,
  });

  return {
    id: `ui-bootstrap-${uiRecord.id || uiRecord.staff_id}`,
    auth_user_id: null,
    bubble_staff_id: uiRecord.staff_id || `ui_${uiRecord.id}`,
    display_name: uiRecord.display_name || uiRecord.email || email,
    email: uiRecord.email || email,
    role: role,
    department: uiRecord.department || null,
    position: uiRecord.role_tag || uiRecord.classification || null,
    phone: null,
    profile_pic_url: uiRecord.profile_pic_url || null,
    is_active: true, // If they're in user_info, they're authorized
    google_email: uiRecord.google_email || email,
  };
}

const DEV_BYPASS_STORAGE_KEY = 'mps_dev_bypass_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [systemUser, setSystemUser] = useState<SystemUserProfile | null>(() => {
    try {
      const raw = localStorage.getItem(DEV_BYPASS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.systemUser ?? null;
    } catch { return null; }
  });
  const [userInfo, setUserInfo] = useState<UserInfoProfile | null>(() => {
    try {
      const raw = localStorage.getItem(DEV_BYPASS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.userInfo ?? null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const verifyInProgressRef = useRef(false);
  // Track whether we've already successfully authenticated to prevent state clearing
  const authSucceededRef = useRef(typeof window !== 'undefined' && !!localStorage.getItem(DEV_BYPASS_STORAGE_KEY));

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // === 15-Second Timeout Fail-safe ===
    // Increased from 10s to 15s to allow OAuth callback + DB queries to complete
    const startLoadingTimeout = () => {
      if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
      loadingTimeoutId = setTimeout(() => {
        // DON'T reset if auth already succeeded
        if (authSucceededRef.current) {
          console.log('[Auth] ⏰ Loading timeout fired but auth already succeeded. Ignoring.');
          return;
        }
        console.warn('[Auth] ⏰ 15-second loading timeout reached. Forcing loading=false (no retry).');
        verifyInProgressRef.current = false;
        setLoading(false);
      }, 15000);
    };

    startLoadingTimeout();

    // Get initial session (with 8s timeout protection — increased for OAuth callback)
    Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 8000))
    ]).then(({ data: { session }, error }: any) => {
      if (error) {
        console.warn('[Auth] Failed to get session:', error.message);
        setLoading(false);
        if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
        return;
      }
      console.log('[Auth] getSession result:', { hasSession: !!session, email: session?.user?.email });
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        verifyAndFetchUser(session.user.email, session.user.id);
      } else {
        setLoading(false);
        if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
      }
    }).catch((err: any) => {
      console.warn('[Auth] Session fetch error or timeout:', err?.message || err);
      setLoading(false);
      if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
    });

    // Listen for auth changes
    try {
      const { data } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('[Auth] onAuthStateChange:', event, session?.user?.email, '| authSucceeded:', authSucceededRef.current);
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            // Only verify if not already in progress AND not already authenticated
            if (!verifyInProgressRef.current && !authSucceededRef.current) {
              // Reset timeout since we're starting a new verification
              startLoadingTimeout();
              setLoading(true);
              // Small delay to ensure the Supabase client has fully initialized the authenticated state
              // This prevents 401/403 errors on immediate queries after OAuth callback
              if (event === 'SIGNED_IN') {
                await new Promise(resolve => setTimeout(resolve, 300));
              }
              await verifyAndFetchUser(session.user.email, session.user.id);
              // Clear timeout on success
              if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
            }

            // Log the login event (fire and forget)
            if (event === 'SIGNED_IN' && !authSucceededRef.current) {
              logLoginEvent(session.user.email || '', true);
            }
          } else {
            // Session became null — BUT don't clear state if:
            // 1. Verification is in progress (transient state)
            // 2. Auth already succeeded (prevents state wipe from stale events)
            if (!verifyInProgressRef.current && !authSucceededRef.current) {
              setSystemUser(null);
              setUserInfo(null);
              setLoading(false);
              if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
            } else {
              console.log('[Auth] onAuthStateChange: Ignoring null session (verify in progress or auth succeeded)');
            }
          }
        }
      );
      subscription = data.subscription;
    } catch (err) {
      console.warn('[Auth] Failed to set up auth listener:', err);
      setLoading(false);
      if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
    }

    return () => {
      subscription?.unsubscribe();
      if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
    };
  }, []);

  // Persist dev-bypass session (no Supabase session, only local systemUser) to localStorage
  // so F5 / refresh keeps the user logged in.
  useEffect(() => {
    try {
      if (systemUser && !session) {
        localStorage.setItem(DEV_BYPASS_STORAGE_KEY, JSON.stringify({ systemUser, userInfo }));
      }
    } catch {}
  }, [systemUser, userInfo, session]);

  // If we restored a dev-bypass session from localStorage, stop loading immediately.
  useEffect(() => {
    if (systemUser && !session && loading) {
      setLoading(false);
    }
  }, []);

  const verifyAndFetchUser = async (email?: string | null, authUserId?: string) => {
    if (!email) {
      setSystemUser(null);
      setUserInfo(null);
      setAuthError(null);
      setLoading(false);
      return;
    }

    // Prevent concurrent verification calls
    if (verifyInProgressRef.current) {
      console.log('[Auth] verifyAndFetchUser skipped — already in progress');
      return;
    }
    verifyInProgressRef.current = true;

    // Per-function timeout: if this function takes more than 12s, abort gracefully
    // Increased from 6s because OAuth callback can add latency
    const abortController = new AbortController();
    const functionTimeout = setTimeout(() => {
      // DON'T abort if auth already succeeded
      if (authSucceededRef.current) {
        console.log('[Auth] ⏰ Internal timeout fired but auth already succeeded. Ignoring.');
        return;
      }
      console.warn('[Auth] ⏰ verifyAndFetchUser internal 12s timeout. Aborting.');
      abortController.abort();
    }, 12000);

    try {
      // Keep loading=true during the entire verification
      setLoading(true);
      const normalizedEmail = email.toLowerCase().trim();
      console.log('[Auth] verifyAndFetchUser called with email:', normalizedEmail, '| authUserId:', authUserId);

      if (!normalizedEmail) {
        console.warn('[Auth] Empty email after normalization');
        setLoading(false);
        verifyInProgressRef.current = false;
        clearTimeout(functionTimeout);
        return;
      }

      // ====== MASTER BYPASS: Hardcoded super admin for OAuth troubleshooting ======
      const SUPER_ADMIN_EMAIL = 'brandingworks.ebiz@gmail.com';
      if (normalizedEmail === SUPER_ADMIN_EMAIL) {
        console.log('[Auth] 🔑🔑 MASTER BYPASS triggered in verifyAndFetchUser for:', normalizedEmail);
        
        // Try DB lookup first, but don't block on failure
        let foundInDB = false;
        try {
          const { data: sysUser } = await findSystemUserByEmail(normalizedEmail);
          if (sysUser) {
            console.log('[Auth] 🔑 Master bypass: Found in DB:', sysUser.display_name);
            setSystemUser({ ...sysUser, phone: sysUser.phone || null });
            setAuthError(null);
            authSucceededRef.current = true;
            foundInDB = true;

            // Update auth_user_id + last_login_at (fire and forget).
            // Skip when sysUser.id is a synthesized bootstrap/fallback id — those are
            // not valid UUIDs, and PATCHing system_users with them returns 400.
            const isSyntheticId = sysUser.id.startsWith('ui-bootstrap-') || sysUser.id.startsWith('fallback-');
            if (authUserId && !isSyntheticId) {
              supabase.from('system_users')
                .update({ auth_user_id: authUserId, last_login_at: new Date().toISOString() })
                .eq('id', sysUser.id)
                .then(() => console.log('[Auth] Master bypass: Updated auth_user_id'))
                .catch((e) => console.warn('[Auth] Master bypass: Update failed:', e));
            }

            // Enrich phone — fire and forget
            (async () => {
              try {
                let phone: string | null = null;
                if (sysUser.bubble_staff_id) {
                  const { data: staffRow } = await supabase
                    .from('staff_directory')
                    .select('work_phone, private_phone')
                    .eq('bubble_staff_id', sysUser.bubble_staff_id)
                    .maybeSingle();
                  if (staffRow) phone = staffRow.work_phone || staffRow.private_phone || null;
                }
                if (!phone) {
                  const { data: staffByEmail } = await supabase
                    .from('staff_directory')
                    .select('work_phone, private_phone')
                    .ilike('work_email', normalizedEmail)
                    .limit(1)
                    .maybeSingle();
                  if (staffByEmail) phone = staffByEmail.work_phone || staffByEmail.private_phone || null;
                }
                if (phone) {
                  setSystemUser(prev => prev ? { ...prev, phone } : prev);
                }
              } catch {}
            })();

            // Fetch user_info
            try {
              const { data: uInfo } = await supabase
                .from('user_info')
                .select('*')
                .eq('staff_id', sysUser.bubble_staff_id)
                .limit(1)
                .maybeSingle();
              setUserInfo(uInfo || null);
              if (uInfo?.role_tag || uInfo?.classification) {
                const enrichedRole = mapRoleToInternal(uInfo.role_tag, uInfo.classification);
                setSystemUser(prev => prev ? { ...prev, role: enrichedRole } : prev);
              }
            } catch {
              setUserInfo(null);
            }
          }
        } catch (dbErr) {
          console.warn('[Auth] 🔑 Master bypass: DB lookup threw error:', dbErr);
        }

        // If DB lookup failed, use hardcoded fallback
        if (!foundInDB) {
          console.warn('[Auth] 🔑 Master bypass: DB lookup failed. Using HARDCODED fallback for Lowell Lo.');
          const fallbackUser: SystemUserProfile = {
            id: 'fallback-super-admin',
            auth_user_id: authUserId || null,
            bubble_staff_id: 'manual_super_admin_lowell',
            display_name: 'Lowell Lo',
            email: SUPER_ADMIN_EMAIL,
            role: 'management',
            department: 'Management',
            position: 'Super Admin',
            phone: null,
            profile_pic_url: null,
            is_active: true,
            google_email: SUPER_ADMIN_EMAIL,
          };
          setSystemUser(fallbackUser);
          setAuthError(null);
          authSucceededRef.current = true;

          const fallbackUserInfo: UserInfoProfile = {
            id: 'fallback-user-info',
            staff_id: 'manual_super_admin_lowell',
            role_tag: 'Administrator',
            system_status: 'active',
            classification: 'management',
            display_name: 'Lowell Lo',
            email: SUPER_ADMIN_EMAIL,
            google_email: SUPER_ADMIN_EMAIL,
          };
          setUserInfo(fallbackUserInfo);
        }

        logLoginEvent(normalizedEmail, true);
        clearTimeout(functionTimeout);
        verifyInProgressRef.current = false;
        setLoading(false);
        console.log('[Auth] 🔑 Master bypass COMPLETE. authSucceeded:', authSucceededRef.current);
        return;
      }
      // ====== END MASTER BYPASS ======

      // Check if aborted
      if (abortController.signal.aborted) throw new Error('Verification timed out');

      // Step 1: Flexible whitelist lookup (case-insensitive, cross-column)
      const { data: sysUser, error: sysError } = await findSystemUserByEmail(normalizedEmail);
      console.log('[Auth] findSystemUserByEmail result:', { found: !!sysUser, displayName: sysUser?.display_name, role: sysUser?.role, error: sysError?.message || null });

      if (abortController.signal.aborted) throw new Error('Verification timed out');

      if (sysUser) {
        // ✅ AUTHORIZED — set system user immediately
        console.log('[Auth] ✅ Lookup authorized:', sysUser.display_name, sysUser.role);
        // Enrich with phone from staff_directory (if not already present)
        const enrichedUser = { ...sysUser, phone: sysUser.phone || null };
        setSystemUser(enrichedUser);
        setAuthError(null);
        authSucceededRef.current = true; // CRITICAL: Mark auth as succeeded IMMEDIATELY

        // Enrich phone from staff_directory — fire and forget, updates state when ready
        (async () => {
          try {
            let phone: string | null = null;
            // Try by bubble_staff_id first
            if (sysUser.bubble_staff_id) {
              const { data: staffRow } = await supabase
                .from('staff_directory')
                .select('work_phone, private_phone')
                .eq('bubble_staff_id', sysUser.bubble_staff_id)
                .maybeSingle();
              if (staffRow) {
                phone = staffRow.work_phone || staffRow.private_phone || null;
              }
            }
            // Fallback: try by email
            if (!phone && normalizedEmail) {
              const { data: staffByEmail } = await supabase
                .from('staff_directory')
                .select('work_phone, private_phone')
                .ilike('work_email', normalizedEmail)
                .limit(1)
                .maybeSingle();
              if (staffByEmail) {
                phone = staffByEmail.work_phone || staffByEmail.private_phone || null;
              }
            }
            if (phone) {
              console.log('[Auth] 📞 Phone enriched from staff_directory:', phone);
              setSystemUser(prev => prev ? { ...prev, phone } : prev);
            }
          } catch (err) {
            console.warn('[Auth] Phone enrichment failed (non-blocking):', err);
          }
        })();

        // Update auth_user_id and last_login_at — fire and forget.
        // Skip when sysUser.id is a synthesized bootstrap/fallback id (not a valid UUID).
        const isSyntheticId = sysUser.id.startsWith('ui-bootstrap-') || sysUser.id.startsWith('fallback-');
        if (!isSyntheticId) {
          if (!sysUser.auth_user_id && authUserId) {
            supabase
              .from('system_users')
              .update({
                auth_user_id: authUserId,
                last_login_at: new Date().toISOString(),
              })
              .eq('id', sysUser.id)
              .then(() => console.log('[Auth] Updated auth_user_id + last_login_at'))
              .catch((e) => console.warn('[Auth] Non-blocking update failed:', e));
          } else {
            supabase
              .from('system_users')
              .update({ last_login_at: new Date().toISOString() })
              .eq('id', sysUser.id)
              .then(() => {})
              .catch((e) => console.warn('[Auth] Non-blocking update failed:', e));
          }
        }

        // Step 2: Fetch user_info for role_tag (joined via staff_id = bubble_staff_id, NO status filter)
        try {
          const { data: uInfo } = await supabase
            .from('user_info')
            .select('*')
            .eq('staff_id', sysUser.bubble_staff_id)
            .limit(1)
            .maybeSingle();

          if (uInfo) {
            // Ensure role_tag is mapped properly for the UI
            const mappedUInfo = {
              ...uInfo,
              role_tag: uInfo.role_tag || mapRoleTagDisplay(uInfo.role_tag, uInfo.classification),
            };
            setUserInfo(mappedUInfo);

            // Enrich systemUser.role from user_info.role_tag so permissions match staff directory
            if (uInfo.role_tag || uInfo.classification) {
              const enrichedRole = mapRoleToInternal(uInfo.role_tag, uInfo.classification);
              console.log('[Auth] Enriching role from user_info:', uInfo.role_tag, '->', enrichedRole);
              setSystemUser(prev => prev ? { ...prev, role: enrichedRole } : prev);
            }
          } else {
            setUserInfo(null);
          }
        } catch (uiErr) {
          console.warn('[Auth] user_info fetch failed (non-blocking):', uiErr);
          setUserInfo(null);
        }

        logLoginEvent(normalizedEmail, true);
        return;
      }

      // findSystemUserByEmail already checks system_users + user_info comprehensively.
      // No additional fallback queries needed — they were causing 502 by cascading timeouts.

      // All lookups failed — NOT authorized
      const failMsg = `Auth FAILED: All lookup attempts exhausted for email "${normalizedEmail}". No matching record in system_users or user_info tables.`;
      console.error('[Auth] ❌', failMsg);
      setSystemUser(null);
      setUserInfo(null);
      setAuthError(`登入失敗：您的 Google 電郵 ${normalizedEmail} 未在系統使用者白名單中，請聯絡管理員。`);
      // Log the failed attempt
      logLoginEvent(normalizedEmail, false);
      // Sign out — with timeout protection so it doesn't hang
      try {
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timeout')), 3000))
        ]);
      } catch (signOutErr) {
        console.warn('[Auth] signOut timed out or failed:', signOutErr);
      }
      setSession(null);
      setUser(null);
    } catch (err) {
      console.error('[Auth] Failed to verify user:', err);
      // Only set error if it's not a timeout AND auth hasn't already succeeded
      if (authSucceededRef.current) {
        console.log('[Auth] Error occurred but auth already succeeded — ignoring.');
        return;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Auth] Auth Exception in verifyAndFetchUser: ${errMsg} (email: ${email})`);
      if (err instanceof Error && err.message === 'Verification timed out') {
        console.warn('[Auth] Verification timed out — user will see login page.');
        setAuthError(`登入超時：驗證流程逾時，請重新嘗試。(${email})`);
      } else {
        setSystemUser(null);
        setUserInfo(null);
        setAuthError(`登入失敗：系統驗證出錯，請稍後再試。(${email})`);
      }
    } finally {
      clearTimeout(functionTimeout);
      verifyInProgressRef.current = false;
      setLoading(false);
      console.log('[Auth] verifyAndFetchUser complete. loading=false, verifyInProgress=false, authSucceeded:', authSucceededRef.current);
    }
  };

  const logLoginEvent = async (email: string, success: boolean) => {
    try {
      await supabase.from('login_logs').insert({
        email,
        login_method: 'google',
        user_agent: navigator.userAgent,
        success,
      });
    } catch (err) {
      console.error('[Auth] Failed to log login:', err);
    }
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getSiteOrigin(),
      },
    });
  };

  const devBypassLogin = useCallback(async (email: string) => {
    setLoading(true);
    setAuthError(null);
    authSucceededRef.current = false; // Reset before attempting

    const SUPER_ADMIN_EMAIL = 'brandingworks.ebiz@gmail.com';
    const DEV_BYPASS_TIMEOUT = 8000; // 8s hard timeout for the entire devBypassLogin

    // Wrap the entire login in a timeout guard
    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), DEV_BYPASS_TIMEOUT)
    );

    const loginLogic = async (): Promise<'done'> => {
      try {
        // ====== FAILSAFE: Hardcoded super admin bypass ======
        if (email.toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
          console.log('[Auth] 🔑 Super Admin failsafe triggered for:', email);
          
          // Try DB lookup first, but don't block on failure
          let sysUser: SystemUserProfile | null = null;
          try {
            const result = await findSystemUserByEmail(email);
            sysUser = result.data;
            console.log('[Auth] DB lookup result:', { found: !!sysUser, error: result.error?.message });
          } catch (lookupErr) {
            console.warn('[Auth] 🔑 Super admin DB lookup threw:', lookupErr);
          }

          if (sysUser) {
            setSystemUser({ ...sysUser, phone: sysUser.phone || null });
            setAuthError(null);
            authSucceededRef.current = true;

            // Fire and forget — don't await these
            supabase
              .from('system_users')
              .update({ last_login_at: new Date().toISOString() })
              .eq('id', sysUser.id)
              .then(() => {})
              .catch((e) => console.warn('[Auth] Non-blocking update failed:', e));

            // Enrich phone — fire and forget
            (async () => {
              try {
                let phone: string | null = null;
                if (sysUser.bubble_staff_id) {
                  const { data: staffRow } = await supabase
                    .from('staff_directory')
                    .select('work_phone, private_phone')
                    .eq('bubble_staff_id', sysUser.bubble_staff_id)
                    .maybeSingle();
                  if (staffRow) phone = staffRow.work_phone || staffRow.private_phone || null;
                }
                if (!phone) {
                  const { data: staffByEmail } = await supabase
                    .from('staff_directory')
                    .select('work_phone, private_phone')
                    .ilike('work_email', email.toLowerCase().trim())
                    .limit(1)
                    .maybeSingle();
                  if (staffByEmail) phone = staffByEmail.work_phone || staffByEmail.private_phone || null;
                }
                if (phone) {
                  setSystemUser(prev => prev ? { ...prev, phone } : prev);
                }
              } catch {}
            })();

            // Fetch user_info — non-blocking with try-catch
            try {
              const { data: uInfo } = await supabase
                .from('user_info')
                .select('*')
                .eq('staff_id', sysUser.bubble_staff_id)
                .limit(1)
                .maybeSingle();
              setUserInfo(uInfo || null);
              if (uInfo?.role_tag || uInfo?.classification) {
                const enrichedRole = mapRoleToInternal(uInfo.role_tag, uInfo.classification);
                setSystemUser(prev => prev ? { ...prev, role: enrichedRole } : prev);
              }
            } catch {
              setUserInfo(null);
            }
          } else {
            // DB lookup failed — use hardcoded fallback immediately
            console.warn('[Auth] ⚠️ DB lookup failed for super admin, using hardcoded fallback.');
            const fallbackUser: SystemUserProfile = {
              id: 'fallback-super-admin',
              auth_user_id: null,
              bubble_staff_id: 'manual_super_admin_lowell',
              display_name: 'Lowell Lo',
              email: SUPER_ADMIN_EMAIL,
              role: 'management',
              department: 'Management',
              position: 'Super Admin',
              phone: null,
              profile_pic_url: null,
              is_active: true,
              google_email: SUPER_ADMIN_EMAIL,
            };
            setSystemUser(fallbackUser);
            setAuthError(null);
            authSucceededRef.current = true;

            const fallbackUserInfo: UserInfoProfile = {
              id: 'fallback-user-info',
              staff_id: 'manual_super_admin_lowell',
              role_tag: 'Administrator',
              system_status: 'active',
              classification: 'management',
              display_name: 'Lowell Lo',
              email: SUPER_ADMIN_EMAIL,
              google_email: SUPER_ADMIN_EMAIL,
            };
            setUserInfo(fallbackUserInfo);
          }

          // Log — fire and forget
          supabase.from('login_logs').insert({
            email,
            login_method: 'dev_bypass_super_admin',
            user_agent: navigator.userAgent,
            success: true,
          }).then(() => {}).catch(() => {});

          return 'done';
        }

        // ====== Normal dev bypass flow ======
        console.log('[Auth] Dev bypass: querying system_users for email:', email);
        const { data: sysUser, error: sysError } = await findSystemUserByEmail(email);
        
        console.log('[Auth] Dev bypass lookup result:', { found: !!sysUser, error: sysError?.message });

        if (sysError || !sysUser) {
          console.error('[Auth] ❌ Whitelist rejection. Email:', email);
          setSystemUser(null);
          setUserInfo(null);
          setAuthError(`登入失敗：您的電郵 ${email} 未在系統使用者白名單中，請聯絡管理員。`);
          return 'done';
        }

        // Authorized — set system user immediately
        console.log('[Auth] ✅ Dev bypass authorized:', sysUser.display_name, sysUser.role);
        setSystemUser({ ...sysUser, phone: sysUser.phone || null });
        setAuthError(null);
        authSucceededRef.current = true;

        // Enrich phone from staff_directory — fire and forget
        (async () => {
          try {
            let phone: string | null = null;
            if (sysUser.bubble_staff_id) {
              const { data: staffRow } = await supabase
                .from('staff_directory')
                .select('work_phone, private_phone')
                .eq('bubble_staff_id', sysUser.bubble_staff_id)
                .maybeSingle();
              if (staffRow) {
                phone = staffRow.work_phone || staffRow.private_phone || null;
              }
            }
            if (!phone) {
              const { data: staffByEmail } = await supabase
                .from('staff_directory')
                .select('work_phone, private_phone')
                .ilike('work_email', email.toLowerCase().trim())
                .limit(1)
                .maybeSingle();
              if (staffByEmail) {
                phone = staffByEmail.work_phone || staffByEmail.private_phone || null;
              }
            }
            if (phone) {
              console.log('[Auth] 📞 Dev bypass phone enriched:', phone);
              setSystemUser(prev => prev ? { ...prev, phone } : prev);
            }
          } catch (err) {
            console.warn('[Auth] Dev bypass phone enrichment failed:', err);
          }
        })();

        // Update last_login_at — fire and forget (don't await)
        if (!sysUser.id.startsWith('ui-bootstrap-') && !sysUser.id.startsWith('fallback-')) {
          supabase
            .from('system_users')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', sysUser.id)
            .then(() => {})
            .catch((e) => console.warn('[Auth] Non-blocking update failed:', e));
        }

        // Step 2: Fetch user_info for role_tag — with try-catch
        try {
          const { data: uInfo } = await supabase
            .from('user_info')
            .select('*')
            .eq('staff_id', sysUser.bubble_staff_id)
            .limit(1)
            .maybeSingle();

          setUserInfo(uInfo || null);

          // Enrich systemUser.role from user_info.role_tag so permissions match staff directory
          if (uInfo?.role_tag || uInfo?.classification) {
            const enrichedRole = mapRoleToInternal(uInfo.role_tag, uInfo.classification);
            console.log('[Auth] Dev bypass: enriching role from user_info:', uInfo.role_tag, '->', enrichedRole);
            setSystemUser(prev => prev ? { ...prev, role: enrichedRole } : prev);
          }
        } catch (uiErr) {
          console.warn('[Auth] user_info fetch failed (non-blocking):', uiErr);
          setUserInfo(null);
        }

        // Log — fire and forget
        supabase.from('login_logs').insert({
          email,
          login_method: 'dev_bypass',
          user_agent: navigator.userAgent,
          success: true,
        }).then(() => {}).catch(() => {});

        return 'done';
      } catch (err) {
        console.error('[Auth] Dev bypass login failed:', err);
        // If auth already succeeded before the error, don't wipe state
        if (!authSucceededRef.current) {
          setSystemUser(null);
          setUserInfo(null);
          setAuthError('登入失敗：系統驗證出錯，請稍後再試。');
        }
        return 'done';
      }
    };

    // Race login logic against hard timeout
    const result = await Promise.race([loginLogic(), timeoutPromise]);

    if (result === 'timeout') {
      console.error('[Auth] ⏰ devBypassLogin: 8s hard timeout reached.');
      if (!authSucceededRef.current) {
        // Use hardcoded fallback for super admin on timeout
        if (email.toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
          console.warn('[Auth] Timeout fallback: Using hardcoded super admin profile.');
          const fallbackUser: SystemUserProfile = {
            id: 'fallback-super-admin',
            auth_user_id: null,
            bubble_staff_id: 'manual_super_admin_lowell',
            display_name: 'Lowell Lo',
            email: SUPER_ADMIN_EMAIL,
            role: 'management',
            department: 'Management',
            position: 'Super Admin',
            phone: null,
            profile_pic_url: null,
            is_active: true,
            google_email: SUPER_ADMIN_EMAIL,
          };
          setSystemUser(fallbackUser);
          setAuthError(null);
          authSucceededRef.current = true;
        } else {
          setAuthError('登入超時：資料庫無回應，請稍後再試。');
        }
      }
    }

    setLoading(false);
  }, []);

  const signOut = async () => {
    authSucceededRef.current = false; // Reset auth success flag on sign out
    try { localStorage.removeItem(DEV_BYPASS_STORAGE_KEY); } catch {}
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setSystemUser(null);
    setUserInfo(null);
    setAuthError(null);
  };

  const isAuthenticated = !!session?.user || !!systemUser; // Dev bypass sets systemUser without session
  // is_active might be null in some records found via fallback — treat null as active (authorized)
  const isAuthorized = !!systemUser && (systemUser.is_active === true || systemUser.is_active === null);

  return (
    <AuthContext.Provider value={{
      session,
      user,
      systemUser,
      userInfo,
      loading,
      signInWithGoogle,
      signOut,
      devBypassLogin,
      isAuthenticated,
      isAuthorized,
      authError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
