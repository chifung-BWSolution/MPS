import { useState } from 'react';
import {
  Check,
  ExternalLink,
  Flame,
  Heart,
  MessageSquare,
  Play,
  Star,
  StickyNote,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  HOTSPOT_AD_LONG_RUNNING_DAYS,
  HOTSPOT_KIND_LABEL,
  HOTSPOT_RELATIVE_HEAT_MIN,
  safeExternalUrl,
} from '@/lib/hotspotRadar';
import { cn } from '@/lib/utils';
import type {
  HotspotFavoriteStatus,
  HotspotFeedItem,
  HotspotKind,
  HotspotMediaType,
} from '@/types/hotspotRadar';

const MEDIA_LABEL: Record<HotspotMediaType, string> = {
  reel: 'Reel',
  video: '影片',
  image: '圖文',
  carousel: '輪播',
  ad: '廣告',
  unknown: '內容',
};

const STATUS_LABEL: Record<HotspotFavoriteStatus, string> = {
  saved: '已收藏',
  used: '已用',
  dropped: '不用',
};

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '時間不詳';
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '時間不詳';
  const diff = Date.now() - time;
  if (diff < 60_000) return '剛剛';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}

function formatCount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function kindLabel(kind: HotspotKind): string {
  return HOTSPOT_KIND_LABEL[kind];
}

/**
 * IG 縮圖代理 URL（不存檔）：瀏覽器直連 IG 偶爾會被熱鏈／限流擋成非圖片，
 * 改由我們 Edge Function 即時取圖轉發（回應有 6 小時 cache，重看不打函數）。
 */
function proxyImageUrl(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z0-9_-]{5,40}$/.test(code)) return null;
  try {
    const env = (import.meta as ImportMeta & { env?: { VITE_SUPABASE_URL?: string } }).env;
    const base = (env?.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
    return base ? `${base}/functions/v1/hotspot-image?code=${encodeURIComponent(code)}&size=m` : null;
  } catch {
    return null;
  }
}

