/**
 * 關鍵字選取器（IMPLEMENTATION-CONTRACT §4）
 *
 *   KeywordSelect({ siteId, value, onChange, onlyBacklog = true,
 *                   placeholder, disabled, className })
 *
 * 資料安全規則（PRD §6.2.2）：
 *   自動生成只會挑 `pipeline_status = 'backlog'` 的詞；NULL（未啟用）的歷史詞
 *   一律視為不可用。因此 onlyBacklog 預設 true，下拉只列已明確啟用的詞，
 *   並在清單下方標明原因，避免使用者以為「找不到詞」是系統壞了。
 *
 * 這裡自己載入（與 SiteSelect 相同的模式），只查需要的欄位並限制 1000 筆，
 * 不經過 useContentKeywords 的全量載入，讓排程表／文章頁可以輕量使用。
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isContentSchemaMissing, contentErrorMessage } from '@/lib/contentApi.ts';
import type { ContentKeyword } from '@/lib/contentTypes.ts';
import {
  CONTENT_KEYWORD_COLUMNS,
  compareContentKeywords,
  keywordPriorityLabel,
  keywordSourceLabel,
  mapContentKeywordRow,
  type ContentKeywordDbRow,
} from '@/hooks/useContentKeywords';
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

export interface KeywordSelectProps {
  siteId: string | null;
  value: string | null;
  onChange: (keywordId: string | null) => void;
  /** 只列 pipeline_status='backlog'（預設 true；false 時列全部詞） */
  onlyBacklog?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const MAX_OPTIONS = 1000;

export function KeywordSelect({
  siteId,
  value,
  onChange,
  onlyBacklog = true,
  placeholder = '選擇關鍵字…',
  disabled = false,
  className,
}: KeywordSelectProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ContentKeyword[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  /** value 不在清單內（例如 slot 已指派非 backlog 的詞）時的顯示備援 */
  const [fallback, setFallback] = useState<ContentKeyword | null>(null);

  useEffect(() => {
    if (!siteId) {
      setItems([]);
      setLoading(false);
      setError(null);
      setMissingSchema(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const query = supabase
      .from('seo_keywords')
      .select(CONTENT_KEYWORD_COLUMNS)
      .eq('website_profile_id', siteId)
      .order('priority', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(MAX_OPTIONS);

    const filtered = onlyBacklog ? query.eq('pipeline_status', 'backlog') : query;

    void filtered.then(({ data, error: queryError }) => {
      if (cancelled) return;
      if (queryError) {
        if (isContentSchemaMissing(queryError)) {
          setMissingSchema(true);
          setError(null);
        } else {
          setMissingSchema(false);
          setError(contentErrorMessage(queryError));
        }
        setItems([]);
      } else {
        const rows = ((data || []) as unknown as ContentKeywordDbRow[]).map(
          mapContentKeywordRow,
        );
        rows.sort(compareContentKeywords);
        setItems(rows);
        setMissingSchema(false);
        setError(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [onlyBacklog, siteId]);

  // value 不在目前清單時，補查一次它的顯示名稱（不影響可選清單）
  useEffect(() => {
    if (!siteId || !value || items.some((item) => item.id === value)) {
      setFallback(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('seo_keywords')
      .select('id, website_profile_id, keyword, priority, source, pipeline_status, cluster')
      .eq('id', value)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (cancelled || queryError || !data) return;
        setFallback(mapContentKeywordRow(data as unknown as ContentKeywordDbRow));
      });
    return () => {
      cancelled = true;
    };
  }, [items, siteId, value]);

  const selected = useMemo(
    () => items.find((item) => item.id === value) ?? (fallback?.id === value ? fallback : null),
    [fallback, items, value],
  );

  const triggerLabel = selected?.keyword?.trim() || (value ? '已選關鍵字' : placeholder);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="選擇關鍵字"
          disabled={disabled || !siteId}
          className={cn(
            'h-9 w-full justify-between gap-2 bg-white px-3 text-[13px] font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {siteId ? triggerLabel : '請先選擇站點'}
          </span>
          {loading ? (
            <Loader2 size={13} className="shrink-0 animate-spin opacity-60" />
          ) : (
            <ChevronsUpDown size={13} className="shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[120] w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="搜尋關鍵字…" className="h-9 text-[13px]" />
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              載入關鍵字…
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center text-[12px] text-rose-600">{error}</div>
          ) : missingSchema ? (
            <div className="px-3 py-6 text-center text-[12px] text-amber-700">
              功能尚未啟用：關鍵字資料表尚未建立。
            </div>
          ) : (
            <CommandList>
              <CommandEmpty className="text-[13px]">
                {onlyBacklog ? '此站沒有已啟用的關鍵字（backlog）' : '此站沒有關鍵字'}
              </CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={[
                      item.keyword,
                      item.cluster ?? '',
                      item.normalized_keyword,
                      keywordSourceLabel(item.source),
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    className="gap-2 text-[13px]"
                    onSelect={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      size={13}
                      className={cn(
                        'shrink-0',
                        value === item.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.keyword}</span>
                    <span className="shrink-0 text-[10px] font-medium text-slate-400">
                      {keywordPriorityLabel(item.priority)} · {keywordSourceLabel(item.source)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {value && (
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    className="gap-2 text-[12px] text-slate-500"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <X size={13} className="shrink-0" />
                    清除選擇
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          )}
        </Command>
        {onlyBacklog && !loading && !error && !missingSchema && (
          <div className="border-t border-[rgba(13,26,45,0.08)] px-3 py-1.5 text-[10px] leading-relaxed text-slate-400">
            只顯示「已啟用自動生成」（pipeline_status = backlog）的關鍵字；未啟用的歷史詞（NULL）不會被排入生成。
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
