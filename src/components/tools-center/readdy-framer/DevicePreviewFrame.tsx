import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SiteScrollProvider } from './site/scrollRoot';

/**
 * Renders the page in an iframe sized to the device width.
 * Tailwind breakpoints follow that iframe viewport, and the page scrolls inside it,
 * so position:fixed bars stick to the preview instead of the tools shell.
 */
export function DevicePreviewFrame({
  scrollerRef,
  children,
}: {
  scrollerRef: MutableRefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;

    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body></body></html>');
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

  return (
    <>
      <iframe ref={iframeRef} title="頁面預覽" className="block h-full w-full border-0 bg-white" />
      {mountNode
        ? createPortal(<SiteScrollProvider scrollerRef={scrollerRef}>{children}</SiteScrollProvider>, mountNode)
        : null}
    </>
  );
}
