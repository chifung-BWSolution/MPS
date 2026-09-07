import { supabase } from '@/lib/supabase';

export type ProvisionStaffAuthMode = 'provision' | 'disable';

export type ProvisionStaffAuthResult = {
  staff_id: string;
  email: string | null;
  auth_user_id: string | null;
  action: 'created' | 'updated' | 'disabled' | 'skipped';
  reason?: string;
};

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
    console.warn('[provision-staff-auth] invoke failed:', error.message);
    throw new Error(error.message);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data?.result ?? null;
}
