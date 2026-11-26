import { useEffect, type ReactNode } from 'react';
import Home from './home/page';
import ServicesPage from './services/page';
import { SiteRouter } from './routerShim';
import './site.css';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@300;400;500;700&family=Noto+Serif+HK:wght@400;600;700&display=swap';
const ICON_HREF = 'https://cdnjs.cloudflare.com/ajax/libs/remixicon/4.5.0/remixicon.min.css';

function ensureStylesheet(id: string, href: string) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function useSiteAssets() {
  useEffect(() => {
    ensureStylesheet('readdy-site-fonts', FONT_HREF);
    ensureStylesheet('readdy-site-icons', ICON_HREF);
  }, []);
}

export function FaithfulHomeFrame() {
  useSiteAssets();
  return (
    <div className="readdy-site min-h-[720px]">
      <SiteRouter>
        <Home />
      </SiteRouter>
    </div>
  );
}

export function FaithfulServicesFrame() {
  useSiteAssets();
  return (
    <div className="readdy-site min-h-[720px]">
      <SiteRouter pathname="/services/">
        <ServicesPage />
      </SiteRouter>
    </div>
  );
}

export function faithfulPagePreview(path: string | undefined, rawCode: string): ReactNode {
  const normalized = (path || '').replace(/\/+$/, '') || '/';
  if (
    (normalized === '/' || normalized === '/cn') &&
    rawCode.includes('讓現場音樂，成為賓客記得住的部分') &&
    rawCode.includes('婚禮、企業晚宴、VIP 接待、餐廳、商場和節日活動的現場音樂統籌。')
  ) {
    return <FaithfulHomeFrame />;
  }
  if (normalized === '/services' || normalized === '/cn/services') {
    return <FaithfulServicesFrame />;
  }
  if (
    !rawCode.includes('讓現場音樂，成為賓客記得住的部分') &&
    rawCode.includes('按您的活動氣氛，配對最合適的表演服務')
  ) {
    return <FaithfulServicesFrame />;
  }
  return undefined;
}
