import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Grid3X3, LayoutTemplate, Loader2, Maximize2, Minimize2, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FramerIrDesignTokens, FramerIrSection, GridConfig } from '@/types/readdyFramer';
import { captureFramerPreview } from '@/lib/readdyFramerApi';
import { SiteScrollProvider } from './site/scrollRoot';

function collapseRepeatedSections(sections: FramerIrSection[]): FramerIrSection[] {
  const seen = new Set<string>();
  const kept: FramerIrSection[] = [];
  for (const section of sections) {
    const el = section.elements || {};
    const lines = [
      el.heading,
      el.subheading,
      ...(el.paragraphs || []),
      ...(el.buttons || []).map((button) => button.label),
      ...(el.cards || []).map((card) => `${card.title}|${card.imageUrl || ''}|${card.description}`),
    ]
      .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const key = `${section.sectionKind}|${lines.join('|')}`;
    if (lines.length > 0 && seen.has(key)) continue;
    if (lines.length > 0) seen.add(key);
    kept.push(section);
  }
  return kept;
}

type CanvasDevice = 'mobile' | 'tablet' | 'desktop';

const DEVICE_OPTIONS: { id: CanvasDevice; label: string; width: number | null }[] = [
  { id: 'mobile', label: '手機', width: 390 },
  { id: 'tablet', label: 'iPad', width: 834 },
  { id: 'desktop', label: '桌面', width: null },
];

interface GridCanvasPreviewProps {
  gridConfig: GridConfig;
  designTokens?: FramerIrDesignTokens;
  sections: FramerIrSection[];
  showGridOverlay: boolean;
  onToggleGridOverlay: () => void;
  expandedCanvas?: boolean;
  onToggleExpandedCanvas?: () => void;
  hoveredSectionId: string | null;
  selectedSectionId: string | null;
  loading?: boolean;
  loadingLabel?: string;
  onHoverSection: (id: string | null) => void;
  onSelectSection: (id: string) => void;
  renderedPage?: import('@/types/readdyFramer').FramerIrPayload['renderedPage'];
  comparisonJobId?: string;
}

function readParsedLink(
  link: string | { label?: string; href?: string },
): { label: string; href?: string } {
  if (typeof link === 'string') return { label: link };
  const href = link.href && link.href !== '#' ? link.href : undefined;
  return { label: link.label || '', href };
}

function ActionLabel({
  label,
  href,
  className,
  style,
}: {
  label: string;
  href?: string;
  className?: string;
  style?: CSSProperties;
}) {
  if (href && href !== '#') {
    return (
      <a href={href} className={className} style={style}>
        {label}
      </a>
    );
  }
  return (
    <span className={className} style={style}>
      {label}
    </span>
  );
}

function imageCardColumns(
  cards: Array<{ imageUrl?: string }>,
  sectionColumns: number | undefined,
  fallback: number,
): number {
  if (cards.length >= 2 && cards.length <= 4 && cards.every((card) => card.imageUrl)) {
    return cards.length;
  }
  return Math.min(4, Math.max(1, sectionColumns || fallback));
}

function pageSurfaceColor(colors: Record<string, string> | undefined): string {
  return colors?.surface || colors?.background || '#F3EEE4';
}

function displaySectionPaint(
  section: FramerIrSection,
  designTokens: FramerIrDesignTokens | undefined,
): FramerIrSection {
  const raw = (section.background || '').trim();
  const primary = (designTokens?.colors?.primary || '').trim().toUpperCase();
  const accent = (section.accentColor || '').trim().toUpperCase();
  const rawKey = raw.toUpperCase();
  const brandFill = Boolean(rawKey) && (rawKey === primary || rawKey === accent);
  const cardHeavy = (section.elements?.cards?.length || 0) >= 3;
  if (
    !brandFill ||
    section.sectionKind === 'hero' ||
    section.sectionKind === 'navbar' ||
    (section.sectionKind === 'cta' && !cardHeavy)
  ) {
    return section;
  }
  const background = pageSurfaceColor(designTokens?.colors);
  const textIsLight = section.textColor ? !isHexDark(section.textColor) : false;
  return {
    ...section,
    background,
    textColor: textIsLight ? designTokens?.colors?.textPrimary || '#1F0000' : section.textColor,
  };
}

function isHexDark(hex: string | undefined): boolean {
  if (!hex || hex.trim().toLowerCase() === 'transparent') return true;
  const clean = hex.trim().replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return true;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.45;
}

