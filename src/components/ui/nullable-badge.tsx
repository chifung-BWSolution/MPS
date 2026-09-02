import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const EMPTY_DISPLAY = '-';

export function isBlankDisplayValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  if (typeof value === 'boolean') return false;
  const text = String(value).trim();
  return text === '' || text === 'null' || text === 'undefined' || text === '—' || text === '-';
}

export function displayText(value: unknown): string {
  if (isBlankDisplayValue(value)) return EMPTY_DISPLAY;
  return String(value).trim();
}

export function EmptyDash({ className }: { className?: string }) {
  return <span className={cn('text-muted-foreground', className)}>{EMPTY_DISPLAY}</span>;
}

interface NullableBadgeProps {
  value: unknown;
  className?: string;
  children?: ReactNode;
}

/** Colored pill when a value exists; a plain "-" (no bg/border) when it is empty. */
export function NullableBadge({ value, className, children }: NullableBadgeProps) {
  if (isBlankDisplayValue(value)) {
    return <EmptyDash />;
  }
  return <span className={className}>{children ?? String(value).trim()}</span>;
}

export function BrandFieldBadge({ value, className }: { value?: unknown; className?: string }) {
  return (
    <NullableBadge
      value={value}
      className={cn('text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded', className)}
    />
  );
}

export function CompanyFieldBadge({ value, className }: { value?: unknown; className?: string }) {
  return (
    <NullableBadge
      value={value}
      className={cn('text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded', className)}
    />
  );
}

export function MutedFieldBadge({ value, className }: { value?: unknown; className?: string }) {
  return (
    <NullableBadge
      value={value}
      className={cn('text-[11px] bg-muted px-1.5 py-0.5 rounded', className)}
    />
  );
}

export function StatusFieldBadge({
  config,
  className,
}: {
  config?: { label?: string; bgColor?: string; color?: string; textColor?: string } | null;
  className?: string;
}) {
  return (
    <NullableBadge
      value={config?.label}
      className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', config?.bgColor, config?.color ?? config?.textColor, className)}
    />
  );
}
