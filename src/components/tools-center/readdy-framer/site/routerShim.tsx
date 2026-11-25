import { createContext, useContext, useMemo, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

type LocationState = { pathname: string };

const LocationContext = createContext<LocationState>({ pathname: '/' });

/** Keeps the copied Readdy page on one route inside the tools shell. */
export function SiteRouter({ pathname = '/', children }: { pathname?: string; children: ReactNode }) {
  const value = useMemo(() => ({ pathname }), [pathname]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  return useContext(LocationContext);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
};

export function Link({ to, onClick, target, children, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (target === '_blank' || /^https?:\/\//.test(to)) return;
    event.preventDefault();
  };

  return (
    <a href={to} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
