import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { resolveRoute, useApp } from '@/context/AppContext';
import { buildSameOriginHref, isModifiedClick } from '@/lib/appNavigation';
import { cn } from '@/lib/utils';

export type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  module: string;
  subModule?: string;
};

/** In-app hash link. Regular click stays in this tab; Ctrl/Cmd/middle click uses the browser. */
export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { module, subModule, className, onClick, children, ...rest },
  ref,
) {
  const { navigateTo } = useApp();
  const resolved = resolveRoute(module, subModule);
  const href = buildSameOriginHref(`${resolved.module}/${resolved.subModule}`);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || isModifiedClick(event)) return;
    event.preventDefault();
    navigateTo(module, subModule);
  };

  return (
    <a
      ref={ref}
      href={href}
      onClick={handleClick}
      className={cn(className)}
      {...rest}
    >
      {children}
    </a>
  );
});
