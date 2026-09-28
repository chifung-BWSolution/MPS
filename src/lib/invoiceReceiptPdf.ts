import { pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

const OBJECT_URL_REVOKE_MS = 30_000;
const IOS_SAVE_OVERLAY_ID = 'mps-ios-pdf-save';

export async function pdfBlobFromDocument(document: ReactElement): Promise<Blob> {
  return pdf(document).toBlob();
}

export function openPdfPreview(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ sends a desktop Macintosh user agent.
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

function attachmentBlob(blob: Blob): Blob {
  return new Blob([blob], { type: 'application/octet-stream' });
}

function triggerAnchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  link.style.top = '0';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, OBJECT_URL_REVOKE_MS);
}

type SharePayload = { data: ShareData };

function sharePayload(blob: Blob, filename: string): SharePayload | null {
  if (typeof navigator.share !== 'function' || typeof File === 'undefined') return null;
  const safeName = filename.trim() || 'document.pdf';
  let file: File;
  try {
    file = new File([blob], safeName, { type: 'application/pdf' });
  } catch {
    return null;
  }
  const data: ShareData = { files: [file], title: safeName };
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) return null;
  } catch {
    return null;
  }
  return { data };
}

function sharePayloadNow(payload: SharePayload): Promise<'shared' | 'cancelled' | 'failed'> {
  return navigator.share(payload.data).then(
    () => 'shared' as const,
    (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled' as const;
      return 'failed' as const;
    },
  );
}

let closeIosSaveOverlay: (() => void) | null = null;

function promptAppleTouchSave(blob: Blob, filename: string): Promise<void> {
  closeIosSaveOverlay?.();
  const payload = sharePayload(blob, filename);
  const safeName = filename.trim() || 'document.pdf';

  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = IOS_SAVE_OVERLAY_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'mps-ios-pdf-save-title');
    root.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-[#0d1a2d]/45 p-4';

    const card = document.createElement('div');
    card.className = 'w-full max-w-sm rounded-lg bg-white p-5 shadow-card';

    const title = document.createElement('h2');
    title.id = 'mps-ios-pdf-save-title';
    title.className = 'text-[16px] font-semibold text-[#0d1a2d]';
    title.textContent = '儲存 PDF';

    const body = document.createElement('p');
    body.className = 'mt-2 text-[13px] leading-relaxed text-muted-foreground';
    body.textContent = '點「儲存到檔案」，然後在系統選單把 PDF 存進「檔案」。';

    const nameLine = document.createElement('p');
    nameLine.className = 'mt-2 text-[12px] text-muted-foreground break-all';
    nameLine.textContent = `檔名：${safeName}`;

    const actions = document.createElement('div');
    actions.className = 'mt-4 flex justify-end gap-2';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'rounded-md border border-border bg-white px-3 py-2 text-[13px] font-medium text-[#0d1a2d]';
    cancel.textContent = '取消';

    let objectUrl: string | null = null;
    const saveControl = payload ? document.createElement('button') : document.createElement('a');
    saveControl.className = 'rounded-md bg-blue-600 px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40';
    saveControl.textContent = '儲存到檔案';
    if (saveControl instanceof HTMLAnchorElement) {
      objectUrl = URL.createObjectURL(attachmentBlob(blob));
      saveControl.href = objectUrl;
      saveControl.download = safeName;
    } else {
      saveControl.type = 'button';
    }

    const close = () => {
      if (closeIosSaveOverlay === close) closeIosSaveOverlay = null;
      document.removeEventListener('keydown', onKey);
      root.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve();
    };
    closeIosSaveOverlay = close;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    cancel.addEventListener('click', close);
    root.addEventListener('click', (event) => {
      if (event.target === root) close();
    });

    if (saveControl instanceof HTMLButtonElement && payload) {
      saveControl.addEventListener('click', () => {
        if (saveControl.disabled) return;
        saveControl.disabled = true;
        void sharePayloadNow(payload).then((result) => {
          if (result === 'failed') triggerAnchorDownload(attachmentBlob(blob), safeName);
          close();
        });
      });
    } else {
      saveControl.addEventListener('click', () => {
        const url = objectUrl;
        objectUrl = null;
        window.setTimeout(() => {
          if (url) URL.revokeObjectURL(url);
        }, OBJECT_URL_REVOKE_MS);
        window.setTimeout(close, 300);
      });
    }

    actions.append(cancel, saveControl);
    card.append(title, body, nameLine, actions);
    root.append(card);
    document.body.append(root);
    document.addEventListener('keydown', onKey);
    if (saveControl instanceof HTMLButtonElement) saveControl.focus();
  });
}

export async function downloadPdfBlob(blob: Blob, filename: string) {
  // iPadOS Safari opens an application/pdf blob in a new tab and ignores
  // <a download> once the original tap has expired (the save request does that).
  if (!isAppleTouchDevice()) {
    triggerAnchorDownload(blob, filename);
    return;
  }

  const payload = sharePayload(blob, filename);
  const gestureActive = typeof navigator.userActivation === 'undefined' || navigator.userActivation.isActive;
  if (payload && gestureActive) {
    const result = await sharePayloadNow(payload);
    if (result === 'shared' || result === 'cancelled') return;
  }

  await promptAppleTouchSave(blob, filename);
}
