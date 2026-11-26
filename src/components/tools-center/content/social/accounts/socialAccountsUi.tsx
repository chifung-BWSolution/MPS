/**
 * 品牌與帳號頁 · MPS 設計語言的共用小原件
 *
 * 規範對照 PRD §8.1（B100 → MPS）與本 repo 既有 content 頁面：
 *   - 白卡、`rounded-lg`（6px）、`border-[rgba(13,26,45,0.08)]`、`shadow-card`、`#f5f8fc` 底
 *   - 主色 teal（`#0d9488`）、深色字 `#0d1a2d`、次要字 `muted-foreground`
 *   - 標題用 `ContentPageHeader`（32px bold）；狀態用 pill（emerald／amber／rose）
 *   - 表單與對話框一律用 `src/components/ui/*`（shadcn），不另創一套樣式
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { SOCIAL_PLATFORM_LABEL, socialPlatformLabel } from '@/lib/contentSocialGenerate.ts';
import {
  credentialStatusMeta,
  loginStatusMeta,
  platformDotClass,
  type SocialCredentialStatus,
  type SocialLoginStatus,
} from '@/lib/contentSocialGroups.ts';

export const CARD = 'rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card';
export const MUTED = 'text-[11px] leading-[15px] text-muted-foreground';
export const SECTION =
  'rounded-lg border border-[rgba(13,26,45,0.08)] bg-slate-50/70 p-3';

// ============================================================
// 卡片
// ============================================================

export function AccountsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn(CARD, 'overflow-hidden', className)}>{children}</section>;
}

export function AccountsCardHeader({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-[15px] font-bold text-[#0d1a2d]">{title}</h2>
          {badge}
        </div>
        {subtitle && <div className="mt-1 text-[12px] leading-[18px] text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </header>
  );
}

// ============================================================
// 狀態與平台
// ============================================================

const LOGIN_TONE: Record<'active' | 'expired' | 'unknown', { pill: string; dot: string }> = {
  active: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  expired: { pill: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  unknown: { pill: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
};

export function LoginStatusPill({
  status,
  className,
  withHint = false,
}: {
  status: SocialLoginStatus | string;
  className?: string;
  withHint?: boolean;
}) {
  const meta = loginStatusMeta(status);
  const tone = LOGIN_TONE[(status as SocialLoginStatus) in LOGIN_TONE ? (status as SocialLoginStatus) : 'unknown'];
  return (
    <span
      title={withHint ? meta.hint : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-[3px] text-[11px] font-semibold leading-4',
        tone.pill,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
      {meta.label}
    </span>
  );
}

export function PlatformLabel({ platform, className }: { platform: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0d1a2d]', className)}>
      <span className={cn('h-2 w-2 rounded-full', platformDotClass(platform))} />
      {socialPlatformLabel(platform)}
    </span>
  );
}

// ---- 憑證狀態（半自動；MPS 色票：emerald／amber／rose／slate） ----

const CREDENTIAL_TONE: Record<SocialCredentialStatus, { pill: string; dot: string }> = {
  none: { pill: 'border-slate-200 bg-slate-50 text-slate-600', dot: 'bg-slate-400' },
  active: { pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  expiring: { pill: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  expired: { pill: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  invalid: { pill: 'border-rose-200 bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

export function CredentialStatusPill({
  status,
  className,
  withHint = true,
}: {
  status: SocialCredentialStatus | string;
  className?: string;
  withHint?: boolean;
}) {
  const meta = credentialStatusMeta(status);
  const tone = CREDENTIAL_TONE[(status as SocialCredentialStatus) in CREDENTIAL_TONE ? (status as SocialCredentialStatus) : 'none'];
  return (
    <span
      title={withHint ? meta.hint : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-[3px] text-[11px] font-semibold leading-4',
        tone.pill,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
      {meta.label}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-[3px] text-[11px] font-semibold text-slate-600">
      <span className={cn('h-1.5 w-1.5 rounded-full', platformDotClass(platform))} />
      {SOCIAL_PLATFORM_LABEL[platform] ?? SOCIAL_PLATFORM_LABEL.other}
    </span>
  );
}

// ============================================================
// 表單
// ============================================================

export function FormField({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-slate-600">{label}</span>
        {hint && <span className="text-[11px] leading-[15px] text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

// ============================================================
// 提示
// ============================================================

const ALERT_TONE = {
  error: 'border-rose-200 bg-rose-50/70 text-rose-700',
  warn: 'border-amber-200 bg-amber-50/70 text-amber-800',
  info: 'border-teal-200 bg-teal-50/60 text-teal-800',
} as const;

export function InlineAlert({
  tone = 'error',
  title,
  children,
}: {
  tone?: keyof typeof ALERT_TONE;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn('rounded-md border px-2.5 py-2 text-[12px] leading-[18px]', ALERT_TONE[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-0.5' : undefined}>{children}</div>
    </div>
  );
}

// ============================================================
// 對話框（MPS 版型：白卡、6px 圓角、標題列／內容／footer 三段）
// ============================================================

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  size = 'lg',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'gap-0 overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-0 shadow-card-hover',
          size === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-[16px] font-bold text-[#0d1a2d]">
            {icon}
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </div>
        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
