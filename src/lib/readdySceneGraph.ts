export type SceneLayout = {
  direction?: 'horizontal' | 'vertical';
  columns?: number;
  tabletColumns?: number;
  phoneColumns?: number;
  gap?: string;
  padding?: string;
  width?: string;
  height?: string;
  maxWidth?: string;
  align?: 'start' | 'center' | 'end';
  justify?: 'start' | 'center' | 'space-between';
  position?: 'relative' | 'absolute' | 'fixed';
  wrap?: boolean;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: number;
  minHeight?: string;
  /** How many tracks this node occupies inside a parent grid, from `lg:col-span-*`. */
  columnSpan?: number;
};

export type SceneStyle = {
  background?: string;
  backgroundImage?: string;
  color?: string;
  border?: string;
  radius?: string;
  fontSize?: string;
  fontWeight?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
};

export type SceneNode = {
  id: string;
  type: 'section' | 'stack' | 'grid' | 'text' | 'image';
  name?: string;
  text?: string;
  src?: string;
  htmlTag?: string;
  href?: string;
  layout?: SceneLayout;
  style?: SceneStyle;
  children?: SceneNode[];
};

const SPACE: Record<string, number> = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
};

const MAX_WIDTH: Record<string, string> = {
  sm: '384px',
  md: '448px',
  lg: '512px',
  xl: '576px',
  '2xl': '672px',
  '3xl': '768px',
  '4xl': '896px',
  '5xl': '1024px',
  '6xl': '1152px',
  '7xl': '1280px',
};

