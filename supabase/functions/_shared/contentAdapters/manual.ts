/**
 * manual adapter（v1）：不呼叫站點 API，內容包由 content-publish 產生，人工貼上。
 * testConnection 只檢查網域可達，避免把「沒有 API」誤判成連線失敗。
 */

import type {
  AdapterCredentials,
  AdapterSite,
  AdapterTestResult,
  ContentAdapter,
} from './types.ts';

const HEAD_TIMEOUT_MS = 10_000;

function domainOf(site: AdapterSite): string | null {
  const value = (site.domain || '').trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export const manualAdapter: ContentAdapter = {
  name: 'manual',

  supports(mode) {
    return mode === 'manual';
  },

  async testConnection(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterTestResult> {
    const fetchImpl = input.fetchImpl ?? fetch;
    const domain = domainOf(input.site);
    const checks = [];

    if (!domain) {
      checks.push({ id: 'domain', label: '站點網域', ok: false, detail: '尚未設定網域' });
      return { ok: false, checks };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
      const response = await fetchImpl(domain, { method: 'HEAD', signal: controller.signal });
      checks.push({
        id: 'domain',
        label: '站點網域',
        ok: response.ok || response.status < 500,
        detail: `HTTP ${response.status}`,
      });
    } catch (error) {
      checks.push({
        id: 'domain',
        label: '站點網域',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }

    checks.push({
      id: 'adapter',
      label: '發布模式',
      ok: true,
      detail: '人工模式：由內容包交付，不需要站點 API',
    });

    return { ok: checks.every((check) => check.ok), checks };
  },

  async createArticle() {
    // 人工模式沒有 API；呼叫端應改走 content-publish 的內容包流程
    return {
      ok: false,
      externalId: null,
      liveUrl: null,
      draftUrl: null,
      httpStatus: null,
      raw: { reason: 'manual mode: use content package' },
    };
  },
};
