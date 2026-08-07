import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type FixedOverlayProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/**
 * Full-viewport overlay rendered on document.body.
 * Avoids space-y margins / layout chrome offsetting fullscreen modals.
 */
export function FixedOverlay({ className, children, ...props }: FixedOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className={cn('fixed inset-0 z-[100] m-0', className)} {...props}>
      {children}
    </div>,
    document.body
  );
}
