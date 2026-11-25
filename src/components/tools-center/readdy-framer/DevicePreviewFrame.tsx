import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SiteScrollProvider } from './site/scrollRoot';

/**
 * Renders the page in an iframe whose layout width is the selected device width.
 * CSS scale is applied on the iframe itself. Tailwind `lg:` follows that width,
 * not the smaller pane the scaled page is drawn into.
 */
export function DevicePreviewFrame({
  scrollerRef,
  layoutWidth,
  layoutHeight,
  scale,
  children,
}: {
  scrollerRef: MutableRefObject<HTMLElement | null>;
  layoutWidth: number;
  layoutHeight: number;
  scale: number;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const layoutWidthRef = useRef(layoutWidth);
  layoutWidthRef.current = layoutWidth;
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;

    const width = Math.max(320, Math.round(layoutWidthRef.current));
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=${width}, initial-scale=1" /></head><body></body></html>`,
    );
    doc.close();

    const syncStyles = () => {
      const head = doc.head;
      if (!head) return;
      head.querySelectorAll('[data-canvas-style]').forEach((node) => node.remove());
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        const clone = node.cloneNode(true) as HTMLElement;
        clone.setAttribute('data-canvas-style', '1');
        head.appendChild(clone);
      });
      const parentSheets = document.adoptedStyleSheets;
      if (parentSheets?.length) {
        try {
          doc.adoptedStyleSheets = [...parentSheets];
        } catch {
          // Some constructed sheets cannot be shared into the frame; cloned tags still apply.
        }
      }
    };
    syncStyles();

    const headObserver = new MutationObserver(syncStyles);
    headObserver.observe(document.head, { childList: true, subtree: true, characterData: true });

    doc.documentElement.style.background = '#fff';
    doc.documentElement.style.overscrollBehavior = 'contain';
    doc.body.style.margin = '0';
    doc.body.style.background = '#fff';
    scrollerRef.current = doc.documentElement;
    setMountNode(doc.body);

    return () => {
      headObserver.disconnect();
      scrollerRef.current = null;
      setMountNode(null);
    };
  }, [scrollerRef]);

  useEffect(() => {
    const meta = iframeRef.current?.contentDocument?.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const next = `width=${Math.max(320, Math.round(layoutWidth))}, initial-scale=1`;
    if (meta.getAttribute('content') !== next) meta.setAttribute('content', next);
  }, [layoutWidth]);

  const frameStyle: CSSProperties = {
    width: layoutWidth,
    height: layoutHeight,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    border: 0,
    display: 'block',
    background: '#fff',
  };

  return (
    <>
      <iframe ref={iframeRef} title="頁面預覽" style={frameStyle} />
      {mountNode
        ? createPortal(<SiteScrollProvider scrollerRef={scrollerRef}>{children}</SiteScrollProvider>, mountNode)
        : null}
    </>
  );
}
