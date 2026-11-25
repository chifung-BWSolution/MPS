import { Link } from '../../routerShim';

const contexts = [
  {
    title: '婚禮需要的是專屬回憶',
    description:
      '我們為證婚、迎賓、進場、敬酒、first dance 和 After Party 編排音樂。讓每一個儀式都有剛剛好的情緒。',
    path: '/wedding-performance/',
    accent: 'bg-accent-500',
  },
  {
    title: '企業活動需要的是節奏與信心',
    description:
      '從嘉賓入場、開場、頒獎、抽獎到壓軸表演，音樂和技術都要配合。讓品牌訊息更容易被記住。',
    path: '/annual-dinner/',
    accent: 'bg-primary-500',
  },
  {
    title: '高端款待需要的是分寸',
    description:
      '在 CEO dinner、品酒會和私人晚宴中，演出以不搶去談話空間為原則。我們用細緻選曲，提升賓客感受。',
    path: '/vip-reception/',
    accent: 'bg-secondary-500',
  },
];

export default function ContextSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8 md:mb-16">
          <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950 mb-4">
            用音樂切合不同場合
          </h2>
          <p className="text-sm md:text-base text-foreground-600 max-w-2xl mx-auto">
            不同場合需要不同的音樂語言。我們按活動性質和賓客輪廓，設計最貼合的現場音樂。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {contexts.map((ctx) => (
            <div
              key={ctx.path}
              className="bg-background-50 border border-background-200/70 rounded-lg p-6 md:p-8 hover:border-primary-300 transition-all duration-300"
            >
              <div className={`w-10 h-1 rounded-full mb-5 ${ctx.accent}`} />
              <h3 className="font-heading text-lg md:text-xl font-semibold text-foreground-950 mb-3">
                {ctx.title}
              </h3>
              <p className="text-sm text-foreground-600 leading-relaxed mb-5">
                {ctx.description}
              </p>
              <Link
                to={ctx.path}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                查看適合您的活動方案
                <i className="ri-arrow-right-line" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}