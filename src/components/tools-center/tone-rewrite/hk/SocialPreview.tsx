import { AlertTriangle, MessageCircle, Share2 } from 'lucide-react';

import type { HkSocialVariant, SocialPlatform } from '@/lib/hkCantoneseRewrite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from './CopyButton';
import { HighlightedText } from './HighlightedText';

export interface SocialPreviewProps {
  variants: HkSocialVariant[];
  active: SocialPlatform;
  onChange: (platform: SocialPlatform) => void;
  stale?: boolean;
}

const PLATFORM_ICON: Record<SocialPlatform, typeof Share2> = {
  instagram: Share2,
  facebook: MessageCircle,
  xiaohongshu: Share2,
};

export function SocialPreview({ variants, active, onChange, stale = false }: SocialPreviewProps) {
  const activeVariant = variants.find((variant) => variant.platform === active) ?? variants[0];

  return (
    <section className="flex h-full flex-col rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 shadow-[0_2px_6px_rgba(0,20,40,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-bold">
            <Share2 size={16} className="text-teal-600" />
            社群口語版
          </h3>
          {activeVariant && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              字數 {activeVariant.charCount.toLocaleString()} / {activeVariant.limit.toLocaleString()}
              {' · '}
              Hashtag {activeVariant.hashtags.length}
              {activeVariant.truncated && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                  <AlertTriangle size={11} /> 已按平台上限截短
                </span>
              )}
            </p>
          )}
        </div>
        {activeVariant && (
          <CopyButton text={activeVariant.text} label="複製" disabled={stale} />
        )}
      </div>

      {variants.length === 0 ? (
        <p className="mt-6 text-center text-[12px] text-muted-foreground">未選擇平台。</p>
      ) : (
        <Tabs
          value={activeVariant?.platform}
          onValueChange={(value) => onChange(value as SocialPlatform)}
          className="mt-3 flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="h-8 shrink-0 justify-start rounded-md bg-[#f5f8fc] p-0.5">
            {variants.map((variant) => {
              const Icon = PLATFORM_ICON[variant.platform];
              return (
                <TabsTrigger
                  key={variant.platform}
                  value={variant.platform}
                  className="h-7 gap-1 rounded-[4px] px-2.5 text-[12px] data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-sm"
                >
                  <Icon size={12} />
                  {variant.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {variants.map((variant) => (
            <TabsContent key={variant.platform} value={variant.platform} className="mt-3 min-h-0 flex-1">
              <div className="flex max-h-[460px] min-h-[160px] flex-col overflow-auto rounded-md border border-border/60 bg-[#fbfdff] p-4">
                <HighlightedText
                  text={variant.text}
                  marks={variant.marks}
                  className="text-[14px] leading-relaxed text-[#0d1a2d]"
                />
              </div>
              {variant.marks.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  玫瑰色＝口語改寫（滑鼠移到標記可看原詞）；hashtag 已按平台數量附加。
                </p>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}
