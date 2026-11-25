import { Link } from '../../routerShim';

const contexts = [
  {
    title: '婚禮',
    description: '證婚、迎賓、進場、敬酒、first dance、After Party',
    path: '/wedding-performance/',
    accent: 'bg-accent-500',
  },
  {
    title: '企業活動',
    description: '入場、開場、頒獎、抽獎到壓軸',
    path: '/annual-dinner/',
    accent: 'bg-primary-500',
  },
  {
    title: '高端款待',
    description: 'CEO dinner、品酒會、私人晚宴',
    path: '/vip-reception/',
    accent: 'bg-secondary-500',
  },
];

export default function ContextSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950 text-center mb-8 md:mb-16">
          用音樂切合不同場合
        </h2>

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