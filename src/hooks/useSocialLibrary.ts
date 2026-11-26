import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  contentErrorMessage,
  isContentSchemaMissing,
  signedAssetUrls,
  uploadContentAsset,
} from '@/lib/contentApi.ts';
import type { ContentAsset } from '@/lib/contentTypes.ts';

export interface UseSocialLibraryResult {
  assets: ContentAsset[];
  urls: Record<string, string>;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  acting: string | null;
  refresh: () => Promise<void>;
  upload: (files: FileList | File[]) => Promise<{ uploaded: number; failed: number }>;
  updateMeta: (assetId: string, patch: { tags?: string[]; alt?: string | null }) => Promise<void>;
  remove: (assetId: string) => Promise<void>;
}

const BUCKET = 'content-assets';

export function useSocialLibrary(): UseSocialLibraryResult {
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from('content_assets')
        .select('*')
        .like('mime_type', 'image/%')
        .order('created_at', { ascending: false })
        .limit(200);
      if (queryError) throw queryError;
      const rows = ((data ?? []) as ContentAsset[]).map((asset) => ({
        ...asset,
        tags: Array.isArray(asset.tags) ? asset.tags : [],
      }));
      setAssets(rows);
      setUrls(await signedAssetUrls(rows));
      setError(null);
      setMissingSchema(false);
    } catch (thrown) {
      if (isContentSchemaMissing(thrown)) {
        setMissingSchema(true);
        setAssets([]);
        setUrls({});
        setError(null);
      } else {
        setError(contentErrorMessage(thrown));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
      if (list.length === 0) return { uploaded: 0, failed: 0 };
      setActing('upload');
      let uploaded = 0;
      let failed = 0;
      try {
        for (const file of list) {
          try {
            const { path } = await uploadContentAsset({
              file,
              filename: file.name,
              contentType: file.type || 'image/png',
            });
            const { error: insertError } = await supabase.from('content_assets').insert({
              bucket: BUCKET,
              storage_path: path,
              filename: file.name,
              mime_type: file.type || 'image/png',
              bytes: file.size,
              source: 'upload',
              tags: [],
              alt: null,
            });
            if (insertError) throw insertError;
            uploaded += 1;
          } catch (thrown) {
            failed += 1;
            console.warn('[social-library] 上傳失敗', file.name, contentErrorMessage(thrown));
          }
        }
        await refresh();
        return { uploaded, failed };
      } finally {
        setActing(null);
      }
    },
    [refresh],
  );

  const updateMeta = useCallback(
    async (assetId: string, patch: { tags?: string[]; alt?: string | null }) => {
      setActing(`meta:${assetId}`);
      try {
        const update: Record<string, unknown> = {};
        if (patch.tags) update.tags = [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))];
        if (patch.alt !== undefined) update.alt = patch.alt;
        const { error: updateError } = await supabase
          .from('content_assets')
          .update(update)
          .eq('id', assetId);
        if (updateError) throw updateError;
        await refresh();
      } finally {
        setActing(null);
      }
    },
    [refresh],
  );

  const remove = useCallback(async (assetId: string) => {
    setActing(`delete:${assetId}`);
    try {
      const asset = assets.find((item) => item.id === assetId);
      if (asset) {
        const { error: storageError } = await supabase.storage
          .from(asset.bucket || BUCKET)
          .remove([asset.storage_path]);
        if (storageError) console.warn('[social-library] 刪除 Storage 檔案失敗', storageError.message);
      }
      const { error: deleteError } = await supabase.from('content_assets').delete().eq('id', assetId);
      if (deleteError) throw deleteError;
      setAssets((previous) => previous.filter((item) => item.id !== assetId));
    } finally {
      setActing(null);
    }
  }, [assets]);

  return { assets, urls, loading, error, missingSchema, acting, refresh, upload, updateMeta, remove };
}
