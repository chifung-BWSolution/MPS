import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getSiteOrigin } from '@/lib/siteUrl';
import { isStaffUuid, remapStaleStaffUuid, resolveStaffUuid } from '@/services/reportLinkService';
import {
  fetchUsersByAuthUserId,
  fetchUsersCandidatesByEmail,
  pickPreferredWhitelistRow,
  resolveUsersRowForAuthUid,
  scoreWhitelistCandidate,
  type UsersWhitelistRow,
} from '@/services/authStaffResolve';
import { isUsersUuid } from '@/lib/loginLogs';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

interface SystemUserProfile {
  id: string;
  auth_user_id: string | null;
  staff_id: string;
  display_name: string;
  email: string;
  role: string;
  department: string | null;
  office: string | null;
  position: string | null;
  phone: string | null;
  profile_pic_url: string | null;
  is_active: boolean | null;
}

interface UserInfoProfile {
  id: string;
  staff_id: string;
  auth_user_id: string | null;
  role_tag: string | null;
  email: string | null;
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

type StaffDirectoryLite = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  status: string | null;
  position: string | null;
  work_email: string | null;
  work_phone: string | null;
  private_phone: string | null;
  profile_pic_url: string | null;
  team_name: string | null;
  base_location: string | null;
};

const STAFFS_LITE_SELECT =
  'id, display_name, full_name, status, position, work_email, work_phone, private_phone, profile_pic_url, team_name, base_location';

// Canonical Bubble staffs.id — not the leftover "Lowell Lo (manual)" placeholder.
const MANUAL_SUPER_ADMIN_STAFF_UUID = '04102dd8-8d0f-4536-82cd-904cc0769227';
const MANUAL_SUPER_ADMIN_BUBBLE_STAFF_ID = '1735542321255x135509613378273280';
const MANUAL_DEV_BYPASS_LEO_STAFF_UUID = '6ddee578-cfe2-4e27-b758-affb02fa02ae';

type HardcodedBypassProfile = {
  staff_id: string;
  bubble_staff_id: string;
  display_name: string;
  role: string;
  role_tag: string;
  classification: string;
  position: string;
  department: string;
  login_method: 'dev_bypass_super_admin' | 'dev_bypass_developer';
};

/** Hardcoded Developer Bypass Login allowlist. Works even if DB lookup times out. */
const HARDCODED_BYPASS_USERS: Record<string, HardcodedBypassProfile> = {
  'brandingworks.ebiz@gmail.com': {
    staff_id: MANUAL_SUPER_ADMIN_STAFF_UUID,
    bubble_staff_id: MANUAL_SUPER_ADMIN_BUBBLE_STAFF_ID,
    display_name: 'Lowell Lo',
    role: 'management',
    role_tag: 'Administrator',
    classification: 'management',
    position: 'Super Admin',
    department: 'Management',
    login_method: 'dev_bypass_super_admin',
  },
  'brandingworks.online@gmail.com': {
    staff_id: MANUAL_DEV_BYPASS_LEO_STAFF_UUID,
    bubble_staff_id: '1730356521386x105918728272347140',
    display_name: 'Leo Tse',
    role: 'system_dev',
    role_tag: 'system_dev',
    classification: 'system_user',
    position: 'IT System Officer / 技術系統主任',
    department: 'System',
    login_method: 'dev_bypass_developer',
  },
};

function lookupHardcodedBypass(email: string): { email: string; profile: HardcodedBypassProfile } | null {
  const normalized = email.toLowerCase().trim();
  const profile = HARDCODED_BYPASS_USERS[normalized];
  return profile ? { email: normalized, profile } : null;
}