export function HotspotCard({
  item,
  canWrite,
  busy,
  onFavorite,
  onUnfavorite,
  onEditNote,
}: {
  item: HotspotFeedItem;
  canWrite: boolean;
  busy: boolean;
  onFavorite: (itemId: string, status: HotspotFavoriteStatus) => void;
  onUnfavorite: (itemId: string) => void;
  onEditNote: (item: HotspotFeedItem) => void;
}) {
  const [thumbnailBroken, setThumbnailBroken] = useState(false);
  const [thumbIndex, setThumbIndex] = useState(0);

  const isAd = item.source_kind === 'ad_keyword';
  const favorite = item.favorite;
  /** 來源沒有提供互動數（例如 IG RSS）→ 不要顯示 0 讚 0 留言誤導使用者 */
  const noEngagement = item.raw?.engagement_available === false;
  // 縮圖後備鏈：IG RSS 主圖用 /media/?size=m（穩定、免登存檔），失敗再用 size=l，
  // 最後才用 RSS 內的 CDN（簽名會過期）。全部都是外鏈，不佔我們的儲存空間。
  const thumbCandidates = (() => {
    const list: string[] = [];
    const push = (value: unknown) => {
      const safe = typeof value === 'string' ? safeExternalUrl(value) : null;
      if (safe && !list.includes(safe)) list.push(safe);
    };
    push(item.thumbnail_url);
    const providerName = String(item.raw?.provider ?? '');
    // 只有真實 IG shortcode 的來源才用 IG 後備端點（mock 的 external_id 是假的）
    if (item.source_kind === 'account' && item.external_id && ['ig_rss', 'apify'].includes(providerName)) {
      // 第二順位：走我們的圖片代理（不存檔、可繞過瀏覽器熱鏈限制）
      push(proxyImageUrl(item.external_id));
      push(`https://www.instagram.com/p/${item.external_id}/media/?size=l`);
    }
    push(item.raw?.cdn_image);
    return list;
  })();
  const thumbSrc = thumbCandidates[thumbIndex] ?? null;
  // 縱深防禦：寫庫前已過濾一次，這裡再過一次（防有人手改 DB）
  const href = safeExternalUrl(item.url);
  const isHot = isAd
    ? (item.ad_active_days ?? 0) >= HOTSPOT_AD_LONG_RUNNING_DAYS
    : (item.relative_heat ?? 0) >= HOTSPOT_RELATIVE_HEAT_MIN;

  const toggleStatus = (status: HotspotFavoriteStatus) => {
    if (!canWrite || busy) return;
    if (favorite?.status === status) {
      onUnfavorite(item.id);
      return;
    }
    onFavorite(item.id, status);
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card transition-shadow hover:shadow-card-hover">
      <div className="relative aspect-[9/16] w-full bg-slate-100">
        {thumbSrc && !thumbnailBroken ? (
          <img
            src={thumbSrc}
            alt={item.caption ?? item.author_handle ?? '熱門內容'}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => {
              if (thumbIndex + 1 < thumbCandidates.length) {
                setThumbIndex(thumbIndex + 1);
              } else {
                setThumbnailBroken(true);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
            <Play size={20} />
            <span className="text-[11px]">{MEDIA_LABEL[item.media_type]}</span>
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
            {MEDIA_LABEL[item.media_type]}
          </span>
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-medium text-white/90">
            {kindLabel(item.source_kind)}
          </span>
          {isHot && (
            <span className="inline-flex items-center gap-0.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
              <Flame size={10} />
              {isAd ? '長投爆款' : '爆款'}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {item.author_handle ? (
              <a
                href={href ?? undefined}
                target="_blank"
                rel="noreferrer noopener"
                className="block truncate text-[13px] font-semibold text-[#0d1a2d] underline-offset-2 hover:text-teal-700 hover:underline"
              >
                @{item.author_handle}
              </a>
            ) : (
              <span className="block truncate text-[13px] font-semibold text-[#0d1a2d]">
                {item.author_name ?? '未知來源'}
              </span>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{formatRelativeTime(item.posted_at)}</span>
              {isAd ? (
                <span className="font-medium text-amber-700">
                  投放 {item.ad_active_days ?? 0} 天{item.ad_status === 'active' ? '（進行中）' : ''}
                </span>
              ) : (
                <span>
                  {item.relative_heat == null
                    ? item.low_sample
                      ? '樣本不足'
                      : '—'
                    : `${item.relative_heat}× 中位數`}
                </span>
              )}
            </div>
          </div>
          <a
            href={href ?? undefined}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-teal-700"
            title="開原帖"
          >
            <ExternalLink size={14} />
          </a>
        </div>

        {item.caption && (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
            {item.caption}
          </p>
        )}

        {!isAd && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-600">
            {noEngagement ? (
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-500">
                互動數據未提供（RSS 來源）
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1">
                  <Heart size={12} className="text-rose-500" />
                  {formatCount(item.likes)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare size={12} className="text-slate-400" />
                  {formatCount(item.comments)}
                </span>
                {item.plays != null && (
                  <span className="inline-flex items-center gap-1">
                    <Play size={12} className="text-slate-400" />
                    {formatCount(item.plays)}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <Button
            size="sm"
            variant={favorite?.status === 'saved' ? 'default' : 'outline'}
            className={cn(
              'h-7 gap-1 px-2 text-[11.5px]',
              favorite?.status === 'saved' && 'bg-teal-600 text-white hover:bg-teal-700',
            )}
            disabled={!canWrite || busy}
            onClick={() => toggleStatus('saved')}
            title={canWrite ? '收藏成靈感庫' : '需要文案／市場推廣／管理層等角色'}
          >
            <Star size={12} />
            {favorite?.status === 'saved' ? STATUS_LABEL.saved : '收藏'}
          </Button>
          <Button
            size="sm"
            variant={favorite?.status === 'used' ? 'default' : 'outline'}
            className={cn('h-7 gap-1 px-2 text-[11.5px]', favorite?.status === 'used' && 'bg-slate-800 text-white hover:bg-slate-900')}
            disabled={!canWrite || busy}
            onClick={() => toggleStatus('used')}
            title="標記為已參考／已用"
          >
            <Check size={12} />
            已用
          </Button>
          <Button
            size="sm"
            variant={favorite?.status === 'dropped' ? 'default' : 'outline'}
            className={cn('h-7 gap-1 px-2 text-[11.5px]', favorite?.status === 'dropped' && 'bg-rose-600 text-white hover:bg-rose-700')}
            disabled={!canWrite || busy}
            onClick={() => toggleStatus('dropped')}
            title="標記為不需要"
          >
            <X size={12} />
            不用
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11.5px] text-slate-500"
            disabled={!canWrite || busy}
            onClick={() => onEditNote(item)}
            title="加備註（例：開頭 3 秒 hook 可抄）"
          >
            <StickyNote size={12} />
            {favorite?.note ? '備註' : '備註'}
          </Button>
        </div>

        {favorite?.note && (
          <p className="rounded bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-800">
            {favorite.note}
          </p>
        )}
      </div>
    </article>
  );
}