function DesktopSectionContent({
  section,
  gridConfig,
  isOverlaidNavbar = false,
}: {
  section: FramerIrSection;
  gridConfig: GridConfig;
  isOverlaidNavbar?: boolean;
}) {
  const el = section.elements || {};
  const hasFullBleedBg =
    Boolean(el.backgroundImage) ||
    (section.sectionKind === 'hero' && Boolean(el.imageUrl && (!el.cards || el.cards.length === 0)));
  const isDarkBg = isOverlaidNavbar || hasFullBleedBg || isHexDark(section.background);
  const textColor =
    isOverlaidNavbar || hasFullBleedBg
      ? '#F9F4EE'
      : section.textColor || (isDarkBg ? '#FFFFFF' : '#1F0000');
  const accent = section.accentColor || '#B37900';
  const btnFg = '#F9F4EE';
  const containerStyle = { maxWidth: `${gridConfig.container_max_width}px` };

  if (section.sectionKind === 'navbar') {
    const navLinks = el.navLinks?.length
      ? el.navLinks
      : ['主頁', '服務一覽', '婚禮演出', '周年晚宴', '聯絡我們'];
    const ctas = el.buttons?.length
      ? el.buttons
      : [{ label: '網上報價', variant: 'primary' as const }];

    return (
      <div
        className="w-full px-6 h-20 flex items-center justify-between gap-4"
        style={
          isOverlaidNavbar
            ? { background: 'linear-gradient(180deg, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0) 100%)' }
            : undefined
        }
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: accent, color: btnFg }}
          >
            <Music2 size={17} />
          </div>
          <div className="leading-tight">
            <div className="font-serif font-bold text-[17px] tracking-tight whitespace-nowrap" style={{ color: textColor }}>
              {el.heading || 'BW Event Music'}
            </div>
            {el.brandSubtitle && (
              <div className="text-[10.5px] whitespace-nowrap" style={{ color: textColor, opacity: 0.72 }}>
                {el.brandSubtitle}
              </div>
            )}
          </div>
        </div>

        {/* Single-row full-width top-level navigation */}
        <nav className="flex items-center justify-center gap-3.5 flex-nowrap overflow-hidden">
          {navLinks.map((raw, i) => {
            const link = readParsedLink(raw);
            const style = { color: i === 0 ? accent : textColor, opacity: i === 0 ? 1 : 0.88 };
            const className = 'text-[12px] font-medium whitespace-nowrap';
            return link.href ? (
              <a key={`${link.label}-${i}`} href={link.href} className={className} style={style}>
                {link.label}
              </a>
            ) : (
              <span key={`${link.label}-${i}`} className={className} style={style}>
                {link.label}
              </span>
            );
          })}
        </nav>

        {/* Action CTAs */}
        <div className="flex items-center gap-2 shrink-0">
          {ctas.slice(0, 2).map((btn, i) => {
            const style =
              btn.variant === 'secondary' || i > 0
                ? {
                    border: `1px solid ${isDarkBg ? 'rgba(249,244,238,0.45)' : 'rgba(31,0,0,0.28)'}`,
                    color: textColor,
                  }
                : { backgroundColor: accent, color: btnFg };
            const className = 'px-3.5 py-2 rounded-md text-[12.5px] font-semibold whitespace-nowrap';
            return btn.href && btn.href !== '#' ? (
              <a key={`${btn.label}-${i}`} href={btn.href} className={className} style={style}>
                {btn.label}
              </a>
            ) : (
              <span key={`${btn.label}-${i}`} className={className} style={style}>
                {btn.label}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (section.sectionKind === 'hero') {
    const heroBgImg = el.backgroundImage || el.imageUrl;
    const paragraphSource =
      el.paragraphs && el.paragraphs.length > 0
        ? el.paragraphs
        : el.subheading
          ? el.subheading.split('\n').filter(Boolean)
          : [];
    const seenParagraphs = new Set<string>();
    const paragraphs = paragraphSource.filter((line) => {
      const text = line.trim();
      if (!text || seenParagraphs.has(text)) return false;
      seenParagraphs.add(text);
      return true;
    });

    if (heroBgImg) {
      return (
        <div className="relative w-full min-h-[720px] flex items-center justify-center overflow-hidden">
          <img
            src={heroBgImg}
            alt={el.heading || section.name}
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
          <div
            className="absolute inset-0"
            style={{ background: el.overlay || 'transparent' }}
          />
          <div className="relative z-10 mx-auto w-full px-8 pt-32 pb-24 text-center" style={containerStyle}>
            {el.badge && (
              <span
                className="inline-block px-3.5 py-1 rounded-full text-[13px] font-semibold mb-5"
                style={{ backgroundColor: `${accent}33`, color: '#F9F4EE' }}
              >
                {el.badge}
              </span>
            )}
            <h1
              className="font-serif text-[56px] font-bold leading-[1.18] max-w-4xl mx-auto text-[#F9F4EE] mb-6"
              style={{ animation: 'readdy-canvas-fade 0.8s ease-out both' }}
            >
              {el.heading || section.name}
            </h1>
            {paragraphs.length > 0 && (
              <div className="max-w-3xl mx-auto space-y-3 mb-9">
                {paragraphs.map((p, i) => (
                  <p
                    key={i}
                    className="text-[18px] leading-relaxed text-[#F9F4EE]/90"
                    style={{ animation: `readdy-canvas-rise 0.8s ease-out ${0.15 + i * 0.08}s both` }}
                  >
                    {p}
                  </p>
                ))}
              </div>
            )}
            {el.buttons && el.buttons.length > 0 && (
              <div
                className="flex items-center justify-center gap-4"
                style={{ animation: 'readdy-canvas-rise 0.8s ease-out 0.32s both' }}
              >
                {el.buttons.map((btn, i) => (
                  <ActionLabel
                    key={`${btn.label}-${i}`}
                    label={btn.label}
                    href={btn.href}
                    className="px-7 py-3 rounded-md text-[15px] font-semibold whitespace-nowrap"
                    style={
                      btn.variant === 'primary'
                        ? { backgroundColor: accent, color: btnFg }
                        : { border: '1px solid rgba(249,244,238,0.55)', color: '#F9F4EE' }
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto w-full px-8 py-24 text-center space-y-5" style={containerStyle}>
        {el.badge && (
          <span
            className="inline-block px-3.5 py-1 rounded-full text-[13px] font-semibold"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            {el.badge}
          </span>
        )}
        <h1 className="font-serif text-[50px] font-bold leading-tight max-w-3xl mx-auto" style={{ color: textColor }}>
          {el.heading || section.name}
        </h1>
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[18px] max-w-2xl mx-auto leading-relaxed" style={{ color: textColor, opacity: 0.78 }}>
            {p}
          </p>
        ))}
        {el.buttons && el.buttons.length > 0 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            {el.buttons.map((btn, i) => (
              <ActionLabel
                key={`${btn.label}-${i}`}
                label={btn.label}
                href={btn.href}
                className="px-7 py-3 rounded-md text-[15px] font-semibold"
                style={
                  btn.variant === 'primary'
                    ? { backgroundColor: accent, color: btnFg }
                    : { border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.28)' : 'rgba(31,0,0,0.25)'}`, color: textColor }
                }
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (section.sectionKind === 'logos') {
    return (
      <div className="mx-auto w-full px-8 py-12 text-center space-y-5 border-y border-black/10" style={containerStyle}>
        {el.subheading && (
          <p className="text-[13px] uppercase tracking-widest" style={{ color: textColor, opacity: 0.6 }}>
            {el.subheading}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-8 px-4">
          {(el.logos || ['Partner A', 'Partner B', 'Partner C']).map((logo, i) => (
            <span
              key={`${logo}-${i}`}
              className="text-[18px] font-bold tracking-wider"
              style={{ color: textColor, opacity: 0.72 }}
            >
              {logo}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Non-hero full-bleed background section (e.g. ApproachSection)
  if (el.backgroundImage) {
    const paragraphs =
      el.paragraphs && el.paragraphs.length > 0
        ? el.paragraphs
        : el.subheading
          ? [el.subheading]
          : [];
    const cards = el.cards || [];
    const cols = imageCardColumns(cards, section.columns, cards.length || 3);

    return (
      <div className="relative w-full py-24 overflow-hidden">
        <img
          src={el.backgroundImage}
          alt={el.heading || section.name}
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div
          className="absolute inset-0"
          style={{ background: el.overlay || 'transparent' }}
        />
        <div className="relative z-10 mx-auto w-full px-8 text-center space-y-6" style={containerStyle}>
          <h2 className="font-serif text-[36px] font-bold text-[#F9F4EE]">
            {el.heading || section.name}
          </h2>
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[16px] leading-relaxed max-w-3xl mx-auto text-[#F9F4EE]/85">
              {p}
            </p>
          ))}
          {cards.length > 0 && (
            <div
              className="grid pt-6"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: `${Math.max(20, gridConfig.gutter)}px`,
              }}
            >
              {cards.map((card, i) => (
                <div
                  key={`${card.title}-${i}`}
                  className="rounded-lg p-6 text-center space-y-2 border border-white/20 bg-white/10 backdrop-blur-sm"
                >
                  <h3 className="font-serif text-[19px] font-bold text-[#F9F4EE]">
                    {card.title}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-[#F9F4EE]/80">
                    {card.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section.sectionKind === 'features' || (el.cards && el.cards.length > 0) || (el.stats && el.stats.length > 0)) {
    const cards = el.cards || [];
    const stats = el.stats || [];
    const cols = imageCardColumns(cards, section.columns, cards.length >= 3 ? 3 : cards.length || 3);
    return (
      <div className="mx-auto w-full px-8 py-20 space-y-12" style={containerStyle}>
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="font-serif text-[36px] font-bold leading-snug" style={{ color: textColor }}>
            {el.heading || section.name}
          </h2>
          {el.subheading && (
            <p className="text-[16px] leading-relaxed" style={{ color: textColor, opacity: 0.75 }}>
              {el.subheading}
            </p>
          )}
        </div>

        {stats.length > 0 && (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${Math.min(4, stats.length)}, minmax(0, 1fr))`,
              gap: `${Math.max(16, gridConfig.gutter)}px`,
            }}
          >
            {stats.map((st, idx) => (
              <div
                key={`${st.label}-${idx}`}
                className="rounded-lg p-6 text-center"
                style={{
                  backgroundColor: isDarkBg ? 'rgba(255,255,255,0.06)' : '#F9F4EE',
                  border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(31,0,0,0.1)'}`,
                }}
              >
                <div className="font-serif text-[32px] font-bold mb-1" style={{ color: accent }}>
                  {st.value}
                </div>
                <div className="text-[14px]" style={{ color: textColor, opacity: 0.75 }}>
                  {st.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {cards.length > 0 && (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: `${Math.max(20, gridConfig.gutter)}px`,
            }}
          >
            {cards.map((card, i) => {
              const cardStyle = {
                backgroundColor: isDarkBg ? 'rgba(255,255,255,0.06)' : '#F9F4EE',
                border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(31,0,0,0.09)'}`,
              };
              const CardTag = card.href && card.href !== '#' ? 'a' : 'div';
              return (
              <CardTag
                key={`${card.title}-${i}`}
                href={card.href && card.href !== '#' ? card.href : undefined}
                className="rounded-xl overflow-hidden flex flex-col"
                style={cardStyle}
              >
                {card.imageUrl && (
                  <div className="w-full aspect-[16/10] overflow-hidden bg-black/5">
                    <img
                      src={card.imageUrl}
                      alt={card.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-6 space-y-2.5 flex-1">
                  {card.tag && !card.imageUrl && (
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-[12px] font-bold"
                      style={{ backgroundColor: `${accent}20`, color: accent }}
                    >
                      {card.tag}
                    </span>
                  )}
                  {card.title ? (
                    <h3 className="font-serif text-[20px] font-bold" style={{ color: textColor }}>
                      {card.title}
                    </h3>
                  ) : null}
                  {card.description ? (
                    <p className="text-[14px] leading-relaxed" style={{ color: textColor, opacity: 0.78 }}>
                      {card.description}
                    </p>
                  ) : null}
                  {card.tagline && (
                    <p
                      className="text-[13px] pl-3 border-l-2 pt-0.5"
                      style={{ borderColor: accent, color: textColor, opacity: 0.72 }}
                    >
                      {card.tagline}
                    </p>
                  )}
                </div>
              </CardTag>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (section.sectionKind === 'cta') {
    return (
      <div className="mx-auto w-full px-8 py-16" style={containerStyle}>
        <div
          className="rounded-2xl p-12 text-center space-y-4"
          style={{
            backgroundColor: isDarkBg ? 'rgba(255,255,255,0.06)' : `${accent}14`,
            border: `1px solid ${accent}44`,
          }}
        >
          <h2 className="font-serif text-[34px] font-bold" style={{ color: textColor }}>
            {el.heading || section.name}
          </h2>
          {el.subheading && (
            <p className="text-[16px] max-w-2xl mx-auto leading-relaxed" style={{ color: textColor, opacity: 0.8 }}>
              {el.subheading}
            </p>
          )}
          {el.buttons?.[0] && (
            <div className="pt-2">
              <ActionLabel
                label={el.buttons[0].label}
                href={el.buttons[0].href}
                className="inline-block px-7 py-3 rounded-md text-[15px] font-semibold"
                style={{ backgroundColor: accent, color: btnFg }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section.sectionKind === 'footer') {
    const lead = el.footerLead;
    const columns = el.footerColumns || [];
    const renderLink = (raw: string | { label: string; href?: string }, key: string) => {
      const link = readParsedLink(raw);
      return link.href ? (
        <a key={key} href={link.href} className="hover:underline">
          {link.label}
        </a>
      ) : (
        <span key={key}>{link.label}</span>
      );
    };
    if (lead || columns.length > 0) {
      return (
        <div className="mx-auto w-full px-8 py-10 space-y-8 text-[14px]" style={containerStyle}>
          <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
            <div className="space-y-3">
              <div className="font-serif font-bold text-[18px]" style={{ color: textColor }}>
                {el.heading || 'BW Event Music'}
              </div>
              {lead?.tagline && (
                <p className="max-w-md leading-relaxed" style={{ color: textColor, opacity: 0.72 }}>
                  {lead.tagline}
                </p>
              )}
              {el.buttons && el.buttons.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-1">
                  {el.buttons.slice(0, 2).map((button, i) => (
                    <ActionLabel
                      key={`${button.label}-${i}`}
                      label={button.label}
                      href={button.href}
                      className="px-5 py-2.5 rounded-md text-[14px] font-medium"
                      style={
                        i === 0
                          ? { backgroundColor: accent, color: btnFg }
                          : { border: `1px solid ${accent}`, color: accent }
                      }
                    />
                  ))}
                </div>
              )}
            </div>
            {(lead?.contactTitle || (lead?.contactLines && lead.contactLines.length > 0)) && (
              <div className="space-y-2">
                {lead?.contactTitle && (
                  <div className="font-semibold" style={{ color: textColor }}>
                    {lead.contactTitle}
                  </div>
                )}
                {(lead?.contactLines || []).map((line, i) => (
                  <div key={`${line.label}-${i}`} style={{ color: textColor, opacity: 0.78 }}>
                    {renderLink(line, `${line.label}-${i}`)}
                  </div>
                ))}
              </div>
            )}
            {(lead?.quickTitle || (lead?.quickLinks && lead.quickLinks.length > 0)) && (
              <div className="space-y-2">
                {lead?.quickTitle && (
                  <div className="font-semibold" style={{ color: textColor }}>
                    {lead.quickTitle}
                  </div>
                )}
                {(lead?.quickLinks || []).map((line, i) => (
                  <div key={`${line.label}-${i}`} style={{ color: textColor, opacity: 0.78 }}>
                    {renderLink(line, `${line.label}-${i}`)}
                  </div>
                ))}
              </div>
            )}
          </div>
          {columns.length > 0 && (
            <div
              className="grid gap-x-6 gap-y-8 border-t pt-8"
              style={{
                borderColor: 'rgba(0,0,0,0.08)',
                gridTemplateColumns: `repeat(${Math.min(columns.length, 5)}, minmax(0, 1fr))`,
              }}
            >
              {columns.map((column) => (
                <div key={column.title} className="space-y-2">
                  <div className="font-semibold" style={{ color: textColor }}>
                    {column.title}
                  </div>
                  {column.links.map((link, i) => (
                    <div key={`${link.label}-${i}`} style={{ color: textColor, opacity: 0.78 }}>
                      {renderLink(link, `${link.label}-${i}`)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {(el.subheading || lead?.company) && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[12px]"
              style={{ borderColor: 'rgba(0,0,0,0.08)', color: textColor, opacity: 0.62 }}
            >
              {el.subheading && <span>{el.subheading}</span>}
              {lead?.company && <span>{lead.company}</span>}
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        className="mx-auto w-full px-8 py-12 flex flex-wrap items-center justify-between gap-6 text-[14px]"
        style={containerStyle}
      >
        <div>
          <div className="font-serif font-bold text-[18px] mb-1" style={{ color: textColor }}>
            {el.heading || 'BW Event Music'}
          </div>
          <span style={{ color: textColor, opacity: 0.68 }}>
            {el.subheading || '© 2026 All rights reserved.'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-6" style={{ color: textColor, opacity: 0.78 }}>
          {(el.navLinks && el.navLinks.length > 0 ? el.navLinks : ['Services', 'Contact']).map((raw, i) => {
            const link = readParsedLink(raw);
            return link.href ? (
              <a key={`${link.label}-${i}`} href={link.href}>
                {link.label}
              </a>
            ) : (
              <span key={`${link.label}-${i}`}>{link.label}</span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full px-8 py-20 space-y-5" style={containerStyle}>
      <h2 className="font-serif text-[34px] font-bold" style={{ color: textColor }}>
        {el.heading || section.name}
      </h2>
      {el.subheading && (
        <p className="text-[16px] leading-relaxed max-w-3xl" style={{ color: textColor, opacity: 0.8 }}>
          {el.subheading}
        </p>
      )}
      {el.paragraphs?.slice(1).map((p, i) => (
        <p key={i} className="text-[16px] leading-relaxed max-w-3xl" style={{ color: textColor, opacity: 0.75 }}>
          {p}
        </p>
      ))}
      {el.imageUrl && (
        <img
          src={el.imageUrl}
          alt={el.heading || section.name}
          className="max-h-72 rounded-xl object-cover border border-black/10"
        />
      )}
      {el.buttons && el.buttons.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-2">
          {el.buttons.map((b, i) => (
            <ActionLabel
              key={`${b.label}-${i}`}
              label={b.label}
              href={b.href}
              className="px-6 py-2.5 rounded-md text-[14px] font-semibold"
              style={{ backgroundColor: accent, color: btnFg }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GridCanvasPreview({
  gridConfig,
  designTokens,
  sections,
  showGridOverlay,
  onToggleGridOverlay,
  expandedCanvas = false,
  onToggleExpandedCanvas,
  hoveredSectionId,
  selectedSectionId,
  loading = false,
  loadingLabel = '載入中',
  onHoverSection,
  onSelectSection,
  renderedPage,
  comparisonJobId,
}: GridCanvasPreviewProps) {
  const desktopWidth = Math.max(320, gridConfig.desktop_width || 1440);
  const containerRatioPct = Math.min(
    100,
    Math.max(55, Math.round(((gridConfig.container_max_width || 1200) / desktopWidth) * 100)),
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<CanvasDevice>('desktop');
  const [framerOrigin, setFramerOrigin] = useState('');
  const [comparison, setComparison] = useState<{ jobId: string; preview: Awaited<ReturnType<typeof captureFramerPreview>> } | null>(null);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const view = device === 'mobile' ? 'phone' : device;
  const screenshot = renderedPage?.images[view];
  const reviewed = comparison?.jobId === comparisonJobId ? comparison?.preview : undefined;
  const targetImage = reviewed?.images[view];
  const [viewportWidth, setViewportWidth] = useState(560);
  const [contentHeight, setContentHeight] = useState(1600);

  const frameWidth =
    DEVICE_OPTIONS.find((item) => item.id === device)?.width ?? desktopWidth;

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0) return;
      setViewportWidth(rect.width);
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [device, screenshot]);

  const scale = Math.min(1, Math.max(0.18, viewportWidth / (targetImage ? frameWidth * 2 + 8 : frameWidth)));

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.ceil(el.scrollHeight);
      if (next > 0) setContentHeight((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const images = Array.from(el.querySelectorAll('img'));
    for (const img of images) {
      if (!img.complete) img.addEventListener('load', measure);
    }
    return () => {
      ro.disconnect();
      for (const img of images) img.removeEventListener('load', measure);
    };
  }, [sections.length, Boolean(screenshot), frameWidth]);

  const scaledHeight = Math.max(460, Math.ceil(contentHeight * scale));
  const zoomPct = Math.round(scale * 100);

  const paintedSections = collapseRepeatedSections(sections);
  const firstNav = paintedSections[0]?.sectionKind === 'navbar' ? paintedSections[0] : null;
  const secondHero = paintedSections[1]?.sectionKind === 'hero' ? paintedSections[1] : null;
  const overlayNavOverHero = Boolean(
    firstNav &&
      secondHero &&
      (firstNav.background === 'transparent' ||
        Boolean(secondHero.elements?.backgroundImage)),
  );

  return (
    <div className="flex h-full min-h-[580px] xl:min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/40">
      <style>{`@keyframes readdy-canvas-fade{from{opacity:0}to{opacity:1}}@keyframes readdy-canvas-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {/* Top Toolbar */}
      <div className="px-4 py-2 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <span className="text-[12px] font-bold text-[#101B2D]">
          {renderedPage ? 'Canvas · 來源畫面' : 'Canvas · 原碼近似預覽'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            {gridConfig.container_max_width}px · {gridConfig.columns} Col · {zoomPct}%
          </span>
          {!screenshot && <button
            type="button"
            onClick={onToggleGridOverlay}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors',
              showGridOverlay
                ? 'bg-teal-50 border-[#0BB59B]/60 text-[#08967F]'
                : 'bg-white border-slate-200 text-slate-500 hover:text-[#101B2D]',
            )}
          >
            <Grid3X3 size={11} />
            <span>網格線: {showGridOverlay ? '開' : '關'}</span>
          </button>}
          {onToggleExpandedCanvas && (
            <button
              type="button"
              onClick={onToggleExpandedCanvas}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-[#101B2D] transition-colors"
              title={expandedCanvas ? '恢復圖層並排對照' : '放大預覽畫布'}
            >
              {expandedCanvas ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              <span>{expandedCanvas ? '並排' : '放大'}</span>
            </button>
          )}
        </div>
      </div>

      {renderedPage && comparisonJobId && (
        <details className="shrink-0 border-b border-slate-200 bg-white px-4 py-2 text-xs">
          <summary className="cursor-pointer font-medium">視覺覆核 · 比對 Framer 預覽</summary>
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (event) => {
            event.preventDefault();
            setComparisonBusy(true);
            setComparisonError('');
            try {
              const preview = await captureFramerPreview(comparisonJobId, framerOrigin.trim());
              setComparison({ jobId: comparisonJobId, preview });
            } catch (error) {
              setComparisonError(error instanceof Error ? error.message : '擷取 Framer 預覽失敗');
            } finally {
              setComparisonBusy(false);
            }
          }}>
            <label className="flex flex-1 flex-col gap-1">
              Framer 公開預覽網址
              <input type="url" required value={framerOrigin} onChange={(event) => setFramerOrigin(event.target.value)}
                placeholder="https://your-site.framer.website" className="rounded border border-slate-200 px-2 py-1" />
            </label>
            <button type="submit" disabled={comparisonBusy} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50">
              {comparisonBusy ? '擷取中…' : '並排比對'}
            </button>
            {targetImage && <button type="button" onClick={() => setComparison(null)} className="px-2 py-1">關閉比對</button>}
          </form>
          {comparisonError && <p role="alert" className="mt-1 text-red-700">{comparisonError}</p>}
          {reviewed && (
            <div aria-live="polite" className="mt-2 flex flex-wrap items-center gap-2">
              <span className={cn('font-semibold', reviewed.layoutReview.meetsTarget ? 'text-teal-700' : 'text-amber-700')}>
                {reviewed.layoutReview.meetsTarget ? '版面達標' : '版面待修正'}（各尺寸須達 {reviewed.layoutReview.threshold}%）
              </span>
              <span>桌面 {reviewed.layoutReview.devices.desktop.percent}%</span>
              <span>平板 {reviewed.layoutReview.devices.tablet.percent}%</span>
              <span>手機 {reviewed.layoutReview.devices.phone.percent}%</span>
              <span className="text-slate-600">
                目前尺寸 · 缺少 {reviewed.layoutReview.devices[view].missing} · 多出 {reviewed.layoutReview.devices[view].extra} · 位置或尺寸有差異 {reviewed.layoutReview.devices[view].displaced}
              </span>
              {reviewed.layoutReview.devices[view].examples.length > 0 && (
                <ul className="w-full space-y-1 text-slate-600">
                  {reviewed.layoutReview.devices[view].examples.map((item, index) => (
                    <li key={index}>
                      {item.kind === 'missing' ? '缺少或大幅移位' : item.kind === 'extra' ? '多出或大幅移位' : '位置或尺寸有差異'}
                      {' · '}{item.label}{' · '}{item.y}px
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {renderedPage.limitations.length > 0 && (
            <p className="mt-1 text-slate-600">{renderedPage.limitations.join(' · ')}</p>
          )}
        </details>
      )}

      {/* Inner Viewport Frame */}
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
          {/* Device ruler */}
          <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2 text-[11px] shrink-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-2 h-2 shrink-0 rounded-full bg-[#0BB59B]" />
              <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
                {DEVICE_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDevice(item.id)}
                    title={`${item.label} ${item.width ?? desktopWidth}px`}
                    className={cn(
                      'rounded px-2 py-0.5 font-mono text-[10.5px] font-semibold',
                      device === item.id
                        ? 'bg-[#101B2D] text-white'
                        : 'text-slate-500 hover:bg-slate-100',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="font-mono font-semibold text-[#101B2D]">{frameWidth}px</span>
            </div>
            <span className="shrink-0 text-slate-400 font-mono text-[10.5px]">
              Scale {zoomPct}% · Auto Stack
            </span>
          </div>

          {/* Scrollable Scaled Stage */}
          <div
            ref={viewportRef}
            className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white"
          >
            {loading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center bg-white">
                <Loader2 size={22} className="animate-spin text-[#0BB59B] mb-3" />
                <p className="text-[13px] font-semibold text-[#101B2D]">{loadingLabel}</p>
                <p className="text-[11.5px] text-slate-400 mt-1.5 max-w-[260px] leading-relaxed">
                  頁面準備完成後，此處會以 {desktopWidth}px 桌面等比顯示
                </p>
              </div>
            ) : screenshot ? (
              <div className={cn('mx-auto grid', targetImage && 'grid-cols-2 gap-2')} style={{ maxWidth: frameWidth * (targetImage ? 2 : 1) }}>
                <figure className="min-w-0">
                  {targetImage && <figcaption className="sticky top-0 bg-white px-2 py-1 text-xs">來源 · {frameWidth}px</figcaption>}
                  <img className="block w-full" src={screenshot} alt="來源網站畫面" />
                </figure>
                {targetImage && (
                  <figure className="min-w-0">
                    <figcaption className="sticky top-0 bg-white px-2 py-1 text-xs">Framer · {frameWidth}px</figcaption>
                    <img className="block w-full" src={`data:image/jpeg;base64,${targetImage}`} alt="Framer 預覽畫面" />
                  </figure>
                )}
              </div>
            ) : (
            <SiteScrollProvider scrollerRef={viewportRef}>
            {sections.length === 0 ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center bg-white">
                <div className="w-11 h-11 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center mb-3">
                  <LayoutTemplate size={18} className="text-slate-400" />
                </div>
                <p className="text-[13px] font-semibold text-[#101B2D]">
                  等待分析頁面
                </p>
                <p className="text-[11.5px] text-slate-400 mt-1.5 max-w-[260px] leading-relaxed">
                  解析左側頁面後，此處將以 {desktopWidth}px 桌面等比縮放渲染各區塊與 {gridConfig.columns} 列網格
                </p>
              </div>
            ) : (
              <div className="relative w-full" style={{ height: `${scaledHeight}px` }}>
                <div
                  style={{
                    width: `${frameWidth}px`,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }}
                  className="bg-white"
                >
                  <div ref={contentRef} className="relative">
                  {/* 12-Col Reference Guide Overlay inside 1440px coordinate space */}
                  {showGridOverlay && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex justify-center">
                      <div
                        className="h-full grid"
                        style={{
                          width: `${containerRatioPct}%`,
                          gridTemplateColumns: `repeat(${Math.max(1, gridConfig.columns)}, minmax(0, 1fr))`,
                          gap: `${Math.max(8, gridConfig.gutter)}px`,
                        }}
                      >
                        {Array.from({ length: Math.max(1, gridConfig.columns) }).map((_, colIdx) => (
                          <div
                            key={colIdx}
                            className="h-full bg-[#0BB59B]/[0.05] border-x border-[#0BB59B]/20"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sections */}
                  <div className="relative z-10 flex flex-col">
                    {paintedSections.map((section, idx) => {
                      const painted = displaySectionPaint(section, designTokens);
                      const isOverlaidNav = idx === 0 && overlayNavOverHero;
                      const isHighlighted =
                        hoveredSectionId === painted.id || selectedSectionId === painted.id;
                      const sectionBg = isOverlaidNav
                        ? 'transparent'
                        : painted.background || designTokens?.colors?.background || '#080F1E';

                      return (
                        <div
                          key={painted.id}
                          onMouseEnter={() => onHoverSection(painted.id)}
                          onMouseLeave={() => onHoverSection(null)}
                          onClick={() => onSelectSection(painted.id)}
                          className={cn(
                            'transition-all cursor-pointer w-full',
                            isOverlaidNav ? 'absolute top-0 left-0 right-0 z-25' : 'relative',
                          )}
                          style={{
                            backgroundColor: sectionBg,
                            fontFamily: designTokens?.typography?.fontFamily || undefined,
                          }}
                        >
                          <DesktopSectionContent
                            section={painted}
                            gridConfig={gridConfig}
                            isOverlaidNavbar={isOverlaidNav}
                          />

                          {isHighlighted && (
                            <div className="pointer-events-none absolute inset-0 z-30 border-4 border-[#0BB59B] bg-[#0BB59B]/[0.06]">
                              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#0BB59B] text-[#081018] text-[18px] font-mono font-bold rounded-br-lg shadow-sm">
                                <span>{String(section.step || idx + 1).padStart(2, '0')}</span>
                                <span>·</span>
                                <span>{section.name}</span>
                                <span>·</span>
                                <span>{section.framerType}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              </div>
            )}
            </SiteScrollProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
