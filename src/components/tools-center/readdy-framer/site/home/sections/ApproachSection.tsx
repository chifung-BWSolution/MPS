export default function ApproachSection() {
  return (
    <section className="relative py-12 md:py-24 px-4 md:px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="https://readdy.ai/api/search-image?query=Behind%20the%20scenes%20of%20live%20event%20production%20in%20Hong%20Kong%2C%20Asian%20sound%20engineer%20at%20mixing%20console%2C%20warm%20stage%20lights%2C%20elegant%20atmosphere%2C%20professional%20event%20coordination%2C%20soft%20golden%20lighting&width=1400&height=800&seq=approach-bg-01&orientation=landscape&nocache=true"
          alt="活動統籌幕後工作"
          title="活動統籌幕後工作 - 音響工程與現場技術"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-foreground-950/80" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <h2 className="font-heading text-2xl md:text-4xl font-bold text-background-50 mb-6">
          我們的統籌方式
        </h2>
        <p className="text-sm md:text-base text-background-200 leading-relaxed mb-4 max-w-3xl mx-auto">
          我們不是只提供一位歌手或一隊樂隊。我們為每一次聚會，設計合適的聲音、節奏和現場體驗。
        </p>
        <p className="text-sm md:text-base text-background-200 leading-relaxed mb-10 max-w-3xl mx-auto">
          前期我們會了解賓客輪廓和場地限制，構思歌單和流程。演出當日，我們負責音響、燈光、LED 和現場協調。一個團隊連接表演、技術和活動節奏，讓你專心招待賓客。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-6">
          <div className="bg-background-50/10 backdrop-blur-sm border border-background-50/20 rounded-lg p-5 md:p-6">
            <div className="w-10 h-10 rounded-full bg-primary-500/80 flex items-center justify-center mx-auto mb-3">
              <i className="ri-team-line text-background-50 text-lg" />
            </div>
            <h3 className="font-heading text-base font-semibold text-background-50 mb-2">
              單一責任窗口
            </h3>
            <p className="text-sm md:text-base text-background-300 leading-relaxed">
              一個統籌團隊連接表演者、技術製作與場地，減少多供應商溝通的錯位與延誤。
            </p>
          </div>

          <div className="bg-background-50/10 backdrop-blur-sm border border-background-50/20 rounded-lg p-5 md:p-6">
            <div className="w-10 h-10 rounded-full bg-primary-500/80 flex items-center justify-center mx-auto mb-3">
              <i className="ri-file-list-3-line text-background-50 text-lg" />
            </div>
            <h3 className="font-heading text-base font-semibold text-background-50 mb-2">
              清晰流程文件
            </h3>
            <p className="text-sm md:text-base text-background-300 leading-relaxed">
              每場活動均附詳細 run-down、cue sheet 與技術規格，確保各方在現場步調一致。
            </p>
          </div>

          <div className="bg-background-50/10 backdrop-blur-sm border border-background-50/20 rounded-lg p-5 md:p-6">
            <div className="w-10 h-10 rounded-full bg-primary-500/80 flex items-center justify-center mx-auto mb-3">
              <i className="ri-shield-check-line text-background-50 text-lg" />
            </div>
            <h3 className="font-heading text-base font-semibold text-background-50 mb-2">
              風險預備與備援
            </h3>
            <p className="text-sm md:text-base text-background-300 leading-relaxed">
              重要活動預備替代方案與備用設備，以應對現場變化，確保活動順利進行。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}