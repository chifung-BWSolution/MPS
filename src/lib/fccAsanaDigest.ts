export type FccDigestCadence = 'daily' | 'weekdays' | 'weekly';

export type FccDigestTask = {
  title: string;
  url: string;
  completed: boolean | null;
  assignee: string;
  projects: string[];
};

export const FCC_DIGEST_DEFAULT_TIME = '18:00';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEEKDAY_LABEL = ['', '一', '二', '三', '四', '五', '六', '日'];

export function normalizeDigestRecipients(value: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const email = String(raw || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function hongKongParts(now = new Date()): { date: string; minutes: number; isoWeekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    isoWeekday: weekdayMap[get('weekday')] || 1,
  };
}

export function parseSendMinutes(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function fccDigestIsDue(input: {
  enabled: boolean;
  sendTime: string;
  cadence: FccDigestCadence;
  weekday: number;
  lastSentOn: string | null;
  now?: Date;
}): boolean {
  if (!input.enabled) return false;
  const clock = parseSendMinutes(input.sendTime);
  if (clock == null) return false;
  const now = hongKongParts(input.now);
  if (input.lastSentOn === now.date) return false;
  if (now.minutes < clock) return false;
  if (input.cadence === 'weekdays' && now.isoWeekday > 5) return false;
  if (input.cadence === 'weekly' && now.isoWeekday !== input.weekday) return false;
  return true;
}

export function fccDigestCron(input: {
  sendTime: string;
  cadence: FccDigestCadence;
  weekday: number;
}): string {
  const match = String(input.sendTime || FCC_DIGEST_DEFAULT_TIME).trim().match(/^(\d{1,2}):(\d{2})/);
  const hour = match ? Number(match[1]) : 18;
  const minute = match ? Number(match[2]) : 0;
  let utcHour = hour - 8;
  let shift = 0;
  if (utcHour < 0) {
    utcHour += 24;
    shift = -1;
  }
  const dow = (isoWeekday: number) => {
    const cronDay = isoWeekday === 7 ? 0 : isoWeekday;
    return (cronDay + shift + 7) % 7;
  };
  let days = '*';
  if (input.cadence === 'weekdays') days = [1, 2, 3, 4, 5].map(dow).join(',');
  if (input.cadence === 'weekly') days = String(dow(input.weekday >= 1 && input.weekday <= 7 ? input.weekday : 1));
  return `${minute} ${utcHour} * * ${days}`;
}

export function describeFccDigestSchedule(input: {
  enabled: boolean;
  sendTime: string;
  cadence: FccDigestCadence;
  weekday: number;
}): string {
  const time = String(input.sendTime || '').slice(0, 5) || FCC_DIGEST_DEFAULT_TIME;
  const when = input.cadence === 'weekdays'
    ? `星期一至五 ${time}`
    : input.cadence === 'weekly'
      ? `每週${WEEKDAY_LABEL[input.weekday] || '一'} ${time}`
      : `每日 ${time}`;
  const state = input.enabled ? '已啟用' : '未啟用，到時不會寄出';
  return `${when}（香港時間）。${state}。Cron：${fccDigestCron(input)}。`;
}

export function fccAsanaTaskUrl(gid: string): string {
  return `https://app.asana.com/0/0/${encodeURIComponent(gid)}`;
}

export function fccDigestProjectLabels(projects: Array<{ name: string; section?: string }>): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const project of projects) {
    const name = String(project.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const section = String(project.section || '').trim();
    const namedSection = section && !/^untitled section$/i.test(section) && section !== '未命名';
    labels.push(namedSection ? `${name}（${section}）` : name);
  }
  return labels;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFccAsanaDigestEmail(input: { date: string; tasks: FccDigestTask[]; notice?: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const count = input.tasks.length;
  const subject = `FC 查詢 Asana ${input.date} — 今日新開 ${count} 個 task`;
  const intro = count === 0
    ? `${input.date}（香港時間）沒有新開的 FC 查詢 Asana task。`
    : `${input.date}（香港時間）新開了 ${count} 個 FC 查詢 Asana task。`;
  const cards = input.tasks.map((task) => {
    const done = task.completed === true;
    const missing = task.completed == null;
    const badgeBg = missing ? '#f1f5f9' : done ? '#dcfce7' : '#ffedd5';
    const badgeColor = missing ? '#334155' : done ? '#166534' : '#9a3412';
    const badge = missing ? '找不到 task' : done ? '已完成' : '未完成';
    const projects = task.projects.length
      ? task.projects.map((project) => `<div style="margin:2px 0;font-size:14px;line-height:1.5;color:#0d1a2d;">${escapeHtml(project)}</div>`).join('')
      : '<div style="font-size:14px;line-height:1.5;color:#64748b;">未有專案</div>';
    return `<div style="margin-top:12px;border:1px solid #e6ebf2;border-radius:10px;padding:14px 16px;">
      <div style="display:inline-block;padding:4px 8px;border-radius:6px;background:${badgeBg};color:${badgeColor};font-size:13px;font-weight:700;line-height:1.4;">${badge}</div>
      <a href="${escapeHtml(task.url)}" style="display:block;margin-top:8px;color:#0f766e;font-size:16px;font-weight:700;line-height:1.5;text-decoration:none;">${escapeHtml(task.title)}</a>
      <div style="margin-top:10px;font-size:12px;line-height:1.4;color:#64748b;">負責人</div>
      <div style="font-size:14px;line-height:1.5;color:#0d1a2d;">${escapeHtml(task.assignee || '未指派')}</div>
      <div style="margin-top:8px;font-size:12px;line-height:1.4;color:#64748b;">專案</div>
      ${projects}
    </div>`;
  }).join('');
  const text = [
    intro,
    '',
    ...input.tasks.flatMap((task) => [
      task.completed == null ? '找不到 task' : task.completed ? '已完成' : '未完成',
      task.title,
      `負責人：${task.assignee || '未指派'}`,
      `專案：${task.projects.join('；') || '未有專案'}`,
      task.url,
      '',
    ]),
  ].join('\n').trim();
  const notice = input.notice
    ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px;line-height:1.5;">${escapeHtml(input.notice)}</p>`
    : '';
  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f7fb;color:#0d1a2d;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
    ${notice}
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.04em;color:#0f766e;font-weight:700;">FC 查詢</p>
    <h1 style="margin:0;font-size:20px;line-height:1.4;">今日新開 ${count} 個 task</h1>
    <p style="margin:12px 0 0;font-size:14px;line-height:1.6;">${escapeHtml(intro)}</p>
    ${cards}
  </div>
</body>
</html>`;
  return { subject, html, text };
}
