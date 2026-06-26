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
