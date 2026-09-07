import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhonePassword } from "./phonePassword.ts";

export type ProvisionResult = {
  staff_id: string;
  email: string | null;
  auth_user_id: string | null;
  action: "created" | "updated" | "disabled" | "skipped";
  reason?: string;
};

type UsersRow = {
  id: string;
  staff_id: string;
  email: string | null;
  auth_user_id: string | null;
};

type StaffRow = {
  id: string;
  private_phone: string | null;
};

function normalizeEmail(email: string | null | undefined): string {
  return (email || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .toLowerCase()
    .trim();
}

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    const match = users.find((u) => (u.email || "").toLowerCase() === email);
    if (match?.id) return match.id;
    if (users.length < 200) break;
  }
  return null;
}

async function upsertAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
  existingAuthUserId: string | null,
): Promise<string> {
  if (existingAuthUserId) {
    const { error } = await admin.auth.admin.updateUserById(existingAuthUserId, {
      email,
      password,
      email_confirm: true,
      ban_duration: "none",
    });
    if (!error) return existingAuthUserId;
    console.warn("[provision-staff-auth] update existing auth user failed:", error.message);
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.data?.user?.id) return created.data.user.id;

  const alreadyExists = /already been registered|already exists/i.test(created.error?.message || "");
  if (!alreadyExists) {
    throw new Error(created.error?.message || "Failed to create Auth user");
  }

  const existingId = await findAuthUserIdByEmail(admin, email);
  if (!existingId) throw new Error(`Auth user exists for ${email} but could not be loaded`);

  const { error: updateError } = await admin.auth.admin.updateUserById(existingId, {
    password,
    email_confirm: true,
    ban_duration: "none",
  });
  if (updateError) throw new Error(updateError.message);
  return existingId;
}

async function loadUsersRow(
  admin: SupabaseClient,
  opts: { staffId?: string; usersId?: string },
): Promise<UsersRow | null> {
  let query = admin.from("users").select("id, staff_id, email, auth_user_id");
  if (opts.usersId) query = query.eq("id", opts.usersId);
  else if (opts.staffId) query = query.eq("staff_id", opts.staffId);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UsersRow | null) || null;
}

export async function provisionOneStaffAuth(
  admin: SupabaseClient,
  opts: { staffId?: string; usersId?: string },
): Promise<ProvisionResult> {
  const row = await loadUsersRow(admin, opts);
  if (!row) {
    return {
      staff_id: opts.staffId || "",
      email: null,
      auth_user_id: null,
      action: "skipped",
      reason: "not_on_allowlist",
    };
  }

  const email = normalizeEmail(row.email);
  if (!email) {
    return {
      staff_id: row.staff_id,
      email: null,
      auth_user_id: row.auth_user_id,
      action: "skipped",
      reason: "no_email",
    };
  }

  const { data: staff, error: staffError } = await admin
    .from("staffs")
    .select("id, private_phone")
    .eq("id", row.staff_id)
    .maybeSingle();
  if (staffError) throw new Error(staffError.message);

  const password = normalizePhonePassword((staff as StaffRow | null)?.private_phone);
  if (!password) {
    return {
      staff_id: row.staff_id,
      email,
      auth_user_id: row.auth_user_id,
      action: "skipped",
      reason: "no_phone",
    };
  }

  const authUserId = await upsertAuthUser(admin, email, password, row.auth_user_id);
  if (row.auth_user_id !== authUserId) {
    const { error: linkError } = await admin
      .from("users")
      .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (linkError) throw new Error(linkError.message);
  }

  return {
    staff_id: row.staff_id,
    email,
    auth_user_id: authUserId,
    action: row.auth_user_id ? "updated" : "created",
  };
}

export async function disableStaffAuth(
  admin: SupabaseClient,
  opts: { staffId?: string; usersId?: string; authUserId?: string },
): Promise<ProvisionResult> {
  const row = await loadUsersRow(admin, opts);
  const authUserId = opts.authUserId || row?.auth_user_id || null;
  if (!authUserId) {
    return {
      staff_id: row?.staff_id || opts.staffId || "",
      email: row?.email || null,
      auth_user_id: null,
      action: "skipped",
      reason: "no_auth_user",
    };
  }

  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    ban_duration: "876000h",
  });
  if (error) throw new Error(error.message);

  return {
    staff_id: row?.staff_id || opts.staffId || "",
    email: row?.email || null,
    auth_user_id: authUserId,
    action: "disabled",
  };
}

export async function provisionAllStaffAuth(admin: SupabaseClient): Promise<ProvisionResult[]> {
  const { data, error } = await admin.from("users").select("id, staff_id, email, auth_user_id");
  if (error) throw new Error(error.message);
  const rows = (data || []) as UsersRow[];
  const results: ProvisionResult[] = [];
  for (const row of rows) {
    results.push(await provisionOneStaffAuth(admin, { usersId: row.id }));
  }
  return results;
}
