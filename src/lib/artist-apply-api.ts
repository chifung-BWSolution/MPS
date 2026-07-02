import { supabase } from '@/lib/supabase';

export interface ArtistApplyV2Form {
  applicationNo: string;
  applicationDate: string;
  nameZh: string;
  nameEn: string;
  displayName: string;
  gender: string;
  birthDate: string;
  age: string;
  idLastFour: string;
  nationality: string;
  residence: string;
  residenceOther: string;
  phone: string;
  whatsapp: string;
  email: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;
  categories: string[];
  categoryOther: string;
  height: string;
  weight: string;
  shoeSize: string;
  clothingSize: string;
  hairColor: string;
  languages: string[];
  languageOther: string;
  languageFluency: string;
  readScriptAbility: string;
  adlibAbility: string;
  outdoorShooting: string;
  studioShooting: string;
  liveStreaming: string;
  travelAvailability: string[];
  earlyNightShift: string;
  weekendHolidayWork: string;
  licenseOrQualification: string;
  specialTalents: string;
  instagramAccount: string;
  instagramFollowers: string;
  xiaohongshuAccount: string;
  xiaohongshuFollowers: string;
  youtubeAccount: string;
  youtubeFollowers: string;
  facebookAccount: string;
  facebookFollowers: string;
  tiktokAccount: string;
  tiktokFollowers: string;
  otherPlatform: string;
  writeContentAbility: string;
  shootEditAbility: string;
  liveCommerceExperience: string;
  liveCommerceDetails: string;
  portfolioLinks: string;
  signedCompanyBefore: string;
  contractStatus: string;
  agencyCompanyName: string;
  contractPeriod: string;
  needAgencyConsent: string;
  previousBrands: string;
  shootingTypes: string[];
  representativeWorks: string;
  pricingModes: string[];
  priceRangeFrom: string;
  priceRangeTo: string;
  reimbursableExpenses: string;
  imagePositioning: string[];
  developmentFocus: string;
  unacceptableJobs: string;
  dreamBrands: string;
  companySupportDirections: string[];
  companySupportOther: string;
  submittedFiles: string[];
  otherFileNote: string;
  uploadedFileNames: string[];
  applicantSignature: string;
  applicantSignDate: string;
  guardianName: string;
  guardianSignature: string;
  guardianSignDate: string;
}

interface ArtistApplyPhotoPayload {
  fileRole: string;
  fileKind: string;
  dataUrl?: string;
  originalFileName?: string;
  mimeType?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

export interface SubmitArtistApplyResult {
  id: string;
}

const dataUrlMimeType = (dataUrl: string): string | undefined => {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/);
  return match?.[1];
};

const buildPhotoPayload = (form: ArtistApplyV2Form): ArtistApplyPhotoPayload[] => {
  const photos: ArtistApplyPhotoPayload[] = [];

  if (form.applicantSignature) {
    photos.push({
      fileRole: 'applicant_signature',
      fileKind: 'signature',
      dataUrl: form.applicantSignature,
      mimeType: dataUrlMimeType(form.applicantSignature) || 'image/png',
      sortOrder: 0,
      metadata: { source: 'signature_pad' },
    });
  }

  (form.uploadedFileNames ?? []).forEach((fileName, index) => {
    const trimmed = fileName.trim();
    if (!trimmed) return;
    photos.push({
      fileRole: 'submitted_file',
      fileKind: 'attachment',
      originalFileName: trimmed,
      sortOrder: index,
      metadata: {
        selectedOnly: true,
        note: 'V2 first version stores file names only; no Supabase Storage upload yet.',
      },
    });
  });

  return photos;
};

export async function submitArtistApplyV2(
  form: ArtistApplyV2Form,
  inviteToken?: string,
): Promise<SubmitArtistApplyResult> {
  if (!form.nameZh.trim()) {
    throw new Error('請填寫中文姓名。');
  }

  if (!form.phone.trim()) {
    throw new Error('請填寫聯絡電話。');
  }

  if (!form.applicantSignature) {
    throw new Error('請完成申請人簽署。');
  }

  const { applicantSignature: _signatureImage, ...textPayload } = form;
  const formPayload = {
    ...textPayload,
    inviteToken: inviteToken ?? null,
  };

  const { data, error } = await supabase.rpc('submit_artist_apply', {
    form_payload: formPayload,
    photo_payload: buildPhotoPayload(form),
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'string') {
    throw new Error('申請已提交，但系統未返回申請編號。');
  }

  return { id: data };
}

const emptyToNull = (value: string | undefined | null): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
};

