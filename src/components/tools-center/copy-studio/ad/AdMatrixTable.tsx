import { Download, Table2 } from 'lucide-react';

import {
  AD_PLATFORM_RULES,
  buildAdMatrixTsv,
  buildVariantText,
  countChars,
  type AdCreativeResult,
} from '@/lib/adCreative';
import { CopyButton } from '../../shared/CopyButton';

export interface AdMatrixTableProps {
  result: AdCreativeResult;
  stale: boolean;
  onExport: () => void;
}

export function AdMatrixTable({ result, stale, onExport }: AdMatrixTableProps) {
  const rule = AD_PLATFORM_RULES[result.brief.platform];
  const rows = result.angles.flatMap((angle) =>
    (['A', 'B'] as const).map((variant) => ({
      angle,
      variant,
      copy: angle.variants[variant],
    })),
  );

  return (
    <section className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-bold">
            <Table2 size={16} className="text-teal-600" />
            文案矩陣
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {rows.length} 列 · {rule.label} · 表格同步顯示你改後的內容
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={buildAdMatrixTsv(result)} label="複製整張矩陣" disabled={stale} />
          <button
            type="button"
            onClick={onExport}
            disabled={stale}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={12} />
            匯出 CSV
          </button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-md border border-border/60">
        <table className="w-full min-w-[1080px] border-collapse text-left text-[11.5px]">
          <caption className="sr-only">文案多角度轉寫 A/B 文案矩陣</caption>
          <thead className="sticky top-0 z-10 bg-[#f5f8fc] text-[11px] text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">切角</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">版本</th>
              <th className="px-3 py-2 font-semibold">短標題</th>
              <th className="px-3 py-2 font-semibold">主文</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">CTA</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">字數</th>
              <th className="px-3 py-2 font-semibold">測試變數</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ angle, variant, copy }) => {
              const overHeadline = countChars(copy.headline) > result.brief.limits.headline;
              const overBody = countChars(copy.body) > result.brief.limits.body;
              return (
                <tr key={`${angle.id}-${variant}`} className="border-t border-border/50 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0d1a2d]">{angle.label}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-[#0d1a2d] px-1 text-[10px] font-bold text-white">
                      {variant}
                    </span>
                  </td>
                  <td className="max-w-[240px] px-3 py-2">
                    <p className={overHeadline ? 'font-medium text-rose-600' : 'text-[#0d1a2d]'} title={copy.headline}>
                      {copy.headline}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {countChars(copy.headline)} / {result.brief.limits.headline}
                    </p>
                  </td>
                  <td className="max-w-[360px] px-3 py-2">
                    <p className={overBody ? 'line-clamp-2 font-medium text-rose-600' : 'line-clamp-2 text-[#0d1a2d]'} title={copy.body}>
                      {copy.body}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {countChars(copy.body)} / {result.brief.limits.body}
                    </p>
                  </td>
                  <td className="max-w-[180px] px-3 py-2">
                    <p className="truncate text-[#0d1a2d]" title={copy.cta}>
                      {copy.cta}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {countChars(copy.cta)} / {result.brief.limits.cta}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                    {countChars(copy.headline) + countChars(copy.body) + countChars(copy.cta)}
                  </td>
                  <td className="max-w-[200px] px-3 py-2 text-[11px] text-muted-foreground">
                    <span className="line-clamp-2" title={angle.testVariable}>
                      {angle.testVariable}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <CopyButton
                      text={buildVariantText(angle, variant, result.brief.productName)}
                      label="複製此列"
                      iconOnly
                      disabled={stale}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        超長欄位以 rose 標示；匯出 CSV 會用同一份改後內容，並自動加上 UTF-8 BOM。
      </p>
    </section>
  );
}
