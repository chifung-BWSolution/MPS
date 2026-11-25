import { Link } from '../../routerShim';

const highlights = [
  {
    title: '一站式活動統籌',
    description: '樂手、歌單、音響到現場，同一團隊跟進。',
  },
  {
    title: '貼合場合的音樂語言',
    description: '按活動和賓客選擇演出形式。',
  },
  {
    title: '穩定的現場執行',
    description: '備妥流程文件，重要場次有後備。',
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
            <p className="text-sm md:text-base text-foreground-600 leading-relaxed">
              香港音樂娛樂活動統籌中心。音樂、歌單、音量和流程由同一個團隊處理。
            </p>
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