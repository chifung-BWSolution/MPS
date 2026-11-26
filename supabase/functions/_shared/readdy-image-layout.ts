// Keep these functions self-contained for execution in the capture browser.
export function splitCssLayers(value: string): string[] {
  const layers: string[] = [];
  let quote = "";
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "\\") {
      index++;
    } else if (quote) {
      if (char === quote) quote = "";
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    } else if (char === "," && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers.filter(Boolean);
}

export function fitCapturedImage(
  boxWidth: number,
  boxHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  sizing: string,
  position: string,
): { x: number; y: number; width: number; height: number } | undefined {
  if (![boxWidth, boxHeight, sourceWidth, sourceHeight].every((size) => Number.isFinite(size) && size > 0)) return;
  const contain = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const cover = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const length = (value: string, available: number): number | undefined => {
    const token = value.trim();
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(%|px)$/.exec(token);
    if (match) return Number(match[1]) * (match[2] === "%" ? available / 100 : 1);
    const calc = /^calc\(\s*([+-]?[\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)$/.exec(token);
    if (calc) return Number(calc[1]) * available / 100 + Number(calc[3]) * (calc[2] === "-" ? -1 : 1);
    if (token === "0") return 0;
  };
  const components = (value: string) => value.match(/calc\([^)]*\)|\S+/g) || [];
  let width: number;
  let height: number;
  if (["contain", "cover", "none", "scale-down"].includes(sizing)) {
    const scale = sizing === "contain" ? contain : sizing === "cover" ? cover : sizing === "scale-down" ? Math.min(1, contain) : 1;
    width = sourceWidth * scale;
    height = sourceHeight * scale;
  } else {
    const [w, h = "auto", extra] = sizing === "fill" ? ["100%", "100%"] : components(sizing);
    if (!w || extra) return;
    const explicitWidth = w === "auto" ? undefined : length(w, boxWidth);
    const explicitHeight = h === "auto" ? undefined : length(h, boxHeight);
    if ((w !== "auto" && explicitWidth === undefined) || (h !== "auto" && explicitHeight === undefined)) return;
    width = explicitWidth ?? (explicitHeight === undefined ? sourceWidth : explicitHeight * sourceWidth / sourceHeight);
    height = explicitHeight ?? width * sourceHeight / sourceWidth;
  }
  if (width <= 0 || height <= 0) return;

  const tokens = components(position);
  let [horizontal = "50%", vertical = "50%"] = tokens;
  if (tokens.length === 4) {
    const [xEdge, xOffset, yEdge, yOffset] = tokens;
    const horizontalOffset = length(xOffset, boxWidth - width);
    const verticalOffset = length(yOffset, boxHeight - height);
    if (!["left", "right"].includes(xEdge) || !["top", "bottom"].includes(yEdge) ||
      horizontalOffset === undefined || verticalOffset === undefined) return;
    horizontal = `${xEdge === "right" ? boxWidth - width - horizontalOffset : horizontalOffset}px`;
    vertical = `${yEdge === "bottom" ? boxHeight - height - verticalOffset : verticalOffset}px`;
  } else if (tokens.length > 2) {
    return;
  } else if (["top", "bottom"].includes(horizontal) && !["top", "bottom"].includes(vertical)) {
    [horizontal, vertical] = [vertical, horizontal];
  }
  const x = length(({ left: "0%", center: "50%", right: "100%" } as Record<string, string>)[horizontal] || horizontal, boxWidth - width);
  const y = length(({ top: "0%", center: "50%", bottom: "100%" } as Record<string, string>)[vertical] || vertical, boxHeight - height);
  if (x === undefined || y === undefined || ![x, y, width, height].every(Number.isFinite)) return;
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y, width, height };
}