function fallbackFromHardcoded(
  email: string,
  profile: HardcodedBypassProfile,
  authUserId: string | null = null
): { systemUser: SystemUserProfile; userInfo: UserInfoProfile } {
  return {
    systemUser: {
      id: `fallback-${profile.staff_id}`,
      auth_user_id: authUserId,
      staff_id: profile.staff_id,
      display_name: profile.display_name,
      email,
      role: profile.role,
      department: profile.department,
      office: null,
      position: profile.position,
      phone: null,
      profile_pic_url: null,
      is_active: true,
    },
    userInfo: {
      id: `fallback-user-info-${profile.staff_id}`,
      staff_id: profile.staff_id,
      auth_user_id: authUserId,
      role_tag: profile.role_tag,
      email,
    },
  };
}

function staffPhone(staff?: { work_phone?: string | null; private_phone?: string | null } | null): string | null {
  return staff?.work_phone || staff?.private_phone || null;
}

async function fetchStaffLiteById(staffId: string | null | undefined): Promise<StaffDirectoryLite | null> {
  if (!staffId) return null;
  const { data } = await supabase
    .from('staffs')
    .select(STAFFS_LITE_SELECT)
    .eq('id', staffId)
    .maybeSingle();
  return (data as StaffDirectoryLite | null) || null;
}

function applyStaffEnrichment(
  prev: SystemUserProfile,
  staff: StaffDirectoryLite | null
): SystemUserProfile {
  if (!staff) return prev;
  return {
    ...prev,
    display_name: staff.display_name || staff.full_name || prev.display_name,
    department: staff.team_name || prev.department,
    office: staff.base_location || prev.office,
    position: staff.position || prev.position,
    phone: staffPhone(staff) || prev.phone,
    profile_pic_url: staff.profile_pic_url || prev.profile_pic_url,
  };
}

function isStaffActive(status: string | null | undefined): boolean {
  return (status || '').toLowerCase() === 'active';
}

async function loadStaffStatusMap(staffIds: string[]): Promise<Map<string, StaffDirectoryLite>> {
  const map = new Map<string, StaffDirectoryLite>();
  const uniqueIds = [...new Set(staffIds.filter(Boolean))];
  if (uniqueIds.length === 0) return map;

  const { data } = await supabase
    .from('staffs')
    .select(STAFFS_LITE_SELECT)
    .in('id', uniqueIds);

  for (const row of (data || []) as StaffDirectoryLite[]) {
    if (row?.id) map.set(row.id, row);
  }
  return map;
}

async function profileFromUsersRow(
  row: UsersWhitelistRow,
  email: string,
): Promise<SystemUserProfile> {
  const staffMap = await loadStaffStatusMap([row.staff_id].filter(Boolean));
  const staff = staffMap.get(row.staff_id) || null;
  return bootstrapSystemUserFromUserInfo(row, email, staff);
}

/**
 * Resolve the whitelist row for a session.
 * OAuth: users.auth_user_id = auth.users.id (RPC links once if unlinked).
 * Dev bypass (no Auth UID): email match only — does not write auth_user_id.
 */
