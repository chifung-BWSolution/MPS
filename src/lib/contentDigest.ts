/**
 * 社媒自動化營運 · 每日日報（PRD §9.2.4、M2-11）
 *
 * 純函式：統計 + HTML 組裝。同一支同時服務
 *   - content-digest Edge Function（真實寄送）
 *   - DigestView（預覽 / 重寄）
 *
 * 統計口徑以香港時間（Asia/Hong_Kong）為「日」，
 * 站點時區只用於顯示各站排程時間。
 */

import type {
  ContentArticleStatus,
  ContentDigestEmail,
  ContentDigestPending,
  ContentDigestSiteLine,
  ContentDigestStats,
  ContentDigestUpcoming,
  ContentPublishMode,
  ContentSlotStatus,
} from './contentTypes.ts';
import {
  HONG_KONG_TIME_ZONE,
  escapeHtml,
  formatNumber,
  formatRelativeHours,
  formatUsd,
  formatZoneDateTime,
  formatZoneMonthDay,
  hoursBetween,
  zoneDateString,
} from './contentFormat.ts';

export interface DigestSiteRef {
  id: string;
  name: string;
  domain: string | null;
  timezone?: string;
}

export interface DigestSlotRef {
  site_id: string;
  publish_at: string;
  status: ContentSlotStatus;
  keyword_id: string | null;
  article_id: string | null;
}

export interface DigestArticleRef {
  site_id: string;
  status: ContentArticleStatus;
  title: string;
  created_at: string;
  scheduled_publish_at: string | null;
  published_at: string | null;
  updated_at: string;
  publish_mode?: ContentPublishMode;
}

