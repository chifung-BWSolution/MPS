import type { ReactNode } from 'react';
import { Link } from '../routerShim';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingWhatsApp from './FloatingWhatsApp';
import ScrollToTopButton from './ScrollToTopButton';

const QUOTE_URL = 'https://www.emailmeform.com/builder/form/69aam00sCW063';

export interface BreadcrumbItem {
  label: string;
  path: string;
}

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  description?: string;
  heroImage?: string;
  heroAlt?: string;
  children: ReactNode;
  ctaText?: string;
  ctaLink?: string;
  ctaSecondaryText?: string;
  ctaSecondaryLink?: string;
  showBreadcrumb?: boolean;
  breadcrumbItems?: BreadcrumbItem[];
}

export default function PageLayout({
  title,
  subtitle,
  description,
  heroImage,
  heroAlt = '',
  children,
  ctaText = '立即網上報價',
  ctaLink = QUOTE_URL,
  ctaSecondaryText,
  ctaSecondaryLink,
  showBreadcrumb = false,
  breadcrumbItems = [],
}: PageLayoutProps) {
  const resolvedCta = ctaLink === '/online-quotation/' ? QUOTE_URL : ctaLink;
  const ctaExternal = resolvedCta.startsWith('http');
  const ctaClass =
    'px-7 py-3 bg-primary-500 text-background-50 font-medium rounded-md hover:bg-primary-600 transition-colors whitespace-nowrap text-sm md:text-base';

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="relative w-full min-h-[320px] md:min-h-[400px] flex items-end pb-10 md:pb-14 overflow-hidden">
          {heroImage ? (
            <div className="absolute inset-0">
              <img
                src={heroImage}
                alt={heroAlt}
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-foreground-900" />
          )}
          <div className="relative z-10 w-full px-4 md:px-6">
            <div className="max-w-7xl mx-auto">
              {showBreadcrumb && breadcrumbItems.length > 0 && (
                <nav className="mb-4 md:mb-5">
                  <ol className="flex items-center gap-2 text-xs md:text-sm text-background-300">
                    {breadcrumbItems.map((item, index) => (
                      <li key={item.path} className="flex items-center gap-2">
                        {index > 0 && <i className="ri-arrow-right-s-line text-background-400" />}
                        <Link to={item.path} className="hover:text-background-50 transition-colors">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              <h1 className="font-heading text-2xl md:text-4xl lg:text-5xl font-bold text-background-50 mb-3">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm md:text-base text-background-200 max-w-3xl leading-relaxed">{subtitle}</p>
              )}
            </div>
          </div>
        </section>

        <div className="px-4 md:px-6 py-10 md:py-16">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>

        <section className="px-4 md:px-6 py-12 md:py-16 bg-background-100 border-t border-background-200/70">
          <div className="max-w-3xl mx-auto text-center">
            {description && (
              <p className="text-sm md:text-base text-foreground-600 mb-6 leading-relaxed">{description}</p>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {ctaExternal ? (
                <a href={resolvedCta} target="_blank" rel="noopener noreferrer" className={ctaClass}>
                  {ctaText}
                </a>
              ) : (
                <Link to={resolvedCta} className={ctaClass}>
                  {ctaText}
                </Link>
              )}
              {ctaSecondaryText && ctaSecondaryLink && (
                <Link
                  to={ctaSecondaryLink}
                  className="px-7 py-3 border border-primary-500 text-primary-600 font-medium rounded-md hover:bg-primary-50 transition-colors whitespace-nowrap text-sm md:text-base"
                >
                  {ctaSecondaryText}
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <FloatingWhatsApp />
      <ScrollToTopButton />
    </div>
  );
}
