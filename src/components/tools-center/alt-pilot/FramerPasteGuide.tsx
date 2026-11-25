import { ChevronDown, ExternalLink, Info } from 'lucide-react';

export function FramerPasteGuide() {
  return (
    <details className="group rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#f0fdfa] text-[#0D9488]">
            <Info size={15} />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-[#0d1a2d]">Framer 貼上指引（半自動）</p>
            <p className="text-[11px] text-muted-foreground">
              Framer 沒有公開的伺服器端 alt API；第一期用對照表人工貼上，貼完可按「驗證已填」。
            </p>
          </div>
        </div>
        <ChevronDown size={16} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <ol className="mt-4 space-y-2 border-t border-border pt-4 text-[12px] leading-relaxed text-muted-foreground">
        <li>
          <span className="font-medium text-[#0d1a2d]">1. 匯出 CSV 或按「複製已批准」</span>
          ，檔案包含檔名、位置、現有 ALT 與建議 ALT。
        </li>
        <li>
          <span className="font-medium text-[#0d1a2d]">2. 在 Framer 開啟對應頁面</span>
          ，用檔名或圖片 URL 找到圖層；位置欄（頁首／主文／頁尾）可協助定位。
        </li>
        <li>
          <span className="font-medium text-[#0d1a2d]">3. 貼上 ALT 並 Publish</span>
          ；若是裝飾圖，將 ALT 留空（alt=""）。
        </li>
        <li>
          <span className="font-medium text-[#0d1a2d]">4. 回 ALT Pilot 按「重新分析」</span>
          ，再按「驗證已填」比對線上 alt 是否已更新。
        </li>
        <li>
          <span className="font-medium text-[#0d1a2d]">5. 若驗證仍是舊值</span>
          ，檢查是否貼到 asset 而非頁面圖層，或該圖是否由 CMS 覆寫。
        </li>
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <a
          href="https://www.framer.com/help/articles/accessibility/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[#0D9488] hover:underline"
        >
          Framer 無障礙說明
          <ExternalLink size={11} />
        </a>
        <span>· 第二期才會評估 MCP 寫入，不在本次範圍。</span>
      </div>
    </details>
  );
}
