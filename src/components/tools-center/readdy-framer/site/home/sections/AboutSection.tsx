import { Link } from '../../routerShim';

const highlights = [
  {
    title: '一站式活動統籌',
    description:
      '由前期了解需要、配對樂手與歌手、設計歌單與流程，到現場音響工程與技術支援，全程由單一團隊跟進，減省您與多個供應商反覆溝通的時間。',
  },
  {
    title: '貼合場合的音樂語言',
    description:
      '婚禮、公司晚宴、VIP 接待、餐廳 Live 與商場節日活動對音樂的要求各有不同，我們按活動性質與賓客輪廓挑選最合適的表演形式。',
  },
  {
    title: '穩定的現場執行',
    description:
      '每場活動均備妥 run-down、cue sheet 與技術規格，並為重要場次預備後備設備與替代方案，確保音效與流程穩定。',
  },
];

const venues = [
  '酒店宴會廳',
  '私人會所',
  '餐廳與酒吧',
  '商場中庭',
  '遊船河',
  '學校禮堂',
  '戶外場地',
  '寫字樓活動空間',
];

export default function AboutSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-50">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-16 items-start">
          {/* Left: intro prose */}
          <div>
            <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950 mb-6">
              關於 BW Event Music
            </h2>
            <div className="space-y-4 text-sm md:text-base text-foreground-600 leading-relaxed">
              <p>
                BW Event Music 是一間扎根香港的音樂娛樂活動統籌中心。我們專注為不同規模的場合，配對現場音樂和技術方案。
              </p>
              <p>
                我們相信，一場活動之所以令人難忘，不在於單一表演有多精彩。關鍵是音樂是否在對的時刻出現，歌單是否貼合賓客，音量是否適合空間，流程是否流暢自然。
              </p>
              <p>
                我們的服務涵蓋現場樂隊、歌手表演、駐場歌手和表演排舞，也有音響工程、燈光和 LED 等技術製作。
              </p>
              <p>
                無論是溫馨的婚禮演出、莊重的公司周年晚宴、私密的高端款待，還是熱鬧的商場節日助慶，我們都會先了解活動目標、場地條件和賓客輪廓。然後才整合成可執行的統籌方案。
              </p>
              <p>
                多年來，我們為香港多個場地和機構提供音樂活動統籌服務。由酒店宴會廳、私人會所、餐廳、商場，到學校禮堂和戶外場地，我們累積了豐富的現場經驗。
              </p>
              <p>
                我們也建立了穩定的樂手、歌手和技術團隊網絡。讓每一次合作，都能在有限時間內交出穩定又貼題的成果。
              </p>
            </div>
          </div>

          {/* Right: highlights + venues */}
          <div className="space-y-8">
            <div className="space-y-4">
              {highlights.map((item) => (
                <div
                  key={item.title}
                  className="flex gap-4 items-start p-4 md:p-5 bg-background-100 rounded-lg border border-background-200/70"
                >
                  <div className="shrink-0 w-9 h-9 rounded-full bg-accent-500 flex items-center justify-center mt-0.5">
                    <i className="ri-check-line text-background-50 text-lg" />
                  </div>
                  <div>
                    <h3 className="font-heading text-base font-semibold text-foreground-950 mb-1.5">
                      {item.title}
                    </h3>
                    <p className="text-sm text-foreground-600 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-background-100 rounded-lg border border-background-200/70 p-5 md:p-6">
              <h3 className="font-heading text-base font-semibold text-foreground-950 mb-3">
                服務場地
              </h3>
              <p className="text-sm text-foreground-600 leading-relaxed mb-4">
                我們熟悉香港各類活動場地的聲學特性與運作規定，可按場地條件建議最合適的演出與音響方案。
              </p>
              <div className="flex flex-wrap gap-2">
                {venues.map((venue) => (
                  <span
                    key={venue}
                    className="px-3 py-1.5 bg-background-50 border border-background-200/70 rounded-full text-xs text-foreground-700 whitespace-nowrap"
                  >
                    {venue}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 md:mt-14 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://www.emailmeform.com/builder/form/69aam00sCW063"
            target="_blank"
            rel="noopener noreferrer"
            className="px-7 py-3 bg-primary-500 text-background-50 font-medium rounded-md hover:bg-primary-600 transition-colors whitespace-nowrap text-sm md:text-base"
          >
            立即網上報價
          </a>
          <Link
            to="/contact/"
            className="px-7 py-3 border border-background-300/60 text-foreground-700 font-medium rounded-md hover:bg-background-100 transition-colors whitespace-nowrap text-sm md:text-base"
          >
            聯絡我們查詢
          </Link>
        </div>
      </div>
    </section>
  );
}