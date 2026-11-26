import { useMemo, useRef, useState } from 'react';
import { Copy, ImageOff, Images, Loader2, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ContentAsset } from '@/lib/contentTypes.ts';
import { useSocialLibrary } from '@/hooks/useSocialLibrary.ts';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';

const SOURCE_LABEL: Record<string, string> = {
  upload: '上傳',
  ai_generated: 'AI 生成',
  vector: '圖卡',
};

export function LibraryView({}: ContentViewProps) {
  const { assets, urls, loading, error, missingSchema, acting, refresh, upload, updateMeta, remove } =
    useSocialLibrary();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<ContentAsset | null>(null);
  const [tagsDraft, setTagsDraft] = useState('');
  const [altDraft, setAltDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ContentAsset | null>(null);
  const [preview, setPreview] = useState<ContentAsset | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const asset of assets) for (const tag of asset.tags) set.add(tag);
    return [...set].sort((left, right) => left.localeCompare(right));
  }, [assets]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (activeTags.length > 0 && !activeTags.every((tag) => asset.tags.includes(tag))) return false;
      if (!keyword) return true;
      return (
        (asset.filename ?? '').toLowerCase().includes(keyword) ||
        (asset.alt ?? '').toLowerCase().includes(keyword)
      );
    });
  }, [assets, activeTags, search]);

  const handleFiles = async (files: FileList | File[]) => {
    const result = await upload(files);
    if (result.uploaded > 0) toast.success(`已上傳 ${result.uploaded} 張`);
    if (result.failed > 0) toast.error(`${result.failed} 張上傳失敗`);
  };

  const openEdit = (asset: ContentAsset) => {
    setEditing(asset);
    setTagsDraft(asset.tags.join(', '));
    setAltDraft(asset.alt ?? '');
  };

  const saveMeta = async () => {
    if (!editing) return;
    try {
      const tags = tagsDraft
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      await updateMeta(editing.id, { tags, alt: altDraft.trim() || null });
      toast.success('素材資訊已更新');
      setEditing(null);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '更新失敗');
    }
  };

  const copyUrl = async (asset: ContentAsset) => {
    const url = urls[asset.id];
    if (!url) {
      toast.error('尚未取得下載連結，請重新整理');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('已複製圖片連結（1 小時有效）');
    } catch {
      toast.error('瀏覽器阻擋了剪貼簿');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove(pendingDelete.id);
      toast.success('已刪除素材');
      setPendingDelete(null);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '刪除失敗');
    }
  };

  const renderBody = () => {
    if (missingSchema) {
      return <ContentEmptyState title="功能尚未啟用" description="資料表尚未建立；請先執行 content migration。" />;
    }
    if (loading && assets.length === 0) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-48 animate-pulse rounded-lg border bg-white" />
          ))}
        </div>
      );
    }
    if (error && assets.length === 0) {
      return (
        <ContentEmptyState
          tone="error"
          title="讀取素材失敗"
          description={error}
          action={<Button size="sm" variant="outline" onClick={() => void refresh()}>重試</Button>}
        />
      );
    }
    if (assets.length === 0) {
      return (
        <ContentEmptyState
          icon={Images}
          title="還沒有素材"
          description="上傳品牌圖片；文章封面與導流圖都會從這裡挑。"
          action={
            <Button size="sm" onClick={() => inputRef.current?.click()}>
              <Upload size={13} /> 上傳第一張
            </Button>
          }
        />
      );
    }
    if (filtered.length === 0) {
      return (
        <ContentEmptyState
          title="沒有符合條件的素材"
          description="清除搜尋或標籤篩選再試一次。"
          action={
            <Button size="sm" variant="outline" onClick={() => { setSearch(''); setActiveTags([]); }}>
              清除篩選
            </Button>
          }
        />
      );
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((asset) => (
          <article
            key={asset.id}
            className="group overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card"
          >
            <button
              type="button"
              onClick={() => setPreview(asset)}
              className="relative block h-36 w-full overflow-hidden bg-slate-50"
            >
              {urls[asset.id] ? (
                <img
                  src={urls[asset.id]}
                  alt={asset.alt ?? asset.filename ?? ''}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageOff size={22} />
                </span>
              )}
              <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-[1px] text-[10px] font-semibold text-white">
                {SOURCE_LABEL[asset.source] ?? asset.source}
              </span>
            </button>
            <div className="space-y-1 p-2.5">
              <p className="truncate text-[12px] font-semibold text-[#0d1a2d]" title={asset.filename ?? ''}>
                {asset.filename || '（未命名）'}
              </p>
              <p className="truncate text-[10.5px] text-muted-foreground" title={asset.alt ?? ''}>
                {asset.alt || '未填 alt'}
              </p>
              <div className="flex flex-wrap gap-1">
                {asset.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded bg-slate-100 px-1.5 py-[1px] text-[10px] text-slate-600">
                    {tag}
                  </span>
                ))}
                {asset.tags.length > 4 && (
                  <span className="text-[10px] text-slate-400">+{asset.tags.length - 4}</span>
                )}
              </div>
              <div className="flex items-center justify-end gap-0.5 pt-0.5">
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10.5px]" onClick={() => void copyUrl(asset)}>
                  <Copy size={11} /> 連結
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10.5px]" onClick={() => openEdit(asset)}>
                  <Pencil size={11} /> 編輯
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10.5px] text-rose-600 hover:text-rose-700"
                  onClick={() => setPendingDelete(asset)}
                >
                  <Trash2 size={11} />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  };

  return (
    <div
      className="space-y-4"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length > 0) void handleFiles(event.dataTransfer.files);
      }}
    >
      <ContentPageHeader
        title="素材庫"
        subtitle="上傳、標籤與換圖；文章封面與導流圖都從這裡挑。"
        actions={
          <>
            <Button size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()} disabled={acting === 'upload'}>
              {acting === 'upload' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              上傳圖片
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
              <Loader2 size={13} className={loading ? 'animate-spin' : 'hidden'} />
              重新整理
            </Button>
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
            <span>共 {assets.length} 張</span>
            <span>拖放圖片到頁面任何位置即可上傳</span>
          </div>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) void handleFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋檔名或 alt"
            className="h-9 bg-white pl-8 text-[13px]"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {allTags.slice(0, 12).map((tag) => {
              const active = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setActiveTags((previous) =>
                      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag],
                    )
                  }
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                    active
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-[rgba(13,26,45,0.12)] bg-white text-slate-600 hover:border-teal-300',
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {dragging && (
        <div className="rounded-lg border-2 border-dashed border-teal-400 bg-teal-50/60 px-4 py-6 text-center text-[12px] font-semibold text-teal-700">
          放開即可上傳
        </div>
      )}

      {renderBody()}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (!open ? setEditing(null) : undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>編輯素材資訊</DialogTitle>
            <DialogDescription>標籤用逗號分隔；alt 會用於圖片無障礙與 SEO。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[12px] font-semibold text-slate-600">標籤</span>
              <Input value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} placeholder="辦公室, 封面" className="h-9 bg-white text-[13px]" />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-semibold text-slate-600">Alt 文字</span>
              <Textarea value={altDraft} onChange={(event) => setAltDraft(event.target.value)} className="min-h-[70px] bg-white text-[13px]" />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={() => void saveMeta()}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => (!open ? setPendingDelete(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>刪除這張素材？</DialogTitle>
            <DialogDescription>檔案會從 Storage 一併移除；已引用它的文章不會被刪。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>取消</Button>
            <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => void confirmDelete()} disabled={!!acting}>
              刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => (!open ? setPreview(null) : undefined)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.filename || '素材預覽'}</DialogTitle>
          </DialogHeader>
          {preview && urls[preview.id] ? (
            <img src={urls[preview.id]} alt={preview.alt ?? ''} className="max-h-[70vh] w-full object-contain" />
          ) : (
            <p className="text-[12px] text-muted-foreground">沒有可預覽的圖片。</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
