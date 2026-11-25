const testimonials = [
  {
    quote:
      '證婚進場那一刻，歌手唱起我們指定的歌曲。整個場面都安靜下來，不少親友感動得流淚。由選曲、彩排到當日流程，團隊都安排得恰到好處。我們幾乎不用操心任何音樂細節。',
    name: '陳小姐',
    role: '婚禮新人',
    event: '婚禮演出',
    accent: 'bg-accent-500',
  },
  {
    quote:
      '周年晚宴的開場樂隊和壓軸歌手，把整晚節奏帶得很好。頒獎、抽獎的音樂轉場也很順。最滿意的是音響和 LED 全部由同一團隊負責，省了我們跟多個供應商溝通的時間。',
    name: '張先生',
    role: '企業活動策劃',
    event: '公司周年晚宴',
    accent: 'bg-primary-500',
  },
  {
    quote:
      '駐場歌手幫餐廳建立了一批回頭客。不少客人會專程為了聽歌來訂位。團隊很了解餐飲空間的音量控制，音樂從不會蓋過客人交談。這點對我們很重要。',
    name: '劉小姐',
    role: '餐廳負責人',
    event: '駐場歌手',
    accent: 'bg-secondary-500',
  },
  {
    quote:
      '商場節日活動要兼顧人流、拍攝和互動。團隊設計的曲目和流程，讓現場很有節日氣氛，大人小朋友都願意停下腳步。臨場應變也很到位，整個活動零失誤。',
    name: '黃小姐',
    role: '品牌營銷經理',
    event: '商場節日活動',
    accent: 'bg-accent-500',
  },
];

const stats = [
  { value: '500+', label: '累計統籌場次' },
  { value: '80+', label: '合作樂手與歌手' },
  { value: '10+', label: '服務場地類型' },
  { value: '98%', label: '客戶滿意度' },
];

export default function TestimonialsSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-100">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8 md:mb-16">
          <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950">
            客戶的評價與信賴
          </h2>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8 md:mb-16">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-background-50 border border-background-200/70 rounded-lg p-5 md:p-6 text-center"
            >
              <div className="font-heading text-2xl md:text-3xl font-bold text-primary-600 mb-1">
                {stat.value}
              </div>
              <div className="text-xs md:text-sm text-foreground-600">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {testimonials.map((item) => (
            <figure
              key={item.name}
              className="bg-background-50 border border-background-200/70 rounded-lg p-6 md:p-8 flex flex-col"
            >
              <div className={`w-10 h-1 rounded-full mb-5 ${item.accent}`} />
              <blockquote className="text-sm md:text-base text-foreground-700 leading-relaxed mb-6 flex-1">
                「{item.quote}」
              </blockquote>
              <figcaption className="flex items-center gap-3 pt-5 border-t border-background-200/70">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                  <span className="font-heading text-sm font-semibold text-primary-700">
                    {item.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground-950">{item.name}</div>
                  <div className="text-xs text-foreground-500">
                    {item.role} · {item.event}
                  </div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}