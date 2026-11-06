import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, ExternalLink, ImageIcon, Loader2, Maximize2, Pencil, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/components/ui/crud-modal';
import { FixedOverlay } from '@/components/ui/fixed-overlay';
import { useQuotationDocs } from '@/hooks/useQuotationDocs';
import {
  COMPLETION_PHOTO_DOC_TYPE_ID,
  completionPhotoFileError,
  completionPhotosFromDocs,
  type QuotationDoc,
} from '@/lib/quotationDocs';
import { cn } from '@/lib/utils';

const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif';

async function downloadPhoto(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('下載失敗');
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'photo';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function PhotoActionButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-sm transition-transform hover:scale-105 hover:bg-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CompletionPhotoPreview({
  photos,
  index,
  onIndexChange,
}: {
  photos: readonly QuotationDoc[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const preview = index != null ? photos[index] : undefined;

  useEffect(() => {
    if (index != null && index >= photos.length) onIndexChange(null);
  }, [photos.length, index, onIndexChange]);

  useEffect(() => {
    if (index == null || photos.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onIndexChange(null);
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onIndexChange((index - 1 + photos.length) % photos.length);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onIndexChange((index + 1) % photos.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, index, onIndexChange]);

  if (!preview || index == null) return null;

  const handleDownload = () => {
    void downloadPhoto(preview.fileUrl, preview.fileName).catch((err) => {
      toast.error(err instanceof Error ? err.message : '下載失敗');
    });
  };

  return (
    <FixedOverlay
      className="flex items-center justify-center bg-black/80 p-4"
      onClick={() => onIndexChange(null)}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3 text-white">
          <p className="min-w-0 truncate text-[13px]">{preview.fileName}</p>
          <div className="flex items-center gap-2 shrink-0">
            <PhotoActionButton label={`下載 ${preview.fileName}`} onClick={handleDownload}>
              <Download size={14} />
            </PhotoActionButton>
            <PhotoActionButton
              label={`在新分頁開啟 ${preview.fileName}`}
              onClick={() => window.open(preview.fileUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink size={14} />
            </PhotoActionButton>
            <button
              type="button"
              aria-label="關閉預覽"
              onClick={() => onIndexChange(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-800"
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <img
          src={preview.fileUrl}
          alt={preview.fileName}
          className="max-h-[calc(92vh-64px)] w-full object-contain"
        />
        {photos.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3 text-[12px] text-white/80">
            <button
              type="button"
              className="rounded-md px-2 py-1 hover:bg-white/10"
              onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}
            >
              上一張
            </button>
            <span>
              {index + 1} / {photos.length}
            </span>
            <button
              type="button"
              className="rounded-md px-2 py-1 hover:bg-white/10"
              onClick={() => onIndexChange((index + 1) % photos.length)}
            >
              下一張
            </button>
          </div>
        )}
      </div>
    </FixedOverlay>
  );
}

export function CompletionPhotosSection({ projectId }: { projectId: string }) {
  const { rows, loading, error, addDoc, deleteDoc } = useQuotationDocs(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<QuotationDoc | null>(null);

  const photos = useMemo(() => completionPhotosFromDocs(rows), [rows]);

  const openPicker = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = [...fileList];
    if (!files.length || uploading) return;
    if (inputRef.current) inputRef.current.value = '';

    setUploading(true);
    let uploaded = 0;
    const failures: string[] = [];
    for (const file of files) {
      const fileError = completionPhotoFileError(file);
      if (fileError) {
        failures.push(`${file.name}：${fileError}`);
        continue;
      }
      const { error: addErr } = await addDoc({
        docTypeId: COMPLETION_PHOTO_DOC_TYPE_ID,
        fileName: file.name,
        fileUrl: '',
        storagePath: '',
        file,
      });
      if (addErr) failures.push(`${file.name}：${addErr.message}`);
      else uploaded += 1;
    }
    setUploading(false);

    if (uploaded > 0) toast.success(uploaded === 1 ? '已上傳 1 張完工相片' : `已上傳 ${uploaded} 張完工相片`);
    if (failures.length > 0) {
      const extra = failures.length > 1 ? `（另有 ${failures.length - 1} 個失敗）` : '';
      toast.error(`${failures[0]}${extra}`);
    }
  };

  const handleDownload = async (photo: QuotationDoc) => {
    try {
      await downloadPhoto(photo.fileUrl, photo.fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '下載失敗');
    }
  };

  const openInNewTab = (photo: QuotationDoc) => {
    window.open(photo.fileUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const removedIndex = photos.findIndex((photo) => photo.id === deleting.id);
    const { error: delErr } = await deleteDoc(deleting.id);
    if (delErr) {
      toast.error(`刪除失敗：${delErr.message}`);
      return;
    }
    toast.success('已刪除相片');
    setDeleting(null);
    setPreviewIndex((current) => {
      if (current == null || removedIndex < 0) return current;
      if (current === removedIndex) return null;
      if (current > removedIndex) return current - 1;
      return current;
    });
    if (photos.length <= 1) setEditing(false);
  };

  const showUploader = editing || photos.length === 0;

  return (
    <section className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-50 text-teal-700 shrink-0">
            <ImageIcon size={15} />
          </span>
          <h3 className="text-[14px] font-semibold text-foreground truncate">
            完工相片
            <span className="ml-1.5 font-medium text-muted-foreground">({photos.length})</span>
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {photos.length > 0 && (
            <button
              type="button"
              onClick={openPicker}
              title="可一次選擇多個圖片"
              disabled={uploading}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              上傳
            </button>
          )}
          {photos.length > 0 && (
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-[13px] transition-colors',
                editing
                  ? 'text-teal-700 bg-teal-50 hover:bg-teal-100'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )}
            >
              <Pencil size={14} />
              {editing ? '完成' : '編輯'}
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="sr-only"
        aria-label="上傳完工相片"
        onChange={(event) => {
          if (event.target.files) void uploadFiles(event.target.files);
        }}
      />

      {error && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          無法載入完工相片：{error}
        </div>
      )}

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-[148px] w-[200px] shrink-0 rounded-lg bg-muted/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="group relative h-[148px] w-[200px] shrink-0 overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-muted"
            >
              <button
                type="button"
                className="block h-full w-full"
                aria-label={`預覽 ${photo.fileName}`}
                onClick={() => setPreviewIndex(index)}
              >
                <img src={photo.fileUrl} alt={photo.fileName} draggable={false} className="h-full w-full object-cover" />
              </button>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <div className="pointer-events-none flex items-center gap-2">
                  <PhotoActionButton
                    label={`下載 ${photo.fileName}`}
                    className="pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
                    onClick={() => void handleDownload(photo)}
                  >
                    <Download size={14} />
                  </PhotoActionButton>
                  <PhotoActionButton
                    label={`放大預覽 ${photo.fileName}`}
                    className="pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
                    onClick={() => setPreviewIndex(index)}
                  >
                    <Maximize2 size={14} />
                  </PhotoActionButton>
                  <PhotoActionButton
                    label={`在新分頁開啟 ${photo.fileName}`}
                    className="pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
                    onClick={() => openInNewTab(photo)}
                  >
                    <ExternalLink size={14} />
                  </PhotoActionButton>
                </div>
              </div>
              {editing && (
                <button
                  type="button"
                  aria-label={`刪除 ${photo.fileName}`}
                  title="刪除"
                  onClick={() => setDeleting(photo)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-sm hover:bg-rose-50"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}

          {showUploader && (
            <button
              type="button"
              disabled={uploading}
              onClick={openPicker}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                void uploadFiles(event.dataTransfer.files);
              }}
              className={cn(
                'flex h-[148px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 text-center transition-colors disabled:opacity-60',
                photos.length === 0 ? 'min-w-[220px] flex-1' : 'w-[200px]',
                dragOver
                  ? 'border-teal-500 bg-teal-50 text-teal-800'
                  : 'border-[rgba(13,26,45,0.16)] bg-muted/20 text-muted-foreground hover:border-teal-400 hover:bg-teal-50/40 hover:text-teal-800',
              )}
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              <span className="text-[13px] font-medium">{uploading ? '上傳中…' : '上傳相片'}</span>
              <span className="text-[11px] leading-snug">可一次選擇多個圖片檔</span>
            </button>
          )}
        </div>
      )}

      <CompletionPhotoPreview
        photos={photos}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
      />

      <DeleteConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        itemName={deleting?.fileName || '相片'}
        canDelete
        description={`確定要刪除「${deleting?.fileName || ''}」嗎？檔案會一併從儲存空間移除。`}
      />
    </section>
  );
}
