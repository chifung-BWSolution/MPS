/**
 * 站點選取器（契約 §4；M1-12）
 *
 * 契約 props：
 *   interface SiteSelectProps {
 *     value: string | null;
 *     onChange: (siteId: string | null) => void;
 *     sites?: ContentSiteWithProfile[];   // 不給就自己載入
 *     allowAll?: boolean;                 // true 時有「全部站點」
 *     placeholder?: string;
 *     disabled?: boolean;
 *     className?: string;
 *   }
 *
 * 以 Popover + cmdk Command 實作可搜尋下拉；顯示 tier 與健康狀態點。
 * `value === null` 且 `allowAll` 時代表「全部站點」。
 */

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { statusTone, type ContentStatusTone } from '@/lib/contentState';
import type { ContentSiteHealth, ContentSiteWithProfile, ContentTier } from '@/lib/contentTypes';
import { useContentSites } from '@/hooks/useContentSites';

export interface SiteSelectProps {
  value: string | null;
  onChange: (siteId: string | null) => void;
  /** 不給就自己呼叫 useContentSites() 載入 */
  sites?: ContentSiteWithProfile[];
  /** true 時提供「全部站點」（value = null） */
  allowAll?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const TIER_BADGE_CLASS: Record<ContentTier, string> = {
  A1: 'bg-teal-600 text-white border-transparent',
  A2: 'bg-blue-50 text-blue-700 border-blue-200',
  B: 'bg-slate-100 text-slate-600 border-slate-200',
};

const HEALTH_DOT_CLASS: Record<ContentStatusTone, string> = {
  slate: 'bg-slate-400',
  amber: 'bg-amber-500',
  'amber-outline': 'bg-amber-500',
  teal: 'bg-teal-500',
  'teal-dark': 'bg-teal-600',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  'indigo-outline': 'bg-indigo-500',
  rose: 'bg-rose-500',
  green: 'bg-emerald-500',
  muted: 'bg-slate-300',
};

function healthDotClass(health: ContentSiteHealth): string {
  // health 是四態（untested/ok/degraded/down），由 contentState 的色票決定
  const tone = statusTone('health', health);
  return HEALTH_DOT_CLASS[tone] ?? HEALTH_DOT_CLASS.slate;
}

function tierOf(site: ContentSiteWithProfile): ContentTier {
  return site.tier === 'A1' || site.tier === 'A2' ? site.tier : 'B';
}

function HealthDot({ health }: { health: ContentSiteHealth }) {
  return (
    <span
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', healthDotClass(health))}
      title={
        health === 'ok'
          ? '健康'
          : health === 'degraded'
            ? '降級（sitemap 等非阻擋項目失敗）'
            : health === 'down'
              ? '異常（網域或憑證失敗）'
              : '尚未測試連線'
      }
    />
  );
}

function TierBadge({ tier }: { tier: ContentTier }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-1 text-[10px] font-bold leading-4',
        TIER_BADGE_CLASS[tier],
      )}
    >
      {tier}
    </span>
  );
}

interface SiteSelectViewProps extends SiteSelectProps {
  resolvedSites: ContentSiteWithProfile[];
  loading?: boolean;
  error?: string | null;
  missingSchema?: boolean;
  onRetry?: () => void;
}

function SiteSelectView({
  value,
  onChange,
  resolvedSites,
  allowAll,
  placeholder = '選擇站點',
  disabled,
  className,
  loading,
  error,
  missingSchema,
  onRetry,
}: SiteSelectViewProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => resolvedSites.find((site) => site.website_profile_id === value) ?? null,
    [resolvedSites, value],
  );
  const showAll = !value && Boolean(allowAll);

  const select = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className={cn('relative min-w-0', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            title={selected ? selected.profile?.website_name : placeholder}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-white px-3 text-left text-[13px] shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {showAll ? (
                <span className="truncate text-[#0d1a2d]">全部站點</span>
              ) : selected ? (
                <>
                  <TierBadge tier={tierOf(selected)} />
                  <HealthDot health={selected.health} />
                  <span className="truncate text-[#0d1a2d]">
                    {selected.profile?.website_name || selected.website_profile_id}
                  </span>
                </>
              ) : (
                <span className="truncate text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
        >
        <Command
          shouldFilter
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="搜尋站點名稱或網域…" />
          <CommandList>
            {loading && (
              <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
                <Loader2 size={13} className="animate-spin" /> 載入站點中…
              </div>
            )}
            {!loading && missingSchema && (
              <div className="px-3 py-3 text-[12px] text-muted-foreground">
                功能尚未啟用：內容自動化資料表尚未建立。
              </div>
            )}
            {!loading && error && (
              <div className="space-y-2 px-3 py-3">
                <p className="text-[12px] leading-relaxed text-rose-600">{error}</p>
                {onRetry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={() => onRetry()}
                  >
                    <RefreshCw size={12} /> 重試
                  </Button>
                )}
              </div>
            )}
            {!loading && !error && !missingSchema && (
              <>
                <CommandEmpty>找不到符合的站點</CommandEmpty>
                <CommandGroup>
                  {allowAll && (
                    <CommandItem
                      value="__all__ 全部站點"
                      onSelect={() => select(null)}
                      className="gap-2"
                    >
                      <span className="flex h-4 w-4 items-center justify-center">
                        {showAll && <Check size={13} className="text-teal-600" />}
                      </span>
                      <span className="text-[13px]">全部站點</span>
                    </CommandItem>
                  )}
                  {resolvedSites.map((site) => {
                    const name = site.profile?.website_name || site.website_profile_id;
                    const domain =
                      site.profile?.domain_url?.replace(/^https?:\/\//i, '').replace(/\/$/, '') ??
                      '';
                    const active = site.website_profile_id === value;
                    return (
                      <CommandItem
                        key={site.website_profile_id}
                        value={`${name} ${domain} ${site.website_profile_id}`}
                        onSelect={() => select(site.website_profile_id)}
                        className="gap-2"
                      >
                        <span className="flex h-4 w-4 items-center justify-center">
                          {active && <Check size={13} className="text-teal-600" />}
                        </span>
                        <TierBadge tier={tierOf(site)} />
                        <HealthDot health={site.health} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] leading-tight text-[#0d1a2d]">
                            {name}
                          </span>
                          {domain && (
                            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                              {domain}
                            </span>
                          )}
                        </span>
                        {site.status !== 'active' && (
                          <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">
                            {site.status === 'paused' ? '暫停' : '歸檔'}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
      </Popover>
    </div>
  );
}

/** 需要自己載入站點時的容器（hooks 只能在元件內無條件呼叫） */
function SiteSelectWithData(props: SiteSelectProps) {
  const { sites, loading, error, missingSchema, refresh } = useContentSites();
  return (
    <SiteSelectView
      {...props}
      resolvedSites={sites}
      loading={loading}
      error={error}
      missingSchema={missingSchema}
      onRetry={() => void refresh()}
    />
  );
}

export function SiteSelect(props: SiteSelectProps) {
  if (props.sites) {
    return <SiteSelectView {...props} resolvedSites={props.sites} />;
  }
  return <SiteSelectWithData {...props} />;
}