async function findSystemUser(opts: {
  email: string;
  authUserId?: string | null;
}): Promise<{ data: SystemUserProfile | null; error: any }> {
  const normalizedEmail = (opts.email || '').toLowerCase().trim();
  const authUserId = (opts.authUserId || '').trim() || null;
  console.log('[Auth:findSystemUser] Starting lookup', {
    email: normalizedEmail || null,
    authUserId,
  });

  if (!normalizedEmail && !authUserId) {
    return { data: null, error: new Error('Empty email and auth_user_id') };
  }

  const MASTER_TIMEOUT_MS = 8000;
  let masterTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const masterTimeoutPromise = new Promise<{ data: null; error: Error }>((resolve) => {
    masterTimer = setTimeout(() => {
      timedOut = true;
      console.warn(`[Auth:findSystemUser] ⏰ Master ${MASTER_TIMEOUT_MS}ms timeout reached. Falling back.`);
      resolve({ data: null, error: new Error(`findSystemUser: Master timeout (${MASTER_TIMEOUT_MS}ms) reached`) });
    }, MASTER_TIMEOUT_MS);
  });

  const lookupLogic = async (): Promise<{ data: SystemUserProfile | null; error: any }> => {
    try {
      if (authUserId) {
        const byId = await fetchUsersByAuthUserId(authUserId);
        if (timedOut) return { data: null, error: new Error('Timed out') };
        if (byId.data) {
          console.log('[Auth:findSystemUser] ✅ users.auth_user_id', {
            staff_id: byId.data.staff_id,
          });
          return { data: await profileFromUsersRow(byId.data, normalizedEmail), error: null };
        }

        const linked = await resolveUsersRowForAuthUid();
        if (timedOut) return { data: null, error: new Error('Timed out') };
        if (linked.data) {
          console.log('[Auth:findSystemUser] ✅ resolve_users_for_auth', {
            staff_id: linked.data.staff_id,
            auth_user_id: linked.data.auth_user_id,
          });
          return { data: await profileFromUsersRow(linked.data, normalizedEmail), error: null };
        }
        if (linked.error) {
          console.warn('[Auth:findSystemUser] resolve_users_for_auth error:', linked.error);
        }
      }

      if (!normalizedEmail) {
        return { data: null, error: new Error('Not found in users whitelist') };
      }

      const { data: userMatches, error: usersErr } = await fetchUsersCandidatesByEmail(normalizedEmail);
      console.log('[Auth:findSystemUser] email fallback matches:', {
        count: userMatches.length,
        staff_ids: userMatches.map((r) => r.staff_id),
        error: (usersErr as { message?: string } | null)?.message || null,
      });

      if (timedOut) return { data: null, error: new Error('Timed out') };

      const staffIds = userMatches.map((r) => r.staff_id).filter(Boolean);
      const staffMap = await loadStaffStatusMap(staffIds);
      const picked = pickPreferredWhitelistRow(userMatches, (row) => {
        const staff = staffMap.get(row.staff_id) || null;
        return scoreWhitelistCandidate({
          staffActive: isStaffActive(staff?.status),
          emailMatch: (row.email || '').toLowerCase().trim() === normalizedEmail,
        });
      });

      if (picked) {
        const staff = staffMap.get(picked.staff_id) || null;
        console.log('[Auth:findSystemUser] ✅ email fallback picked:', {
          staff_id: picked.staff_id,
          staff_status: staff?.status || null,
        });
        return {
          data: bootstrapSystemUserFromUserInfo(picked, normalizedEmail, staff),
          error: null,
        };
      }

      console.warn('[Auth:findSystemUser] ❌ No users match for:', authUserId || normalizedEmail);
      return { data: null, error: usersErr || new Error('Not found in users whitelist') };
    } catch (err) {
      console.warn('[Auth:findSystemUser] Query error:', err);
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

  // System developer (must run before the generic "system" / "admin" checks)
  if (raw === 'system_dev' || raw.includes('系統開發')) {
    return 'system_dev';
  }
  
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
    'system_dev': '系統開發',
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
 * Bootstrap a SystemUserProfile from a users row + optional staffs enrichment.
 */
function bootstrapSystemUserFromUserInfo(
  uiRecord: any,
  email: string,
  staff?: StaffDirectoryLite | null
): SystemUserProfile {
  const role = mapRoleToInternal(uiRecord.role_tag);
  const displayName =
    staff?.display_name || staff?.full_name || uiRecord.email || email;
  console.log('[Auth:bootstrap] Creating SystemUserProfile from users:', {
    staff_id: uiRecord.staff_id,
    display_name: displayName,
    role_tag: uiRecord.role_tag,
    staff_status: staff?.status || null,
    mapped_role: role,
  });

  return {
    id: uiRecord.id || `ui-bootstrap-${uiRecord.staff_id}`,
    auth_user_id: uiRecord.auth_user_id || null,
    staff_id: uiRecord.staff_id,
    display_name: displayName,
    email: uiRecord.email || email,
    role: role,
    department: staff?.team_name || null,
    office: staff?.base_location || null,
    position: staff?.position || uiRecord.role_tag || null,
    phone: staffPhone(staff),
    profile_pic_url: staff?.profile_pic_url || null,
    is_active: true, // If they're in users, they're authorized
  };
}

const DEV_BYPASS_STORAGE_KEY = 'mps_dev_bypass_session';

function remapStaffIdFromLegacySession(raw: any): string {
  const staffIdRaw = typeof raw?.staff_id === 'string' ? raw.staff_id.trim() : '';
  if (isStaffUuid(staffIdRaw)) return remapStaleStaffUuid(staffIdRaw);

  // Old session JSON may still carry Bubble ids. Remap hardcoded bypass users only;
  // bubble-id restore is not the primary path.
  const bubbleRaw = typeof raw?.bubble_staff_id === 'string' ? raw.bubble_staff_id.trim() : '';
  const legacyBubble = bubbleRaw || (!isStaffUuid(staffIdRaw) ? staffIdRaw : '');
  if (legacyBubble === 'manual_super_admin_lowell' || legacyBubble === MANUAL_SUPER_ADMIN_BUBBLE_STAFF_ID) {
    return MANUAL_SUPER_ADMIN_STAFF_UUID;
  }
  const hardcoded = Object.values(HARDCODED_BYPASS_USERS).find(
    (p) => p.bubble_staff_id === legacyBubble
  );
  return hardcoded?.staff_id || '';
}

function normalizeRestoredSystemUser(raw: any): SystemUserProfile | null {
  if (!raw || typeof raw !== 'object') return null;

  const staff_id = remapStaffIdFromLegacySession(raw);
  if (!staff_id) return null;

  return {
    id: raw.id || `ui-bootstrap-${staff_id}`,
    auth_user_id: raw.auth_user_id ?? null,
    staff_id,
    display_name: raw.display_name || raw.email || 'User',
    email: raw.email || raw.google_email || '',
    role: raw.role || 'staff',
    department: raw.department ?? null,
    office: raw.office ?? null,
    position: raw.position ?? null,
    phone: raw.phone ?? null,
    profile_pic_url: raw.profile_pic_url ?? null,
    is_active: raw.is_active ?? true,
  };
}

function normalizeRestoredUserInfo(raw: any, staffUuid: string): UserInfoProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id || 'fallback-user-info',
    staff_id: isStaffUuid(raw.staff_id) ? remapStaleStaffUuid(raw.staff_id) : staffUuid,
    auth_user_id: raw.auth_user_id ?? null,
    role_tag: raw.role_tag ?? null,
    email: raw.email ?? raw.google_email ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [systemUser, setSystemUser] = useState<SystemUserProfile | null>(() => {
    try {
      const raw = localStorage.getItem(DEV_BYPASS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return normalizeRestoredSystemUser(parsed.systemUser);
    } catch { return null; }
  });
  const [userInfo, setUserInfo] = useState<UserInfoProfile | null>(() => {
    try {
      const raw = localStorage.getItem(DEV_BYPASS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const normalized = normalizeRestoredSystemUser(parsed.systemUser);
      return normalizeRestoredUserInfo(parsed.userInfo, normalized?.staff_id || '');
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const verifyInProgressRef = useRef(false);
  // Track whether we've already successfully authenticated to prevent state clearing
  const authSucceededRef = useRef(typeof window !== 'undefined' && !!localStorage.getItem(DEV_BYPASS_STORAGE_KEY));
  const staffUuidMigrateRef = useRef(false);

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
              void logLoginEvent(session.user.email || '', true);
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

  // Heal stale sessions: leftover manual UUID, or a session staff_id that
  // no longer matches users.auth_user_id.
  useEffect(() => {
    if (!systemUser || staffUuidMigrateRef.current) return;
    staffUuidMigrateRef.current = true;

    let cancelled = false;
    (async () => {
      const uuid = await resolveStaffUuid({
        staff_id: systemUser.staff_id,
        auth_user_id: systemUser.auth_user_id,
      });
      if (cancelled || !uuid || uuid === systemUser.staff_id) return;
      setSystemUser(prev => (prev ? { ...prev, staff_id: uuid } : prev));
      setUserInfo(prev => (prev ? { ...prev, staff_id: uuid } : prev));
    })();

    return () => { cancelled = true; };
  }, [systemUser]);

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

      // ====== MASTER BYPASS: Hardcoded developer/super-admin for OAuth troubleshooting ======
      const oauthBypass = lookupHardcodedBypass(normalizedEmail);
      if (oauthBypass) {
        console.log('[Auth] 🔑🔑 MASTER BYPASS triggered in verifyAndFetchUser for:', normalizedEmail);
        
        // Try DB lookup first, but don't block on failure
        let foundInDB = false;
        try {
          const { data: sysUser } = await findSystemUser({
            email: normalizedEmail,
            authUserId: authUserId || null,
          });
          if (sysUser) {
            console.log('[Auth] 🔑 Master bypass: Found in DB:', sysUser.display_name);
            setSystemUser({ ...sysUser, phone: sysUser.phone || null });
            setAuthError(null);
            authSucceededRef.current = true;
            foundInDB = true;


            // Enrich phone / profile pic from staffs.id — fire and forget
            (async () => {
              try {
                const staff = await fetchStaffLiteById(sysUser.staff_id);
                if (staff) setSystemUser(prev => prev ? applyStaffEnrichment(prev, staff) : prev);
              } catch {}
            })();

            // Fetch users row
            try {
              const { data: uInfo } = await supabase
                .from('users')
                .select('*')
                .eq('staff_id', sysUser.staff_id)
                .limit(1)
                .maybeSingle();
              setUserInfo(uInfo ? {
                id: uInfo.id,
                staff_id: uInfo.staff_id,
                auth_user_id: uInfo.auth_user_id ?? null,
                role_tag: uInfo.role_tag ?? null,
                email: uInfo.email ?? null,
              } : null);
              if (uInfo?.role_tag) {
                const enrichedRole = mapRoleToInternal(uInfo.role_tag);
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
          console.warn('[Auth] 🔑 Master bypass: DB lookup failed. Using HARDCODED fallback for', oauthBypass.profile.display_name);
          const fallback = fallbackFromHardcoded(oauthBypass.email, oauthBypass.profile, authUserId || null);
          setSystemUser(fallback.systemUser);
          setUserInfo(fallback.userInfo);
          setAuthError(null);
          authSucceededRef.current = true;
        }

        void logLoginEvent(normalizedEmail, true);
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
      const { data: sysUser, error: sysError } = await findSystemUser({
        email: normalizedEmail,
        authUserId: authUserId || null,
      });
      console.log('[Auth] findSystemUser result:', { found: !!sysUser, displayName: sysUser?.display_name, role: sysUser?.role, auth_user_id: sysUser?.auth_user_id, error: sysError?.message || null });

      if (abortController.signal.aborted) throw new Error('Verification timed out');

      if (sysUser) {
        // ✅ AUTHORIZED — set system user immediately
        console.log('[Auth] ✅ Lookup authorized:', sysUser.display_name, sysUser.role);
        // Enrich with phone from staffs (if not already present)
        const enrichedUser = { ...sysUser, phone: sysUser.phone || null };
        setSystemUser(enrichedUser);
        setAuthError(null);
        authSucceededRef.current = true; // CRITICAL: Mark auth as succeeded IMMEDIATELY

        // Enrich phone / profile pic from staffs.id — fire and forget
        (async () => {
          try {
            const staff = await fetchStaffLiteById(sysUser.staff_id);
            if (staff) {
              console.log('[Auth] 📞 Phone enriched from staffs:', staffPhone(staff));
              setSystemUser(prev => prev ? applyStaffEnrichment(prev, staff) : prev);
            }
          } catch (err) {
            console.warn('[Auth] Phone enrichment failed (non-blocking):', err);
          }
        })();

        // Step 2: Fetch users row for role_tag (joined via users.staff_id → staffs.id, NO status filter)
        try {
          const { data: uInfo } = await supabase
            .from('users')
            .select('*')
            .eq('staff_id', sysUser.staff_id)
            .limit(1)
            .maybeSingle();

          if (uInfo) {
            const mappedUInfo: UserInfoProfile = {
              id: uInfo.id,
              staff_id: uInfo.staff_id,
              auth_user_id: uInfo.auth_user_id ?? null,
              role_tag: uInfo.role_tag || mapRoleTagDisplay(uInfo.role_tag),
              email: uInfo.email ?? null,
            };
            setUserInfo(mappedUInfo);

            if (uInfo.role_tag) {
              const enrichedRole = mapRoleToInternal(uInfo.role_tag);
              console.log('[Auth] Enriching role from users:', uInfo.role_tag, '->', enrichedRole);
              setSystemUser(prev => prev ? { ...prev, role: enrichedRole } : prev);
            }
          } else {
            setUserInfo(null);
          }
        } catch (uiErr) {
          console.warn('[Auth] users fetch failed (non-blocking):', uiErr);
          setUserInfo(null);
        }

        void logLoginEvent(normalizedEmail, true, 'google', sysUser.id);
        return;
      }

      // findSystemUser already checks users.auth_user_id + staffs.
      // No additional fallback queries needed — they were causing 502 by cascading timeouts.

      // All lookups failed — NOT authorized
      const failMsg = `Auth FAILED: No public.users row for auth_user_id "${authUserId || ''}" / email "${normalizedEmail}".`;
      console.error('[Auth] ❌', failMsg);
      setSystemUser(null);
      setUserInfo(null);
      setAuthError(`登入失敗：您的 Google 電郵 ${normalizedEmail} 未在系統使用者白名單中，請聯絡管理員。`);
      // Log the failed attempt
      void logLoginEvent(normalizedEmail, false);
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

  const logLoginEvent = async (
    email: string,
    success: boolean,
    loginMethod = 'google',
    userId?: string | null,
  ) => {
    try {
      let resolvedUserId = isUsersUuid(userId) ? userId : null;
      if (!resolvedUserId && email) {
        try {
          const { data: matches } = await fetchUsersCandidatesByEmail(email);
          const picked = pickPreferredWhitelistRow(matches, (row) => {
            const normalized = email.toLowerCase().trim();
            return scoreWhitelistCandidate({
              staffActive: true,
              emailMatch: (row.email || '').toLowerCase().trim() === normalized,
            });
          });
          if (isUsersUuid(picked?.id)) resolvedUserId = picked.id;
        } catch (lookupErr) {
          console.warn('[Auth] login_logs user_id lookup failed:', lookupErr);
        }
      }

      const { error } = await supabase.from('login_logs').insert({
        email,
        login_method: loginMethod,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        success,
        user_id: resolvedUserId,
      });
      if (error) {
        console.error('[Auth] Failed to log login:', error.message);
      }
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

    const hardcodedBypass = lookupHardcodedBypass(email);
    const DEV_BYPASS_TIMEOUT = 8000; // 8s hard timeout for the entire devBypassLogin

    // Wrap the entire login in a timeout guard
    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), DEV_BYPASS_TIMEOUT)
    );

    const loginLogic = async (): Promise<'done'> => {
      try {
        // ====== FAILSAFE: Hardcoded developer / super-admin bypass ======
        if (hardcodedBypass) {
          console.log('[Auth] 🔑 Hardcoded bypass failsafe triggered for:', hardcodedBypass.email);
          
          // Try DB lookup first, but don't block on failure
          let sysUser: SystemUserProfile | null = null;
          try {
            const result = await findSystemUser({ email });
            sysUser = result.data;
            console.log('[Auth] DB lookup result:', { found: !!sysUser, error: result.error?.message });
          } catch (lookupErr) {
            console.warn('[Auth] 🔑 Hardcoded bypass DB lookup threw:', lookupErr);
          }

          if (sysUser) {
            setSystemUser({ ...sysUser, phone: sysUser.phone || null });
            setAuthError(null);
            authSucceededRef.current = true;

            // Enrich phone / profile pic from staffs.id — fire and forget
            (async () => {
              try {
                const staff = await fetchStaffLiteById(sysUser.staff_id);
                if (staff) setSystemUser(prev => prev ? applyStaffEnrichment(prev, staff) : prev);
              } catch {}
            })();

            // Fetch users row — non-blocking with try-catch
            try {
              const { data: uInfo } = await supabase
                .from('users')
                .select('*')
                .eq('staff_id', sysUser.staff_id)
                .limit(1)
                .maybeSingle();
              setUserInfo(uInfo ? {
                id: uInfo.id,
                staff_id: uInfo.staff_id,
                auth_user_id: uInfo.auth_user_id ?? null,
                role_tag: uInfo.role_tag ?? null,
                email: uInfo.email ?? null,
              } : null);
              if (uInfo?.role_tag) {
                const enrichedRole = mapRoleToInternal(uInfo.role_tag);
                setSystemUser(prev => prev ? { ...prev, role: enrichedRole } : prev);
              }
            } catch {
              setUserInfo(null);
            }
          } else {
            // DB lookup failed — use hardcoded fallback immediately
            console.warn('[Auth] ⚠️ DB lookup failed for hardcoded bypass, using fallback for', hardcodedBypass.profile.display_name);
            const fallback = fallbackFromHardcoded(hardcodedBypass.email, hardcodedBypass.profile);
            setSystemUser(fallback.systemUser);
            setUserInfo(fallback.userInfo);
            setAuthError(null);
            authSucceededRef.current = true;
          }

          void logLoginEvent(email, true, hardcodedBypass.profile.login_method, sysUser?.id);

          return 'done';
        }

        // ====== Normal dev bypass flow ======
        console.log('[Auth] Dev bypass: querying users for email:', email);
        const { data: sysUser, error: sysError } = await findSystemUser({ email });
        
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

        // Enrich phone / profile pic from staffs.id — fire and forget
        (async () => {
          try {
            const staff = await fetchStaffLiteById(sysUser.staff_id);
            if (staff) {
              console.log('[Auth] 📞 Dev bypass phone enriched:', staffPhone(staff));
              setSystemUser(prev => prev ? applyStaffEnrichment(prev, staff) : prev);
            }
          } catch (err) {
            console.warn('[Auth] Dev bypass phone enrichment failed:', err);
          }
        })();

        // Step 2: Fetch users row for role_tag — with try-catch
        try {
          const { data: uInfo } = await supabase
            .from('users')
            .select('*')
            .eq('staff_id', sysUser.staff_id)
            .limit(1)
            .maybeSingle();

          setUserInfo(uInfo ? {
            id: uInfo.id,
            staff_id: uInfo.staff_id,
            auth_user_id: uInfo.auth_user_id ?? null,
            role_tag: uInfo.role_tag ?? null,
            email: uInfo.email ?? null,
          } : null);

          if (uInfo?.role_tag) {
            const enrichedRole = mapRoleToInternal(uInfo.role_tag);
            console.log('[Auth] Dev bypass: enriching role from users:', uInfo.role_tag, '->', enrichedRole);
            setSystemUser(prev => prev ? { ...prev, role: enrichedRole } : prev);
          }
        } catch (uiErr) {
          console.warn('[Auth] users fetch failed (non-blocking):', uiErr);
          setUserInfo(null);
        }

        void logLoginEvent(email, true, 'dev_bypass', sysUser.id);

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
        // Use hardcoded fallback for developer / super-admin on timeout
        if (hardcodedBypass) {
          console.warn('[Auth] Timeout fallback: Using hardcoded profile for', hardcodedBypass.profile.display_name);
          const fallback = fallbackFromHardcoded(hardcodedBypass.email, hardcodedBypass.profile);
          setSystemUser(fallback.systemUser);
          setUserInfo(fallback.userInfo);
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
