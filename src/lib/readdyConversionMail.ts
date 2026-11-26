/** Result mail for a finished Readdy → Framer background conversion. */
export const READDY_CONVERSION_RESULT_TO = 'cfb.marketing@chifung.net';

export type ReaddyConversionPageResult = {
  path: string;
  title: string;
  status: 'migrated' | 'failed';
  sectionCount: number;
  error?: string;
};

export type ReaddyConversionMailInput = {
  siteName: string;
  readdyCode: string;
  /** Hong Kong calendar date, YYYY-MM-DD. */
  date: string;
  framerProjectUrl: string;
  kind: 'success' | 'failed';
  pages: ReaddyConversionPageResult[];
  unstarted: number;
  cancelled?: boolean;
  error?: string;
  /** Extra line for the one-off template test. Omitted on real sends. */
  notice?: string;
  /** Present when this run tried to Publish. Omitted when auto Publish is off. */
  publishNote?: string;
};

export function hongKongDateLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Pull the Readdy project token from a repo, zip, or folder name. */
export function extractReaddyCode(sources: Array<string | null | undefined>): string {
  const text = sources
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .join('\n');
  const tagged = text.match(/readdy[-_\s]?([a-z0-9]{3,})/i);
  if (tagged?.[1]) return tagged[1];
  const project = text.match(/project[-_\s]?(\d{4,})/i);
  if (project?.[1]) return project[1];
  return '未知';
}

export function buildReaddyConversionSubject(input: {
  siteName: string;
  readdyCode: string;
  date: string;
}): string {
  const site = input.siteName.replace(/\s+/g, ' ').trim() || '未命名網站';
  const code = input.readdyCode.trim() || '未知';
  const date = input.date.trim();
  return `【MPS】${site}(Readdy-${code})轉換結果 ${date}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReaddyConversionResultEmail(input: ReaddyConversionMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = buildReaddyConversionSubject(input);
  const migrated = input.pages.filter((page) => page.status === 'migrated');
  const failed = input.pages.filter((page) => page.status === 'failed');
  const outcome = input.kind === 'success' ? '轉換成功' : '轉換失敗';
  const site = input.siteName.trim() || '未命名網站';
  const code = input.readdyCode.trim() || '未知';

  const textLines = [
    `Readdy → Framer ${outcome}`,
    '',
    `網站：${site}`,
    `Readdy 編號：Readdy-${code}`,
    `日期：${input.date}（香港時間）`,
    `Framer：${input.framerProjectUrl || '—'}`,
    `完成 ${migrated.length} 頁，失敗 ${failed.length} 頁，未開始 ${input.unstarted} 頁。`,
  ];
  if (input.publishNote) textLines.push(input.publishNote);
  if (input.notice) textLines.push('', input.notice);
  if (input.cancelled) textLines.push('', '這次轉換已中止，其餘頁面沒有繼續。');
  if (input.error) textLines.push('', `原因：${input.error}`);
  if (input.pages.length) {
    textLines.push('', '頁面：');
    input.pages.forEach((page, index) => {
      const mark = page.status === 'migrated' ? '成功' : '失敗';
      textLines.push(`${index + 1}. [${mark}] ${page.path} ${page.title}（${page.sectionCount} 個區塊）`);
      if (page.error) textLines.push(`   ${page.error}`);
    });
  }
  textLines.push('', '—', '此郵件由 MPS「Readdy → Framer 轉換」後台任務寄出。');
  const text = textLines.join('\n');

  const rows = input.pages
    .map((page) => {
      const ok = page.status === 'migrated';
      const badgeBg = ok ? '#dcfce7' : '#fee2e2';
      const badgeColor = ok ? '#166534' : '#991b1b';
      const badge = ok ? '成功' : '失敗';
      const error = page.error
        ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:#991b1b;">${escapeHtml(page.error)}</div>`
        : '';
      return `<div style="margin-top:10px;border:1px solid #e6ebf2;border-radius:10px;padding:12px 14px;">
        <span style="display:inline-block;padding:3px 8px;border-radius:6px;background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700;">${badge}</span>
        <div style="margin-top:8px;font-size:15px;font-weight:700;color:#0d1a2d;">${escapeHtml(page.title)}</div>
        <div style="margin-top:2px;font-size:13px;color:#64748b;">${escapeHtml(page.path)} · ${page.sectionCount} 個區塊</div>
        ${error}
      </div>`;
    })
    .join('');

  const notice = input.notice
    ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;">${escapeHtml(input.notice)}</p>`
    : '';
  const reason = input.error
    ? `<p style="margin:12px 0 0;color:#991b1b;">原因：${escapeHtml(input.error)}</p>`
    : '';
  const cancelled = input.cancelled
    ? '<p style="margin:12px 0 0;color:#9a3412;">這次轉換已中止，其餘頁面沒有繼續。</p>'
    : '';

  const inner = `
    ${notice}
    <h2 style="margin:0 0 12px;font-size:18px;color:#0d1a2d;">Readdy → Framer ${outcome}</h2>
    <p style="margin:0;color:#4b5b70;line-height:1.7;">
      網站：${escapeHtml(site)}<br />
      Readdy 編號：Readdy-${escapeHtml(code)}<br />
      日期：${escapeHtml(input.date)}（香港時間）<br />
      Framer：${escapeHtml(input.framerProjectUrl || '—')}
    </p>
    <p style="margin:12px 0 0;color:#0d1a2d;">完成 ${migrated.length} 頁，失敗 ${failed.length} 頁，未開始 ${input.unstarted} 頁。</p>
    ${input.publishNote ? `<p style="margin:12px 0 0;color:#0d1a2d;">${escapeHtml(input.publishNote)}</p>` : ''}
    ${cancelled}
    ${reason}
    ${rows}
    <p style="margin:20px 0 0;color:#4b5b70;">—<br />此郵件由 MPS「Readdy → Framer 轉換」後台任務寄出。</p>
  `;

  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;background:#f5f8fc;color:#0d1a2d;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;"><div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d7dee8;padding:24px;">${inner}</div></body></html>`;

  return { subject, html, text };
}
