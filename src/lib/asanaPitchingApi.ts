import { supabase } from '@/lib/supabase';
import type { AsanaAttachment, AsanaTaskComment } from '@/lib/asanaTaskLink';
import { attachmentOpenUrl } from '@/lib/asanaTaskLink';

export type { AsanaAttachment, AsanaTaskComment };

export type AsanaTaskStoriesResult = {
  success?: boolean;
  task_gid?: string;
  task_name?: string;
  asana_link?: string | null;
  comments: AsanaTaskComment[];
  attachments: AsanaAttachment[];
};

export type AsanaAttachmentDownloadResult = {
  success?: boolean;
  gid?: string;
  name: string;
  size?: number | null;
  resource_subtype?: string | null;
  download_url?: string | null;
  view_url?: string | null;
  permanent_url?: string | null;
  host?: string | null;
};

async function invokeFunction<T = Record<string, unknown>>(
  slug: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  const url = `${supabaseUrl}/functions/v1/${slug}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || json.error) {
    throw new Error(String(json.error || `${res.status} ${res.statusText}`));
  }
  return json;
}

export function fetchAsanaTaskStories(input: {
  projectId?: string;
  asanaLink?: string;
}) {
  return invokeFunction<AsanaTaskStoriesResult>('asana-task-stories', {
    project_id: input.projectId || undefined,
    asana_link: input.asanaLink || undefined,
  }).then((result) => ({
    ...result,
    comments: result.comments || [],
    attachments: result.attachments || [],
  }));
}

export function fetchAsanaAttachmentDownload(attachmentGid: string) {
  return invokeFunction<AsanaAttachmentDownloadResult>('asana-attachment-download', {
    attachment_gid: attachmentGid,
  });
}

export async function downloadAsanaAttachment(
  attachment: Pick<AsanaAttachment, 'gid' | 'name'> & Partial<AsanaAttachment>,
): Promise<void> {
  const fresh = await fetchAsanaAttachmentDownload(attachment.gid);
  const url =
    fresh.download_url ||
    fresh.view_url ||
    fresh.permanent_url ||
    attachmentOpenUrl({
      gid: attachment.gid,
      name: attachment.name,
      createdAt: attachment.createdAt || '',
      downloadUrl: attachment.downloadUrl,
      viewUrl: attachment.viewUrl,
      permanentUrl: attachment.permanentUrl,
    });
  if (!url) {
    throw new Error('此附件沒有可用的下載連結');
  }
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.download = fresh.name || attachment.name || 'attachment';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function invokeAsanaPitchingSync() {
  return invokeFunction<{
    success?: boolean;
    run_id?: string;
    duration_ms?: number;
    project_gid?: string;
    project_name?: string;
    sync_year?: number;
    tasks_fetched?: number;
    tasks_skipped?: number;
    records_upserted?: number;
    projects_synced?: number;
    sync_direction?: string;
    errors?: string[];
  }>('sync-asana-pitching', {});
}

let inFlightAutoSync: Promise<void> | null = null;
let lastAutoSyncAt = 0;
const AUTO_SYNC_COOLDOWN_MS = 2 * 60 * 1000;

/** Background Asana import — deduped across Pitching/Project page mounts. */
export async function autoSyncAsanaPitchingIfNeeded(): Promise<void> {
  const now = Date.now();
  if (inFlightAutoSync) {
    await inFlightAutoSync;
    return;
  }
  if (now - lastAutoSyncAt < AUTO_SYNC_COOLDOWN_MS) return;

  inFlightAutoSync = invokeAsanaPitchingSync()
    .then((result) => {
      lastAutoSyncAt = Date.now();
      if (result.errors?.length) {
        console.warn('[Asana auto-sync]', result.errors);
      }
    })
    .catch((e) => {
      console.warn('[Asana auto-sync failed]', e);
    })
    .finally(() => {
      inFlightAutoSync = null;
    });

  await inFlightAutoSync;
}
