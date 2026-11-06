import {
  annualFeePaymentStatusLabel,
  formatAnnualFeeNextDueLabel,
  summarizeAnnualFeeGroups,
  type AnnualFeeGroup,
  type AnnualFeeIncomeRow,
  type AnnualFeeSummary,
} from './annualFeeIncomes.ts';
import { financeProjectTypeLabel } from './financeProjectType.ts';
import { formatIncomeDate, formatIncomeMoney, parseLocalIsoDate } from './quotationIncomes.ts';
import { escapeHtml, projectDetailHref } from './receivablesAlert.ts';
import { CANONICAL_SITE_URL } from './siteUrl.ts';

export const ANNUAL_FEES_REMINDER_SUBJECT = 'BWT月費/年費收費時間表';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function daysUntilDue(dueDate: string | undefined, asOf: string): number | null {
  const due = parseLocalIsoDate(dueDate);
  const today = parseLocalIsoDate(asOf);
  if (!due || !today) return null;
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function formatRemainingDays(days: number | null): string {
  if (days == null) return '—';
  if (days < 0) return `逾期 ${Math.abs(days)} 日`;
  if (days === 0) return '今日到期';
  return `${days} 日`;
}

function formatFinanceMoney(amount: number, currency?: string): string {
  return formatIncomeMoney(amount, currency || 'HKD');
}

export type AnnualFeeProjectPm = {
  projectId: string;
  projectName: string;
  staffId?: string;
  name?: string;
  email?: string;
  active?: boolean;
};

export type AnnualFeeReminderRecipient = {
  staffId: string;
  name: string;
  email: string;
  projectIds: string[];
};

export type SkippedAnnualFeeProject = {
  projectId: string;
  projectName: string;
  reason: 'no_main_pm' | 'inactive' | 'no_email';
};

export type AnnualFeeReminderEmail = {
  to: string;
  staffId: string;
  name: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  ownedProjectIds: string[];
};

export function annualFeesPageHref(siteOrigin: string): string {
  return `${normalizeOrigin(siteOrigin)}/#finance/annual-fees`;
}

export function annualFeeReminderIdempotencyKey(asOf: string, email: string): string {
  return `annual-fees-reminder/${asOf}/${email.trim().toLowerCase()}`.slice(0, 256);
}

export function collectAnnualFeeReminderRecipients(assignments: readonly AnnualFeeProjectPm[]): {
  recipients: AnnualFeeReminderRecipient[];
  skipped: SkippedAnnualFeeProject[];
} {
  const byEmail = new Map<string, AnnualFeeReminderRecipient>();
  const skipped: SkippedAnnualFeeProject[] = [];

  for (const assignment of assignments) {
    const projectId = assignment.projectId.trim();
    const projectName = assignment.projectName.trim() || '未指定項目';
    const staffId = assignment.staffId?.trim() || '';
    const email = assignment.email?.trim() || '';
    if (!staffId) {
      skipped.push({ projectId, projectName, reason: 'no_main_pm' });
      continue;
    }
    if (assignment.active === false) {
      skipped.push({ projectId, projectName, reason: 'inactive' });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      skipped.push({ projectId, projectName, reason: 'no_email' });
      continue;
    }

    const key = email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      if (!existing.projectIds.includes(projectId)) existing.projectIds.push(projectId);
      continue;
    }
    byEmail.set(key, {
      staffId,
      name: assignment.name?.trim() || '同事',
      email,
      projectIds: [projectId],
    });
  }

  return {
    recipients: [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email)),
    skipped,
  };
}

export function buildAnnualFeeReminderEmails(input: {
  asOf: string;
  siteOrigin?: string;
  groups: readonly AnnualFeeGroup[];
  assignments: readonly AnnualFeeProjectPm[];
}): {
  summary: AnnualFeeSummary;
  emails: AnnualFeeReminderEmail[];
  skipped: SkippedAnnualFeeProject[];
  mainPmNameByProjectId: Record<string, string>;
} {
  const summary = summarizeAnnualFeeGroups(input.groups);
  const relevant = new Set(input.groups.map((group) => group.projectId));
  const { recipients, skipped } = collectAnnualFeeReminderRecipients(
    input.assignments.filter((assignment) => relevant.has(assignment.projectId)),
  );
  const mainPmNameByProjectId: Record<string, string> = {};
  for (const assignment of input.assignments) {
    const name = assignment.name?.trim();
    if (name) mainPmNameByProjectId[assignment.projectId] = name;
  }

  const emails = recipients.map((recipient) => {
    const owned = new Set(recipient.projectIds);
    const rendered = renderAnnualFeeReminder({
      asOf: input.asOf,
      siteOrigin: input.siteOrigin,
      groups: input.groups,
      recipientName: recipient.name,
      ownedProjectIds: owned,
      mainPmNameByProjectId,
    });
    return {
      to: recipient.email,
      staffId: recipient.staffId,
      name: recipient.name,
      subject: ANNUAL_FEES_REMINDER_SUBJECT,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: annualFeeReminderIdempotencyKey(input.asOf, recipient.email),
      ownedProjectIds: recipient.projectIds,
    };
  });

  return { summary, emails, skipped, mainPmNameByProjectId };
}

