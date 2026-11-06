import {
  ADS_EMAIL_ALERT_THRESHOLD,
  DEFAULT_ADS_EMAIL_ALERT_STAFF_NAMES,
  alertMetricTone,
  buildAlertEmailHtml,
  buildAlertEmailSubject,
  percentChange,
  wrapAlertEmailHtml,
  type AdsEmailAlertBrandSnapshot,
  type AdsEmailAlertMetricCell,
} from './adsEmailAlert.ts';
import {
  ANNUAL_FEES_REMINDER_SUBJECT,
  buildAnnualFeeReminderEmails,
} from './annualFeeReminder.ts';
import type { AnnualFeeGroup } from './annualFeeIncomes.ts';
import {
  DEFAULT_RECEIVABLES_ALERT_RECIPIENTS,
  RECEIVABLES_ALERT_DUE_WITHIN_DAYS,
  buildReceivablesAlertEmail,
} from './receivablesAlert.ts';
import { CANONICAL_SITE_URL } from './siteUrl.ts';
import type { AdsClickTrendMetric } from '../types/adsCostTrend.ts';

/** Fixed date so the documented preview does not change with the calendar. */
const SAMPLE_AS_OF = '2026-11-09';

export type SystemNotificationKind = 'scheduled' | 'manual';

export type SystemNotificationRecipients = {
  /** Fixed addresses. Empty when there is no standing list. */
  addresses: readonly string[];
  /** Short To line shown when addresses is empty. */
  summary: string;
  note: string;
};

export type SystemNotificationDoc = {
  id: string;
  name: string;
  kind: SystemNotificationKind;
  subject: string;
  purpose: string;
  trigger: string;
  /** Human schedule. Manual notifications use a sentence instead of a clock time. */
  frequency: string;
  to: SystemNotificationRecipients;
  cc: readonly string[];
  bcc: readonly string[];
  previewHtml: string;
  previewSubject: string;
};

