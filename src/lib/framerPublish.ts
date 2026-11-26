/** Decide and describe Framer Publish after an MPS canvas sync. */

export type FramerPublishResult = {
  ok: boolean;
  skipped?: boolean;
  target?: 'branch' | 'staging' | 'production' | null;
  url?: string | null;
  version_id?: string | null;
  error?: string | null;
};

/**
 * Manual sync sends the checkbox the user sees. Batch page writes pass false so
 * a conversion publishes once at the end. Omitted follows the saved checkbox,
 * which defaults to off.
 */
export function shouldPublishAfterSync(
  storedAutoPublish: boolean | null | undefined,
  requested: boolean | null | undefined,
): boolean {
  if (requested === false) return false;
  if (requested === true) return true;
  return storedAutoPublish === true;
}

export function framerPublishDestinationLabel(target: string | null | undefined): string {
  if (target === 'staging') return 'Staging';
  if (target === 'branch') return '分支預覽';
  return '正式站';
}

export function formatFramerPublishNote(result: FramerPublishResult | null | undefined): string | null {
  if (!result || result.skipped) return null;
  if (!result.ok) return `Publish 失敗：${result.error || '未知錯誤'}`;
  const where = framerPublishDestinationLabel(result.target);
  return result.url ? `已 Publish 到${where} ${result.url}` : `已 Publish 到${where}`;
}

/** Program run inside a Framer MCP exec session. Publishes the current branch target. */
export function buildFramerPublishProgram(): string {
  return `const capabilities = await api.getCapabilities();
if (!capabilities || capabilities.canPublish !== true) {
  return { ok: false, error: "目前的 Framer 授權不能 Publish" };
}
const before = await api.publishing.status();
if (!before || before.status === "unavailable") {
  return { ok: false, error: (before && before.message) || "沒有 Publish 權限" };
}
if (before.status === "blocked") {
  const titles = [];
  for (const item of before.errors || []) {
    if (item && item.title) titles.push(item.title);
  }
  return { ok: false, error: titles.join("；") || "Publish 被阻擋" };
}
const result = await api.publishing.publish();
const urls = (result && result.urls) || {};
return {
  ok: true,
  target: (result && result.target) || (before && before.target) || null,
  versionId: result && result.version ? result.version.id : null,
  url: urls.published || urls.production || urls.staging || urls.branch || null,
};`;
}

export function readFramerPublishPayload(payload: Record<string, unknown> | null | undefined): FramerPublishResult {
  if (!payload || payload.ok !== true) {
    const error = payload && typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : 'Framer 沒有回傳 Publish 結果';
    return { ok: false, error };
  }
  const target = payload.target === 'branch' || payload.target === 'staging' || payload.target === 'production'
    ? payload.target
    : null;
  return {
    ok: true,
    target,
    url: typeof payload.url === 'string' && payload.url.trim() ? payload.url.trim() : null,
    version_id: typeof payload.versionId === 'string' ? payload.versionId : null,
  };
}
