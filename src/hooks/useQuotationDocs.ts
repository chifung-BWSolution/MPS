import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  QUOTATION_DOCS_BUCKET,
  QUOTATION_DOCS_TABLE,
  isAllowedQuotationDocFile,
  optionalIsoDate,
  quotationDocStoragePath,
  type QuotationDoc,
  type QuotationDocInput,
} from '@/lib/quotationDocs';

type DbRow = {
  id: string;
  quotation_client_project_id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  document_date: string | null;
  expiry_date: string | null;
  file_size: number | string | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): QuotationDoc {
  return {
    id: row.id,
    quotationClientProjectId: row.quotation_client_project_id,
    docType: row.doc_type,
    fileName: row.file_name,
    fileUrl: row.file_url,
    storagePath: row.storage_path,
    documentDate: optionalIsoDate(row.document_date),
    expiryDate: optionalIsoDate(row.expiry_date),
    fileSize: row.file_size == null ? undefined : Number(row.file_size) || undefined,
    mimeType: row.mime_type ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inputToRow(input: QuotationDocInput, projectId: string) {
  return {
    quotation_client_project_id: projectId,
    doc_type: input.docType.trim(),
    file_name: input.fileName.trim(),
    file_url: input.fileUrl.trim(),
    storage_path: input.storagePath.trim(),
    document_date: optionalIsoDate(input.documentDate ?? undefined) ?? null,
    expiry_date: optionalIsoDate(input.expiryDate ?? undefined) ?? null,
    file_size: input.fileSize ?? null,
    mime_type: input.mimeType ?? null,
    created_by: input.createdBy ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function removeStorageObject(path: string | undefined) {
  const trimmed = path?.trim();
  if (!trimmed) return;
  await supabase.storage.from(QUOTATION_DOCS_BUCKET).remove([trimmed]);
}

export async function uploadQuotationDocFile(
  projectId: string,
  file: File,
): Promise<{ data: { path: string; url: string } | null; error: { message: string } | null }> {
  const fileError = isAllowedQuotationDocFile(file);
  if (fileError) return { data: null, error: { message: fileError } };

  const uniqueId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const path = quotationDocStoragePath(projectId, file.name, uniqueId);
  const { error } = await supabase.storage.from(QUOTATION_DOCS_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { data: null, error: { message: error.message } };

  const { data: urlData } = supabase.storage.from(QUOTATION_DOCS_BUCKET).getPublicUrl(path);
  return { data: { path, url: urlData.publicUrl }, error: null };
}

export function useQuotationDocs(projectId: string | undefined) {
  const { systemUser } = useAuth();
  const [rows, setRows] = useState<QuotationDoc[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from(QUOTATION_DOCS_TABLE)
      .select('*')
      .eq('quotation_client_project_id', projectId)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setError(null);
      setRows(((data as DbRow[] | null) ?? []).map(mapRow));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addDoc = useCallback(
    async (input: Omit<QuotationDocInput, 'createdBy'> & { file: File }) => {
      if (!projectId) return { data: null, error: { message: '缺少項目' } };
      const docType = input.docType.trim();
      if (!docType) return { data: null, error: { message: '請填寫文件類型' } };

      const uploaded = await uploadQuotationDocFile(projectId, input.file);
      if (uploaded.error || !uploaded.data) {
        return { data: null, error: uploaded.error ?? { message: '上傳失敗' } };
      }

      const row = inputToRow(
        {
          ...input,
          fileName: input.file.name,
          fileUrl: uploaded.data.url,
          storagePath: uploaded.data.path,
          fileSize: input.file.size,
          mimeType: input.file.type || null,
          createdBy: systemUser?.staff_id || systemUser?.display_name || null,
        },
        projectId,
      );

      const { data, error: err } = await supabase
        .from(QUOTATION_DOCS_TABLE)
        .insert(row)
        .select('*')
        .single();

      if (err || !data) {
        await removeStorageObject(uploaded.data.path);
        return { data: null, error: err ?? { message: '儲存失敗' } };
      }

      const mapped = mapRow(data as DbRow);
      setRows((prev) => [mapped, ...prev]);
      return { data: mapped, error: null };
    },
    [projectId, systemUser?.display_name, systemUser?.staff_id],
  );

  const updateDoc = useCallback(
    async (
      id: string,
      input: Partial<Omit<QuotationDocInput, 'createdBy'>> & { file?: File | null },
    ) => {
      if (!projectId) return { error: { message: '缺少項目' } };
      const current = rows.find((row) => row.id === id);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      let uploadedPath: string | undefined;

      if (input.docType !== undefined) {
        const docType = input.docType.trim();
        if (!docType) return { error: { message: '請填寫文件類型' } };
        patch.doc_type = docType;
      }
      if (input.documentDate !== undefined) patch.document_date = optionalIsoDate(input.documentDate ?? undefined) ?? null;
      if (input.expiryDate !== undefined) patch.expiry_date = optionalIsoDate(input.expiryDate ?? undefined) ?? null;

      if (input.file) {
        const uploaded = await uploadQuotationDocFile(projectId, input.file);
        if (uploaded.error || !uploaded.data) {
          return { error: uploaded.error ?? { message: '上傳失敗' } };
        }
        uploadedPath = uploaded.data.path;
        patch.file_name = input.file.name;
        patch.file_url = uploaded.data.url;
        patch.storage_path = uploaded.data.path;
        patch.file_size = input.file.size;
        patch.mime_type = input.file.type || null;
      } else {
        if (input.fileName !== undefined) patch.file_name = input.fileName.trim();
        if (input.fileUrl !== undefined) patch.file_url = input.fileUrl.trim();
        if (input.storagePath !== undefined) patch.storage_path = input.storagePath.trim();
      }

      const { data, error: err } = await supabase
        .from(QUOTATION_DOCS_TABLE)
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();

      if (err || !data) {
        await removeStorageObject(uploadedPath);
        return { error: err ?? { message: '更新失敗' } };
      }

      if (uploadedPath && current?.storagePath && current.storagePath !== uploadedPath) {
        await removeStorageObject(current.storagePath);
      }

      const mapped = mapRow(data as DbRow);
      setRows((prev) => prev.map((row) => (row.id === id ? mapped : row)));
      return { error: null };
    },
    [projectId, rows],
  );

  const deleteDoc = useCallback(async (id: string) => {
    const current = rows.find((row) => row.id === id);
    const { error: err } = await supabase.from(QUOTATION_DOCS_TABLE).delete().eq('id', id);
    if (err) return { error: err };
    await removeStorageObject(current?.storagePath);
    setRows((prev) => prev.filter((row) => row.id !== id));
    return { error: null };
  }, [rows]);

  return { rows, loading, error, refresh, addDoc, updateDoc, deleteDoc };
}
