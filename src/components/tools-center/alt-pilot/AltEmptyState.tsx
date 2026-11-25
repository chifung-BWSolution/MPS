import { ClipboardCheck, Link2, ScanSearch, Sparkles } from 'lucide-react';

const STEPS = [
  {
    icon: Link2,
    title: '選站點、貼頁面 URL',
    body: '只處理公開頁面；系統會抓 title、H1–H3、正文與所有 <img>。',
  },
  {
    icon: Sparkles,
    title: '勾選圖片，生成 ALT',
    body: '整頁文案 + 圖片畫面 + 站點關鍵字一起交給模型；每批最多 6 張。',
  },
  {
    icon: ClipboardCheck,
    title: '逐張批准，匯出對照表',
    body: '批准後匯出 CSV／JSON，貼進 Framer；貼完可按「驗證已填」比對。',
  },
];

export function AltEmptyState() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-6 shadow-card">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#f0fdfa] text-[#0D9488]">
            <ScanSearch size={18} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold text-[#0d1a2d]">開始第一次 ALT 分析</h2>
            <p className="text-[12px] text-muted-foreground">選一個站點，貼上頁面 URL，先看抓到什麼再決定生成哪幾張。</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-[#f0fdfa] text-[11px] font-semibold text-[#0D9488]">
                  {index + 1}
                </span>
                <div>
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#0d1a2d]">
                    <Icon size={13} className="text-[#0D9488]" />
                    {step.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-6 shadow-card">
        <h3 className="text-[13px] font-semibold text-[#0d1a2d]">ALT Pilot 會檢查什麼</h3>
        <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
          <li>· 是否具體描述畫面（物件、材質、顏色、動作、地點）</li>
          <li>· 是否自然呼應頁面主題，而不是硬塞關鍵字</li>
          <li>· 是否與同頁其他 ALT 重複</li>
          <li>· 長度是否在 20–60 字（硬上限 125 字元）</li>
          <li>· 裝飾圖是否應該留空 <code className="rounded bg-[#f5f8fc] px-1">alt=""</code></li>
        </ul>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
          第一期只處理公開頁面的 <code>&lt;img&gt;</code>；背景圖、iframe、SVG、GIF 不在範圍。Framer 的填入是半自動，不會直接改你的專案。
        </div>
      </div>
    </div>
  );
}