function renderAnnualFeeReminder(input: {
  asOf: string;
  siteOrigin?: string;
  groups: readonly AnnualFeeGroup[];
  recipientName: string;
  ownedProjectIds: ReadonlySet<string>;
  mainPmNameByProjectId: Record<string, string>;
}): { html: string; text: string } {
  const siteOrigin = normalizeOrigin(input.siteOrigin || CANONICAL_SITE_URL);
  const pageHref = annualFeesPageHref(siteOrigin);
  const summary = summarizeAnnualFeeGroups(input.groups);
  const ownedCount = input.groups.filter((group) => input.ownedProjectIds.has(group.projectId)).length;
  const ownedUpcoming = summarizeAnnualFeeGroups(
    input.groups.filter((group) => input.ownedProjectIds.has(group.projectId)),
  ).upcomingAmount;
  const asOfLabel = formatIncomeDate(input.asOf);
  const preview = ownedCount > 0
    ? `請跟進年度收費：你負責 ${ownedCount} 個項目，下次收費合計 ${formatFinanceMoney(ownedUpcoming)}。`
    : `年度收費時間表：共 ${summary.projectCount} 個項目，下次收費合計 ${formatFinanceMoney(summary.upcomingAmount)}。`;

  const projects = input.groups.length === 0
    ? '<p style="margin:0;font-size:14px;line-height:1.6;color:#0d1a2d;">目前沒有未收逾期或即將到期的年度收費。</p>'
    : input.groups.map((group) => renderProject(group, input)).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-Hant" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(ANNUAL_FEES_REMINDER_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;color:#0d1a2d;font-family:Arial,Helvetica,sans-serif;">
  <div lang="zh-Hant" dir="ltr">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="720" cellpadding="0" cellspacing="0" border="0" style="width:720px;max-width:720px;background:#ffffff;border:1px solid #d7dee8;">
            <tr>
              <td style="padding:24px 24px 8px;background:#0d1a2d;color:#ffffff;">
                <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;color:#d7dee8;">MPS 財務</p>
                <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">${escapeHtml(ANNUAL_FEES_REMINDER_SUBJECT)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px;">
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#0d1a2d;">${escapeHtml(input.recipientName)}，這是每週一的收費提醒。請追收你負責的即將到期及已逾期未收款項。</p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4b5b70;">基準日 ${escapeHtml(asOfLabel)}（香港時間）。下列項目與年度收費頁相同，只包括 BWT 系統與 BWT 網頁，並只展開未收逾期及即將到期的期數。</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#0d1a2d;">你負責 ${ownedCount} 個項目，下次收費合計 ${escapeHtml(formatFinanceMoney(ownedUpcoming))}。</p>
                ${summaryTable(summary)}
                <p style="margin:16px 0 0;">${actionButton(pageHref, '開啟年度收費頁面')}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px;">
                ${projects}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px;border-top:1px solid #d7dee8;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#4b5b70;">此郵件每週一早上 6:00（香港時間）自動發送給年度收費頁項目的主負責 PM。標示「請你跟進」的項目需要你向客戶追收。</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;

  const text = renderText({
    asOfLabel,
    pageHref,
    siteOrigin,
    summary,
    ownedCount,
    ownedUpcoming,
    recipientName: input.recipientName,
    groups: input.groups,
    ownedProjectIds: input.ownedProjectIds,
    mainPmNameByProjectId: input.mainPmNameByProjectId,
    asOf: input.asOf,
  });

  return { html, text };
}

