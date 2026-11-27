import { supabase } from '@/lib/supabase';
import { getSiteOrigin } from '@/lib/siteUrl';

export const INQUIRY_FIELD_TYPES = [
  { id: 'text', label: '單行文字' },
  { id: 'textarea', label: '多行文字' },
  { id: 'number', label: '數字' },
  { id: 'checkbox', label: '確認勾選' },
  { id: 'radio', label: '單選' },
  { id: 'select', label: '下拉選單' },
  { id: 'checkboxes', label: '多選' },
  { id: 'email', label: '電郵' },
  { id: 'phone', label: '電話' },
  { id: 'address', label: '地址' },
  { id: 'date', label: '日期' },
  { id: 'website', label: '網址' },
  { id: 'hidden', label: '隱藏欄位' },
  { id: 'section', label: '分段標題' },
  { id: 'terms', label: '條款同意' },
  { id: 'file', label: '檔案上傳' },
] as const;

export type InquiryFieldType = (typeof INQUIRY_FIELD_TYPES)[number]['id'];

export const INQUIRY_FILE_TYPE_OPTIONS = [
  { id: 'image/jpeg', label: 'JPG 圖片', extensions: ['.jpg', '.jpeg', '.jfif'] },
  { id: 'image/png', label: 'PNG 圖片', extensions: ['.png'] },
  { id: 'image/gif', label: 'GIF 圖片', extensions: ['.gif'] },
  { id: 'image/webp', label: 'WebP 圖片', extensions: ['.webp'] },
  { id: 'application/pdf', label: 'PDF', extensions: ['.pdf'] },
  { id: 'application/msword', label: 'Word .doc', extensions: ['.doc'] },
  { id: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word .docx', extensions: ['.docx'] },
  { id: 'application/vnd.ms-excel', label: 'Excel .xls', extensions: ['.xls'] },
  { id: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel .xlsx', extensions: ['.xlsx'] },
  { id: 'text/plain', label: '純文字 .txt', extensions: ['.txt'] },
  { id: 'text/csv', label: 'CSV', extensions: ['.csv'] },
  { id: 'application/zip', label: 'ZIP', extensions: ['.zip'] },
] as const;

export type InquiryField = {
  id: string;
  label: string;
  fieldType: InquiryFieldType;
  required: boolean;
  placeholder: string;
  options: string[];
  fileMaxCount: number;
  fileMaxSizeMb: number;
  fileAccept: string[];
};

export type InquiryAnswerValue = string | string[] | File[];

export type PublicInquiry = {
  linkId: string;
  formName: string;
  description: string;
  websiteName: string;
  languageCode: 'zh-Hant' | 'en';
  submitButtonText: string;
  labelAlignment: 'top' | 'left' | 'right';
  submitAlignment: 'left' | 'center' | 'right';
  confirmationType: 'message' | 'redirect';
  confirmationMessage: string;
  redirectUrl: string;
  availability: 'available' | 'not_published' | 'not_open' | 'closed' | 'full';
  fields: InquiryField[];
};

export function inquiryFieldTypeLabel(type: string): string {
  return INQUIRY_FIELD_TYPES.find((item) => item.id === type)?.label || type;
}

export function isInquiryChoiceField(type: string): boolean {
  return type === 'select' || type === 'radio' || type === 'checkboxes';
}

export function isInquiryDisplayField(type: string): boolean {
  return type === 'section';
}

export function inquiryPublicUrl(linkId: string): string {
  return `${getSiteOrigin()}/inquiry/${linkId}`;
}

export function splitFieldOptions(value: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const line of value.split('\n')) {
    const option = line.trim();
    if (!option || seen.has(option)) continue;
    seen.add(option);
    options.push(option);
  }
  return options;
}

function asFieldType(value: unknown): InquiryFieldType {
  const type = String(value || '');
  return INQUIRY_FIELD_TYPES.some((item) => item.id === type) ? type as InquiryFieldType : 'text';
}

function asOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function mapPublicInquiry(data: unknown): PublicInquiry | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const linkId = String(row.linkId || '');
  if (!linkId) return null;
  const fields = Array.isArray(row.fields) ? row.fields.map((item) => {
    const field = item as Record<string, unknown>;
    return {
      id: String(field.id || ''),
      label: String(field.label || ''),
      fieldType: asFieldType(field.fieldType),
      required: field.required === true,
      placeholder: String(field.placeholder || ''),
      options: asOptions(field.options),
      fileMaxCount: Number(field.fileMaxCount) === 0 ? 0 : Math.min(20, Math.max(1, Number(field.fileMaxCount || 3))),
      fileMaxSizeMb: Math.min(20, Math.max(1, Number(field.fileMaxSizeMb || 10))),
      fileAccept: asOptions(field.fileAccept),
    };
  }).filter((field) => field.id && field.label) : [];
  return {
    linkId,
    formName: String(row.formName || '表格'),
    description: String(row.description || ''),
    websiteName: String(row.websiteName || ''),
    languageCode: row.languageCode === 'en' ? 'en' : 'zh-Hant',
    submitButtonText: String(row.submitButtonText || '送出'),
    labelAlignment: row.labelAlignment === 'left' || row.labelAlignment === 'right' ? row.labelAlignment : 'top',
    submitAlignment: row.submitAlignment === 'center' || row.submitAlignment === 'right' ? row.submitAlignment : 'left',
    confirmationType: row.confirmationType === 'redirect' ? 'redirect' : 'message',
    confirmationMessage: String(row.confirmationMessage || '已收到，多謝你的資料。我們會盡快跟進。'),
    redirectUrl: String(row.redirectUrl || ''),
    availability: (
      row.availability === 'not_published' ||
      row.availability === 'not_open' ||
      row.availability === 'closed' ||
      row.availability === 'full'
    ) ? row.availability : 'available',
    fields,
  };
}

export async function fetchPublicInquiry(linkId: string): Promise<PublicInquiry | null> {
  const { data, error } = await supabase.rpc('get_inquiry_link_public', { p_link_id: linkId });
  if (error) throw new Error(error.message);
  return mapPublicInquiry(data);
}

export async function submitPublicInquiry(
  linkId: string,
  answers: Record<string, InquiryAnswerValue>,
  meta: { startedAt: number; honeypot?: string },
): Promise<void> {
  const serializableAnswers: Record<string, string | string[]> = {};
  const body = new FormData();
  for (const [fieldId, value] of Object.entries(answers)) {
    if (Array.isArray(value) && value.every((item) => item instanceof File)) {
      for (const file of value) body.append(`file:${fieldId}`, file, file.name);
      continue;
    }
    serializableAnswers[fieldId] = value as string | string[];
  }
  body.append('payload', JSON.stringify({
    linkId,
    answers: serializableAnswers,
    startedAt: meta.startedAt,
    website: meta.honeypot || '',
    referrer: typeof document === 'undefined' ? '' : document.referrer,
  }));
  const { data, error } = await supabase.functions.invoke('submit-inquiry-form', {
    body,
  });
  if (error) throw new Error(error.message || '送出失敗');
  if (data?.error) throw new Error(String(data.error));
}
