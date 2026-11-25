import Navbar from '../feature/Navbar';
import Footer from '../feature/Footer';
import FloatingWhatsApp from '../feature/FloatingWhatsApp';
import ScrollToTopButton from '../feature/ScrollToTopButton';
import HeroSection from './sections/HeroSection';
import ServicesSection from './sections/ServicesSection';
import ProcessSection from './sections/ProcessSection';
import ContextSection from './sections/ContextSection';
import ApproachSection from './sections/ApproachSection';
import AboutSection from './sections/AboutSection';
import TestimonialsSection from './sections/TestimonialsSection';
import FaqSection from './sections/FaqSection';
import SeoContentSection from './sections/SeoContentSection';
import ScenarioGallery from '../feature/ScenarioGallery';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <ServicesSection />
        <ProcessSection />
        <ContextSection />
        <ApproachSection />
        <AboutSection />
        <TestimonialsSection />
        <section className="py-12 md:py-24 px-4 md:px-6 bg-background-50">
          <div className="max-w-7xl mx-auto">
            <ScenarioGallery
              heading="真實活動情景"
              items={[
                {
                  image: 'https://readdy.ai/api/search-image?query=Hong%20Kong%20Chinese%20bride%20and%20groom%20celebrating%20at%20wedding%20banquet%20with%20live%20band%2C%20Asian%20guests%20applauding%2C%20elegant%20ballroom%2C%20warm%20golden%20lighting%2C%20joyful%20atmosphere%2C%20editorial%20photography&width=800&height=600&seq=home-scene-01&orientation=landscape',
                  alt: '香港婚禮演出情景',
                  title: '婚禮演出',
                },
                {
                  image: 'https://readdy.ai/api/search-image?query=Hong%20Kong%20corporate%20annual%20dinner%20with%20live%20band%20on%20stage%2C%20Chinese%20employees%20celebrating%20in%20formal%20attire%2C%20warm%20golden%20spotlights%2C%20festive%20atmosphere%2C%20editorial%20photography&width=800&height=600&seq=home-scene-02&orientation=landscape',
                  alt: '香港周年晚宴情景',
                  title: '周年晚宴',
                },
                {
                  image: 'https://readdy.ai/api/search-image?query=Hong%20Kong%20Chinese%20singer%20performing%20at%20upscale%20restaurant%20with%20acoustic%20guitar%2C%20diners%20enjoying%20dinner%20and%20live%20music%2C%20warm%20candlelight%2C%20intimate%20atmosphere%2C%20editorial%20photography&width=800&height=600&seq=home-scene-03&orientation=landscape',
                  alt: '香港餐廳駐場情景',
                  title: '餐廳駐場',
                },
                {
                  image: 'https://readdy.ai/api/search-image?query=Hong%20Kong%20Chinese%20families%20enjoying%20festive%20live%20music%20at%20shopping%20mall%20celebration%2C%20colorful%20decorations%2C%20joyful%20atmosphere%2C%20editorial%20photography&width=800&height=600&seq=home-scene-04&orientation=landscape',
                  alt: '香港商場節日情景',
                  title: '商場與節日',
                },
              ]}
            />
          </div>
        </section>
        <SeoContentSection />
        <FaqSection />
      </main>
      <Footer />
      <FloatingWhatsApp />
      <ScrollToTopButton />
    </div>
  );
}