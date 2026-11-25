import { useEffect } from 'react';
import Home from './home/page';
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

export function FaithfulHomeFrame() {
  useEffect(() => {
    ensureStylesheet('readdy-site-fonts', FONT_HREF);
    ensureStylesheet('readdy-site-icons', ICON_HREF);
  }, []);

  return (
    <div className="readdy-site min-h-[720px]">
      <SiteRouter>
        <Home />
      </SiteRouter>
    </div>
  );
}
