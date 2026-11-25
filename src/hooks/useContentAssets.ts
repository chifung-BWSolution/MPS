/**
 * 內容素材 hook（M3-06 私有）
 *
 * 對應任務契約：`useContentAssets(siteId?) → 上傳、列表（依 tags 篩選）、刪除`
 *
 * 設計說明：
 *   - 只服務審核工作室的圖片面板；其他 owner 不得 import（契約 §5 私有 hook）。
 *   - 私有 bucket：縮圖一律用 `signedAssetUrls()` 取 1 小時簽名 URL，不產生公開連結。
 *   - 上傳流程與 content-worker 的配圖一致：Storage → `content_assets` 一列，
 *     `source` 標記來源（upload／ai_generated／vector），UI 以此顯示來源徽章。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  contentErrorMessage,
  isContentSchemaMissing,
  signedAssetUrls,
  uploadContentAsset,
} from '@/lib/contentApi.ts';
import type { ContentAsset, ContentAssetSource } from '@/lib/contentTypes.ts';

const ASSET_QUERY_LIMIT = 200;
const SIGNED_URL_TTL_SECONDS = 3600;

export interface ContentAssetUploadOptions {
  tags?: string[];
  alt?: string | null;
  createdBy?: string | null;
  source?: Extract<ContentAssetSource, 'upload' | 'ai_generated'>;
}

export interface UseContentAssetsResult {
  /** 全部素材（最近上傳優先，上限 200） */
  assets: ContentAsset[];
  /** 依 tagFilter 篩選後的素材 */
  filteredAssets: ContentAsset[];
  /** 素材庫現有標籤（去重、排序） */
  tags: string[];
  tagFilter: string | null;
  setTagFilter: (tag: string | null) => void;
  /** asset.id → 簽名 URL */
  assetUrls: Record<string, string>;
  loading: boolean;
  uploading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  upload: (files: FileList | File[], options?: ContentAssetUploadOptions) => Promise<ContentAsset[]>;
  remove: (assetId: string) => Promise<void>;
  updateAlt: (assetId: string, alt: string | null) => Promise<void>;
}

function normalizeTags(tags: readonly string[] | undefined | null): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
}

function fileNameOf(file: File): string {
  return file.name || `asset-${Date.now()}`;
}

export function useContentAssets(siteId?: string | null): UseContentAssetsResult {
  const normalizedSiteId = (siteId ?? '').trim() || null;

  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('content_assets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(ASSET_QUERY_LIMIT);
      if (normalizedSiteId) {
        // 站點專屬 + 共用（site_id = null）素材都要出現
        query = query.or(`site_id.eq.${normalizedSiteId},site_id.is.null`);
      }
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      if (requestIdRef.current !== requestId) return;

      const rows = (data ?? []) as ContentAsset[];
      setAssets(rows);
      setMissingSchema(false);

      const urls = await signedAssetUrls(rows, SIGNED_URL_TTL_SECONDS);
      if (requestIdRef.current === requestId) setAssetUrls(urls);
    } catch (loadError) {
      if (requestIdRef.current !== requestId) return;
      if (isContentSchemaMissing(loadError)) {
        setMissingSchema(true);
        setAssets([]);
        setAssetUrls({});
        setError(null);
      } else {
        setError(contentErrorMessage(loadError));
        setAssets([]);
        setAssetUrls({});
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [normalizedSiteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (files: FileList | File[], options: ContentAssetUploadOptions = {}) => {
      const list = Array.from(files).filter((file) => file.size > 0);
      if (list.length === 0) return [];
      setUploading(true);
      setError(null);
      const created: ContentAsset[] = [];
      const failures: string[] = [];
      try {
        for (const file of list) {
          try {
            const uploaded = await uploadContentAsset({
              file,
              filename: fileNameOf(file),
              siteId: normalizedSiteId,
              contentType: file.type || undefined,
            });
            const { data, error: insertError } = await supabase
              .from('content_assets')
              .insert({
                site_id: normalizedSiteId,
                bucket: uploaded.bucket,
                storage_path: uploaded.path,
                filename: fileNameOf(file),
                mime_type: file.type || null,
                bytes: file.size,
                source: options.source ?? 'upload',
                tags: normalizeTags(options.tags),
                alt: options.alt ?? null,
                created_by: options.createdBy || null,
              })
              .select('*')
              .single();
            if (insertError) throw insertError;
            if (data) created.push(data as ContentAsset);
          } catch (itemError) {
            failures.push(`${fileNameOf(file)}：${contentErrorMessage(itemError)}`);
          }
        }
      } finally {
        setUploading(false);
      }
      if (created.length > 0) await refresh();
      if (failures.length > 0) {
        const message = `部分圖片上傳失敗（${failures.length}）：${failures.join('；')}`;
        setError(message);
        if (created.length === 0) throw new Error(message);
      }
      return created;
    },
    [normalizedSiteId, refresh],
  );

  const remove = useCallback(
    async (assetId: string) => {
      const target = assets.find((asset) => asset.id === assetId);
      if (target?.storage_path) {
        // Storage 刪除失敗不阻擋 DB 清理；殘檔由素材庫巡檢處理
        const { error: storageError } = await supabase.storage
          .from(target.bucket || 'content-assets')
          .remove([target.storage_path]);
        if (storageError) {
          console.warn('[useContentAssets] Storage 刪除失敗（已忽略）', storageError);
        }
      }
      const { error: deleteError } = await supabase
        .from('content_assets')
        .delete()
        .eq('id', assetId);
      if (deleteError) throw deleteError;
      setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
      setAssetUrls((prev) => {
        const next = { ...prev };
        delete next[assetId];
        return next;
      });
    },
    [assets],
  );

  const updateAlt = useCallback(async (assetId: string, alt: string | null) => {
    const { error: updateError } = await supabase
      .from('content_assets')
      .update({ alt: alt && alt.trim() ? alt.trim() : null })
      .eq('id', assetId);
    if (updateError) throw updateError;
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, alt: alt && alt.trim() ? alt.trim() : null } : asset,
      ),
    );
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const asset of assets) {
      for (const tag of asset.tags ?? []) {
        const trimmed = String(tag).trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-HK'));
  }, [assets]);

  const filteredAssets = useMemo(() => {
    if (!tagFilter) return assets;
    const wanted = tagFilter.trim().toLowerCase();
    if (!wanted) return assets;
    return assets.filter((asset) =>
      (asset.tags ?? []).some((tag) => String(tag).trim().toLowerCase() === wanted),
    );
  }, [assets, tagFilter]);

  return {
    assets,
    filteredAssets,
    tags,
    tagFilter,
    setTagFilter,
    assetUrls,
    loading,
    uploading,
    error,
    missingSchema,
    refresh,
    upload,
    remove,
    updateAlt,
  };
}