const buildArtistApplyUpdateRow = (
  form: ArtistApplyV2Form,
  inviteToken?: string | null,
  existingRawPayload?: Record<string, unknown> | null,
) => {
  const { applicantSignature: _signatureImage, ...textPayload } = form;
  return {
    application_no: emptyToNull(form.applicationNo),
    application_date: emptyToNull(form.applicationDate),
    name_zh: emptyToNull(form.nameZh),
    name_en: emptyToNull(form.nameEn),
    display_name: emptyToNull(form.displayName),
    gender: emptyToNull(form.gender),
    birth_date: emptyToNull(form.birthDate),
    age: emptyToNull(form.age),
    id_last_four: emptyToNull(form.idLastFour),
    nationality: emptyToNull(form.nationality),
    residence: emptyToNull(form.residence),
    residence_other: emptyToNull(form.residenceOther),
    phone: emptyToNull(form.phone),
    whatsapp: emptyToNull(form.whatsapp),
    email: emptyToNull(form.email),
    emergency_name: emptyToNull(form.emergencyName),
    emergency_relation: emptyToNull(form.emergencyRelation),
    emergency_phone: emptyToNull(form.emergencyPhone),
    categories: form.categories ?? [],
    category_other: emptyToNull(form.categoryOther),
    height: emptyToNull(form.height),
    weight: emptyToNull(form.weight),
    shoe_size: emptyToNull(form.shoeSize),
    clothing_size: emptyToNull(form.clothingSize),
    hair_color: emptyToNull(form.hairColor),
    languages: form.languages ?? [],
    language_other: emptyToNull(form.languageOther),
    language_fluency: emptyToNull(form.languageFluency),
    read_script_ability: emptyToNull(form.readScriptAbility),
    adlib_ability: emptyToNull(form.adlibAbility),
    outdoor_shooting: emptyToNull(form.outdoorShooting),
    studio_shooting: emptyToNull(form.studioShooting),
    live_streaming: emptyToNull(form.liveStreaming),
    travel_availability: form.travelAvailability ?? [],
    early_night_shift: emptyToNull(form.earlyNightShift),
    weekend_holiday_work: emptyToNull(form.weekendHolidayWork),
    license_or_qualification: emptyToNull(form.licenseOrQualification),
    special_talents: emptyToNull(form.specialTalents),
    instagram_account: emptyToNull(form.instagramAccount),
    instagram_followers: emptyToNull(form.instagramFollowers),
    xiaohongshu_account: emptyToNull(form.xiaohongshuAccount),
    xiaohongshu_followers: emptyToNull(form.xiaohongshuFollowers),
    youtube_account: emptyToNull(form.youtubeAccount),
    youtube_followers: emptyToNull(form.youtubeFollowers),
    facebook_account: emptyToNull(form.facebookAccount),
    facebook_followers: emptyToNull(form.facebookFollowers),
    tiktok_account: emptyToNull(form.tiktokAccount),
    tiktok_followers: emptyToNull(form.tiktokFollowers),
    other_platform: emptyToNull(form.otherPlatform),
    write_content_ability: emptyToNull(form.writeContentAbility),
    shoot_edit_ability: emptyToNull(form.shootEditAbility),
    live_commerce_experience: emptyToNull(form.liveCommerceExperience),
    live_commerce_details: emptyToNull(form.liveCommerceDetails),
    portfolio_links: emptyToNull(form.portfolioLinks),
    signed_company_before: emptyToNull(form.signedCompanyBefore),
    contract_status: emptyToNull(form.contractStatus),
    agency_company_name: emptyToNull(form.agencyCompanyName),
    contract_period: emptyToNull(form.contractPeriod),
    need_agency_consent: emptyToNull(form.needAgencyConsent),
    previous_brands: emptyToNull(form.previousBrands),
    shooting_types: form.shootingTypes ?? [],
    representative_works: emptyToNull(form.representativeWorks),
    pricing_modes: form.pricingModes ?? [],
    price_range_from: emptyToNull(form.priceRangeFrom),
    price_range_to: emptyToNull(form.priceRangeTo),
    reimbursable_expenses: emptyToNull(form.reimbursableExpenses),
    image_positioning: form.imagePositioning ?? [],
    development_focus: emptyToNull(form.developmentFocus),
    unacceptable_jobs: emptyToNull(form.unacceptableJobs),
    dream_brands: emptyToNull(form.dreamBrands),
    company_support_directions: form.companySupportDirections ?? [],
    company_support_other: emptyToNull(form.companySupportOther),
    submitted_files: form.submittedFiles ?? [],
    other_file_note: emptyToNull(form.otherFileNote),
    uploaded_file_names: form.uploadedFileNames ?? [],
    applicant_sign_date: emptyToNull(form.applicantSignDate),
    guardian_name: emptyToNull(form.guardianName),
    guardian_signature_text: emptyToNull(form.guardianSignature),
    guardian_sign_date: emptyToNull(form.guardianSignDate),
    raw_payload: {
      ...(existingRawPayload ?? {}),
      ...textPayload,
      inviteToken: inviteToken ?? null,
    },
    updated_at: new Date().toISOString(),
  };
};

