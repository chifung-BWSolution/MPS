const topics = [
  {
    title: '全面的演出與技術項目',
    paragraphs: [
      '我們提供現場樂隊、個人歌手、駐場歌手、爵士三重奏和弦樂組合。也有 DJ、表演排舞、司儀和互動節目。你可以按活動規模，自由組合最合適的演出陣容。',
      '技術方面，我們提供音響系統、無線麥克風、舞台燈光、LED 屏幕、影片播放和舞台配置。',
      '所有演出和技術環節，由同一個團隊負責。這樣可以減少供應商之間的資訊落差。歌手、樂手、音響和場地，都會按同一份流程表運作。',
    ],
  },
  {
    title: '度身設計的歌單與流程',
    paragraphs: [
      '我們會先了解活動目標、賓客年齡層、語言偏好和想要的氣氛，然後才建議合適的曲風和歌單。',
      '無論是廣東歌金曲、英文經典、流行派對還是輕爵士，都會配合進場、致辭、敬酒、切餅、頒獎和抽獎等環節。',
      '在我們眼中，音樂不只是背景聲。它是引導現場節奏的工具。何時該熱鬧、何時該收斂，我們都會按流程仔細安排，讓賓客自然跟隨活動推進。',
    ],
  },
  {
    title: '切合不同場合的現場音樂',
    paragraphs: [
      '婚禮演出講求情感和專屬回憶。公司周年晚宴重視節奏、品牌訊息和場面控制。VIP 接待和私人晚宴，要求音量收斂、選曲細膩。',
      '餐廳駐場的目標，是建立夜間辨識度和回頭客。商場和節日活動，則要兼顧人流、互動和拍攝效果。',
      '我們熟悉每種場合的實際需要。我們會就演出形式、編制大小和技術配置，給出貼題又務實的建議，而不是套用同一套方案。',
    ],
  },
  {
    title: '服務地區與場地經驗',
    paragraphs: [
      '我們服務全港各區。包括中環、金鐘、灣仔、銅鑼灣、尖沙咀、旺角、觀塘、沙田、荃灣、將軍澳、元朗、屯門和港島南區等地。',
      '常見場地有酒店宴會廳、私人會所、餐廳與酒吧、商場中庭、遊艇與遊船河、學校禮堂、戶外草地和寫字樓活動空間。',
      '我們熟悉各類場地的聲學特性、電力供應、運作時間和相關規定。我們會按現場條件，建議最合適的演出和音響方案。',
    ],
  },
  {
    title: '預算規劃與報價',
    paragraphs: [
      '無論是小型私人聚會，還是數百人的企業慶典，我們都可按預算提供選項。不同編制和技術配置，價錢都會不同。',
      '報價一般涵蓋演出人員、音響及技術器材、運輸、設置和現場支援。收費透明，也會清楚列明包含項目，方便你比較和規劃。',
      '如果活動流程較複雜，或涉及多個場地，我們樂意先提供初步建議和分項估算，幫你在籌備初期就掌握整體開支。',
    ],
  },
];

export default function SeoContentSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-50">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-3xl mb-8 md:mb-14">
          <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950 mb-5">
            香港現場音樂演出與活動統籌服務
          </h2>
          <p className="text-sm md:text-base text-foreground-600 leading-relaxed mb-3">
            BW Event Music 為香港各類活動提供現場音樂與技術統籌。服務對象包括新人、企業、酒店、餐廳、商場、學校和品牌機構。
          </p>
          <p className="text-sm md:text-base text-foreground-600 leading-relaxed">
            我們相信，現場音樂不只是表演，而是整體活動體驗的一部分。由迎賓的第一首歌，到壓軸的互動時刻，都需要配合流程、場地和賓客。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {topics.map((topic) => (
            <article
              key={topic.title}
              className="bg-background-100 border border-background-200/70 rounded-lg p-6 md:p-7"
            >
              <h3 className="font-heading text-lg md:text-xl font-semibold text-foreground-950 mb-4 flex items-start gap-3">
                <span className="shrink-0 w-1.5 h-6 rounded-full bg-primary-500 mt-1" />
                {topic.title}
              </h3>
              <div className="space-y-3">
                {topic.paragraphs.map((paragraph, index) => (
                  <p
                    key={index}
                    className="text-sm text-foreground-600 leading-relaxed"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 md:mt-12 max-w-4xl space-y-3">
          <p className="text-sm md:text-base text-foreground-600 leading-relaxed">
            如果你正在為婚禮、公司晚宴、VIP 接待、餐廳駐場或商場節日活動尋找現場音樂方案，歡迎先和我們分享活動日期、場地和大約人數。
          </p>
          <p className="text-sm md:text-base text-foreground-600 leading-relaxed">
            我們會就演出形式、曲風和技術配置，提供專業建議。無論你是第一次籌辦活動，還是想為每年的重點項目找一個穩定的合作團隊，我們都樂意協助。
          </p>
        </div>
      </div>
    </section>
  );
}