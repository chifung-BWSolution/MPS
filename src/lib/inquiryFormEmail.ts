export type InquiryEmailAnswer = {
  label: string;
  value: string | string[];
  files?: { name: string; url: string }[];
};

type TokenContext = {
  formName: string;
  websiteName: string;
  answers: InquiryEmailAnswer[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function answerText(value: string | string[]): string {
  return Array.isArray(value) ? value.join('、') : value;
}

function answerPlainText(answer: InquiryEmailAnswer): string {
  const value = answerText(answer.value);
  const links = (answer.files || []).map((file) => `${file.name}: ${file.url}`);
  return [value, ...links].filter(Boolean).join('\n');
}

function hasAnswer(answer: InquiryEmailAnswer): boolean {
  return Boolean(answerText(answer.value).trim() || answer.files?.length);
}

export function applyInquiryEmailTokens(template: string, context: TokenContext): string {
  let output = String(template || '')
    .replace(/\{\{\s*form_name\s*\}\}/gi, context.formName)
    .replace(/\{\{\s*website_name\s*\}\}/gi, context.websiteName);
  output = output.replace(/\{\{\s*field:([^}]+)\}\}/gi, (_match, rawLabel: string) => {
    const label = String(rawLabel).trim();
    const answer = context.answers.find((item) => item.label === label);
    return answer ? answerText(answer.value) : '';
  });
  return output;
}

function answerRows(answers: InquiryEmailAnswer[], showEmptyFields: boolean): string {
  return answers
    .filter((answer) => showEmptyFields || hasAnswer(answer))
    .map((answer) => `
      <tr>
        <th align="left" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px;vertical-align:top;width:34%;">${escapeHtml(answer.label)}</th>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;white-space:pre-wrap;">
          ${escapeHtml(answerText(answer.value) || (answer.files?.length ? '' : '—'))}
          ${(answer.files || []).map((file) => `<div style="margin-top:6px;"><a href="${escapeHtml(file.url)}" style="color:#0369a1;text-decoration:underline;">下載 ${escapeHtml(file.name)}</a></div>`).join('')}
        </td>
      </tr>`).join('');
}

function wrapEmail(title: string, intro: string, body: string): string {
  return `<!doctype html>
<html lang="zh-Hant">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
  <body style="margin:0;background:#f1f5f9;font-family:Arial,'Noto Sans TC',sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#075985;padding:20px 24px;color:#ffffff;">
            <h1 style="margin:0;font-size:21px;line-height:1.4;">${escapeHtml(title)}</h1>
          </td></tr>
          <tr><td style="padding:24px;">
            <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#334155;white-space:pre-wrap;">${escapeHtml(intro)}</p>
            ${body}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildInquirySubmissionEmail(input: {
  formName: string;
  websiteName: string;
  answers: InquiryEmailAnswer[];
  subjectTemplate?: string;
  showEmptyFields?: boolean;
  submittedAt?: string;
  visitorIp?: string;
  referrer?: string;
}): { subject: string; html: string; text: string } {
  const context: TokenContext = {
    formName: input.formName,
    websiteName: input.websiteName,
    answers: input.answers,
  };
  const subject = applyInquiryEmailTokens(
    input.subjectTemplate || '新表格回覆 — {{form_name}}',
    context,
  ).replace(/[\r\n]+/g, ' ').trim().slice(0, 200) || `新表格回覆 — ${input.formName}`;
  const meta = [
    input.websiteName ? `網站：${input.websiteName}` : '',
    input.submittedAt ? `收到時間：${input.submittedAt}` : '',
    input.visitorIp ? `訪客 IP：${input.visitorIp}` : '',
    input.referrer ? `來源頁面：${input.referrer}` : '',
  ].filter(Boolean);
  const rows = answerRows(input.answers, input.showEmptyFields === true);
  const html = wrapEmail(
    input.formName,
    ['收到一份新的表格回覆。', ...meta].join('\n'),
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:6px;border-collapse:separate;border-spacing:0;">${rows}</table>`,
  );
  const text = [
    input.formName,
    ...meta,
    '',
    ...input.answers
      .filter((answer) => input.showEmptyFields === true || hasAnswer(answer))
      .map((answer) => `${answer.label}: ${answerPlainText(answer) || '—'}`),
  ].join('\n');
  return { subject, html, text };
}

export function buildInquiryAutoresponderEmail(input: {
  formName: string;
  websiteName: string;
  answers: InquiryEmailAnswer[];
  senderName?: string;
  subjectTemplate?: string;
  messageTemplate?: string;
  includeCopy?: boolean;
}): { subject: string; html: string; text: string } {
  const context: TokenContext = {
    formName: input.formName,
    websiteName: input.websiteName,
    answers: input.answers,
  };
  const subject = applyInquiryEmailTokens(
    input.subjectTemplate || '已收到你的 {{form_name}}',
    context,
  ).replace(/[\r\n]+/g, ' ').trim().slice(0, 200) || `已收到你的 ${input.formName}`;
  const message = applyInquiryEmailTokens(
    input.messageTemplate || '多謝你的查詢，我們已收到資料，會盡快跟進。',
    context,
  );
  const copy = input.includeCopy
    ? `<h2 style="margin:24px 0 8px;font-size:16px;">你送出的資料</h2>
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:6px;border-collapse:separate;border-spacing:0;">${answerRows(input.answers, true)}</table>`
    : '';
  const html = wrapEmail(
    input.senderName || input.websiteName || input.formName,
    message,
    copy,
  );
  const text = [
    message,
    input.includeCopy ? '' : '',
    ...(input.includeCopy
      ? input.answers.map((answer) => `${answer.label}: ${answerPlainText(answer) || '—'}`)
      : []),
  ].join('\n');
  return { subject, html, text };
}
