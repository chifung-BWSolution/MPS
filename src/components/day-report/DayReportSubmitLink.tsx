import type { MouseEvent, ReactNode } from 'react';
import { applyLocationHash, buildSameOriginHref, isModifiedClick } from '@/lib/appNavigation';
import { buildDayReportSubmitHash } from '@/lib/dayReportNavigation';
import { cn } from '@/lib/utils';

type DayReportSubmitLinkProps = {
  staffId: string;
  date: string;
  className?: string;
  title?: string;
  children: ReactNode;
};

/** Opens `#day-report/submit?staff=&date=` in this tab. Modified clicks follow the real href. */
export function DayReportSubmitLink({
  staffId,
  date,
  className,
  title,
  children,
}: DayReportSubmitLinkProps) {
  const hash = buildDayReportSubmitHash(staffId, date);
  const href = buildSameOriginHref(hash);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    applyLocationHash(hash);
  };

  return (
    <a
      href={href}
      title={title || '查看當日匯報'}
      onClick={handleClick}
      className={cn('text-inherit no-underline', className)}
    >
      {children}
    </a>
  );
}