const residenceToConfirmedRegion = (residence: string | null | undefined): string | null => {
  if (residence === 'hk') return 'HK';
  if (residence === 'sz') return 'SZ';
  if (residence) return 'OTHER';
  return null;
};

export async function updateArtistApplyV2(
  applyId: string,
  form: ArtistApplyV2Form,
  inviteToken?: string | null,
): Promise<void> {
  if (!form.nameZh.trim()) {
    throw new Error('請填寫中文姓名。');
  }
  if (!form.phone.trim()) {
    throw new Error('請填寫聯絡電話。');
  }
  if (!form.applicantSignature) {
    throw new Error('請完成申請人簽署。');
  }

  const { data: existing, error: existingError } = await supabase
    .from('artist_apply')
    .select('raw_payload, invite_token')
    .eq('id', applyId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) throw new Error('找不到此筆申請資料。');

  const token = inviteToken ?? existing.invite_token ?? null;
  const updateRow = buildArtistApplyUpdateRow(
    form,
    token,
    (existing.raw_payload as Record<string, unknown> | null) ?? null,
  );

  const { error: updateError } = await supabase
    .from('artist_apply')
    .update(updateRow)
    .eq('id', applyId);

  if (updateError) throw updateError;

  await supabase
    .from('artist_apply_photo')
    .delete()
    .eq('artist_apply_id', applyId)
    .eq('file_role', 'applicant_signature');

  const signaturePhoto = buildPhotoPayload(form).find(p => p.fileRole === 'applicant_signature');
  if (signaturePhoto) {
    const { error: photoError } = await supabase.from('artist_apply_photo').insert({
      artist_apply_id: applyId,
      file_role: signaturePhoto.fileRole,
      file_kind: signaturePhoto.fileKind,
      data_url: signaturePhoto.dataUrl ?? null,
      mime_type: signaturePhoto.mimeType ?? null,
      sort_order: signaturePhoto.sortOrder ?? 0,
      metadata: signaturePhoto.metadata ?? {},
    });
    if (photoError) throw photoError;
  }

  const confirmedUpdate = {
    name_zh: updateRow.name_zh,
    name_en: updateRow.name_en,
    gender: updateRow.gender,
    age: updateRow.age,
    height: updateRow.height,
    weight: updateRow.weight,
    region: residenceToConfirmedRegion(form.residence),
    payload: updateRow.raw_payload,
  };

  const { error: confirmedError } = await supabase
    .from('confirmed_artist')
    .update(confirmedUpdate)
    .eq('artist_apply_id', applyId);

  if (confirmedError) throw confirmedError;
}
