import { cn } from '@/lib/utils';
import type { PlatformPublishKey, PlatformPublishMap } from '@/types/videoOutput';
import {
  PLATFORM_PUBLISH_LABELS,
  getPlatformUrls,
  isHttpUrl,
} from '@/lib/videoOutputUtils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PLATFORM_TAG_COLORS: Record<PlatformPublishKey, string> = {
  youtube: 'bg-red-50 text-red-700 border-red-200',
  instagram: 'bg-pink-50 text-pink-700 border-pink-200',
  facebook: 'bg-blue-50 text-blue-700 border-blue-200',
  threads: 'bg-slate-100 text-slate-700 border-slate-300',
  linkedin: 'bg-sky-50 text-sky-700 border-sky-200',
  xiaohongshu: 'bg-rose-50 text-rose-700 border-rose-200',
  douyin: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  wechat_channels: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wechat_official: 'bg-green-50 text-green-700 border-green-200',
};

type Props = {
  platformKey: PlatformPublishKey;
  platformPublish: PlatformPublishMap;
  size?: 'sm' | 'md';
};

export function PlatformPublishLinkTag({ platformKey, platformPublish, size = 'md' }: Props) {
  const label = PLATFORM_PUBLISH_LABELS[platformKey];
  const urls = getPlatformUrls(platformPublish, platformKey);
  const tagClass = cn(
    'inline-flex items-center border font-medium transition-colors',
    size === 'sm' ? 'px-1.5 py-0.5 rounded text-[10px]' : 'px-2 py-0.5 rounded-md text-[11px]',
    PLATFORM_TAG_COLORS[platformKey],
  );
  const primary = urls[0] ?? '';
  const openable = !!primary && isHttpUrl(primary);

  if (urls.length > 1) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(tagClass, 'hover:opacity-80 cursor-pointer')}
            title={`${label}（${urls.length} 條鏈接）`}
            onClick={e => e.stopPropagation()}
          >
            {label}
            <span className="ml-1 tabular-nums opacity-80">{urls.length}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-2"
          onClick={e => e.stopPropagation()}
        >
          <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">{label}</p>
          <ul className="space-y-0.5">
            {urls.map(url => {
              const hrefOk = isHttpUrl(url);
              const itemClass = 'block px-2 py-1.5 rounded text-[12px] break-all';
              return (
                <li key={url}>
                  {hrefOk ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(itemClass, 'text-teal-700 hover:bg-teal-50')}
                    >
                      {url}
                    </a>
                  ) : (
                    <span className={cn(itemClass, 'text-foreground')}>{url}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    );
  }

  if (openable) {
    return (
      <a
        href={primary}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(tagClass, 'hover:opacity-80 cursor-pointer')}
        title={`打開 ${label}`}
        onClick={e => e.stopPropagation()}
      >
        {label}
      </a>
    );
  }

  return (
    <span className={tagClass} title={primary || '尚未填寫連結'}>
      {label}
    </span>
  );
}
