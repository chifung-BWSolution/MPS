export const QUOTATION_DOCS_TABLE = 'quotation_docs';
export const QUOTATION_DOCS_BUCKET = 'quotation-docs';
export const QUOTATION_DOC_MAX_SIZE_MB = 50;
export const QUOTATION_DOC_MAX_SIZE_BYTES = QUOTATION_DOC_MAX_SIZE_MB * 1024 * 1024;
export const QUOTATION_DOC_EXPIRING_SOON_DAYS = 30;

export const QUOTATION_DOC_TYPE_PRESETS = ['報價單', '項目合約', '參考圖片'] as const;

export type QuotationDocTypePreset = (typeof QUOTATION_DOC_TYPE_PRESETS)[number];

export type QuotationDocExpiryStatus = 'none' | 'valid' | 'expiring' | 'expired';

export type QuotationDoc = {
  id: string;
  quotationClientProjectId: string;
  docType: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  documentDate?: string;
  expiryDate?: string;
  fileSize?: number;
  mimeType?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type QuotationDocInput = {
  docType: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  documentDate?: string | null;
  expiryDate?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  createdBy?: string | null;
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
]);

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'zip',
]);

export function optionalIsoDate(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 10);
}

export function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'file';
  const cleaned = trimmed.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').replace(/_+/g, '_');
  return cleaned.slice(0, 180) || 'file';
}

export function fileExtension(name: string): string {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

export function isAllowedQuotationDocFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (file.size > QUOTATION_DOC_MAX_SIZE_BYTES) {
    return `檔案不可超過 ${QUOTATION_DOC_MAX_SIZE_MB}MB`;
  }
  const ext = fileExtension(file.name);
  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) return null;
  if (ext && ALLOWED_EXTENSIONS.has(ext)) return null;
  return '不支援此檔案格式（可用 PDF、圖片、Word、Excel、PowerPoint、ZIP）';
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocDate(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

export function quotationDocStoragePath(projectId: string, fileName: string, uniqueId: string): string {
  return `${projectId.trim()}/${uniqueId}/${sanitizeFileName(fileName)}`;
}

export function quotationDocExpiryStatus(
  expiryDate: string | undefined,
  today = new Date().toISOString().slice(0, 10),
): QuotationDocExpiryStatus {
  const expiry = optionalIsoDate(expiryDate);
  if (!expiry) return 'none';
  if (expiry < today) return 'expired';
  const limit = addDaysIso(today, QUOTATION_DOC_EXPIRING_SOON_DAYS);
  if (expiry <= limit) return 'expiring';
  return 'valid';
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validateQuotationDocDates(
  documentDate: string | undefined,
  expiryDate: string | undefined,
): string | null {
  const start = optionalIsoDate(documentDate);
  const end = optionalIsoDate(expiryDate);
  if (start && end && end < start) return '到期日不可早於文件日期';
  return null;
}

export function isImageDoc(mimeType: string | undefined, fileName: string): boolean {
  if (mimeType?.startsWith('image/')) return true;
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(fileExtension(fileName));
}
