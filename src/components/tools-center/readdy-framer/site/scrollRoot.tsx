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
