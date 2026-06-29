/** 由 HTML 文件名推導列表標題（去掉 .html 後綴） */
export function filenameToTitle(fileName: string): string {
  return fileName.replace(/\.html$/i, '');
}

/** 組裝倉庫內文檔路徑 */
export function buildDocumentPath(planningDate: string, fileName: string): string {
  return `docs/development_plan/${planningDate}/${fileName}`;
}

/** 倉庫路徑 → 瀏覽器靜態 URL（供 iframe 載入） */
export function documentPathToUrl(documentPath: string): string {
  if (documentPath.startsWith('docs/')) {
    return `/${documentPath.slice('docs/'.length)}`;
  }
  return documentPath.startsWith('/') ? documentPath : `/${documentPath}`;
}

/** 今日日期 YYYY-MM-DD（本地時區） */
export function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