function summaryTable(summary: AnnualFeeSummary): string {
  const cells = [
    ['項目數', String(summary.projectCount), '#0d1a2d'],
    ['收入合計', formatFinanceMoney(summary.totalBilled), '#0d1a2d'],
    ['下次收費合計', formatFinanceMoney(summary.upcomingAmount), '#9f1239'],
  ];
  const row = cells.map(([label, value, color]) => `
    <td width="33%" style="width:33%;padding:8px;vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb;border:1px solid #d7dee8;">
        <tr>
          <td style="padding:10px 12px;">
            <p style="margin:0 0 4px;font-size:12px;color:#4b5b70;">${escapeHtml(label)}</p>
            <p style="margin:0;font-size:16px;line-height:1.3;font-weight:700;color:${color};">${escapeHtml(value)}</p>
          </td>
        </tr>
      </table>
    </td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>${row}</tr></table>`;
}

function renderProject(
  group: AnnualFeeGroup,
  input: {
    asOf: string;
    siteOrigin?: string;
    ownedProjectIds: ReadonlySet<string>;
    mainPmNameByProjectId: Record<string, string>;
  },
): string {
  const siteOrigin = normalizeOrigin(input.siteOrigin || CANONICAL_SITE_URL);
  const owned = input.ownedProjectIds.has(group.projectId);
  const pmName = input.mainPmNameByProjectId[group.projectId] || '未設定';
  const typeLabel = financeProjectTypeLabel(group.projectTypeKey) || group.projectTypeKey;
  const projectHref = projectDetailHref(siteOrigin, group.projectId, group.projectStatus);
  const hiddenCount = group.rows.length - group.defaultRows.length;
  const hiddenNote = hiddenCount > 0
    ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#4b5b70;">另有 ${hiddenCount} 期已在年度收費頁收合（已收或沒有到期日）。</p>`
    : '';
  const chase = owned
    ? '<p style="margin:0 0 8px;font-size:13px;line-height:1.5;font-weight:700;color:#9f1239;">請你跟進</p>'
    : '';
  const rows = group.defaultRows.map((row) => renderLine(row, input.asOf)).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border:1px solid #d7dee8;">
      <tr>
        <td style="padding:16px;background:#f8fafc;border-bottom:1px solid #d7dee8;">
          ${chase}
          <h2 style="margin:0 0 4px;font-size:18px;line-height:1.4;color:#0d1a2d;">${escapeHtml(group.projectName || '未指定項目')}</h2>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#4b5b70;">${escapeHtml(group.clientName || '—')} · ${escapeHtml(typeLabel)} · 主負責 PM ${escapeHtml(pmName)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${headerStat('收入合計', formatFinanceMoney(group.totalBilled))}
              ${headerStat('期數', String(group.installmentCount))}
              ${headerStat('下次收費日', formatAnnualFeeNextDueLabel(group))}
              ${headerStat('下次收費金額', formatFinanceMoney(group.upcomingAmount), '#9f1239')}
            </tr>
          </table>
          <p style="margin:12px 0 0;">${actionButton(projectHref, '開啟項目')}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 8px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <thead>
              <tr>
                ${columnHeader('到期日')}
                ${columnHeader('期數')}
                ${columnHeader('類型')}
                ${columnHeader('應收', 'right')}
                ${columnHeader('實收', 'right')}
                ${columnHeader('未收', 'right')}
                ${columnHeader('狀態')}
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          ${hiddenNote}
        </td>
      </tr>
    </table>`;
}

function renderLine(row: AnnualFeeIncomeRow, asOf: string): string {
  const days = daysUntilDue(row.dueDate, asOf);
  const dayColor = days == null ? '#4b5b70' : days < 0 ? '#9f1239' : days <= 7 ? '#92400e' : '#4b5b70';
  const due = `${formatIncomeDate(row.dueDate)} ${formatRemainingDays(days)}`;
  return `<tr>
    <td style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;color:${dayColor};">${escapeHtml(due)}</td>
    <td style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;">${escapeHtml(row.installmentNumber == null ? '—' : String(row.installmentNumber))}</td>
    <td style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;">${escapeHtml(row.typeLabel || '未分類')}</td>
    <td align="right" style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(formatFinanceMoney(row.billedAmount, row.currency))}</td>
    <td align="right" style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(formatFinanceMoney(row.paymentAmount, row.currency))}</td>
    <td align="right" style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;white-space:nowrap;color:#9f1239;font-weight:700;">${escapeHtml(formatFinanceMoney(row.outstanding, row.currency))}</td>
    <td style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;">${escapeHtml(annualFeePaymentStatusLabel(row))}</td>
  </tr>`;
}

function headerStat(label: string, value: string, color = '#0d1a2d'): string {
  return `<td width="25%" style="width:25%;padding:4px 8px 4px 0;vertical-align:top;">
    <p style="margin:0;font-size:12px;color:#4b5b70;">${escapeHtml(label)}</p>
    <p style="margin:0;font-size:14px;line-height:1.4;font-weight:700;color:${color};">${escapeHtml(value)}</p>
  </td>`;
}

function columnHeader(label: string, align: 'left' | 'right' = 'left'): string {
  return `<th scope="col" align="${align}" style="padding:8px;border-bottom:1px solid #d7dee8;font-size:12px;color:#4b5b70;font-weight:700;">${escapeHtml(label)}</th>`;
}

function actionButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;background:#0d1a2d;color:#ffffff;font-size:13px;font-weight:700;line-height:1;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>`;
}