export function buildSystemNotificationCatalog(): SystemNotificationDoc[] {
  const annualPreview = buildAnnualFeePreview();
  const receivablesPreview = buildReceivablesPreview();
  const adsPreview = buildAdsPreview();

  return [
    {
      id: 'annual-fees-reminder',
      name: 'BWT月費/年費收費時間表',
      kind: 'scheduled',
      subject: ANNUAL_FEES_REMINDER_SUBJECT,
      purpose: '提醒年度收費頁上各項目的主負責 PM，跟進即將到期及已逾期未收的月費／年費。',
      trigger: '排程 annual-fees-reminder-weekly 於每週一 06:00（香港時間）呼叫 annual-fees-reminder。頁面沒有年度收費項目，或沒有任何在職主負責 PM 的有效工作電郵時，不會寄出。',
      frequency: '每週一 06:00（香港時間）。Cron：0 22 * * 0（星期日 22:00 UTC）。',
      to: {
        addresses: [],
        summary: '各項目在職主負責 PM 的工作電郵（每人一封）',
        note: '沒有固定名單。收件人是年度收費頁每個項目的在職主負責 PM 工作電郵。每位 PM 各收一封，內容是頁面上的全部項目，自己負責的項目標示「請你跟進」。沒有主負責 PM、已離職，或沒有有效工作電郵的項目不會新增收件人，項目仍會出現在其他 PM 的郵件裡。',
      },
      cc: [],
      bcc: [],
      previewHtml: annualPreview.html,
      previewSubject: annualPreview.subject,
    },
    {
      id: 'receivables-alert',
      name: '應收未收日報',
      kind: 'scheduled',
      subject: '應收未收日報 {基準日} — 未收 {筆數} 筆（逾期 {逾期筆數}）',
      purpose: '把已逾期，以及未來 30 日內到期且未收金額大於 0 的收入，整理成一封日報，方便同事跟進未收款。',
      trigger: '排程 receivables-alert-daily 於每週一 09:00（香港時間）呼叫 receivables-alert。當日沒有符合條件的未收款時不會寄出。更遠的到期日不會寫進郵件。',
      frequency: '每週一 09:00（香港時間）。Cron：0 1 * * 1（星期一 01:00 UTC）。',
      to: {
        addresses: DEFAULT_RECEIVABLES_ALERT_RECIPIENTS,
        summary: '固定收件人',
        note: `同一封信的 To 包含以上地址。環境變數 RECEIVABLES_ALERT_TO 可以取代這份名單。超過 50 人時會分批寄出，每批最多 50 個 To。只列出已逾期或 ${RECEIVABLES_ALERT_DUE_WITHIN_DAYS} 日內到期的未收。`,
      },
      cc: [],
      bcc: [],
      previewHtml: receivablesPreview.html,
      previewSubject: receivablesPreview.subject,
    },
    {
      id: 'ads-email-alert',
      name: '廣告成效預警',
      kind: 'manual',
      subject: `廣告成效預警（{本期} vs {上期}）— {品牌數} 個品牌 CPC/CPA 上升超過 ${ADS_EMAIL_ALERT_THRESHOLD}%`,
      purpose: '把 Google Ads／Facebook Ads 中 CPC 或 CPA 較上一期上升超過門檻的品牌整理成報告，寄給指定同事。',
      trigger: `同事在行銷管理「電郵預警通知」按「發送電郵預警」才會寄出。預設帶入 CPC 或 CPA 上升超過 ${ADS_EMAIL_ALERT_THRESHOLD}% 的品牌，寄出前可以改品牌、收件人、主旨與內文。`,
      frequency: '無固定排程。由同事手動發送。',
      to: {
        addresses: [],
        summary: '發送時勾選的同事工作電郵',
        note: `發送當下勾選的同事工作電郵，全部放在同一封信的 To。開啟對話框時，若員工名單有 ${DEFAULT_ADS_EMAIL_ALERT_STAFF_NAMES.join('、')}，會預先勾選這兩位。`,
      },
      cc: [],
      bcc: [],
      previewHtml: adsPreview.html,
      previewSubject: adsPreview.subject,
    },
  ];
}

function buildAnnualFeePreview(): { html: string; subject: string } {
  const groups: AnnualFeeGroup[] = [
    {
      projectId: 'sample-web',
      projectName: '範例網頁保養',
      clientName: '範例客戶',
      projectTypeKey: 'bwt_web',
      projectStatus: 'confirmed',
      totalBilled: 24000,
      installmentCount: 12,
      nextDueDate: '2026-11-16',
      nextBilledAmount: 2000,
      expiredOutstanding: 2000,
      upcomingAmount: 4000,
      rows: [],
      defaultRows: [
        {
          id: 'sample-web-overdue',
          projectName: '範例網頁保養',
          clientName: '範例客戶',
          typeLabel: '主要收入',
          installmentNumber: 10,
          currency: 'HKD',
          billedAmount: 2000,
          paymentAmount: 0,
          outstanding: 2000,
          dueDate: '2026-10-16',
          paymentStatus: 'Not Received',
        },
        {
          id: 'sample-web-upcoming',
          projectName: '範例網頁保養',
          clientName: '範例客戶',
          typeLabel: '主要收入',
          installmentNumber: 11,
          currency: 'HKD',
          billedAmount: 2000,
          paymentAmount: 0,
          outstanding: 2000,
          dueDate: '2026-11-16',
          paymentStatus: 'Not Received',
        },
      ],
    },
    {
      projectId: 'sample-system',
      projectName: '範例系統保養',
      clientName: '另一客戶',
      projectTypeKey: 'bwt_system',
      projectStatus: 'confirmed',
      totalBilled: 36000,
      installmentCount: 12,
      nextDueDate: '2026-11-20',
      nextBilledAmount: 3000,
      expiredOutstanding: 0,
      upcomingAmount: 3000,
      rows: [],
      defaultRows: [
        {
          id: 'sample-system-upcoming',
          projectName: '範例系統保養',
          clientName: '另一客戶',
          typeLabel: '主要收入',
          installmentNumber: 8,
          currency: 'HKD',
          billedAmount: 3000,
          paymentAmount: 0,
          outstanding: 3000,
          dueDate: '2026-11-20',
          paymentStatus: 'Not Received',
        },
      ],
    },
  ];

  const built = buildAnnualFeeReminderEmails({
    asOf: SAMPLE_AS_OF,
    siteOrigin: CANONICAL_SITE_URL,
    groups,
    assignments: [
      {
        projectId: 'sample-web',
        projectName: '範例網頁保養',
        staffId: 'sample-pm',
        name: '主負責 PM（範例）',
        email: 'pm@example.com',
        active: true,
      },
      {
        projectId: 'sample-system',
        projectName: '範例系統保養',
        staffId: 'sample-other-pm',
        name: '另一位 PM（範例）',
        email: 'other-pm@example.com',
        active: true,
      },
    ],
  });
  const email = built.emails.find((item) => item.email === 'pm@example.com') ?? built.emails[0];
  return { html: email?.html ?? '', subject: email?.subject ?? ANNUAL_FEES_REMINDER_SUBJECT };
}

