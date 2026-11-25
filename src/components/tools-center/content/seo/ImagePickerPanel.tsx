/**
 * 圖片面板（M3-06；PRD §8.2.4、§9.2.3 配圖）
 *
 * 功能：
 *   - 16:9 封面縮圖（私有 bucket → 1 小時簽名 URL）
 *   - 內文圖縮圖（來自 content_articles.image_asset_ids）
 *   - 素材庫挑選（`useContentAssets`：列表 / 標籤篩選 / 上傳 / 改 alt / 刪除）
 *   - 重生 SVG 圖卡（`buildSvgCard()`，本專案 v1 不接影像 API）
 *   - 顯示來源：upload／ai_generated／vector（PRD §6.2.1 content_assets.source）
 *
 * 注意：封面變更（setCover／generateCover）由工作室的 useContentArticle 執行，
 * 本面板只發出意圖，避免兩處各寫一次文章更新邏輯。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Images,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ContentArticle, ContentAsset, ContentAssetSource } from '@/lib/contentTypes.ts';
import { contentErrorMessage } from '@/lib/contentApi.ts';
import { useContentAssets } from '@/hooks/useContentAssets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ContentStatusPill } from '../shell/ContentStatusPill';

const ASSET_SOURCE_LABEL: Record<ContentAssetSource, string> = {
  upload: '手動上傳',
  ai_generated: 'AI 生成',
  vector: '系統圖卡',
};

const ASSET_SOURCE_TONE: Record<ContentAssetSource, 'slate' | 'indigo' | 'teal'> = {
  upload: 'slate',
  ai_generated: 'indigo',
  vector: 'teal',
};

export interface ImagePickerPanelProps {
  siteId: string;
  article: ContentArticle;
  coverAsset: ContentAsset | null;
  imageAssets: ContentAsset[];
  /** 簽名 URL：asset.id → url（由 useContentArticle 提供） */
  assetUrls: Record<string, string>;
  canEdit: boolean;
  /** 重生圖卡中（由工作室控制 busy） */
  coverBusy?: boolean;
  /** 建議標籤（關鍵字／欄目），上傳新圖時自動帶入 */
  suggestedTags?: string[];
  onSelectCover: (assetId: string | null) => Promise<void> | void;
  onGenerateCover: () => Promise<void> | void;
  className?: string;
}

function AssetThumb({
  url,
  alt,
  className,
}: {
  url?: string | null;
  alt?: string | null;
  className?: string;
}) {
  if (!url) {
    return (
      <div className={cn('flex items-center justify-center rounded bg-slate-100 text-slate-300', className)}>
        <ImageIcon size={18} strokeWidth={1.6} />
      </div>
    );
  }
  return <img src={url} alt={alt ?? ''} loading="lazy" className={cn('rounded object-cover', className)} />;
}