function renderText(input: {
  asOf: string;
  asOfLabel: string;
  pageHref: string;
  siteOrigin: string;
  summary: AnnualFeeSummary;
  ownedCount: number;
  ownedUpcoming: number;
  recipientName: string;
  groups: readonly AnnualFeeGroup[];
  ownedProjectIds: ReadonlySet<string>;
  mainPmNameByProjectId: Record<string, string>;
}): string {
  const lines = [
    `MPS 財務 — ${ANNUAL_FEES_REMINDER_SUBJECT}`,
    '',
    `${input.recipientName}，這是每週一的收費提醒。請追收你負責的即將到期及已逾期未收款項。`,
    `基準日 ${input.asOfLabel}（香港時間）`,
    `你負責 ${input.ownedCount} 個項目，下次收費合計 ${formatFinanceMoney(input.ownedUpcoming)}。`,
    `項目數：${input.summary.projectCount}`,
    `收入合計：${formatFinanceMoney(input.summary.totalBilled)}`,
    `下次收費合計：${formatFinanceMoney(input.summary.upcomingAmount)}`,
    '',
    `開啟年度收費頁面：${input.pageHref}`,
    '',
  ];

  if (input.groups.length === 0) {
    lines.push('目前沒有未收逾期或即將到期的年度收費。');
  }

  input.groups.forEach((group, index) => {
    const owned = input.ownedProjectIds.has(group.projectId);
    const pmName = input.mainPmNameByProjectId[group.projectId] || '未設定';
    const typeLabel = financeProjectTypeLabel(group.projectTypeKey) || group.projectTypeKey;
    lines.push(`${index + 1}. ${group.projectName || '未指定項目'}${owned ? '（請你跟進）' : ''}`);
    lines.push(`客戶：${group.clientName || '—'} · ${typeLabel} · 主負責 PM ${pmName}`);
    lines.push(`收入合計：${formatFinanceMoney(group.totalBilled)} · 期數：${group.installmentCount}`);
    lines.push(`下次收費日：${formatAnnualFeeNextDueLabel(group)} · 下次收費金額：${formatFinanceMoney(group.upcomingAmount)}`);
    group.defaultRows.forEach((row) => {
      const days = formatRemainingDays(daysUntilDue(row.dueDate, input.asOf));
      const installment = row.installmentNumber == null ? '—' : String(row.installmentNumber);
      lines.push(
        `- 到期 ${formatIncomeDate(row.dueDate)}（${days}）｜期數 ${installment}｜${row.typeLabel || '未分類'}｜應收 ${formatFinanceMoney(row.billedAmount, row.currency)}｜實收 ${formatFinanceMoney(row.paymentAmount, row.currency)}｜未收 ${formatFinanceMoney(row.outstanding, row.currency)}｜${annualFeePaymentStatusLabel(row)}`,
      );
    });
    const hiddenCount = group.rows.length - group.defaultRows.length;
    if (hiddenCount > 0) lines.push(`另有 ${hiddenCount} 期已在年度收費頁收合。`);
    lines.push(`開啟項目：${projectDetailHref(input.siteOrigin, group.projectId, group.projectStatus)}`);
    lines.push('');
  });

  lines.push('此郵件每週一早上 6:00（香港時間）自動發送給年度收費頁項目的主負責 PM。');
  return lines.join('\n');
}

function normalizeOrigin(origin: string): string {
  return String(origin || CANONICAL_SITE_URL).trim().replace(/\/$/, '') || CANONICAL_SITE_URL;
}
