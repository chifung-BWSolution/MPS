import { Link } from '../../routerShim';

const services = [
  {
    title: '婚禮演出',
    description: '證婚、迎賓、婚宴進場、敬酒與 After Party',
    path: '/wedding-performance/',
    image: 'https://readdy.ai/api/search-image?query=Romantic%20Hong%20Kong%20wedding%20ceremony%20with%20Chinese%20couple%20and%20elegant%20live%20music%20performance%20by%20Asian%20musicians%2C%20warm%20candlelight%2C%20intimate%20atmosphere%2C%20champagne%20and%20gold%20tones%2C%20soft%20focus%20background&width=600&height=400&seq=service-wedding-01&orientation=landscape&nocache=true',
  },
  {
    title: '周年晚宴',
    description: '開場表演、頒獎串場、公司樂隊、歌手壓軸、音響及 LED',
    path: '/annual-dinner/',
    image: 'https://readdy.ai/api/search-image?query=Corporate%20annual%20dinner%20in%20Hong%20Kong%20with%20live%20band%20of%20Asian%20musicians%2C%20Chinese%20employees%20in%20formal%20attire%2C%20elegant%20ballroom%20setting%2C%20warm%20stage%20lighting%2C%20professional%20atmosphere%2C%20sophisticated%20decor&width=600&height=400&seq=service-corporate-01&orientation=landscape&nocache=true',
  },
  {
    title: 'VIP接待',
    description: 'CEO Dinner、VVIP 晚宴、遊船河與 Wine & Music Tasting',
    path: '/vip-reception/',
    image: 'https://readdy.ai/api/search-image?query=Exclusive%20VIP%20private%20dinner%20in%20Hong%20Kong%20with%20jazz%20trio%20of%20Asian%20musicians%2C%20Chinese%20guests%2C%20intimate%20elegant%20setting%2C%20warm%20ambient%20lighting%2C%20wine%20glasses%2C%20luxury%20atmosphere&width=600&height=400&seq=service-vip-01&orientation=landscape&nocache=true',
  },
  {
    title: '餐廳與駐場',
    description: '駐場歌手、爵士組合、主題晚和餐廳音響',
    path: '/resident-singer/',
    image: 'https://readdy.ai/api/search-image?query=Upscale%20Hong%20Kong%20restaurant%20with%20live%20Asian%20singer%20performance%2C%20Chinese%20diners%20enjoying%20music%2C%20cozy%20warm%20lighting%2C%20sophisticated%20interior%20design&width=600&height=400&seq=service-restaurant-01&orientation=landscape&nocache=true',
  },
  {
    title: '商場與節日',
    description: '定時演出、互動音樂及主題節目',
    path: '/mall-performance/',
    image: 'https://readdy.ai/api/search-image?query=Shopping%20mall%20holiday%20event%20in%20Hong%20Kong%20with%20live%20music%20performance%2C%20Chinese%20families%20gathering%2C%20festive%20decorations%2C%20warm%20colorful%20lighting%2C%20family%20friendly%20atmosphere&width=600&height=400&seq=service-mall-01&orientation=landscape&nocache=true',
  },
  {
    title: '音響工程',
    description: '樂隊、司儀、影片、燈光與 LED',
    path: '/sound-engineering/',
    image: 'https://readdy.ai/api/search-image?query=Professional%20audio%20sound%20equipment%20setup%20for%20live%20event%2C%20Asian%20sound%20engineer%20at%20mixing%20console%2C%20speakers%2C%20warm%20stage%20lighting%2C%20technical%20production%20atmosphere&width=600&height=400&seq=service-sound-01&orientation=landscape&nocache=true',
  },
];

export default function ServicesSection() {
  return (
    <section className="py-12 md:py-24 px-4 md:px-6 bg-background-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-heading text-2xl md:text-4xl font-bold text-foreground-950 text-center mb-8 md:mb-16">
          我們可以為您統籌甚麼？
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {services.map((service) => (
            <Link
              key={service.path}
              to={service.path}
              className="group block bg-background-50 border border-background-200/70 rounded-lg overflow-hidden hover:border-primary-300 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="relative h-44 md:h-48 overflow-hidden">
                <img
                  src={service.image}
                  alt={service.title}
                  title={`${service.title} - 香港現場音樂活動統籌`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
              <div className="p-5">
                <h3 className="font-heading text-lg font-semibold text-foreground-950 mb-2 group-hover:text-primary-700 transition-colors">
                  {service.title}
                </h3>
                <p className="text-sm text-foreground-600 leading-relaxed">
                  {service.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}