const topics = [
  {
    title: '演出與技術',
    text: '樂隊、歌手、駐場、音響、燈光和 LED，由同一個團隊執行。',
  },
  {
    title: '歌單與流程',
    text: '按賓客、氣氛，以及進場、致辭、敬酒、頒獎等環節編排。',
  },
  {
    title: '不同場合',
    text: '婚禮、晚宴、VIP、餐廳和商場，各自用不同的演出形式。',
  },
  {
    title: '服務範圍',
    text: '全港酒店、會所、餐廳、商場、遊船、學校禮堂和戶外場地。',
  },
  {
    title: '報價',
    text: '按演出人員、器材、運輸和現場支援分開列明。',
  },
];

export default function SeoContentSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950 mb-8 md:mb-12">
          香港現場音樂演出與活動統籌
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {topics.map((topic) => (
            <article
              key={topic.title}
              className="bg-background-100 border border-background-200/70 rounded-lg p-5 md:p-6"
            >
              <h3 className="font-heading text-base md:text-lg font-semibold text-foreground-950 mb-2">
                {topic.title}
              </h3>
              <p className="text-sm text-foreground-600 leading-relaxed">{topic.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
