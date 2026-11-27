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
import { buildFccAsanaDigestEmail, buildUnmatchedInquiryEmail, describeFccDigestSchedule, fccAsanaTaskUrl } from './fccAsanaDigest.ts';
import {
  READDY_CONVERSION_RESULT_TO,
  buildReaddyConversionResultEmail,
} from './readdyConversionMail.ts';
import {
  buildInquiryAutoresponderEmail,
  buildInquirySubmissionEmail,
  type InquiryEmailAnswer,
} from './inquiryFormEmail.ts';
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
  const fccDigestPreview = buildFccDigestPreview();
  const unmatchedPreview = buildUnmatchedPreview();
  const inquirySubmissionPreview = buildInquirySubmissionPreview();
  const inquiryAutoresponderPreview = buildInquiryAutoresponderPreview();
  const adsPreview = buildAdsPreview();
  const readdyPreview = buildReaddyConversionPreview();

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
      id: 'fcc-asana-digest',
      name: '查詢 Asana 日報',
      kind: 'scheduled',
      subject: '查詢 Asana {日期} — 今日新開 {個數} 個 task',
      purpose: '把當日 BW、FC、WP 新開的查詢 Asana task 放在同一封電郵，列出每個 task 的 Asana 連結和而家的狀態。',
      trigger: '排程 fcc-asana-digest 於本頁儲存的香港時間寄出。已啟用而且有至少一個收件人時才寄出。某個部門當日沒有新 task 仍會列出 0 個。同一日不會寄第二次。',
      frequency: describeFccDigestSchedule({
        enabled: false,
        sendTime: '18:00',
        cadence: 'daily',
        weekday: 1,
      }),
      to: {
        addresses: [],
        summary: '本頁設定儲存的收件人',
        note: '沒有固定名單。收件人、幾點寄、每日／星期一至五／每週哪一日，都在這張卡的設定儲存。Cc、Bcc 不用。未啟用或沒有有效電郵就不會寄。',
      },
      cc: [],
      bcc: [],
      previewHtml: fccDigestPreview.html,
      previewSubject: fccDigestPreview.subject,
    },
    {
      id: 'asana-inquiry-unmatched',
      name: '查詢對不上規則',
      kind: 'manual',
      subject: 'Asana 查詢對不上規則 — {部門}',
      purpose: 'BW 或 FC 收到 EmailMeForm，但主旨對不上現有規則、所以未有開 task 時，通知收件人去加一行，或者在錯誤頁略過。',
      trigger: 'BW 或 FC 的郵件同步第一次記低一封對不上規則的信時寄出。同一封信不會再寄。收件人沿用查詢 Asana 日報的名單；名單是空的就只記在錯誤頁，不寄信。',
      frequency: '無固定排程。對不上規則的新郵件出現時寄出。',
      to: {
        addresses: [],
        summary: '同查詢 Asana 日報的收件人',
        note: '沒有另一份名單。日報未加入收件人時，這封通知也不會寄。Cc、Bcc 不用。',
      },
      cc: [],
      bcc: [],
      previewHtml: unmatchedPreview.html,
      previewSubject: unmatchedPreview.subject,
    },
    {
      id: 'inquiry-form-submission',
      name: '自訂表格新回覆通知',
      kind: 'manual',
      subject: '新表格回覆 — {表格名稱}',
      purpose: '客人送出由「表格設定」建立的自訂表格後，把欄位答案及上載檔案的限時下載連結寄給該表格設定的同事。',
      trigger: '客人成功送出公開表格，而且該表格已開啟「新回覆通知」及最少有一個收件人時寄出。同一份回覆重試不會重複寄。',
      frequency: '無固定排程。客人成功送出表格時寄出。',
      to: {
        addresses: [],
        summary: '每份表格「通知與回覆」內設定的收件人',
        note: '每份表格有自己的 To 名單。Reply-to 可選用該表格其中一個電郵欄位。沒有 Cc、Bcc。主旨和是否包括空白欄位、來源頁面、訪客 IP 都由該表格設定。上載檔案以有效 7 日的私人下載連結附上。',
      },
      cc: [],
      bcc: [],
      previewHtml: inquirySubmissionPreview.html,
      previewSubject: inquirySubmissionPreview.subject,
    },
    {
      id: 'inquiry-form-autoresponder',
      name: '自訂表格自動回覆',
      kind: 'manual',
      subject: '已收到你的 {表格名稱}',
      purpose: '客人送出自訂表格後，向表格內指定的電郵欄位寄出確認信和資料副本；副本內的上載檔案使用限時下載連結。',
      trigger: '客人成功送出公開表格，而且該表格已開啟「自動回覆客人」及選好有效電郵欄位時寄出。同一份回覆重試不會重複寄。',
      frequency: '無固定排程。客人成功送出表格時寄出。',
      to: {
        addresses: [],
        summary: '表格內指定的客人電郵欄位',
        note: '沒有固定收件人。每份表格可選擇一個電郵欄位作 To，並設定寄件人顯示名稱、Reply-to、主旨、內容及是否附上回覆副本。沒有 Cc、Bcc。副本內的檔案下載連結有效 7 日。',
      },
      cc: [],
      bcc: [],
      previewHtml: inquiryAutoresponderPreview.html,
      previewSubject: inquiryAutoresponderPreview.subject,
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
    {
      id: 'readdy-framer-conversion',
      name: 'Readdy → Framer 轉換結果',
      kind: 'manual',
      subject: '【MPS】{網站名稱}(Readdy-{編號})轉換結果 {日期}',
      purpose: '一鍵轉換在後台跑完後，把每個頁面的成功或失敗結果寄出，方便同事不用守在工作台前也能知道有沒有寫進 Framer。工作台開啟「自動 Publish」時，全部頁面處理完會再 Publish 一次，信裡多一行 Publish 結果。',
      trigger: '同事在 Readdy → Framer 轉換工作台按「一鍵轉換」後，伺服器佇列跑完時寄出。佇列函式尚未部署時，改由瀏覽器在任務結束時寄出。全部頁面成功寄成功結果；有頁面失敗、任務中止或中途出錯寄失敗結果。自動 Publish 開啟時，成功寫入的頁面會在結束時 Publish，結果寫在同一封信。',
      frequency: '無固定排程。由同事手動開始轉換，任務結束時寄出。',
      to: {
        addresses: [READDY_CONVERSION_RESULT_TO],
        summary: '固定收件人',
        note: '成功與失敗都寄到這個地址。沒有 Cc、Bcc。',
      },
      cc: [],
      bcc: [],
      previewHtml: readdyPreview.html,
      previewSubject: readdyPreview.subject,
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
  const email = built.emails.find((item) => item.to === 'pm@example.com') ?? built.emails[0];
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

function buildFccDigestPreview(): { html: string; subject: string } {
  const email = buildFccAsanaDigestEmail({
    date: '2026-11-19',
    departments: [
      {
        label: 'BW',
        color: '#0369a1',
        tasks: [{
          title: '辦公室工程設計 - 範例客人 9123 4567 範例公司',
          url: fccAsanaTaskUrl('1000000000000001'),
          completed: false,
          assignee: '範例同事',
          projects: ['BWL Active 1 準備報價單 Quote Stage'],
        }],
      },
      {
        label: 'FC',
        color: '#0f766e',
        tasks: [{
          title: 'FC Catering - 另一客人 6123 4567 到會公司',
          url: fccAsanaTaskUrl('1000000000000002'),
          completed: true,
          assignee: '範例同事',
          projects: ['FCC Active 1 到會報價 Catering Follow Up'],
        }],
      },
      { label: 'WP', color: '#6d28d9', tasks: [] },
    ],
  });
  return { html: email.html, subject: email.subject };
}

function buildUnmatchedPreview(): { html: string; subject: string } {
  const email = buildUnmatchedInquiryEmail({
    department: 'BW',
    subjectLine: '寫字樓 Office工程查詢: 範例客人 9123 4567',
    receivedOn: '2026-11-26',
  });
  return { html: email.html, subject: email.subject };
}

const SAMPLE_INQUIRY_ANSWERS: InquiryEmailAnswer[] = [
  { label: '姓名', value: '陳大文' },
  { label: '電郵', value: 'customer@example.com' },
  { label: '查詢項目', value: ['報價', '參觀'] },
  { label: '其他資料', value: '希望下星期安排電話跟進。' },
  {
    label: '參考檔案',
    value: [],
    files: [{ name: 'office-plan.pdf', url: 'https://example.com/sample-signed-download' }],
  },
];

function buildInquirySubmissionPreview(): { html: string; subject: string } {
  return buildInquirySubmissionEmail({
    formName: '辦公室工程查詢',
    websiteName: 'Office Design 辦公室設計工程',
    answers: SAMPLE_INQUIRY_ANSWERS,
    submittedAt: '2026/11/27 14:30:00',
    referrer: 'https://hkofficedesign.com/contact',
  });
}

function buildInquiryAutoresponderPreview(): { html: string; subject: string } {
  return buildInquiryAutoresponderEmail({
    formName: '辦公室工程查詢',
    websiteName: 'Office Design 辦公室設計工程',
    answers: SAMPLE_INQUIRY_ANSWERS,
    senderName: 'Office Design',
    messageTemplate: '陳大文你好，多謝你的查詢。我們已收到資料，會盡快跟進。',
    includeCopy: true,
  });
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

function buildReaddyConversionPreview(): { html: string; subject: string } {
  const email = buildReaddyConversionResultEmail({
    siteName: '範例現場音樂',
    readdyCode: '16106125',
    date: SAMPLE_AS_OF,
    framerProjectUrl: 'https://framer.com/projects/example',
    kind: 'success',
    unstarted: 0,
    pages: [
      { path: '/', title: '首頁', status: 'migrated', sectionCount: 6 },
      { path: '/services', title: '服務', status: 'migrated', sectionCount: 4 },
    ],
    publishNote: '已 Publish 到正式站 https://example.com',
  });
  return { html: email.html, subject: email.subject };
}
