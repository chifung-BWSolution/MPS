import { Link } from '../../routerShim';

export default function HeroSection() {
  return (
    <section className="relative w-full min-h-[600px] md:min-h-[720px] flex items-center justify-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="https://readdy.ai/api/search-image?query=Hong%20Kong%20Chinese%20guests%20enjoying%20elegant%20live%20music%20performance%20at%20dinner%20event%2C%20Asian%20musicians%20performing%20on%20stage%2C%20warm%20golden%20ambient%20lighting%2C%20sophisticated%20dinner%20setting%2C%20soft%20bokeh%20lights%2C%20luxury%20atmosphere%2C%20editorial%20photography&width=1600&height=900&seq=hero-main-01&orientation=landscape&nocache=true"
          alt="香港音樂娛樂活動統籌中心 - 現場音樂表演"
          title="香港音樂娛樂活動統籌中心 - 現場音樂表演"
          fetchPriority="high"
          decoding="async"
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 md:px-6 pt-24 pb-16 md:pt-32 md:pb-24 text-center">
        <h1 className="font-heading text-3xl md:text-5xl lg:text-6xl font-bold text-background-50 leading-tight mb-6 animate-fade-in">
          讓現場音樂，成為賓客記得住的部分
        </h1>
        <div className="max-w-3xl mx-auto mb-8 animate-fade-in-delay-1 space-y-3">
          <p className="text-base md:text-lg text-background-200 leading-relaxed">
            一首剛剛好的進場歌，一段讓晚宴升溫的現場演奏，或一套不打擾交談的爵士組合，都能令活動變得更完整。
          </p>
          <p className="text-base md:text-lg text-background-200 leading-relaxed">
            BW Event Music 為婚禮、企業晚宴、VIP 接待、餐飲空間、商場和節日活動，統籌歌手、樂手、Live Band、排舞和音響製作。讓音樂、流程和現場節奏，由同一個團隊為你處理。
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-delay-2">
          <a
            href="https://www.emailmeform.com/builder/form/69aam00sCW063"
            target="_blank"
            rel="noopener noreferrer"
            className="px-7 py-3 bg-primary-500 text-background-50 font-medium rounded-md hover:bg-primary-600 transition-colors whitespace-nowrap text-sm md:text-base"
          >
            立即網上報價
          </a>
          <Link
            to="/services/"
            className="px-7 py-3 border border-background-300/60 text-background-50 font-medium rounded-md hover:bg-background-50/10 transition-colors whitespace-nowrap text-sm md:text-base"
          >
            查看服務一覽
          </Link>
        </div>
      </div>
    </section>
  );
}