import { supabase } from '@/lib/supabase';

export type ProvisionStaffAuthMode = 'provision' | 'disable';

export type ProvisionStaffAuthResult = {
  staff_id: string;
  email: string | null;
  auth_user_id: string | null;
  action: 'created' | 'updated' | 'disabled' | 'skipped';
  reason?: string;
};

async function readInvokeError(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
  if (!context || typeof context.json !== 'function') return fallback;
  try {
    const body = await context.json();
    if (body && typeof body === 'object') {
      const record = body as { error?: unknown; message?: unknown };
      if (typeof record.error === 'string' && record.error) return record.error;
      if (typeof record.message === 'string' && record.message) return record.message;
    }
  } catch {
    // Response body was not JSON.
  }
  return fallback;
}

export async function invokeProvisionStaffAuth(input: {
  mode: ProvisionStaffAuthMode;
  staffId?: string;
  usersId?: string;
  authUserId?: string;
}): Promise<ProvisionStaffAuthResult | null> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    result?: ProvisionStaffAuthResult;
    error?: string;
  }>('provision-staff-auth', {
    body: {
      mode: input.mode,
      staff_id: input.staffId,
      users_id: input.usersId,
      auth_user_id: input.authUserId,
    },
  });

  if (error) {
    const message = await readInvokeError(error);
    console.warn('[provision-staff-auth] invoke failed:', message);
    throw new Error(message);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data?.result ?? null;
}