export interface DigestUsageRef {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

export interface BuildDigestStatsInput {
  date: string;
  sites: DigestSiteRef[];
  slots: DigestSlotRef[];
  articles: DigestArticleRef[];
  usage: DigestUsageRef[];
  /** 由 worker 額外收集的待處理項目（憑證失效、job dead 等） */
  extraPending?: ContentDigestPending[];
  upcomingDays?: number;
  now?: Date;
}

const PENDING_REVIEW_STATUSES: ContentArticleStatus[] = [
  'pending_review',
  'changes_requested',
  'draft',
];

const FAILED_STATUSES: ContentArticleStatus[] = ['publish_failed', 'verify_failed'];

function isSameHkDay(iso: string | null, date: string): boolean {
  if (!iso) return false;
  return zoneDateString(new Date(iso), HONG_KONG_TIME_ZONE) === date;
}

function sumUsage(usage: DigestUsageRef[]): ContentDigestStats['totals'] {
  return usage.reduce<ContentDigestStats['totals']>(
    (acc, item) => {
      acc.llmCalls += 1;
      acc.tokensIn += Number(item.tokens_in) || 0;
      acc.tokensOut += Number(item.tokens_out) || 0;
      acc.costUsd += Number(item.cost_usd) || 0;
      return acc;
    },
    { llmCalls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
  );
}

export function buildDigestStats(input: BuildDigestStatsInput): ContentDigestStats {
  const now = input.now ?? new Date();
  const date = input.date;
  const siteById = new Map(input.sites.map((site) => [site.id, site]));
  const upcomingDays = input.upcomingDays ?? 3;
  const upcomingLimit = new Date(now.getTime() + upcomingDays * 86_400_000);

  const perSite = new Map<string, ContentDigestSiteLine>();
  const ensureLine = (siteId: string): ContentDigestSiteLine => {
    const existing = perSite.get(siteId);
    if (existing) return existing;
    const site = siteById.get(siteId);
    const created: ContentDigestSiteLine = {
      siteId,
      siteName: site?.name || siteId,
      domain: site?.domain || null,
      generated: 0,
      pendingReview: 0,
      published: 0,
      failed: 0,
      missingKeywords: 0,
      oldestPendingHours: null,
    };
    perSite.set(siteId, created);
    return created;
  };

  // 文章統計
  let generated = 0;
  let published = 0;
  let failed = 0;
  let pendingReview = 0;
  let held = 0;
  let manualPending = 0;
  let oldestPendingHours: number | null = null;
  const pending: ContentDigestPending[] = [];
  const upcoming: ContentDigestUpcoming[] = [];

  for (const article of input.articles) {
    const line = ensureLine(article.site_id);

    if (isSameHkDay(article.created_at, date)) {
      generated += 1;
      line.generated += 1;
    }

    if (isSameHkDay(article.published_at, date)) {
      published += 1;
      line.published += 1;
    }

    if (FAILED_STATUSES.includes(article.status) && isSameHkDay(article.updated_at, date)) {
      failed += 1;
      line.failed += 1;
    }

    if (PENDING_REVIEW_STATUSES.includes(article.status)) {
      pendingReview += 1;
      line.pendingReview += 1;
      const waiting = hoursBetween(article.created_at, now);
      if (waiting != null) {
        if (oldestPendingHours == null || waiting > oldestPendingHours) oldestPendingHours = waiting;
        if (line.oldestPendingHours == null || waiting > line.oldestPendingHours) {
          line.oldestPendingHours = waiting;
        }
      }
    }

    if (article.status === 'held') held += 1;

    if (article.status === 'publishing' && article.publish_mode === 'manual') {
      manualPending += 1;
      pending.push({
        siteName: line.siteName,
        label: '待手動上線',
        detail: `《${article.title || '未命名'}》內容包已產生，等待回填 URL`,
      });
    }

    if (
      article.scheduled_publish_at &&
      article.status !== 'published' &&
      article.status !== 'manual_done' &&
      article.status !== 'cancelled'
    ) {
      const publishAt = new Date(article.scheduled_publish_at);
      if (publishAt > now && publishAt <= upcomingLimit) {
        upcoming.push({
          siteName: line.siteName,
          publishAt: article.scheduled_publish_at,
          title: article.title || null,
          status: 'scheduled',
        });
      }
    }
  }

  // 排程格統計：缺關鍵字、未來 3 天
  let missingKeywords = 0;
  let scheduled = 0;

  for (const slot of input.slots) {
    const line = ensureLine(slot.site_id);
    if (['approved', 'scheduled', 'in_review', 'draft_ready'].includes(slot.status)) scheduled += 1;

    if (!slot.keyword_id && ['planned', 'generating'].includes(slot.status)) {
      missingKeywords += 1;
      line.missingKeywords += 1;
      pending.push({
        siteName: line.siteName,
        label: '缺關鍵字',
        detail: `${formatZoneDateTime(slot.publish_at, siteById.get(slot.site_id)?.timezone)} 的排程格尚未指派關鍵字，到 generate_at 會轉為保留`,
      });
    }

    if (slot.status === 'held' && slot.publish_at) {
      pending.push({
        siteName: line.siteName,
        label: '排程已保留',
        detail: `${formatZoneDateTime(slot.publish_at, siteById.get(slot.site_id)?.timezone)} 的排程格已保留，不會自動發布`,
      });
    }

    const publishAt = slot.publish_at ? new Date(slot.publish_at) : null;
    if (
      publishAt &&
      publishAt > now &&
      publishAt <= upcomingLimit &&
      !['published', 'skipped', 'failed'].includes(slot.status)
    ) {
      upcoming.push({
        siteName: line.siteName,
        publishAt: slot.publish_at,
        title: null,
        status: slot.status,
      });
    }
  }

  // 最舊審核等待 → 進位到小時
  const sites = [...perSite.values()].sort(
    (a, b) => b.generated + b.pendingReview - (a.generated + a.pendingReview),
  );

  return {
    date,
    generated,
    pendingReview,
    published,
    failed,
    held,
    scheduled,
    manualPending,
    missingKeywords,
    oldestPendingHours:
      oldestPendingHours == null ? null : Math.round(oldestPendingHours * 10) / 10,
    sites,
    pending: [...(input.extraPending || []), ...pending],
    upcoming: upcoming
      .sort((a, b) => new Date(a.publishAt).getTime() - new Date(b.publishAt).getTime())
      .slice(0, 12),
    totals: sumUsage(input.usage),
  };
}

// ============================================================
// 標題與 HTML
// ============================================================

export function buildDigestSubject(stats: ContentDigestStats): string {
  const [, month, day] = stats.date.split('-');
  return `[MPS] ${Number(month)}/${Number(day)} 內容日報：生成 ${stats.generated} · 待審 ${stats.pendingReview} · 已發布 ${stats.published} · 失敗 ${stats.failed}`;
}

function statusColor(status: ContentSlotStatus): string {
  switch (status) {
    case 'published':
      return '#0f766e';
    case 'scheduled':
    case 'approved':
      return '#1d4ed8';
    case 'in_review':
    case 'held':
      return '#b45309';
    case 'failed':
      return '#be123c';
    default:
      return '#64748b';
  }
}

/** 日報深連結（不依賴瀏覽器 API，Edge Function 可直接用） */
export function digestDeepLink(siteOrigin: string, page: string, id?: string | null): string {
  const origin = (siteOrigin || '').replace(/\/$/, '');
  const params = new URLSearchParams({ zone: 'seo', page });
  if (id) params.set('id', id);
  return `${origin}/#tools-center/social-automation?${params.toString()}`;
}

export function renderDigestHtml(stats: ContentDigestStats, siteOrigin: string): string {
  const link = (page: string) => digestDeepLink(siteOrigin, page);

  const metricCell = (label: string, value: number | string, tone: string) => `
    <td style="padding: 12px 8px; text-align: center; border-right: 1px solid #e7eef6;">
      <div style="font-size: 22px; font-weight: 700; color: ${tone}; line-height: 1.1;">${escapeHtml(String(value))}</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${escapeHtml(label)}</div>
    </td>`;

  const siteRows = stats.sites
    .map(
      (line) => `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #eef3f9; font-size: 13px; color: #0d1a2d;">
          <strong>${escapeHtml(line.siteName)}</strong>
          <div style="font-size: 11px; color: #94a3b8;">${escapeHtml(line.domain || '—')}</div>
        </td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #eef3f9; text-align: center; font-size: 13px;">${line.generated}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #eef3f9; text-align: center; font-size: 13px; color: ${line.pendingReview ? '#b45309' : '#0d1a2d'};">
          ${line.pendingReview}${line.oldestPendingHours != null ? `<div style="font-size: 10px; color: #94a3b8;">最久 ${formatRelativeHours(line.oldestPendingHours)}</div>` : ''}
        </td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #eef3f9; text-align: center; font-size: 13px;">${line.published}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #eef3f9; text-align: center; font-size: 13px; color: ${line.failed ? '#be123c' : '#0d1a2d'};">${line.failed}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #eef3f9; text-align: center; font-size: 13px; color: ${line.missingKeywords ? '#b45309' : '#0d1a2d'};">${line.missingKeywords}</td>
      </tr>`,
    )
    .join('');

  const pendingRows = stats.pending.length
    ? stats.pending
        .slice(0, 20)
        .map(
          (item) => `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #eef3f9; font-size: 12.5px;">
            <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 600;">${escapeHtml(item.label)}</span>
            <span style="margin-left: 6px; color: #0d1a2d; font-weight: 600;">${escapeHtml(item.siteName)}</span>
            <div style="color: #64748b; margin-top: 3px;">${escapeHtml(item.detail)}</div>
          </td>
        </tr>`,
        )
        .join('')
    : `<tr><td style="padding: 12px; font-size: 12.5px; color: #64748b;">沒有待處理項目 🎉</td></tr>`;

  const upcomingRows = stats.upcoming.length
    ? stats.upcoming
        .map(
          (item) => `
        <tr>
          <td style="padding: 7px 10px; border-bottom: 1px solid #eef3f9; font-size: 12.5px; color: #0d1a2d;">${formatZoneDateTime(item.publishAt, HONG_KONG_TIME_ZONE)}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #eef3f9; font-size: 12.5px;">${escapeHtml(item.siteName)}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #eef3f9; font-size: 12.5px; color: #64748b;">${escapeHtml(item.title || '—')}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #eef3f9; font-size: 11.5px; color: ${statusColor(item.status)}; text-align: right;">${escapeHtml(item.status)}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="4" style="padding: 12px; font-size: 12.5px; color: #64748b;">未來 3 天沒有排程</td></tr>`;

  const section = (title: string, body: string) => `
    <div style="background: #ffffff; border: 1px solid #e7eef6; border-radius: 8px; margin: 0 0 14px 0; overflow: hidden;">
      <div style="padding: 10px 14px; border-bottom: 1px solid #eef3f9; font-size: 13px; font-weight: 700; color: #0d1a2d; background: #fbfdff;">${escapeHtml(title)}</div>
      ${body}
    </div>`;

  return `<!DOCTYPE html>
<html lang="zh-HK">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 0; background: #f5f8fc; font-family: 'Helvetica Neue', Arial, 'PingFang TC', 'Microsoft JhengHei', sans-serif;">
  <div style="max-width: 720px; margin: 0 auto; padding: 22px 16px;">
    <div style="margin-bottom: 16px;">
      <div style="font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #0d9488; font-weight: 700;">MPS · 內容自動化</div>
      <h1 style="margin: 6px 0 2px; font-size: 22px; color: #0d1a2d; letter-spacing: -.01em;">${formatZoneMonthDay(`${stats.date}T04:00:00Z`, HONG_KONG_TIME_ZONE)} 內容日報</h1>
      <p style="margin: 0; font-size: 12.5px; color: #64748b;">今日生成 ${stats.generated} 篇、待審 ${stats.pendingReview} 篇${stats.oldestPendingHours != null ? `（最久等待 ${formatRelativeHours(stats.oldestPendingHours)}）` : ''}；已發布 ${stats.published} 篇。</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border: 1px solid #e7eef6; border-radius: 8px; margin-bottom: 14px;">
      <tr>
        ${metricCell('今日生成', stats.generated, '#0d1a2d')}
        ${metricCell('待審', stats.pendingReview, stats.pendingReview ? '#b45309' : '#0d1a2d')}
        ${metricCell('已發布', stats.published, '#0f766e')}
        ${metricCell('失敗', stats.failed, stats.failed ? '#be123c' : '#0d1a2d')}
        ${metricCell('待回填', stats.manualPending, stats.manualPending ? '#4338ca' : '#0d1a2d')}
      </tr>
    </table>

    ${section(
      '分站明細',
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <tr style="background: #fbfdff;">
          <th style="padding: 8px 10px; text-align: left; font-size: 11px; color: #94a3b8; font-weight: 600;">站點</th>
          <th style="padding: 8px 10px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">生成</th>
          <th style="padding: 8px 10px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">待審</th>
          <th style="padding: 8px 10px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">已發</th>
          <th style="padding: 8px 10px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">失敗</th>
          <th style="padding: 8px 10px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">缺詞</th>
        </tr>
        ${siteRows || `<tr><td colspan="6" style="padding: 12px; font-size: 12.5px; color: #64748b;">今天沒有站點活動</td></tr>`}
      </table>`,
    )}

    ${section('待處理', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${pendingRows}</table>`)}

    ${section('未來 3 天排程', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">${upcomingRows}</table>`)}

    ${section(
      '用量',
      `<div style="padding: 12px 14px; font-size: 12.5px; color: #0d1a2d;">
        LLM 呼叫 <strong>${formatNumber(stats.totals.llmCalls)}</strong> 次 ·
        輸入 <strong>${formatNumber(stats.totals.tokensIn)}</strong> tokens ·
        輸出 <strong>${formatNumber(stats.totals.tokensOut)}</strong> tokens ·
        估算 <strong>${formatUsd(stats.totals.costUsd)}</strong>
      </div>`,
    )}

    <p style="margin: 18px 0 8px; font-size: 12.5px; color: #64748b;">
      直接處理：
      <a href="${link('articles')}" style="color: #0d9488; font-weight: 600; text-decoration: none;">文章佇列</a> ·
      <a href="${link('digest')}" style="color: #0d9488; font-weight: 600; text-decoration: none;">日報紀錄</a> ·
      <a href="${link('plan')}" style="color: #0d9488; font-weight: 600; text-decoration: none;">排程表</a>
    </p>
    <p style="margin: 0; font-size: 11px; color: #94a3b8;">
      本信由 MPS 內容自動化每日 ${stats.date} 自動寄出；數字口徑為香港時間當日。
    </p>
  </div>
</body>
</html>`;
}

export function renderDigestText(stats: ContentDigestStats, siteOrigin: string): string {
  const origin = (siteOrigin || '').replace(/\/$/, '');
  const lines = [
    `[MPS] ${stats.date} 內容日報`,
    `生成 ${stats.generated} · 待審 ${stats.pendingReview} · 已發布 ${stats.published} · 失敗 ${stats.failed} · 待回填 ${stats.manualPending}`,
    stats.oldestPendingHours != null
      ? `最舊待審：${formatRelativeHours(stats.oldestPendingHours)}`
      : '',
    '',
    '分站明細：',
    ...stats.sites.map(
      (line) =>
        `- ${line.siteName}（${line.domain || '—'}）：生成 ${line.generated}／待審 ${line.pendingReview}／已發 ${line.published}／失敗 ${line.failed}／缺詞 ${line.missingKeywords}`,
    ),
    '',
    '待處理：',
    ...(stats.pending.length
      ? stats.pending.slice(0, 20).map((item) => `- [${item.label}] ${item.siteName}：${item.detail}`)
      : ['- 沒有待處理項目']),
    '',
    '未來 3 天排程：',
    ...(stats.upcoming.length
      ? stats.upcoming.map(
          (item) =>
            `- ${formatZoneDateTime(item.publishAt, HONG_KONG_TIME_ZONE)} ${item.siteName} ${item.title || ''}`.trim(),
        )
      : ['- 無']),
    '',
    `用量：${stats.totals.llmCalls} 次呼叫／${stats.totals.tokensIn} in／${stats.totals.tokensOut} out／${formatUsd(stats.totals.costUsd)}`,
    '',
    `處理入口：${digestDeepLink(origin, 'articles')}`,
  ];
  return lines.filter((line) => line !== '').join('\n');
}

export function buildDigestEmail(input: {
  stats: ContentDigestStats;
  siteOrigin: string;
}): ContentDigestEmail {
  return {
    date: input.stats.date,
    subject: buildDigestSubject(input.stats),
    html: renderDigestHtml(input.stats, input.siteOrigin),
    text: renderDigestText(input.stats, input.siteOrigin),
    stats: input.stats,
  };
}

// ============================================================
// 收件人
// ============================================================

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecipients(values: readonly unknown[] | null | undefined): string[] {
  const list = Array.isArray(values) ? values : [];
  const emails = list
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter((value) => EMAIL_PATTERN.test(value));
  return [...new Set(emails)];
}

export function invalidRecipients(values: readonly unknown[] | null | undefined): string[] {
  const list = Array.isArray(values) ? values : [];
  return list
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0 && !EMAIL_PATTERN.test(value));
}

export function isValidDigestTime(value: string | null | undefined): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test((value || '').trim());
}
