import { createContext, useContext, type ReactNode, type RefObject } from 'react';

const SiteScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function SiteScrollProvider({
  scrollerRef,
  children,
}: {
  scrollerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return <SiteScrollContext.Provider value={scrollerRef}>{children}</SiteScrollContext.Provider>;
}

export function useSiteScroll() {
  return useContext(SiteScrollContext);
}

/** Window of a preview iframe, when the scroller lives in that document. */
export function frameWindowOf(scroller: HTMLElement | null): Window | null {
  const view = scroller?.ownerDocument?.defaultView ?? null;
  if (!view || view === window) return null;
  return view;
}