function buildReceivablesPreview(): { html: string; subject: string } {
  const email = buildReceivablesAlertEmail({
    asOf: SAMPLE_AS_OF,
    siteOrigin: CANONICAL_SITE_URL,
    projects: [
      {
        projectId: 'sample-project',
        projectName: '範例客戶項目',
        projectStatus: 'confirmed',
        clientName: '範例客戶',
        contactPerson: '陳先生',
        phone: '91234567',
        email: 'client@example.com',
        lines: [
          {
            id: 'sample-overdue',
            typeLabel: '主要收入',
            installmentNumber: 2,
            currency: 'HKD',
            billedAmount: 8000,
            paymentAmount: 0,
            outstanding: 8000,
            dueDate: '2026-10-20',
            paymentStatus: 'Not Received',
          },
          {
            id: 'sample-upcoming',
            typeLabel: '主要收入',
            installmentNumber: 3,
            currency: 'HKD',
            billedAmount: 8000,
            paymentAmount: 0,
            outstanding: 8000,
            dueDate: '2026-11-16',
            paymentStatus: 'Not Received',
          },
        ],
      },
    ],
  });
  return { html: email.html, subject: email.subject };
}

function metricCell(
  metric: AdsClickTrendMetric,
  current: number,
  previous: number,
): AdsEmailAlertMetricCell {
  const percent = percentChange(current, previous);
  return { metric, current, previous, percent, tone: alertMetricTone(metric, percent) };
}

function buildAdsPreview(): { html: string; subject: string } {
  const cells = {
    impr: metricCell('impr', 12000, 10000),
    clicks: metricCell('clicks', 480, 500),
    conv: metricCell('conv', 18, 20),
    cpc: metricCell('cpc', 6.5, 4.8),
    cpa: metricCell('cpa', 140, 100),
  } satisfies Record<AdsClickTrendMetric, AdsEmailAlertMetricCell>;
  const flagged: AdsEmailAlertBrandSnapshot[] = [
    {
      brandId: 'sample-brand',
      brandCode: 'BWT',
      displayName: '範例品牌',
      campaignCount: 3,
      cells,
      isCostAlert: true,
    },
  ];
  const period = {
    current: '近 30 日',
    previous: '上一個 30 日',
    currentRange: '2026/10/11–2026/11/09',
    previousRange: '2026/09/11–2026/10/10',
  };
  return {
    subject: buildAlertEmailSubject(flagged, period),
    html: wrapAlertEmailHtml(buildAlertEmailHtml({ flagged, period, asOf: SAMPLE_AS_OF })),
  };
}