function AltEditor({
  assetId,
  value,
  disabled,
  onSave,
}: {
  assetId: string;
  value: string | null;
  disabled: boolean;
  onSave: (assetId: string, alt: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const dirty = draft !== (value ?? '');

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(assetId, draft.trim() || null);
      toast.success('已更新圖片替代文字');
    } catch (error) {
      toast.error(contentErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="alt 替代文字（圖片無法顯示時的可讀描述）"
        className="h-7 text-[11.5px]"
      />
      <Button
        type="button"
        size="sm"
        variant={dirty ? 'default' : 'ghost'}
        disabled={!dirty || disabled || saving}
        onClick={() => void handleSave()}
        className="h-7 shrink-0 px-2 text-[11px]"
      >
        {saving ? <Loader2 size={11} className="animate-spin" /> : null}
        儲存 alt
      </Button>
    </div>
  );
}

export function ImagePickerPanel({
  siteId,
  article,
  coverAsset,
  imageAssets,
  assetUrls,
  canEdit,
  coverBusy = false,
  suggestedTags = [],
  onSelectCover,
  onGenerateCover,
  className,
}: ImagePickerPanelProps) {
  const library = useContentAssets(siteId || null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [altOverrides, setAltOverrides] = useState<Record<string, string | null>>({});
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const effectiveAlt = (asset: ContentAsset): string | null => {
    if (Object.prototype.hasOwnProperty.call(altOverrides, asset.id)) {
      return altOverrides[asset.id];
    }
    return asset.alt;
  };

  const saveAlt = async (assetId: string, alt: string | null) => {
    await library.updateAlt(assetId, alt);
    setAltOverrides((prev) => ({ ...prev, [assetId]: alt }));
  };

  const handleSelectCover = async (assetId: string | null) => {
    setSelectingId(assetId ?? 'none');
    try {
      await onSelectCover(assetId);
      toast.success(assetId ? '已更新封面' : '已移除封面');
    } catch (error) {
      toast.error(contentErrorMessage(error));
    } finally {
      setSelectingId(null);
    }
  };

  const handleGenerateCover = async () => {
    try {
      await onGenerateCover();
      toast.success('已重生 SVG 圖卡並設為封面');
    } catch (error) {
      toast.error(contentErrorMessage(error));
    }
  };

  const handleUpload = async (files: FileList | null, options: { asCover: boolean }) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const created = await library.upload(files, {
        tags: suggestedTags,
        alt: article.title || null,
      });
      if (created.length > 0) {
        toast.success(`已上傳 ${created.length} 張圖片`);
        if (options.asCover) await handleSelectCover(created[0].id);
      }
    } catch (error) {
      toast.error(contentErrorMessage(error));
    } finally {
      setUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
      if (libraryInputRef.current) libraryInputRef.current.value = '';
    }
  };

  const handleDelete = async (assetId: string) => {
    try {
      await library.remove(assetId);
      toast.success('已從素材庫刪除');
    } catch (error) {
      toast.error(contentErrorMessage(error));
    }
  };

  const coverUrl = coverAsset ? assetUrls[coverAsset.id] ?? null : null;
  const libraryAssets = library.filteredAssets;
  const suggestedTagSet = useMemo(
    () => new Set(suggestedTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
    [suggestedTags],
  );

  const isSuggested = (asset: ContentAsset) =>
    (asset.tags ?? []).some((tag) => suggestedTagSet.has(String(tag).trim().toLowerCase()));

  return (
    <div className={cn('space-y-3', className)}>
      {/* 封面 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0d1a2d]">
            <ImageIcon size={13} className="text-teal-600" strokeWidth={2} />
            封面（16:9）
          </div>
          {coverAsset && (
            <ContentStatusPill
              label={ASSET_SOURCE_LABEL[coverAsset.source] ?? coverAsset.source}
              tone={ASSET_SOURCE_TONE[coverAsset.source] ?? 'slate'}
              dot={false}
            />
          )}
        </div>

        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50">
          {coverUrl ? (
            <img src={coverUrl} alt={coverAsset ? effectiveAlt(coverAsset) ?? '' : ''} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
              <ImageIcon size={22} strokeWidth={1.5} />
              <span className="text-[11.5px]">尚未設定封面</span>
            </div>
          )}
          {coverBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 size={18} className="animate-spin text-teal-600" />
            </div>
          )}
        </div>

        {coverAsset && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
              <span className="truncate font-mono">{coverAsset.storage_path}</span>
              <span className="shrink-0 tabular-nums">
                {coverAsset.width && coverAsset.height ? `${coverAsset.width}×${coverAsset.height}` : ''}
              </span>
            </div>
            <AltEditor
              assetId={coverAsset.id}
              value={effectiveAlt(coverAsset)}
              disabled={!canEdit}
              onSave={saveAlt}
            />
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canEdit || coverBusy}
            onClick={() => void handleGenerateCover()}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            {coverBusy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            重生 SVG 圖卡
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canEdit || uploading}
            onClick={() => coverInputRef.current?.click()}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            上傳新圖
          </Button>
          {coverAsset && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canEdit || selectingId !== null}
              onClick={() => void handleSelectCover(null)}
              className="h-7 px-2 text-[11px] text-slate-500"
            >
              移除封面
            </Button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            multiple
            className="hidden"
            onChange={(event) => void handleUpload(event.target.files, { asCover: true })}
          />
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            multiple
            className="hidden"
            onChange={(event) => void handleUpload(event.target.files, { asCover: false })}
          />
        </div>
      </div>

      {/* 內文圖 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0d1a2d]">
            <Images size={13} className="text-teal-600" strokeWidth={2} />
            內文圖
          </div>
          <span className="text-[10.5px] text-muted-foreground">{imageAssets.length} 張</span>
        </div>
        {imageAssets.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-[11.5px] text-slate-400">
            還沒有內文圖；可直接在 Markdown 用 <code className="rounded bg-slate-100 px-1">![alt](url)</code> 插入。
          </p>
        ) : (
          <div className="space-y-2">
            {imageAssets.map((asset) => (
              <div key={asset.id} className="rounded-md border border-[rgba(13,26,45,0.06)] p-2">
                <div className="flex items-start gap-2">
                  <AssetThumb
                    url={assetUrls[asset.id]}
                    alt={effectiveAlt(asset)}
                    className="h-14 w-24 shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <ContentStatusPill
                        label={ASSET_SOURCE_LABEL[asset.source] ?? asset.source}
                        tone={ASSET_SOURCE_TONE[asset.source] ?? 'slate'}
                        dot={false}
                      />
                      <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {asset.filename || asset.storage_path}
                      </span>
                    </div>
                    <AltEditor
                      assetId={asset.id}
                      value={effectiveAlt(asset)}
                      disabled={!canEdit}
                      onSave={saveAlt}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 素材庫 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0d1a2d]">
            <Images size={13} className="text-teal-600" strokeWidth={2} />
            素材庫
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={library.loading}
              onClick={() => void library.refresh()}
              className="h-6 gap-1 px-1.5 text-[10.5px] text-muted-foreground"
            >
              <RefreshCw size={11} className={library.loading ? 'animate-spin' : undefined} />
              重新整理
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canEdit || uploading}
              onClick={() => libraryInputRef.current?.click()}
              className="h-6 gap-1 px-1.5 text-[10.5px]"
            >
              <Upload size={11} />
              上傳
            </Button>
          </div>
        </div>

        {library.missingSchema ? (
          <p className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11.5px] text-amber-700">
            素材庫資料表尚未建立；封面與圖卡仍可產生，但無法挑選歷史素材。
          </p>
        ) : (
          <>
            {library.tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => library.setTagFilter(null)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors',
                    !library.tagFilter
                      ? 'border-teal-200 bg-teal-50 text-teal-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                  )}
                >
                  全部
                </button>
                {library.tags.slice(0, 14).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => library.setTagFilter(library.tagFilter === tag ? null : tag)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors',
                      library.tagFilter === tag
                        ? 'border-teal-200 bg-teal-50 text-teal-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {library.error && (
              <p className="mb-2 rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1.5 text-[11px] text-rose-700">
                {library.error}
              </p>
            )}

            {library.loading && libraryAssets.length === 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="aspect-video rounded-md" />
                ))}
              </div>
            ) : libraryAssets.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-[11.5px] text-slate-400">
                {library.tagFilter ? '這個標籤還沒有素材' : '素材庫還沒有圖片；上傳後可重複使用。'}
              </p>
            ) : (
              <ScrollArea className="h-[248px] pr-2">
                <div className="grid grid-cols-3 gap-2">
                  {libraryAssets.map((asset) => {
                    const selected = coverAsset?.id === asset.id;
                    return (
                      <div key={asset.id} className="group relative">
                        <button
                          type="button"
                          disabled={!canEdit || selectingId !== null}
                          onClick={() => void handleSelectCover(asset.id)}
                          title={`設為封面（${ASSET_SOURCE_LABEL[asset.source] ?? asset.source}）`}
                          className={cn(
                            'relative block w-full overflow-hidden rounded-md border transition-colors',
                            selected
                              ? 'border-teal-500 ring-2 ring-teal-200'
                              : 'border-[rgba(13,26,45,0.08)] hover:border-teal-300',
                          )}
                        >
                          <AssetThumb
                            url={library.assetUrls[asset.id]}
                            alt={effectiveAlt(asset)}
                            className="aspect-video w-full"
                          />
                          {selected && (
                            <span className="absolute left-1 top-1 rounded bg-teal-600 px-1 py-0.5 text-[9px] font-bold text-white">
                              封面
                            </span>
                          )}
                          {isSuggested(asset) && !selected && (
                            <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1 py-0.5 text-[9px] font-semibold text-teal-700">
                              相關
                            </span>
                          )}
                          {selectingId === asset.id && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                              <Loader2 size={14} className="animate-spin text-teal-600" />
                            </span>
                          )}
                        </button>
                        {canEdit && (
                          pendingDeleteId === asset.id ? (
                            <div className="absolute inset-x-1 top-1 flex items-center justify-between gap-1 rounded bg-white/95 px-1 py-0.5 shadow-sm">
                              <span className="text-[9px] font-semibold text-rose-600">刪除？</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingDeleteId(null);
                                    void handleDelete(asset.id);
                                  }}
                                  className="rounded bg-rose-600 px-1 py-0.5 text-[9px] font-bold text-white"
                                >
                                  是
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteId(null)}
                                  className="rounded bg-slate-200 px-1 py-0.5 text-[9px] font-semibold text-slate-600"
                                >
                                  否
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              title="從素材庫刪除"
                              onClick={() => setPendingDeleteId(asset.id)}
                              className="absolute right-1 top-1 hidden rounded bg-white/90 p-1 text-slate-500 hover:text-rose-600 group-hover:block"
                            >
                              <Trash2 size={11} />
                            </button>
                          )
                        )}
                        <div className="mt-0.5 truncate text-center text-[9.5px] text-slate-400">
                          {ASSET_SOURCE_LABEL[asset.source] ?? asset.source}
                          {asset.tags && asset.tags.length > 0 ? ` · ${asset.tags[0]}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </div>
    </div>
  );
}
