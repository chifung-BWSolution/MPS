/// <reference lib="dom" />

export type TextFragment = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function applyPaintedTextCase(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return text.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());
  return text;
}

export function readPaintedTextLines(
  node: ChildNode,
  range: Pick<Range, "setStart" | "setEnd" | "getClientRects"> = document.createRange(),
): TextFragment[] {
  const text = node.textContent || "";
  if (!text.trim()) return [];
  const bounds = (start: number, end: number) => {
    range.setStart(node, start);
    range.setEnd(node, end);
    return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  };
  const aligned = (rects: DOMRect[]) => rects.every((rect) => Math.abs(rect.top - rects[0].top) <= 1);
  const lines: TextFragment[] = [];
  function record(part: string, rects: DOMRect[]) {
    if (!part.trim() || !rects.length) return;
    lines.push({
      text: part,
      left: Math.min(...rects.map((rect) => rect.left)),
      top: Math.min(...rects.map((rect) => rect.top)),
      right: Math.max(...rects.map((rect) => rect.right)),
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
    });
  }
  const full = bounds(0, text.length);
  if (aligned(full)) {
    record(text, full);
    return lines;
  }
  const offsets = [0];
  for (const letter of text) offsets.push(offsets[offsets.length - 1] + letter.length);
  for (let start = 0; start < offsets.length - 1;) {
    let low = start + 1;
    let high = offsets.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (aligned(bounds(offsets[start], offsets[middle]))) low = middle;
      else high = middle - 1;
    }
    record(text.slice(offsets[start], offsets[low]), bounds(offsets[start], offsets[low]));
    start = low;
  }
  return lines;
}

// Compare painted lines, even when one page uses inline formatting and the
// other uses several independent RichText layers for the same reading run.
export function mergePaintedText(fragments: TextFragment[]): TextFragment[] {
  const ordered = [...fragments].sort((a, b) => a.left - b.left || a.top - b.top);
  const lines: TextFragment[] = [];
  for (const fragment of ordered) {
    const text = fragment.text.normalize("NFKC").replace(/\s+/g, "");
    if (!text) continue;
    const height = fragment.bottom - fragment.top;
    const candidates = lines.filter((line) => {
      const gap = fragment.left - line.right;
      const tolerance = Math.max(3, Math.min(height, line.bottom - line.top) * 0.3);
      const overlap = Math.min(fragment.bottom, line.bottom) - Math.max(fragment.top, line.top);
      return gap >= -1 && gap <= tolerance && overlap >= Math.min(height, line.bottom - line.top) * 0.68;
    });
    const line = candidates.reduce<TextFragment | undefined>(
      (nearest, candidate) => !nearest || candidate.right > nearest.right ? candidate : nearest,
      undefined,
    );
    if (line) {
      line.text += text;
      line.top = Math.min(line.top, fragment.top);
      line.right = Math.max(line.right, fragment.right);
      line.bottom = Math.max(line.bottom, fragment.bottom);
    } else {
      lines.push({ ...fragment, text });
    }
  }
  return lines;
}