function usableSceneFont(family: string | undefined): string | undefined {
  const name = String(family || '').split(',')[0].replace(/['"]/g, '').trim();
  if (!name || /^(sans-serif|serif|monospace|system-ui|inherit|initial|unset)$/i.test(name)) return undefined;
  return name;
}

function classTokens(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function tokenPx(token: string | undefined): number | undefined {
  if (!token) return undefined;
  if (token.endsWith('px')) {
    const n = Number.parseInt(token, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return SPACE[token];
}

/** Desktop (1440) wins over tablet and phone utilities. */
export function resolveSpacing(className: string, prefix: string): number | undefined {
  const tokens = classTokens(className);
  const tiers = [`lg:${prefix}-`, `md:${prefix}-`, `sm:${prefix}-`, `${prefix}-`];
  for (const tier of tiers) {
    for (const token of tokens) {
      if (!token.startsWith(tier)) continue;
      const px = tokenPx(token.slice(tier.length));
      if (px !== undefined) return px;
    }
  }
  return undefined;
}

export function columnSpanOf(className: string): number | undefined {
  const tokens = classTokens(className);
  const read = (prefix: string) => {
    const hit = tokens.find((token) => new RegExp(`^${prefix}col-span-\\d+$`).test(token));
    return hit ? Number(hit.slice(hit.lastIndexOf('-') + 1)) : undefined;
  };
  return read('lg:') ?? read('md:') ?? read('sm:') ?? read('');
}

export function resolveGridColumns(
  className: string,
  viewport: 'phone' | 'tablet' | 'desktop',
): number | undefined {
  const tokens = classTokens(className);
  const read = (prefix: string) => {
    const hit = tokens.find((token) => new RegExp(`^${prefix}grid-cols-\\d+$`).test(token));
    return hit ? Number(hit.slice(hit.lastIndexOf('-') + 1)) : undefined;
  };
  const base = read('');
  const sm = read('sm:');
  const md = read('md:');
  const lg = read('lg:');
  const responsive = sm ?? md ?? lg;
  if (viewport === 'phone') return base ?? (responsive ? 1 : undefined);
  if (viewport === 'tablet') return md ?? sm ?? base ?? (lg ? 1 : undefined);
  return lg ?? md ?? sm ?? base;
}

function desktopPadding(className: string): string | undefined {
  const uniform = resolveSpacing(className, 'p');
  const top = resolveSpacing(className, 'pt') ?? resolveSpacing(className, 'py') ?? uniform;
  const bottom = resolveSpacing(className, 'pb') ?? resolveSpacing(className, 'py') ?? uniform;
  const left = resolveSpacing(className, 'pl') ?? resolveSpacing(className, 'px') ?? uniform;
  const right = resolveSpacing(className, 'pr') ?? resolveSpacing(className, 'px') ?? uniform;
  if ([top, right, bottom, left].every((value) => value === undefined)) return undefined;
  return `${top ?? 0}px ${right ?? 0}px ${bottom ?? 0}px ${left ?? 0}px`;
}

function desktopGap(className: string): string | undefined {
  const gap = resolveSpacing(className, 'gap') ?? resolveSpacing(className, 'gap-x') ?? resolveSpacing(className, 'gap-y');
  return gap === undefined ? undefined : `${gap}px`;
}

function maxWidthOf(className: string): string | undefined {
  const tokens = classTokens(className);
  const hit = tokens.find((token) => /^max-w-/.test(token));
  if (!hit) return undefined;
  return MAX_WIDTH[hit.slice('max-w-'.length)];
}

function fixedAxis(className: string, axis: 'w' | 'h'): string | undefined {
  const tokens = classTokens(className);
  const hit = tokens.find((token) => new RegExp(`^${axis}-\\d+$`).test(token));
  const px = tokenPx(hit?.slice(2));
  return px === undefined ? undefined : `${px}px`;
}

function minHeightOf(className: string): string | undefined {
  const tokens = classTokens(className);
  for (const tier of ['lg:', 'md:', 'sm:', '']) {
    const hit = tokens.find((token) => token.startsWith(`${tier}min-h-`));
    if (!hit) continue;
    const match = hit.match(/min-h-\[(\d+)px\]/);
    if (match) return `${match[1]}px`;
    if (hit.endsWith('screen')) return '100vh';
  }
  return undefined;
}

function radiusOf(className: string): string | undefined {
  const tokens = classTokens(className);
  if (tokens.includes('rounded-full')) return '999px';
  if (tokens.includes('rounded-lg')) return '12px';
  if (tokens.includes('rounded-md')) return '8px';
  if (tokens.includes('rounded')) return '4px';
  return undefined;
}

export function readableColor(value: string | null | undefined): string | undefined {
  const raw = String(value || '').trim();
  if (!raw || raw === 'transparent') return undefined;
  const match = raw.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
  if (!match) return raw.startsWith('#') ? raw : undefined;
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (!Number.isFinite(alpha) || alpha < 0.04) return undefined;
  const channels = [match[1], match[2], match[3]].map((part) => Math.round(Number(part)));
  if (alpha < 0.98) return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${Math.round(alpha * 100) / 100})`;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function ownText(element: HTMLElement): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent || '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

function isTextTag(tag: string): boolean {
  return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'li', 'blockquote', 'figcaption', 'label'].includes(tag);
}

function collectText(node: SceneNode): string {
  return [node.text || '', ...(node.children || []).map(collectText)].join(' ').replace(/\s+/g, ' ').trim();
}

function hasContent(node: SceneNode): boolean {
  return Boolean(node.text || node.src || node.style?.background || node.style?.backgroundImage || node.children?.length);
}

function collapse(node: SceneNode): SceneNode {
  const children = (node.children || []).map(collapse).filter(hasContent);
  node.children = children.length ? children : undefined;
  const plain = node.type === 'stack'
    && !node.style?.background
    && !node.style?.border
    && !node.style?.radius
    && !node.layout?.padding
    && !node.layout?.maxWidth
    && node.layout?.position !== 'absolute'
    && node.layout?.position !== 'fixed';
  if (plain && node.children?.length === 1 && node.children[0].type !== 'text') {
    return { ...node.children[0], id: node.id };
  }
  return node;
}

function capture(element: Element, id: string, depth: number): SceneNode | null {
  if (!(element instanceof HTMLElement) || depth > 16) return null;
  if (element.matches('script, style, link, noscript, svg')) return null;
  const className = typeof element.className === 'string' ? element.className : '';
  const tokens = classTokens(className);
  if (element.tagName === 'I' && tokens.some((token) => token.startsWith('ri-'))) {
    if (!tokens.includes('ri-check-line')) return null;
    return { id, type: 'text', name: 'check', text: '✓', style: { textAlign: 'center' } };
  }
  const style = getComputedStyle(element);
  const hidden = style.display === 'none' && !tokens.includes('readdy-nav-desktop');
  if (hidden || tokens.includes('readdy-nav-mobile')) return null;
  const fixedWidget = (tokens.includes('fixed') || style.position === 'fixed')
    && !element.closest('header, nav')
    && element.tagName !== 'HEADER'
    && element.tagName !== 'NAV';
  if (fixedWidget) return null;

  const tag = element.tagName.toLowerCase();
  const hrefAttr = tag === 'a' ? (element.getAttribute('href') || '').trim() : '';
  const href = hrefAttr && hrefAttr !== '#' ? hrefAttr : undefined;
  if (tag === 'img') {
    const src = element.getAttribute('src') || '';
    if (!src) return null;
    return {
      id,
      type: 'image',
      name: element.getAttribute('alt') || 'Image',
      src,
      layout: {
        width: tokens.includes('w-full') ? '100%' : fixedAxis(className, 'w'),
        height: tokens.includes('h-full') ? '100%' : fixedAxis(className, 'h') || 'auto',
      },
      style: { radius: radiusOf(className) },
    };
  }

  const children: SceneNode[] = [];
  let childIndex = 0;
  for (const child of element.children) {
    const next = capture(child, `${id}-${childIndex}`, depth + 1);
    if (next) {
      children.push(next);
      childIndex += 1;
    }
  }

  const labelled = (element.getAttribute('aria-label') || '').trim();
  const text = ownText(element) || (children.length === 0 ? labelled : '');
  const color = readableColor(style.color);
  const gradientScrim = tokens.some((token) => token.startsWith('bg-gradient-') || token.startsWith('from-black'));
  const background = gradientScrim
    ? 'rgba(0, 0, 0, 0.5)'
    : readableColor(style.backgroundColor);
  const fontSize = style.fontSize && style.fontSize !== '16px' ? style.fontSize : undefined;
  const fontWeight = Number.parseInt(style.fontWeight, 10);
  const textAlign = style.textAlign === 'center' || tokens.includes('text-center')
    ? 'center'
    : style.textAlign === 'right' || tokens.includes('text-right')
      ? 'right'
      : undefined;
  const textStyle: SceneStyle = {
    color,
    fontSize,
    fontWeight: fontWeight >= 600 ? fontWeight : undefined,
    fontFamily: usableSceneFont(style.fontFamily),
    textAlign,
  };

  if (isTextTag(tag) && children.length === 0 && text) {
    return {
      id,
      type: 'text',
      name: text.slice(0, 40),
      text,
      htmlTag: tag,
      href,
      style: textStyle,
    };
  }

  const desktopColumns = resolveGridColumns(className, 'desktop');
  const isGrid = tokens.includes('grid') || (desktopColumns !== undefined && desktopColumns > 1);
  const horizontal = !isGrid && (tokens.includes('flex') || tokens.includes('inline-flex')) && !tokens.includes('flex-col');
  const absolute = tokens.includes('absolute') || tokens.includes('inset-0');
  const pinned = tokens.includes('inset-0');
  const borderWidth = Number.parseFloat(style.borderTopWidth || '0');
  const border = tokens.includes('border') && borderWidth > 0
    ? `${Math.max(1, Math.round(borderWidth))}px solid ${readableColor(style.borderTopColor) || 'rgba(80, 48, 20, 0.12)'}`
    : undefined;
  const layout: SceneLayout = {
    direction: horizontal ? 'horizontal' : 'vertical',
    columns: isGrid ? desktopColumns || Math.max(children.length, 1) : undefined,
    tabletColumns: isGrid ? resolveGridColumns(className, 'tablet') : undefined,
    phoneColumns: isGrid ? resolveGridColumns(className, 'phone') : undefined,
    gap: desktopGap(className),
    padding: desktopPadding(className),
    width: fixedAxis(className, 'w'),
    height: pinned ? '100%' : fixedAxis(className, 'h'),
    maxWidth: maxWidthOf(className),
    align: tokens.includes('items-center') || tokens.includes('text-center') ? 'center' : undefined,
    justify: tokens.includes('justify-between') ? 'space-between' : tokens.includes('justify-center') ? 'center' : undefined,
    position: tokens.includes('fixed') ? 'fixed' : absolute ? 'absolute' : tokens.includes('relative') || tokens.includes('z-10') ? 'relative' : undefined,
    wrap: tokens.includes('flex-wrap'),
    top: pinned ? '0px' : undefined,
    right: pinned ? '0px' : undefined,
    bottom: pinned ? '0px' : undefined,
    left: pinned ? '0px' : undefined,
    zIndex: tokens.includes('z-10') ? 1 : undefined,
    minHeight: minHeightOf(className),
    columnSpan: columnSpanOf(className),
  };
  const nodeChildren = text
    ? [{ id: `${id}-t`, type: 'text' as const, text, name: text.slice(0, 40), style: textStyle }, ...children]
    : children;
  const heading = nodeChildren.find((child) => child.type === 'text' && /^h[1-6]$/.test(child.htmlTag || ''));
  const sectionTag = tag === 'header' || tag === 'nav' || tag === 'footer' || tag === 'section' || tag === 'main';
  return {
    id,
    type: isGrid ? 'grid' : 'stack',
    name: heading?.text || element.getAttribute('aria-label') || tag,
    htmlTag: sectionTag ? tag : undefined,
    href,
    layout,
    style: {
      background,
      backgroundImage: style.backgroundImage && style.backgroundImage !== 'none'
        ? style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1]
        : undefined,
      border,
      radius: radiusOf(className) || (style.borderRadius && style.borderRadius !== '0px' ? style.borderRadius : undefined),
    },
    children: nodeChildren,
  };
}

export function extractScenes(root: ParentNode): SceneNode[] {
  const scopes: Element[] = [];
  const header = root.querySelector('header, nav');
  if (header) scopes.push(header);
  const main = root.querySelector('main');
  const source = main || root;
  for (const child of source.children) scopes.push(child);
  const footer = root.querySelector('footer');
  if (footer) scopes.push(footer);
  return scopes
    .map((element, index) => capture(element, `scene-${index}`, 0))
    .filter((node): node is SceneNode => Boolean(node))
    .map(collapse)
    .filter(hasContent);
}

export function captureDesktopSceneGraph(): SceneNode[] | null {
  if (typeof document === 'undefined') return null;
  const documents: Document[] = [document];
  for (const frame of document.querySelectorAll('iframe')) {
    try {
      if (frame.contentDocument) documents.push(frame.contentDocument);
    } catch {
      // Cross-origin frames are not readable.
    }
  }
  for (const doc of documents) {
    const root = doc.querySelector('.readdy-site');
    if (root) return extractScenes(root);
  }
  return null;
}

export function matchSceneToSection(
  section: { name?: string; elements?: { heading?: string } },
  scenes: SceneNode[],
): SceneNode | undefined {
  const heading = section.elements?.heading?.trim();
  const name = section.name?.trim();
  const ranked = scenes
    .map((scene) => {
      const text = collectText(scene);
      let score = 0;
      if (heading && text.includes(heading)) score += 5;
      if (name && text.includes(name)) score += 2;
      return { scene, score, size: text.length };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.size - b.size);
  return ranked[0]?.scene;
}
