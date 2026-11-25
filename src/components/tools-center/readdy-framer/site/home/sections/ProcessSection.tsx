const steps = [
  {
    number: '01',
    title: '了解需要',
    description: '日期、場地、人數、氣氛、必須環節',
  },
  {
    number: '02',
    title: '配對方案',
    description: '演出形式、曲風、時長、技術、預算',
  },
  {
    number: '03',
    title: '確認細節',
    description: '進場、走位、用電、聲量、彩排、流程表',
  },
  {
    number: '04',
    title: '現場執行',
    description: '按已確認的安排到場執行',
  },
];

export default function ProcessSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-100">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950 mb-8 md:mb-12">
          不只安排演出，更統籌整個現場
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {steps.map((step) => (
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
    </section>
  );
}