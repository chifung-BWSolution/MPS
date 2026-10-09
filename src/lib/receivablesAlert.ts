import { CANONICAL_SITE_URL } from './siteUrl.ts';

/** Lines kept in one email so Gmail does not clip the message. */
export const RECEIVABLES_ALERT_MAX_LINES = 40;
/** Resend allows at most 50 recipients on a single send. */
export const RECEIVABLES_ALERT_RECIPIENT_BATCH = 50;

/** Weekday receivables report recipients. Override with RECEIVABLES_ALERT_TO. */
export const DEFAULT_RECEIVABLES_ALERT_RECIPIENTS = [
  'cfb.marketing@chifung.net',
  'brandingworks.ebiz@gmail.com',
  'franco.kaffa@gmail.com',
  'brandingworks.finance@gmail.com',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ReceivableAlertLine = {
  id: string;
  typeLabel: string;
  installmentNumber?: number;
  currency?: string;
  billedAmount: number;
  paymentAmount: number;
  outstanding: number;
  dueDate?: string;
  paymentStatus?: string;
  remarks?: string;
};

export type ReceivableAlertProject = {
  projectId: string;
  projectName: string;
  projectStatus?: string;
  clientName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  lines: ReceivableAlertLine[];
};

export type ReceivablesAlertSummary = {
  count: number;
  overdue: number;
  billed: number;
  received: number;
  outstanding: number;
};

export type ReceivablesAlertEmail = {
  subject: string;
  html: string;
  text: string;
  summary: ReceivablesAlertSummary;
  omittedLineCount: number;
};

const STATUS_LABELS: Record<string, string> = {
  'Pending Check': '待核對',
  Received: '已收款',
  'Not Received': '未收款',
};

export function hongKongIsoDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatAlertMoney(amount: number, currency = 'HKD'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const fixed = (Math.round(safe * 100) / 100).toFixed(2);
  const [whole, frac] = fixed.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${withCommas}.${frac} ${currency || 'HKD'}`;
}

export function formatAlertDate(value: string | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[1]}/${match[2]}/${match[3]}`;
}

export function daysUntilDue(dueDate: string | undefined, asOf: string): number | null {
  const due = dateUtc(dueDate);
  const today = dateUtc(asOf);
  if (due == null || today == null) return null;
  return Math.round((due - today) / 86_400_000);
}

export function formatRemainingDays(days: number | null): string {
  if (days == null) return '未有到期日';
  if (days < 0) return `逾期 ${Math.abs(days)} 日`;
  if (days === 0) return '今日到期';
  return `尚餘 ${days} 日`;
}

export function statusLabel(status: string | undefined): string {
  const trimmed = status?.trim();
  if (!trimmed) return '—';
  return STATUS_LABELS[trimmed] ?? trimmed;
}

export function receivablesPageHref(siteOrigin: string): string {
  return `${normalizeOrigin(siteOrigin)}/#finance/receivables`;
}

export function projectDetailHref(
  siteOrigin: string,
  projectId: string,
  projectStatus?: string,
): string {
  const page = projectStatus === 'confirmed' ? 'projects' : 'pitching';
  const id = encodeURIComponent(projectId.trim());
  return `${normalizeOrigin(siteOrigin)}/#quotation/${page}?id=${id}`;
}

/** Hong Kong 8-digit mobiles become 852… so wa.me opens the right chat. */
export function whatsappDigits(phone: string | undefined): string | null {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `852${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function whatsappHref(phone: string | undefined, text: string): string | null {
  const digits = whatsappDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function customerMailtoHref(
  email: string | undefined,
  subject: string,
  body: string,
): string | null {
  const address = String(email ?? '').trim();
  if (!EMAIL_RE.test(address)) return null;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function selectAlertRecipients(override?: string | null): string[] {
  const source = String(override ?? '').trim()
    ? String(override).split(/[,;\s]+/)
    : DEFAULT_RECEIVABLES_ALERT_RECIPIENTS;
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const item of source) {
    const email = String(item ?? '').trim();
    const key = email.toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }
  return recipients;
}

export function chunkRecipients(
  emails: string[],
  size = RECEIVABLES_ALERT_RECIPIENT_BATCH,
): string[][] {
  const batchSize = Math.max(1, size);
  const batches: string[][] = [];
  for (let index = 0; index < emails.length; index += batchSize) {
    batches.push(emails.slice(index, index + batchSize));
  }
  return batches;
}

export function receivablesAlertIdempotencyKey(asOf: string, batchIndex: number): string {
  return `receivables-alert/${asOf}/batch-${batchIndex}`.slice(0, 256);
}

export function summarizeReceivableProjects(
  projects: ReceivableAlertProject[],
  asOf: string,
): ReceivablesAlertSummary {
  const lines = projects.flatMap((project) => project.lines);
  return {
    count: lines.length,
    overdue: lines.filter((line) => {
      const days = daysUntilDue(line.dueDate, asOf);
      return days != null && days < 0;
    }).length,
    billed: sum(lines.map((line) => line.billedAmount)),
    received: sum(lines.map((line) => line.paymentAmount)),
    outstanding: sum(lines.map((line) => line.outstanding)),
  };
}

export function sortReceivableProjects(
  projects: ReceivableAlertProject[],
  asOf: string,
): ReceivableAlertProject[] {
  return projects
    .map((project) => ({
      ...project,
      lines: [...project.lines].sort((a, b) => compareDue(a.dueDate, b.dueDate, asOf)),
    }))
    .sort((a, b) => compareDue(earliestDue(a, asOf), earliestDue(b, asOf), asOf));
}

export function customerFollowUpMessage(project: ReceivableAlertProject, asOf: string): string {
  const greeting = project.contactPerson?.trim()
    ? `您好，${project.contactPerson.trim()}：`
    : '您好：';
  const itemLines = project.lines.map((line, index) => {
    const installment = line.installmentNumber ? `第 ${line.installmentNumber} 期` : '不分期';
    const days = formatRemainingDays(daysUntilDue(line.dueDate, asOf));
    return [
      `${index + 1}. ${line.typeLabel || '未分類'}（${installment}）`,
      `到期日：${formatAlertDate(line.dueDate)}（${days}）`,
      `應收：${formatAlertMoney(line.billedAmount, line.currency)}`,
      `實收：${formatAlertMoney(line.paymentAmount, line.currency)}`,
      `未收：${formatAlertMoney(line.outstanding, line.currency)}`,
    ].join('\n');
  });
  return [
    greeting,
    '',
    `以下為「${project.projectName}」截至 ${formatAlertDate(asOf)} 尚未收到的款項，敬請安排付款：`,
    '',
    ...itemLines.flatMap((block) => [block, '']),
    '如已付款，請回覆並提供收據，以便我們核對。謝謝。',
  ].join('\n');
}

export function buildReceivablesAlertEmail(input: {
  asOf: string;
  siteOrigin?: string;
  projects: ReceivableAlertProject[];
}): ReceivablesAlertEmail {
  const asOf = input.asOf;
  const siteOrigin = normalizeOrigin(input.siteOrigin || CANONICAL_SITE_URL);
  const sorted = sortReceivableProjects(input.projects, asOf).filter((project) => project.lines.length > 0);
  const summary = summarizeReceivableProjects(sorted, asOf);
  const { visible, omittedLineCount } = selectVisibleProjects(sorted, RECEIVABLES_ALERT_MAX_LINES);
  const pageHref = receivablesPageHref(siteOrigin);
  const subject = summary.count === 0
    ? `應收未收日報 ${formatAlertDate(asOf)} — 目前沒有未收款項`
    : `應收未收日報 ${formatAlertDate(asOf)} — 未收 ${summary.count} 筆（逾期 ${summary.overdue}）`;

  return {
    subject,
    html: renderHtml({ asOf, siteOrigin, pageHref, summary, visible, omittedLineCount }),
    text: renderText({ asOf, pageHref, summary, visible, omittedLineCount, siteOrigin }),
    summary,
    omittedLineCount,
  };
}

function renderHtml(input: {
  asOf: string;
  siteOrigin: string;
  pageHref: string;
  summary: ReceivablesAlertSummary;
  visible: ReceivableAlertProject[];
  omittedLineCount: number;
}): string {
  const preview = input.summary.count === 0
    ? `應收未收日報 ${formatAlertDate(input.asOf)}：目前沒有未收款項。`
    : `應收未收日報：未收 ${input.summary.count} 筆，逾期 ${input.summary.overdue} 筆，未收合計 ${formatAlertMoney(input.summary.outstanding)}。`;

  const projects = input.visible.length === 0
    ? `<p style="margin:0;color:#0d1a2d;">目前沒有未收金額大於 0 的收入紀錄。</p>`
    : input.visible.map((project) => renderProjectHtml(project, input.asOf, input.siteOrigin)).join('');

  const omitted = input.omittedLineCount > 0
    ? `<p style="margin:20px 0 0;color:#4b5b70;">另有 ${input.omittedLineCount} 筆未收未列在這封郵件。請開啟應收未收頁面查看全部。</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(preview)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;color:#0d1a2d;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #d7dee8;">
          <tr>
            <td style="padding:24px 24px 8px;background:#0d1a2d;color:#ffffff;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;color:#d7dee8;">MPS 財務</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">應收未收日報</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;">
              <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#4b5b70;">基準日 ${escapeHtml(formatAlertDate(input.asOf))}（香港時間）。內容與系統「應收未收」相同：列出未收金額大於 0 的收入（應收 − 實收 − 壞帳）。</p>
              ${summaryTable(input.summary)}
              <p style="margin:16px 0 0;">${actionButton(input.pageHref, '開啟應收未收頁面', '#0d1a2d')}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              ${projects}
              ${omitted}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #d7dee8;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#4b5b70;">此郵件由 MPS 每個工作日早上自動發送給系統用戶，方便跟進未收款項。WhatsApp 與電郵按鈕會帶上該項目的未收明細，方便直接聯絡客戶。「開啟項目」會進入客戶項目詳情。</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function summaryTable(summary: ReceivablesAlertSummary): string {
  const cells = [
    ['未收筆數', String(summary.count), '#0d1a2d'],
    ['逾期筆數', String(summary.overdue), '#9f1239'],
    ['應收合計', formatAlertMoney(summary.billed), '#0d1a2d'],
    ['未收合計', formatAlertMoney(summary.outstanding), '#9f1239'],
  ];
  const row = cells.map(([label, value, color]) => `
    <td width="25%" style="width:25%;padding:8px;vertical-align:top;">
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

function renderProjectHtml(project: ReceivableAlertProject, asOf: string, siteOrigin: string): string {
  const followUp = customerFollowUpMessage(project, asOf);
  const subject = `未收款項跟進 — ${project.projectName}`;
  const projectHref = project.projectId
    ? projectDetailHref(siteOrigin, project.projectId, project.projectStatus)
    : '';
  const whatsapp = whatsappHref(project.phone, followUp);
  const mailto = customerMailtoHref(project.email, subject, followUp);
  const contactBits = [
    project.contactPerson?.trim() ? `聯絡人 ${project.contactPerson.trim()}` : '',
    project.phone?.trim() ? `電話 ${project.phone.trim()}` : '',
    project.email?.trim() ? `電郵 ${project.email.trim()}` : '',
  ].filter(Boolean);

  const buttons = [
    projectHref ? actionButton(projectHref, '開啟項目', '#0d1a2d') : '',
    whatsapp ? actionButton(whatsapp, 'WhatsApp 客戶', '#075E54') : '',
    mailto ? actionButton(mailto, '電郵客戶', '#1e3a8a') : '',
  ].filter(Boolean);

  const missingContact = !whatsapp && !mailto
    ? `<p style="margin:8px 0 0;font-size:13px;color:#92400e;">客戶列表未有可用電話或電郵，請先到客戶資料補上再聯絡。</p>`
    : '';

  const rows = project.lines.map((line) => renderLineHtml(line, asOf)).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border:1px solid #d7dee8;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 4px;font-size:12px;color:#4b5b70;">客戶 ${escapeHtml(project.clientName || '—')}</p>
          <h2 style="margin:0 0 8px;font-size:18px;line-height:1.4;color:#0d1a2d;">${escapeHtml(project.projectName || '未指定項目')}</h2>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#4b5b70;">${escapeHtml(contactBits.join(' · ') || '未有聯絡資料')}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <th align="left" style="padding:8px;border-bottom:1px solid #d7dee8;font-size:12px;color:#4b5b70;">到期日</th>
              <th align="left" style="padding:8px;border-bottom:1px solid #d7dee8;font-size:12px;color:#4b5b70;">剩餘</th>
              <th align="left" style="padding:8px;border-bottom:1px solid #d7dee8;font-size:12px;color:#4b5b70;">類型</th>
              <th align="right" style="padding:8px;border-bottom:1px solid #d7dee8;font-size:12px;color:#4b5b70;">未收</th>
              <th align="left" style="padding:8px;border-bottom:1px solid #d7dee8;font-size:12px;color:#4b5b70;">狀態</th>
            </tr>
            ${rows}
          </table>
          <p style="margin:12px 0 0;">${buttons.join(' ')}</p>
          ${missingContact}
        </td>
      </tr>
    </table>`;
}

function renderLineHtml(line: ReceivableAlertLine, asOf: string): string {
  const days = daysUntilDue(line.dueDate, asOf);
  const dayColor = days == null ? '#4b5b70' : days < 0 ? '#9f1239' : days <= 7 ? '#92400e' : '#4b5b70';
  const installment = line.installmentNumber ? `第 ${line.installmentNumber} 期` : '';
  const type = [line.typeLabel || '未分類', installment].filter(Boolean).join(' ');
  const remarks = line.remarks?.trim()
    ? `<br /><span style="color:#4b5b70;">備註：${escapeHtml(line.remarks.trim())}</span>`
    : '';
  const billed = `應收 ${formatAlertMoney(line.billedAmount, line.currency)}／實收 ${formatAlertMoney(line.paymentAmount, line.currency)}`;
  return `<tr>
    <td style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;">${escapeHtml(formatAlertDate(line.dueDate))}</td>
    <td style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;color:${dayColor};font-weight:700;">${escapeHtml(formatRemainingDays(days))}</td>
    <td style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;">${escapeHtml(type)}${remarks}<br /><span style="color:#4b5b70;">${escapeHtml(billed)}</span></td>
    <td align="right" style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;color:#9f1239;font-weight:700;white-space:nowrap;">${escapeHtml(formatAlertMoney(line.outstanding, line.currency))}</td>
    <td style="padding:8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top;">${escapeHtml(statusLabel(line.paymentStatus))}</td>
  </tr>`;
}

function actionButton(href: string, label: string, background: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;background:${background};color:#ffffff;font-size:13px;font-weight:700;line-height:1;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>`;
}

function renderText(input: {
  asOf: string;
  pageHref: string;
  summary: ReceivablesAlertSummary;
  visible: ReceivableAlertProject[];
  omittedLineCount: number;
  siteOrigin: string;
}): string {
  const lines = [
    'MPS 財務 — 應收未收日報',
    '',
    `基準日 ${formatAlertDate(input.asOf)}（香港時間）`,
    `未收筆數：${input.summary.count}`,
    `逾期筆數：${input.summary.overdue}`,
    `應收合計：${formatAlertMoney(input.summary.billed)}`,
    `實收合計：${formatAlertMoney(input.summary.received)}`,
    `未收合計：${formatAlertMoney(input.summary.outstanding)}`,
    '',
    `開啟應收未收頁面：${input.pageHref}`,
    '',
  ];

  if (input.visible.length === 0) {
    lines.push('目前沒有未收金額大於 0 的收入紀錄。');
  }

  input.visible.forEach((project, index) => {
    const followUp = customerFollowUpMessage(project, input.asOf);
    const projectHref = project.projectId
      ? projectDetailHref(input.siteOrigin, project.projectId, project.projectStatus)
      : '';
    const whatsapp = whatsappHref(project.phone, followUp);
    const mailto = customerMailtoHref(
      project.email,
      `未收款項跟進 — ${project.projectName}`,
      followUp,
    );
    lines.push(`${index + 1}. ${project.projectName || '未指定項目'}`);
    lines.push(`客戶：${project.clientName || '—'}`);
    if (project.contactPerson?.trim()) lines.push(`聯絡人：${project.contactPerson.trim()}`);
    if (project.phone?.trim()) lines.push(`電話：${project.phone.trim()}`);
    if (project.email?.trim()) lines.push(`電郵：${project.email.trim()}`);
    project.lines.forEach((line) => {
      const days = formatRemainingDays(daysUntilDue(line.dueDate, input.asOf));
      const installment = line.installmentNumber ? `第 ${line.installmentNumber} 期` : '不分期';
      lines.push(
        `- ${line.typeLabel || '未分類'}（${installment}）｜到期 ${formatAlertDate(line.dueDate)}（${days}）｜未收 ${formatAlertMoney(line.outstanding, line.currency)}｜${statusLabel(line.paymentStatus)}`,
      );
      if (line.remarks?.trim()) lines.push(`  備註：${line.remarks.trim()}`);
    });
    if (projectHref) lines.push(`開啟項目：${projectHref}`);
    if (whatsapp) lines.push(`WhatsApp 客戶：${whatsapp}`);
    if (mailto) lines.push(`電郵客戶：${mailto}`);
    if (!whatsapp && !mailto) lines.push('客戶列表未有可用電話或電郵。');
    lines.push('');
  });

  if (input.omittedLineCount > 0) {
    lines.push(`另有 ${input.omittedLineCount} 筆未收未列在這封郵件。請開啟應收未收頁面查看全部。`, '');
  }

  lines.push('此郵件由 MPS 每個工作日早上自動發送給系統用戶。');
  return lines.join('\n');
}

function selectVisibleProjects(
  projects: ReceivableAlertProject[],
  maxLines: number,
): { visible: ReceivableAlertProject[]; omittedLineCount: number } {
  const total = projects.reduce((count, project) => count + project.lines.length, 0);
  const visible: ReceivableAlertProject[] = [];
  let used = 0;
  for (const project of projects) {
    const room = maxLines - used;
    if (room <= 0) break;
    if (visible.length > 0 && project.lines.length > room) break;
    if (project.lines.length > room) {
      visible.push({ ...project, lines: project.lines.slice(0, room) });
      used = maxLines;
      break;
    }
    visible.push(project);
    used += project.lines.length;
  }
  return { visible, omittedLineCount: total - used };
}

function earliestDue(project: ReceivableAlertProject, asOf: string): string | undefined {
  return project.lines
    .map((line) => line.dueDate)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => compareDue(a, b, asOf))[0];
}

function compareDue(a: string | undefined, b: string | undefined, asOf: string): number {
  const aDays = daysUntilDue(a, asOf);
  const bDays = daysUntilDue(b, asOf);
  if (aDays == null && bDays == null) return 0;
  if (aDays == null) return 1;
  if (bDays == null) return -1;
  return aDays - bDays;
}

function dateUtc(value: string | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function sum(values: number[]): number {
  return Math.round(values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0) * 100) / 100;
}

function normalizeOrigin(origin: string): string {
  return String(origin || CANONICAL_SITE_URL).trim().replace(/\/$/, '') || CANONICAL_SITE_URL;
}
