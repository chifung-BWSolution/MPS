import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Link2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  AltKeywordOption,
  AltPageContext,
  AltRunRow,
  AltVerifyResult,
} from '@/lib/altTypes.ts';

export interface PageSummaryCardProps {
  page: AltPageContext;
  run: AltRunRow | null;
  keywords: AltKeywordOption[];
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  onReanalyze: () => void;
  reanalyzing: boolean;
  onVerify: () => void;
  verifying: boolean;
  verifyResult: AltVerifyResult | null;
}

export function PageSummaryCard({
  page,
  run,
  keywords,
  keyword,
  onKeywordChange,
  onReanalyze,
  reanalyzing,
  onVerify,
  verifying,
  verifyResult,
}: PageSummaryCardProps) {
  const keywordValues = new Set(keywords.map((option) => option.keyword));
  const hasCurrentKeyword = keyword && !keywordValues.has(keyword);

  return (
    <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#f0fdfa] text-[#0D9488]">
            <Globe2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#0d1a2d]">
              {page.title || run?.page_url || '未命名頁面'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Link2 size={11} />
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-[360px] truncate hover:text-[#0D9488] hover:underline"
                >
                  {page.url}
                </a>
              </span>
              <span>·</span>
              <span>{page.lang || '未知語言'}</span>
              <span>·</span>
              <span>{page.wordCount > 0 ? `${page.wordCount} 字` : '字數未計算'}</span>
              <span>·</span>
              <span>{page.imageCount} 張可處理圖片</span>
            </div>
            {page.h1 ? (
              <p className="mt-1.5 line-clamp-1 text-[12px] text-[#0d1a2d]">
                <span className="text-muted-foreground">H1：</span>
                {page.h1}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {keywords.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">主關鍵字</span>
              <Select
                value={keyword || '__none__'}
                onValueChange={(value) => onKeywordChange(value === '__none__' ? '' : value)}
              >
                <SelectTrigger className="h-8 w-[210px] bg-white text-[12px]" aria-label="主關鍵字">
                  <SelectValue placeholder="不使用關鍵字" />
                </SelectTrigger>
                <SelectContent className="z-[120]">
                  <SelectItem value="__none__">不使用關鍵字</SelectItem>
                  {hasCurrentKeyword ? (
                    <SelectItem value={keyword}>{keyword}</SelectItem>
                  ) : null}
                  {keywords.map((option) => (
                    <SelectItem key={option.id} value={option.keyword}>
                      {option.keyword}
                      {option.level === 'level_1' ? ' · S1' : option.level === 'level_2' ? ' · S2' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">此站未設定 SEO 關鍵字</span>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReanalyze}
            disabled={reanalyzing}
            className="h-8 gap-1.5 text-[12px]"
          >
            <RefreshCw size={13} className={reanalyzing ? 'animate-spin' : ''} />
            重新分析
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onVerify}
            disabled={verifying || !run}
            className="h-8 gap-1.5 bg-white text-[12px]"
          >
            <ShieldCheck size={13} />
            {verifying ? '驗證中…' : '驗證已填'}
          </Button>
        </div>
      </div>

      {page.skippedImageCount > 0 || page.backgroundImageCount > 0 || page.truncated ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {page.skippedImageCount > 0 ? `已略過 ${page.skippedImageCount} 張（SVG／GIF／1x1／重複）` : ''}
          {page.skippedImageCount > 0 && page.backgroundImageCount > 0 ? ' · ' : ''}
          {page.backgroundImageCount > 0 ? `${page.backgroundImageCount} 張背景圖未處理` : ''}
          {(page.skippedImageCount > 0 || page.backgroundImageCount > 0) && page.truncated ? ' · ' : ''}
          {page.truncated ? '圖片超過 40 張，只顯示前 40 張' : ''}
        </p>
      ) : null}

      {verifyResult ? (
        <div
          className={`mt-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${
            verifyResult.missing.length === 0
              ? 'border-teal-200 bg-teal-50 text-teal-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {verifyResult.missing.length === 0 ? (
            <CheckCircle2 size={14} />
          ) : (
            <AlertTriangle size={14} />
          )}
          {verifyResult.checked === 0
            ? '沒有已批准的 ALT 可驗證。'
            : `已寫回 ${verifyResult.matched}/${verifyResult.checked} 張。`}
          {verifyResult.missing.length > 0
            ? ` 仍有 ${verifyResult.missing.length} 張是舊值或找不到圖片。`
            : ''}
        </div>
      ) : null}

      {page.description ? (
        <p className="mt-3 line-clamp-2 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
          {page.description}
        </p>
      ) : null}
    </div>
  );
}
