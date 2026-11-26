const ASANA_API = "https://app.asana.com/api/1.0";
const MAX_IMAGES = 8;
const MAX_BYTES = 8 * 1024 * 1024;

export type MailFile = { filename: string; mimeType: string; bytes: Uint8Array };

export type GmailImageNode = {
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailImageNode[];
};

export function collectFormImageUrls(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of String(text || "").match(/https?:\/\/files\.emailmeform\.com\/[^\s<>"')]+/gi) || []) {
    const url = match.replace(/[),.;]+$/, "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    found.push(url);
    if (found.length >= MAX_IMAGES) break;
  }
  return found;
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/heic") return ".heic";
  if (mimeType === "image/bmp") return ".bmp";
  return ".img";
}

function cleanFilename(name: string, mimeType: string, index: number): string {
  const base = name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  const withExt = /\.[A-Za-z0-9]{2,5}$/.test(base) ? base : `${base || `image-${index + 1}`}${extensionFor(mimeType)}`;
  return withExt || `image-${index + 1}${extensionFor(mimeType)}`;
}

function fileNameFromUrl(url: string, index: number, mimeType: string): string {
  const path = decodeURIComponent(url.split("?")[0].split("#")[0]);
  return cleanFilename(path.split("/").pop() || "", mimeType, index);
}

function uniqueNames(files: MailFile[]): MailFile[] {
  const used = new Set<string>();
  return files.map((file, index) => {
    let filename = file.filename;
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const ext = dot > 0 ? filename.slice(dot) : "";
    let n = 2;
    while (used.has(filename.toLowerCase())) {
      filename = `${stem}-${n}${ext}`;
      n += 1;
    }
    used.add(filename.toLowerCase());
    return { ...file, filename: filename || `image-${index + 1}.jpg` };
  });
}

export function decodeGmailBytes(data: string): Uint8Array {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function namedImageParts(node: GmailImageNode | undefined, out: GmailImageNode[]): void {
  if (!node) return;
  const mime = String(node.mimeType || "").toLowerCase();
  const filename = String(node.filename || "").trim();
  const size = Number(node.body?.size || 0);
  if (mime.startsWith("image/") && filename && (!size || size <= MAX_BYTES)) out.push(node);
  for (const child of node.parts || []) namedImageParts(child, out);
}

async function filesFromUrls(text: string): Promise<MailFile[]> {
  const files: MailFile[] = [];
  for (const url of collectFormImageUrls(text)) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const headerType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const path = url.split("?")[0];
      const guessed = /\.png$/i.test(path) ? "image/png"
        : /\.gif$/i.test(path) ? "image/gif"
        : /\.webp$/i.test(path) ? "image/webp"
        : /\.jpe?g$/i.test(path) ? "image/jpeg"
        : "";
      const mimeType = headerType.startsWith("image/") ? headerType : guessed;
      if (!mimeType.startsWith("image/")) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) continue;
      files.push({ filename: fileNameFromUrl(url, files.length, mimeType), mimeType, bytes });
    } catch {
      files.push({ filename: "", mimeType: "", bytes: new Uint8Array() });
    }
    if (files.filter((file) => file.bytes.byteLength).length >= MAX_IMAGES) break;
  }
  return files;
}

async function filesFromGmail(
  payload: GmailImageNode | undefined,
  loadGmailAttachment: (attachmentId: string) => Promise<string>,
): Promise<MailFile[]> {
  const parts: GmailImageNode[] = [];
  namedImageParts(payload, parts);
  const files: MailFile[] = [];
  for (const part of parts) {
    if (files.length >= MAX_IMAGES) break;
    const mimeType = String(part.mimeType || "image/jpeg").toLowerCase();
    try {
      const encoded = part.body?.data || (part.body?.attachmentId ? await loadGmailAttachment(part.body.attachmentId) : "");
      if (!encoded) continue;
      const bytes = decodeGmailBytes(encoded);
      if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) continue;
      files.push({
        filename: cleanFilename(String(part.filename || ""), mimeType, files.length),
        mimeType,
        bytes,
      });
    } catch {
      files.push({ filename: "", mimeType: "", bytes: new Uint8Array() });
    }
  }
  return files;
}

async function existingNames(token: string, taskGid: string): Promise<Set<string>> {
  const res = await fetch(`${ASANA_API}/tasks/${taskGid}/attachments?opt_fields=name&limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json() as { data?: Array<{ name?: string }> };
  if (!res.ok) return new Set();
  return new Set((payload.data || []).map((item) => String(item.name || "").trim().toLowerCase()).filter(Boolean));
}

async function uploadOne(token: string, taskGid: string, file: MailFile): Promise<void> {
  const form = new FormData();
  form.append("parent", taskGid);
  form.append("file", new Blob([file.bytes], { type: file.mimeType || "application/octet-stream" }), file.filename);
  const res = await fetch(`${ASANA_API}/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({})) as { errors?: Array<{ message?: string }> };
    throw new Error(payload.errors?.[0]?.message || "上傳圖片失敗");
  }
}

export async function attachMailImages(
  token: string,
  taskGid: string,
  input: {
    text: string;
    payload?: GmailImageNode;
    loadGmailAttachment?: (attachmentId: string) => Promise<string>;
  },
): Promise<{ attached: number; failed: number }> {
  const urlFiles = await filesFromUrls(input.text);
  const gmailFiles = input.loadGmailAttachment
    ? await filesFromGmail(input.payload, input.loadGmailAttachment)
    : [];
  const files = uniqueNames([...urlFiles, ...gmailFiles].filter((file) => file.bytes.byteLength > 0)).slice(0, MAX_IMAGES);
  const failedDownloads = [...urlFiles, ...gmailFiles].filter((file) => !file.bytes.byteLength).length;
  if (!files.length && !failedDownloads) return { attached: 0, failed: 0 };
  const names = await existingNames(token, taskGid);
  let attached = 0;
  let failed = failedDownloads;
  for (const file of files) {
    if (names.has(file.filename.toLowerCase())) continue;
    try {
      await uploadOne(token, taskGid, file);
      names.add(file.filename.toLowerCase());
      attached += 1;
    } catch {
      failed += 1;
    }
  }
  return { attached, failed };
}
