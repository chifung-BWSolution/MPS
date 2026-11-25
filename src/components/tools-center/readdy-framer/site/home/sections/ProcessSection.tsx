const steps = [
  {
    number: '01',
    title: '了解需要',
    description: '收集日期、場地、活動性質、賓客人數、期望氣氛及必須出現的環節。',
  },
  {
    number: '02',
    title: '配對方案',
    description: '提供合適的演出形式、曲風、時長、技術配置及預算選項。',
  },
  {
    number: '03',
    title: '確認細節',
    description: '與客戶、場地及相關供應商核對進場、走位、用電、聲量、彩排及流程表。',
  },
  {
    number: '04',
    title: '現場執行',
    description: '演出及技術團隊按已確認的安排到場，配合現場節奏完成每一個環節。',
  },
];

export default function ProcessSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-100">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-16 items-start">
          {/* Left: intro text */}
          <div>
            <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950 mb-5">
              不只安排演出，更統籌整個現場
            </h2>
            <p className="text-sm md:text-base text-foreground-600 leading-relaxed mb-6">
              我們不只安排一位表演者，而是先理解賓客、場地、活動目標和流程重點，再配對合適編制、曲風與技術配置。
            </p>
            <p className="text-sm md:text-base text-foreground-600 leading-relaxed">
              從迎賓酒會、嘉賓進場、頒獎、敬酒到壓軸互動，每一段音樂都有清楚角色，讓主辦方可以安心招待每一位賓客。
            </p>
          </div>

          {/* Right: steps */}
          <div className="space-y-6">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="flex gap-4 md:gap-5 items-start p-4 md:p-5 bg-background-50 rounded-lg border border-background-200/70"
              >
                <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary-500 flex items-center justify-center">
                  <span className="font-heading text-sm md:text-base font-bold text-background-50">
                    {step.number}
                  </span>
                </div>
                <div>
                  <h3 className="font-heading text-base md:text-lg font-semibold text-foreground-950 mb-1">
                    {step.title}
                  </h3>
                  <p className="text-sm text-foreground-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}