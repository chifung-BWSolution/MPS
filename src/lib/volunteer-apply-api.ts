import { supabase } from '@/lib/supabase';
import { getSiteOrigin } from '@/lib/siteUrl';

export type VolunteerCampaignStatus = 'draft' | 'open' | 'closed';
export type VolunteerApplyStatus = 'pending' | 'approved' | 'rejected';
export type VolunteerTreatmentType = 'face' | 'body';

export interface VolunteerCampaign {
  id: string;
  slug: string;
  title: string;
  product_name: string | null;
  description: string | null;
  incentive: string | null;
  deliverables: string | null;
  requirements_note: string | null;
  min_followers: number;
  face_quota: number;
  body_quota: number;
  deadline: string | null;
  status: VolunteerCampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface VolunteerApply {
  id: string;
  campaign_id: string;
  status: VolunteerApplyStatus;
  status_note: string | null;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram_account: string;
  follower_count: number;
  treatment_type: VolunteerTreatmentType;
  skin_concerns: string | null;
  agree_followup: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface VolunteerCampaignPublic {
  id: string;
  slug: string;
  title: string;
  product_name: string | null;
  description: string | null;
  incentive: string | null;
  deliverables: string | null;
  requirements_note: string | null;
  min_followers: number;
  face_quota: number;
  body_quota: number;
  face_approved: number;
  body_approved: number;
  face_remaining: number;
  body_remaining: number;
  deadline: string | null;
  status: VolunteerCampaignStatus;
  is_accepting: boolean;
}

export interface VolunteerCampaignInput {
  slug: string;
  title: string;
  product_name?: string;
  description?: string;
  incentive?: string;
  deliverables?: string;
  requirements_note?: string;
  min_followers: number;
  face_quota: number;
  body_quota: number;
  deadline?: string | null;
  status: VolunteerCampaignStatus;
}

export interface SubmitVolunteerApplyInput {
  campaign_id: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram_account: string;
  follower_count: number;
  treatment_type: VolunteerTreatmentType;
  skin_concerns?: string;
  agree_followup?: boolean;
}

const rpcErrorMessage = (error: { message?: string; details?: string; hint?: string } | null): string => {
  if (!error) return '操作失敗';
  const raw = error.message || error.details || error.hint || '操作失敗';
  // Postgres RAISE EXCEPTION often arrives as: "粉絲數需達 5000 或以上"
  return raw.replace(/^.*ERROR:\s*/i, '').replace(/\s+CONTEXT:.*$/i, '').trim() || '操作失敗';
};

export const getVolunteerPublicUrl = (slug: string): string =>
  `${getSiteOrigin()}/volunteer/apply/${slug}`;

export async function listVolunteerCampaigns(): Promise<VolunteerCampaign[]> {
  const { data, error } = await supabase
    .from('volunteer_campaign')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as VolunteerCampaign[];
}

export async function getVolunteerCampaign(id: string): Promise<VolunteerCampaign | null> {
  const { data, error } = await supabase
    .from('volunteer_campaign')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as VolunteerCampaign | null) ?? null;
}

export async function createVolunteerCampaign(input: VolunteerCampaignInput): Promise<VolunteerCampaign> {
  const { data, error } = await supabase
    .from('volunteer_campaign')
    .insert({
      slug: input.slug.trim().toLowerCase(),
      title: input.title.trim(),
      product_name: input.product_name?.trim() || null,
      description: input.description?.trim() || null,
      incentive: input.incentive?.trim() || null,
      deliverables: input.deliverables?.trim() || null,
      requirements_note: input.requirements_note?.trim() || null,
      min_followers: input.min_followers,
      face_quota: input.face_quota,
      body_quota: input.body_quota,
      deadline: input.deadline || null,
      status: input.status,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as VolunteerCampaign;
}

export async function updateVolunteerCampaign(
  id: string,
  input: Partial<VolunteerCampaignInput>,
): Promise<VolunteerCampaign> {
  const patch: Record<string, unknown> = {};
  if (input.slug !== undefined) patch.slug = input.slug.trim().toLowerCase();
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.product_name !== undefined) patch.product_name = input.product_name.trim() || null;
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.incentive !== undefined) patch.incentive = input.incentive.trim() || null;
  if (input.deliverables !== undefined) patch.deliverables = input.deliverables.trim() || null;
  if (input.requirements_note !== undefined) patch.requirements_note = input.requirements_note.trim() || null;
  if (input.min_followers !== undefined) patch.min_followers = input.min_followers;
  if (input.face_quota !== undefined) patch.face_quota = input.face_quota;
  if (input.body_quota !== undefined) patch.body_quota = input.body_quota;
  if (input.deadline !== undefined) patch.deadline = input.deadline || null;
  if (input.status !== undefined) patch.status = input.status;

  const { data, error } = await supabase
    .from('volunteer_campaign')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as VolunteerCampaign;
}

export async function listVolunteerApplies(campaignId: string): Promise<VolunteerApply[]> {
  const { data, error } = await supabase
    .from('volunteer_apply')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('submitted_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as VolunteerApply[];
}

export async function getVolunteerCampaignPublic(slug: string): Promise<VolunteerCampaignPublic | null> {
  const { data, error } = await supabase.rpc('get_volunteer_campaign_public', {
    p_slug: slug.trim().toLowerCase(),
  });

  if (error) throw new Error(rpcErrorMessage(error));
  if (!data) return null;
  return data as VolunteerCampaignPublic;
}

export async function submitVolunteerApply(input: SubmitVolunteerApplyInput): Promise<string> {
  const { data, error } = await supabase.rpc('submit_volunteer_apply', {
    form_payload: {
      campaign_id: input.campaign_id,
      name: input.name,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      email: input.email ?? null,
      instagram_account: input.instagram_account,
      follower_count: input.follower_count,
      treatment_type: input.treatment_type,
      skin_concerns: input.skin_concerns ?? null,
      agree_followup: input.agree_followup ?? true,
    },
  });

  if (error) throw new Error(rpcErrorMessage(error));
  return data as string;
}

export async function reviewVolunteerApply(params: {
  applyId: string;
  status: VolunteerApplyStatus;
  statusNote?: string;
  reviewedBy?: string;
}): Promise<VolunteerApply> {
  const { data, error } = await supabase.rpc('review_volunteer_apply', {
    p_apply_id: params.applyId,
    p_status: params.status,
    p_status_note: params.statusNote ?? null,
    p_reviewed_by: params.reviewedBy ?? null,
  });

  if (error) throw new Error(rpcErrorMessage(error));
  return data as VolunteerApply;
}

export function countQuota(applies: VolunteerApply[], treatment: VolunteerTreatmentType) {
  return applies.filter((a) => a.treatment_type === treatment && a.status === 'approved').length;
}

export function slugifyCampaignTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/[\u4e00-\u9fff]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || `campaign-${Date.now().toString(36)}`;
}
