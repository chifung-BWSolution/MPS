/// <reference lib="dom" />

import { CAPTURE_DEVICES, LAYOUT_MEASUREMENT_VERSION, type CaptureDevice, type LayoutRegion, type PageLayout } from "./readdy-layout-score.ts";
import { fitCapturedImage, splitCssLayers } from "./readdy-image-layout.ts";
import { applyPaintedTextCase, mergePaintedText, readPaintedTextLines, type TextFragment } from "./readdy-text-layout.ts";

// Keep the measurement independent of importer IDs and component names. Framer and
// the source site can render equivalent content with different DOM structures.
function measurePageLayout(version: number): PageLayout {
  const root = document.documentElement;
  const regions: LayoutRegion[] = [];
  const seen = new Set<string>();
  const fragments: TextFragment[] = [];
  function collectText(node: ChildNode, transform: string, clip?: DOMRect) {
    for (const fragment of readPaintedTextLines(node)) {
      const left = Math.max(0, clip?.left ?? -Infinity, fragment.left);
      const right = Math.min(root.clientWidth, clip?.right ?? Infinity, fragment.right);
      const top = Math.max(0, clip?.top ?? -Infinity, fragment.top);
      const bottom = Math.min(root.scrollHeight, clip?.bottom ?? Infinity, fragment.bottom);
      if (right - left >= 1 && bottom - top >= 3) {
        fragments.push({ text: applyPaintedTextCase(fragment.text, transform), left, right, top, bottom });
      }
      if (fragments.length > 4800) throw new Error("頁面超過文字覆核上限");
    }
  }
  function add(key: string, rect: DOMRect, clip?: DOMRect) {
    const left = Math.max(0, rect.left, clip?.left ?? -Infinity);
    const right = Math.min(root.clientWidth, rect.right, clip?.right ?? Infinity);
    const top = Math.max(0, Math.max(rect.top, clip?.top ?? -Infinity) + scrollY);
    const bottom = Math.min(root.scrollHeight, Math.min(rect.bottom, clip?.bottom ?? Infinity) + scrollY);
    if (right - left < 4 || bottom - top < 4) return;
    const signature = JSON.stringify([key, ...[left, top, right, bottom].map(Math.round)]);
    if (seen.has(signature)) return;
    seen.add(signature);
    regions.push({ key, x: left, y: top, width: right - left, height: bottom - top });
    if (regions.length > 2400) throw new Error("頁面超過版面覆核上限");
  }
  function visit(el: Element, clip?: DOMRect) {
    if (el.matches("script,style,link,meta,noscript,template,defs")) return;
    const css = getComputedStyle(el);
    if (css.display === "none" || css.visibility === "hidden" || Number(css.opacity) === 0) return;
    const box = el.getBoundingClientRect();
    const isFloatingFixed = css.position === "fixed" &&
      !el.matches("header,nav") &&
      !el.closest("header,nav") &&
      !el.querySelector("header,nav") &&
      !(box.top <= 4 && Math.abs(box.width - root.clientWidth) < 2);
    if (isFloatingFixed) return;
    if (el.matches("img,svg,canvas,video,iframe") || /url\(|gradient\(/.test(css.backgroundImage)) {
      if (el instanceof HTMLImageElement && el.naturalWidth > 0) {
        const image = fitCapturedImage(box.width, box.height, el.naturalWidth, el.naturalHeight, css.objectFit, css.objectPosition);
        const painted = image && new DOMRect(
          Math.max(box.left, box.left + image.x), Math.max(box.top, box.top + image.y),
          Math.min(box.right, box.left + image.x + image.width) - Math.max(box.left, box.left + image.x),
          Math.min(box.bottom, box.top + image.y + image.height) - Math.max(box.top, box.top + image.y),
        );
        if (!painted || (painted.width > 0 && painted.height > 0)) add("image", painted || box, clip);
      } else if (!(el instanceof HTMLImageElement)) {
        add("image", box, clip);
      }
      if (el.matches("svg,canvas,video,iframe")) return;
    } else if (el !== document.body && (el.matches("button,input,select,textarea") ||
      (box.width >= 48 && box.height >= 20 && css.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        !(box.width >= root.clientWidth - 2 && box.height >= root.scrollHeight - 2) &&
        css.backgroundColor !== "transparent"))) {
      add("surface", box, clip);
    }
    const clipsX = /^(hidden|clip)$/.test(css.overflowX);
    const clipsY = /^(hidden|clip)$/.test(css.overflowY);
    let childClip = clip;
    if (clipsX || clipsY) {
      const left = Math.max(clip?.left ?? -1e6, clipsX ? box.left : -1e6);
      const top = Math.max(clip?.top ?? -1e6, clipsY ? box.top : -1e6);
      const right = Math.min(clip?.right ?? 1e6, clipsX ? box.right : 1e6);
      const bottom = Math.min(clip?.bottom ?? 1e6, clipsY ? box.bottom : 1e6);
      childClip = new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    }
    for (const child of Array.from(el.childNodes)) {
      if (child instanceof Element) visit(child, childClip);
      else if (child.nodeType === Node.TEXT_NODE) collectText(child, css.textTransform, childClip);
    }
  }
  visit(document.body);
  for (const { text, left, top, right, bottom } of mergePaintedText(fragments)) {
    add("text:" + text.slice(0, 1000), new DOMRect(left, top, right - left, bottom - top));
  }
  const appRoot = document.querySelector("#root, #app, #__next");
  let background = [document.body, root, appRoot]
    .map((el) => (el ? getComputedStyle(el).backgroundColor : "rgba(0, 0, 0, 0)"))
    .find((value) => value && value !== "rgba(0, 0, 0, 0)") || "rgba(0, 0, 0, 0)";
  if (background === "rgba(0, 0, 0, 0)") {
    const shell = (appRoot || document.body).children.length === 1 ? (appRoot || document.body).children[0] : null;
    if (shell) {
      const shellBox = shell.getBoundingClientRect();
      const shellBg = getComputedStyle(shell).backgroundColor;
      if (shellBg && shellBg !== "rgba(0, 0, 0, 0)" && Math.abs(shellBox.width - root.clientWidth) < 2 && shellBox.height >= innerHeight - 2) {
        background = shellBg;
      }
    }
  }
  return { version, width: innerWidth, height: root.scrollHeight, background, regions };
}

// Runs inside Chromium. Keep this function self-contained for Browserless page.evaluate.
async function captureVisiblePage(unwrappedIds: string[] | null = null) {
  const root = document.querySelector("#root, #app, #__next") || document.body;
  const blocks: Array<{ element: Element; id: string }> = [];
  const unwrapped: string[] = [];
  function collectBlocks(container: Element, prefix: string, depth = 0) {
    Array.from(container.children).forEach((element, index) => {
      const id = prefix + "-" + index;
      if (Array.isArray(unwrappedIds)) {
        if (unwrappedIds.includes(id)) {
          unwrapped.push(id);
          collectBlocks(element, id, depth + 1);
          return;
        }
        blocks.push({ element, id });
        return;
      }
      if (depth < 4 && element.matches("div,main") && element.children.length > 0) {
        const css = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const children = Array.from(element.children);
        const isVerticalFlow = css.display === "block" ||
          (css.display === "flex" && css.flexDirection === "column") ||
          (css.display === "grid" && (!css.gridTemplateColumns || css.gridTemplateColumns === "none" || css.gridTemplateColumns.trim().split(/\s+/).length <= 1));
        const hasAbsoluteChild = children.some((child) => getComputedStyle(child).position === "absolute");
        const wrapsLandmarks = children.some((child) => child.matches("header,nav,main,section,footer,article"));
        const zeroPadding = css.padding
          ? css.padding === "0px"
          : [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft].every((v) => !v || v === "0px");
        const zeroBorder = css.borderWidth
          ? css.borderWidth === "0px"
          : [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth].every((v) => !v || v === "0px");
        const zeroMargin = css.margin
          ? css.margin === "0px"
          : [css.marginTop, css.marginBottom].every((v) => !v || v === "0px");
        const isPageWrapper = isVerticalFlow &&
          (css.position === "static" || (css.position === "relative" && !hasAbsoluteChild)) &&
          (css.backgroundColor === "rgba(0, 0, 0, 0)" || wrapsLandmarks) &&
          (!css.backgroundImage || css.backgroundImage === "none") &&
          (!css.borderRadius || css.borderRadius === "0px") &&
          (!css.maxWidth || css.maxWidth === "none") &&
          zeroPadding && zeroBorder && zeroMargin &&
          Math.abs(box.width - document.documentElement.clientWidth) < 2 &&
          !Array.from(element.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
        if (isPageWrapper) {
          unwrapped.push(id);
          collectBlocks(element, id, depth + 1);
          return;
        }
      }
      blocks.push({ element, id });
    });
  }
  collectBlocks(root, "dom");
  const round = (n: number) => Math.round(n * 10) / 10 + "px";
  const safeUrl = (value: string | null) => {
    if (!value) return undefined;
    try {
      const url = new URL(value, location.href);
      if (/^(https?:|mailto:|tel:)$/.test(url.protocol)) {
        return url.origin === location.origin ? url.pathname + url.search + url.hash : url.href;
      }
    } catch { /* Unsupported URL. */ }
  };
  let count = 0;
  const limitations = new Set<string>();
  const rasterized = new Map<Element, string>();
  const backgrounds = new Map<Element, { src: string; x: number; y: number; width: number; height: number }[]>();
  const inlineIcons = Array.from(root.querySelectorAll("svg:not(svg svg)")).filter((svg) => {
    const bounds = svg.getBoundingClientRect();
    const style = getComputedStyle(svg);
    return bounds.width > 0 && bounds.height > 0 && style.visibility === "visible" &&
      bounds.width <= 480 && bounds.height <= 480;
  });
  const iconFontElements = Array.from(root.querySelectorAll("i,span")).filter((el) => {
    if (el.children.length > 0 || el.textContent?.trim()) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const bounds = el.getBoundingClientRect();
    if (bounds.width < 6 || bounds.height < 6 || bounds.width > 96 || bounds.height > 96) return false;
    const before = getComputedStyle(el, "::before");
    const raw = before.content || "";
    if (!raw || raw === "none" || raw === "normal" || raw === '""' || raw === "''") return false;
    const glyph = raw.replace(/^["']|["']$/g, "");
    if (!glyph) return false;
    const cp = glyph.codePointAt(0) ?? 0;
    return cp >= 0xE000 || /\b(ri-|fa-|icon|material)/i.test(`${el.className || ""} ${before.fontFamily || ""}`);
  });
  let rasterBytes = 0;
  async function decodeImage(src: string) {
    const image = new Image();
    image.src = src;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        image.decode(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Image decode timed out")), 1000); }),
      ]);
      return image;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  async function vectorPng(svg: SVGSVGElement, width: number, height: number) {
    const image = await decodeImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (data.length > 65536 || rasterBytes + data.length > 1024 * 1024) throw new Error("Raster image exceeds budget");
    rasterBytes += data.length;
    return data;
  }
  await Promise.all(inlineIcons.slice(0, 48).map(async (svg) => {
    const bounds = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(bounds.width));
    clone.setAttribute("height", String(bounds.height));
    const styled = [svg, ...Array.from(svg.querySelectorAll("*"))];
    [clone, ...Array.from(clone.querySelectorAll("*"))].forEach((node, index) => {
      const style = getComputedStyle(styled[index]);
      for (const key of ["color", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin"]) {
        const value = style.getPropertyValue(key);
        if (value) (node as SVGElement).style.setProperty(key, value);
      }
    });
    clone.querySelectorAll("script,foreignObject").forEach((element) => element.remove());
    try {
      rasterized.set(svg, await vectorPng(clone, bounds.width * 2, bounds.height * 2));
    } catch {
      limitations.add("部分向量圖示未能保留");
    }
  }));
  for (const el of iconFontElements.slice(0, 64)) {
    try {
      const bounds = el.getBoundingClientRect();
      const before = getComputedStyle(el, "::before");
      const glyph = (before.content || "").replace(/^["']|["']$/g, "");
      if (!glyph) continue;
      const w = Math.max(12, Math.ceil(bounds.width * 2));
      const h = Math.max(12, Math.ceil(bounds.height * 2));
      const iconCanvas = document.createElement("canvas");
      iconCanvas.width = w;
      iconCanvas.height = h;
      const iconCtx = iconCanvas.getContext("2d");
      if (!iconCtx) continue;
      const fontSize = Math.max(10, (Number.parseFloat(before.fontSize) || bounds.height) * 2);
      iconCtx.font = `${before.fontStyle || "normal"} ${before.fontWeight || "400"} ${fontSize}px ${before.fontFamily}`;
      iconCtx.fillStyle = before.color || getComputedStyle(el).color || "#ffffff";
      iconCtx.textAlign = "center";
      iconCtx.textBaseline = "middle";
      iconCtx.fillText(glyph, w / 2, h / 2);
      const data = iconCanvas.toDataURL("image/png");
      if (data.length <= 65536 && rasterBytes + data.length <= 1024 * 1024) {
        rasterBytes += data.length;
        rasterized.set(el, data);
      }
    } catch { /* Keep icon fallback if font glyph rasterization fails. */ }
  }
  const cssBackgrounds = Array.from(root.querySelectorAll("*")).slice(0, 2200).flatMap((element) => {
    const css = getComputedStyle(element);
    return !element.matches("img,svg,svg *") && css.backgroundImage !== "none" && css.visibility === "visible"
      ? [{ element, css }]
      : [];
  });
  await Promise.all(cssBackgrounds.slice(0, 40).map(async ({ element, css }) => {
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height) return;
    const layers = splitCssLayers(css.backgroundImage);
    const get = (value: string, index: number) => {
      const list = splitCssLayers(value);
      return list[index % list.length] || "";
    };
    try {
      if (splitCssLayers(css.backgroundBlendMode).some((mode) => mode !== "normal") ||
        css.backgroundAttachment.includes("fixed")) return;
      const painted = await Promise.all(layers.map(async (layer, index) => {
        const size = get(css.backgroundSize, index);
        const position = get(css.backgroundPosition, index);
        const repeat = get(css.backgroundRepeat, index);
        if (/^(?:repeating-)?(?:linear|radial|conic)-gradient\(/.test(layer)) {
          const namespace = "http://www.w3.org/2000/svg";
          const svg = document.createElementNS(namespace, "svg");
          const w = Math.min(800, Math.ceil(width));
          const h = Math.min(800, Math.ceil(height));
          svg.setAttribute("width", String(w));
          svg.setAttribute("height", String(h));
          svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
          svg.setAttribute("preserveAspectRatio", "none");
          const foreign = document.createElementNS(namespace, "foreignObject");
          foreign.setAttribute("width", "100%");
          foreign.setAttribute("height", "100%");
          const surface = document.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
          Object.assign(surface.style, {
            width: `${width}px`, height: `${height}px`,
            backgroundImage: layer, backgroundSize: size, backgroundPosition: position, backgroundRepeat: repeat,
          });
          foreign.append(surface);
          svg.append(foreign);
          return { src: await vectorPng(svg, w, h), x: 0, y: 0, width, height };
        }
        if (layer === "none") return null;
        const src = /^url\(["']?([^"']+?)["']?\)$/.exec(layer)?.[1];
        if (!src || !/^https:\/\//i.test(src)) throw new Error("Unsupported background image");
        const image = await decodeImage(src);
        const placed = fitCapturedImage(width, height, image.naturalWidth, image.naturalHeight, size, position);
        if (!placed || Math.abs(placed.width / placed.height - image.naturalWidth / image.naturalHeight) > 0.01 ||
          (repeat !== "no-repeat" && (placed.x > 0.5 || placed.y > 0.5 || placed.x + placed.width < width - 0.5 || placed.y + placed.height < height - 0.5))) {
          throw new Error("Unsupported background layout");
        }
        return { src, ...placed };
      }));
      backgrounds.set(element, painted.filter((item) => item !== null));
    } catch { /* Keep the original bitmap and report the unsupported paint below. */ }
  }));
  const colorCache = new Map<string, string>();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const color = (value: string) => {
    if (!context || !value || /^(#|rgba?\()/.test(value)) return value;
    const cached = colorCache.get(value);
    if (cached) return cached;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
    const output = `rgba(${r}, ${g}, ${b}, ${+(alpha / 255).toFixed(3)})`;
    colorCache.set(value, output);
    return output;
  };
  function visit(el: Element, id: string, parent: DOMRect | null, depth: number): unknown {
    if (el.matches("script,style,link,meta,noscript,template")) return null;
    const css = getComputedStyle(el);
    if (css.display === "none" || css.visibility === "hidden" || css.opacity === "0") return null;
    const box = el.getBoundingClientRect();
    const isFloatingFixed = css.position === "fixed" &&
      !el.matches("header,nav") &&
      !el.closest("header,nav") &&
      !el.querySelector("header,nav") &&
      !(box.top <= 4 && Math.abs(box.width - document.documentElement.clientWidth) < 2);
    if (isFloatingFixed) return null;
    if (++count > 1800 || depth > 35) throw new Error("頁面圖層超過單次擷取上限");
    const tag = el.tagName.toLowerCase();
    const raster = rasterized.get(el);
    if (!raster && (el.matches("svg,canvas,video,iframe,input,select,textarea") || el.matches("button:not([disabled])"))) {
      limitations.add("互動控制項或媒體需要人工覆核");
      if (el.matches("svg,canvas,video,iframe")) return null;
    }
    const fixed = css.position === "fixed";
    const viewportWidth = document.documentElement.clientWidth;
    const fullViewport = Math.abs(box.left) < 1 && Math.abs(box.width - viewportWidth) < 2;
    const fullParent = !parent || (Math.abs(parent.left) < 1 && Math.abs(parent.width - viewportWidth) < 2);
    const layout = {
      width: fullViewport && fullParent ? "100%" : round(box.width),
      height: round(box.height),
      position: fixed ? "fixed" : parent ? "absolute" : "relative",
      left: round(box.left - (fixed ? 0 : parent?.left ?? 0)),
      top: round(box.top - (fixed ? 0 : parent?.top ?? 0)),
      zIndex: Number.isFinite(Number.parseInt(css.zIndex)) ? Number.parseInt(css.zIndex) : undefined,
      clip: css.overflow === "hidden" || css.overflow === "clip",
    };
    const paintedBackground = backgrounds.get(el);
    const imageUrl = !paintedBackground ? css.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1] : undefined;
    const gradient = !paintedBackground && css.backgroundImage.startsWith("linear-gradient(") && !imageUrl
      ? css.backgroundImage : undefined;
    const borderSide = css.borderTopWidth !== "0px"
      ? css.borderTop
      : css.borderBottomWidth !== "0px"
        ? css.borderBottom
        : css.borderLeftWidth !== "0px"
          ? css.borderLeft
          : css.borderRightWidth !== "0px"
            ? css.borderRight
            : undefined;
    const style = {
      background: css.backgroundColor === "rgba(0, 0, 0, 0)" ? undefined : color(css.backgroundColor),
      backgroundImage: imageUrl,
      gradient,
      radius: css.borderRadius === "0px" ? undefined : css.borderRadius,
      border: borderSide,
      shadow: css.boxShadow && css.boxShadow !== "none" ? css.boxShadow : undefined,
      color: color(css.color),
      fontFamily: css.fontFamily,
      fontSize: css.fontSize,
      fontWeight: Number.parseInt(css.fontWeight),
      lineHeight: css.lineHeight,
      letterSpacing: css.letterSpacing,
      opacity: css.opacity === "1" ? undefined : Number(css.opacity),
      textAlign: ["center", "right"].includes(css.textAlign) ? css.textAlign : "left",
    };
    const appearRaw = el.getAttribute("data-readdy-appear");
    let appear: { opacity: number; y: string; delay: number } | undefined;
    if (appearRaw) {
      try {
        const parsed = JSON.parse(appearRaw) as { opacity?: number; y?: string; delay?: number };
        if (typeof parsed.opacity === "number" && typeof parsed.y === "string") {
          appear = { opacity: parsed.opacity, y: parsed.y, delay: Number(parsed.delay) || 0 };
        }
      } catch { /* Ignore malformed appear hint. */ }
    }
    const href = el.matches("a[href]") ? safeUrl(el.getAttribute("href")) : undefined;
    if (!paintedBackground && css.backgroundImage !== "none") limitations.add("部分背景圖或漸層需要在 Framer 覆核");
    if (raster) return { id, type: "image", name: el.getAttribute("aria-label") || (el.tagName.toLowerCase() === "svg" ? "SVG" : "Icon"), src: raster, layout, style, ...(appear ? { appear } : {}) };
    if (el instanceof HTMLImageElement) {
      if (!el.naturalWidth && box.width && box.height) limitations.add("部分來源圖片未載入");
      if (!box.width || !box.height || !el.naturalWidth) return null;
      const border = [css.borderLeftWidth, css.borderRightWidth, css.borderTopWidth, css.borderBottomWidth].map((value) => Number.parseFloat(value) || 0);
      const padding = [css.paddingLeft, css.paddingRight, css.paddingTop, css.paddingBottom].map((value) => Number.parseFloat(value) || 0);
      const inset = border.map((value, index) => value + padding[index]);
      const contentWidth = box.width - inset[0] - inset[1];
      const contentHeight = box.height - inset[2] - inset[3];
      const placed = fitCapturedImage(contentWidth, contentHeight, el.naturalWidth, el.naturalHeight, css.objectFit, css.objectPosition);
      const src = el.currentSrc || el.src;
      if (fullViewport && fullParent && css.objectFit === "cover" && inset.every((v) => v === 0)) {
        return { id, type: "image", name: el.alt || "Image", src, layout: { ...layout, width: "100%" }, style };
      }
      if (placed && Math.abs(placed.width / placed.height - el.naturalWidth / el.naturalHeight) < 0.01) {
        return {
          id, type: parent ? "stack" : "section", name: el.alt || "Image", layout: { ...layout, clip: true }, style,
          children: [{
            id: id + "-bitmap", type: "image", name: el.alt || "Image", src,
            layout: {
              position: "absolute", left: round(inset[0] + placed.x), top: round(inset[2] + placed.y),
              width: round(placed.width), height: round(placed.height),
            },
          }],
        };
      }
      limitations.add("部分圖片裁切位置需要覆核");
      return { id, type: "image", name: el.alt || "Image", src, layout, style };
    }
    const children: unknown[] = [];
    if (paintedBackground?.length) {
      children.push({
        id: id + "-background", type: "stack", name: "Background",
        layout: { position: "absolute", left: "0px", top: "0px", width: "100%", height: round(box.height), clip: true },
        style: { radius: style.radius },
        children: paintedBackground.slice().reverse().map(({ src, x, y, width, height }, index) => ({
          id: id + "-background-" + index, name: "Background image", type: "image", src,
          layout: {
            position: "absolute",
            left: round(x),
            top: round(y),
            width: fullViewport && Math.abs(x) < 1 && Math.abs(width - box.width) < 2 ? "100%" : round(width),
            height: round(height),
          },
        })),
      });
    }
    Array.from(el.childNodes).forEach((child, index) => {
      const childId = id + "-" + index;
      if (child instanceof Element) {
        const node = visit(child, childId, box, depth + 1);
        if (node) children.push(node);
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        const lines = readPaintedTextLines(child);
        lines.forEach((line, index) => {
          const width = line.right - line.left;
          // Leave a few pixels for font-renderer rounding. Absolute text layers
          // have no effect on the positioning of the next captured line.
          children.push({
            id: index === 0 ? childId : childId + "-line-" + index,
            type: "text",
            text: applyPaintedTextCase(line.text, css.textTransform).replace(/\s+/g, " ").trim(),
            htmlTag: index === 0 && !children.some((item) => (item as { htmlTag?: string }).htmlTag === tag) && /^h[1-6]$/.test(tag) ? tag : "p",
            layout: {
              position: "absolute",
              left: round(line.left - box.left),
              top: round(line.top - box.top),
              width: round(width + Math.max(3, width * 0.035)),
              height: "auto",
            },
            style: { ...style, textAlign: "left", opacity: undefined },
          });
        });
      }
    });
    if (!children.length && !style.background && !imageUrl && !gradient && !style.border) return null;
    if (css.display === "contents") limitations.add("display: contents 版面需要人工覆核");
    return { id, type: parent ? "stack" : "section", name: el.getAttribute("aria-label") || tag, htmlTag: tag, href, layout, style, ...(appear ? { appear } : {}), children };
  }
  const scenes = (blocks.length ? blocks : [{ element: root, id: "dom-0" }])
    .map(({ element, id }) => visit(element, id, null, 0)).filter(Boolean);
  return { scenes, limitations: [...limitations], unwrapped };
}

export const VIEWPORTS = { tablet: 834, phone: 390 } as const;

// Freeze the readable state for fixed headers that change their palette on scroll.
// This runs after the source screenshot so the comparison still uses the original page.
async function prepareNavigationForImport() {
  const headers = Array.from(document.querySelectorAll("header, nav"));
  const fixedHeaders = headers.filter((header) =>
    getComputedStyle(header).position === "fixed" && header.getBoundingClientRect().top <= 4
  );
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 350));
  if (fixedHeaders.length && window.scrollY === 0) {
    const backgrounds = fixedHeaders.map((header) => getComputedStyle(header).backgroundColor);
    window.scrollTo({ top: 96, behavior: "instant" });
    await settle();
    const palettes = fixedHeaders.flatMap((header, index) => {
      const style = getComputedStyle(header);
      if (style.backgroundColor === backgrounds[index] || style.backgroundColor === "rgba(0, 0, 0, 0)") return [];
      return [{
        header,
        background: style.backgroundColor,
        shadow: style.boxShadow,
        colors: [header, ...header.querySelectorAll("*")].map((element) => {
          const style = getComputedStyle(element);
          return { element, color: style.color, border: style.borderColor };
        }),
      }];
    });
    window.scrollTo({ top: 0, behavior: "instant" });
    if (palettes.length) await settle();
    for (const { header, background, shadow, colors } of palettes) {
      (header as HTMLElement).style.setProperty("background-color", background, "important");
      (header as HTMLElement).style.setProperty("box-shadow", shadow, "important");
      for (const { element, color, border } of colors) {
        if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
        element.style.setProperty("transition", "none", "important");
        element.style.setProperty("color", color, "important");
        element.style.setProperty("border-color", border, "important");
      }
    }
  }

  for (const header of headers.filter((element) => !headers.some((other) => other !== element && other.contains(element)))) {
    const triggers = Array.from(header.querySelectorAll<HTMLButtonElement>("button[aria-expanded='false']"))
      .filter((button) => /language|語言|语言/i.test(button.getAttribute("aria-label") || "") && button.getBoundingClientRect().width > 0);
    for (const button of triggers) {
      button.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const links = Array.from(button.parentElement?.querySelectorAll<HTMLAnchorElement>("a[data-lang-switch][href], a[hreflang][href]") || [])
        .map((link) => ({
          href: link.href,
          label: link.textContent?.trim() || "",
        }))
        .filter((link) => /^https?:/i.test(link.href) && link.label && link.label.length <= 32);
      if (button.getAttribute("aria-expanded") === "true") button.click();
      if (links.length < 2 || links.length > 5) continue;
      const wrapper = document.createElement("span");
      const style = getComputedStyle(button);
      wrapper.style.cssText = `display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font:${style.font};color:${style.color}`;
      for (const { href, label } of links) {
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.setAttribute("aria-label", label);
        anchor.textContent = ({ "繁體中文": "繁體", "简体中文": "简体", "English": "EN" } as Record<string, string>)[label] || label;
        anchor.style.cssText = "color:inherit;text-decoration:none;display:inline-block";
        wrapper.append(anchor);
      }
      button.replaceWith(wrapper);
    }
  }
}

export type RenderedPage = {
  url: string;
  images: { desktop: string; tablet: string; phone: string };
  scenes: { desktop: unknown[]; tablet: unknown[]; phone: unknown[] };
  geometry: Record<CaptureDevice, PageLayout>;
  limitations: string[];
};

export async function publishCapturedImages(
  scenes: RenderedPage["scenes"],
  publish: (name: string, png: Uint8Array<ArrayBuffer>) => Promise<string>,
): Promise<void> {
  const images = new Map<string, { src: string }[]>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const node = value as { src?: string; children?: unknown[] };
    if (typeof node.src === "string" && node.src.startsWith("data:image/png;base64,") && node.src.length <= 65536) {
      const matches = images.get(node.src) || [];
      matches.push(node as { src: string });
      images.set(node.src, matches);
    }
    for (const child of node.children || []) visit(child);
  };
  Object.values(scenes).forEach((blocks) => blocks.forEach(visit));
  const entries = Array.from(images.entries());
  for (let start = 0; start < entries.length; start += 8) {
    const batch = await Promise.allSettled(entries.slice(start, start + 8).map(async ([data, nodes], index) => {
      const bytes = Uint8Array.from(atob(data.slice("data:image/png;base64,".length)), (char) => char.charCodeAt(0));
      const url = await publish(`visual-${start + index}.png`, bytes);
      nodes.forEach((node) => { node.src = url; });
    }));
    const failed = batch.find((item) => item.status === "rejected");
    if (failed) throw failed.reason;
  }
}

export function resolveRenderUrl(origin: string, route: string): URL {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password || base.port ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(base.hostname) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$|^\d+(?:\.\d+){3}$/i.test(base.hostname)) {
    throw new Error("來源網站必須使用公開 HTTPS 網址");
  }
  if (route.split("/").some((part) => part.startsWith(":") || part === "*")) {
    throw new Error("這個路徑還帶有動態 id（例如 :slug）。請重新分析專案，每個實際 id 會展開成獨立頁面後再轉換。");
  }
  if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\")) {
    throw new Error("請選擇已指定實際路徑的頁面");
  }
  const url = new URL(route, base.origin);
  if (url.origin !== base.origin || url.search || url.hash) throw new Error("來源路徑必須是不含查詢參數的站內路徑");
  return url;
}

export function formatBrowserlessError(raw: string): string {
  let msg = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
    if (typeof parsed?.error === "string" && parsed.error.trim()) {
      msg = parsed.error;
    } else if (typeof parsed?.message === "string" && parsed.message.trim()) {
      msg = parsed.message;
    }
  } catch {
    // raw is plain text
  }
  const firstLine = msg.split(/\r?\n/)[0] || msg;
  const cleaned = firstLine
    .replace(/\s+at\s+\S+\s+\(http:\/\/0\.0\.0\.0:3000\/function\/.*$/i, "")
    .replace(/\s*default\s+\(http:\/\/0\.0\.0\.0:3000\/function\/.*$/i, "")
    .replace(/\s*\(requestId:\s*[^)]+\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 200);
}

function isRetryableCaptureError(status: number, detail: string): boolean {
  if (status === 408 || status === 429 || status >= 500) return true;
  if (status === 400) {
    if (/HTTP 40[134]\b|Source route redirected|Page exceeds capture height|No visible sections/i.test(detail)) {
      return false;
    }
    return /Source page unavailable|timeout|timed out|Target closed|Execution context was destroyed/i.test(detail);
  }
  return false;
}

export async function captureRenderedPage(
  url: URL,
  desktopWidth: number,
  token: string,
  request: typeof fetch = fetch,
  screenshotsOnly = false,
  retryDelayMs = 1200,
): Promise<RenderedPage> {
  const endpoint = new URL("https://production-sfo.browserless.io/function");
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("timeout", "65000");
  const code = `export default async ({ page, context }) => {
    const capture = ${captureVisiblePage.toString()};
    const measure = ${measurePageLayout.toString()};
    const prepareNavigation = ${prepareNavigationForImport.toString()};
    const images = {}, scenes = {}, geometry = {}, limitations = new Set();
    let unwrappedIds = null;
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      const allowed = url.protocol === "data:" || url.protocol === "blob:" ||
        (url.protocol === "https:" && /^[a-z0-9-]+(?:\\.[a-z0-9-]+)+$/i.test(url.hostname)
        && !/(?:^|\\.)(?:localhost|local|internal|test|invalid)$|^\\d+(?:\\.\\d+){3}$/i.test(url.hostname)
        && !url.port && (!request.isNavigationRequest() || request.frame() !== page.mainFrame()
          || url.hostname === new URL(context.url).hostname));
      return allowed ? request.continue() : request.abort();
    });
    for (const [device, width] of Object.entries(context.widths)) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      let response = null;
      let lastGotoError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await page.goto(context.url, { waitUntil: "networkidle2", timeout: 17000 });
          lastGotoError = null;
        } catch (err) {
          response = null;
          lastGotoError = err;
        }
        const status = response
          ? (typeof response.status === "function" ? response.status() : (response.ok() ? 200 : 0))
          : 0;
        if (response && response.ok()) break;
        const retryableStatus = status === 0 || status === 408 || status === 429 || status >= 500;
        if (attempt < 2 && (lastGotoError || retryableStatus)) {
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
          continue;
        }
        const reason = lastGotoError
          ? (lastGotoError instanceof Error ? lastGotoError.message : String(lastGotoError))
          : "HTTP " + (status || "no-response");
        throw new Error("Source page unavailable (" + device + ": " + reason + ")");
      }
      const expectedPath = new URL(context.url).pathname.replace(/\\/$/, "");
      if (new URL(page.url()).pathname.replace(/\\/$/, "") !== expectedPath) throw new Error("Source route redirected");
      await page.evaluate(async () => {
        await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2500))]);
        document.querySelectorAll("img[loading=lazy]").forEach(img => { img.loading = "eager"; });
        await Promise.race([Promise.allSettled([...document.images].map(img => img.decode())), new Promise(resolve => setTimeout(resolve, 2500))]);
        document.getAnimations().forEach(animation => {
          const timing = animation.effect && animation.effect.getComputedTiming ? animation.effect.getComputedTiming() : null;
          const target = animation.effect && animation.effect.target ? animation.effect.target : null;
          if (target instanceof Element && !target.hasAttribute("data-readdy-appear") && timing && Number.isFinite(timing.endTime)) {
            const name = String(animation.animationName || "");
            if (/fade|rise|slide|up|appear|enter/i.test(name)) {
              const delaySec = Math.max(0, Math.round((Number(timing.delay || 0) / 1000) * 100) / 100);
              const y = /up|rise|slide/i.test(name) ? "18px" : "0px";
              target.setAttribute("data-readdy-appear", JSON.stringify({ opacity: 0, y, delay: delaySec }));
            }
          }
          if (timing && Number.isFinite(timing.endTime)) animation.finish();
        });
        document.querySelectorAll("[class*='animate-fade']").forEach(el => {
          if (el.hasAttribute("data-readdy-appear")) return;
          const cls = String(el.className || "");
          const y = /fade-in-up|rise|delay/i.test(cls) ? "18px" : "0px";
          const delay = /delay-3/.test(cls) ? 0.45 : /delay-2/.test(cls) ? 0.3 : /delay-1/.test(cls) ? 0.15 : 0;
          el.setAttribute("data-readdy-appear", JSON.stringify({ opacity: 0, y, delay }));
        });
      });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      if (height > 30000) throw new Error("Page exceeds capture height (" + device + ": " + height + "px)");
      await page.evaluate(() => {
        globalThis.fitCapturedImage = ${fitCapturedImage.toString()};
        globalThis.splitCssLayers = ${splitCssLayers.toString()};
        globalThis.mergePaintedText = ${mergePaintedText.toString()};
        globalThis.readPaintedTextLines = ${readPaintedTextLines.toString()};
        globalThis.applyPaintedTextCase = ${applyPaintedTextCase.toString()};
      });
      geometry[device] = await page.evaluate(measure, context.measurementVersion);
      images[device] = await page.screenshot({ type: "jpeg", encoding: "base64", quality: 65, fullPage: true });
      if (!context.screenshotsOnly) {
        await page.evaluate(prepareNavigation);
        const result = await page.evaluate(capture, unwrappedIds);
        if (!result.scenes.length) throw new Error("No visible sections");
        if (unwrappedIds === null && Array.isArray(result.unwrapped)) unwrappedIds = result.unwrapped;
        scenes[device] = result.scenes;
        result.limitations.forEach(item => limitations.add(item));
      }
    }
    return { url: page.url(), images, scenes, geometry, limitations: [...limitations] };
  };`;
  const body = JSON.stringify({
    code,
    context: {
      url: url.href,
      widths: { desktop: desktopWidth, ...VIEWPORTS },
      screenshotsOnly,
      measurementVersion: LAYOUT_MEASUREMENT_VERSION,
    },
  });
  let res: Response | null = null;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(70000),
      });
      if (res.ok) {
        lastError = null;
        break;
      }
      const rawDetail = await res.text().catch(() => "");
      const cleanDetail = formatBrowserlessError(rawDetail);
      lastError = new Error(`無法擷取來源畫面（${cleanDetail || `HTTP ${res.status}`}）`);
      if (attempt === 0 && isRetryableCaptureError(res.status, cleanDetail || rawDetail)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      throw lastError;
    } catch (err) {
      if (err === lastError) throw err;
      const msg: string = err instanceof Error ? err.message : String(err);
      lastError = new Error(`無法擷取來源畫面（${formatBrowserlessError(msg) || msg}）`);
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      throw lastError;
    }
  }
  if (!res || !res.ok) {
    throw lastError ?? new Error("無法擷取來源畫面");
  }
  const result = await res.json() as RenderedPage;
  if (!result || !Array.isArray(result.limitations) || !CAPTURE_DEVICES.every((key) => {
    return (screenshotsOnly || (Array.isArray(result.scenes?.[key]) && result.scenes[key].length > 0)) &&
      typeof result.images?.[key] === "string" && !!result.images[key] &&
      result.geometry?.[key]?.version === LAYOUT_MEASUREMENT_VERSION &&
      Array.isArray(result.geometry[key].regions) && result.geometry[key].regions.length > 0;
  })) throw new Error("來源畫面擷取結果不完整");
  return { ...result, url: url.href };
}

export { captureVisiblePage, measurePageLayout };
