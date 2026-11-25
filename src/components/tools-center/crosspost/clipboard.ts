/** 複製文字；回傳 false 代表瀏覽器拒絕或沒有剪貼板權限。 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || !text.trim()) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
