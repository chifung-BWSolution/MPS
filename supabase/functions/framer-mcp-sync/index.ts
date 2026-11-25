import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  FramerMcpClient,
  type McpToolInfo,
  corsHeaders,
  extractBearerToken,
  getValidFramerAccessToken,
  jsonResponse,
  supabaseAdmin,
  upsertFramerConnection,
} from "../_shared/framer-mcp.ts";

type IrSection = {
  id: string;
  step: number;
  name: string;
  sectionKind: string;
  framerType: "Stack" | "Grid";
  direction: "horizontal" | "vertical";
  gridSpan: string;
  columns: number;
  gap: number;
  padding: string;
  background: string;
  textColor: string;
  accentColor: string;
  elements: {
    badge?: string;
    heading?: string;
    brandSubtitle?: string;
    subheading?: string;
    paragraphs?: string[];
    buttons?: Array<{ label: string; variant?: string }>;
    navLinks?: string[];
    logos?: string[];
    cards?: Array<{
      title: string;
      description: string;
      tag?: string;
      imageUrl?: string;
      tagline?: string;
    }>;
    imageUrl?: string;
    backgroundImage?: string;
    overlay?: string;
  };
  syncStatus?: string;
};

type IrPayload = {
  pageMeta?: {
    path: string;
    title: string;
    locale?: string;
    pageKind?: string;
    sourceFile?: string;
    framerPageNodeId?: string | null;
    framerBreakpointId?: string | null;
  };
  gridConfig: {
    desktop_width: number;
    container_max_width: number;
    columns: number;
    gutter: number;
  };
  designTokens: {
    colors: Record<string, string>;
    typography: { fontFamily: string; bodyFont?: string; h1Size: number; h2Size: number; bodySize: number };
  };
  sections: IrSection[];
};

function escapeXml(val: string): string {
  return String(val || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSectionFramerXml(
  section: IrSection,
  grid: IrPayload["gridConfig"],
): string {
  const el = section.elements || {};
  const parts: string[] = [];

  if (el.badge) {
    parts.push(
      `<Frame name="${escapeXml(section.name)} Badge" backgroundColor="${escapeXml(section.accentColor)}22" borderRadius="999px" padding="6px 14px"><Text color="${escapeXml(section.accentColor)}" fontSize="12px" fontWeight="600">${escapeXml(el.badge)}</Text></Frame>`,
    );
  }
  if (el.heading) {
    const size = section.sectionKind === "hero" ? 48 : section.sectionKind === "navbar" ? 18 : 32;
    parts.push(
      `<Text name="Heading" color="${escapeXml(section.textColor)}" fontSize="${size}px" fontWeight="700">${escapeXml(el.heading)}</Text>`,
    );
  }
  if (el.subheading) {
    parts.push(
      `<Text name="Subheading" color="${escapeXml(section.textColor)}CC" fontSize="16px">${escapeXml(el.subheading)}</Text>`,
    );
  }
  if (Array.isArray(el.paragraphs) && el.paragraphs.length > 0 && !el.subheading) {
    for (const para of el.paragraphs) {
      parts.push(
        `<Text name="Paragraph" color="${escapeXml(section.textColor)}CC" fontSize="16px">${escapeXml(para)}</Text>`,
      );
    }
  }
  if (Array.isArray(el.navLinks) && el.navLinks.length > 0) {
    const linksXml = el.navLinks
      .map((l) => `<Text color="${escapeXml(section.textColor)}CC" fontSize="14px">${escapeXml(l)}</Text>`)
      .join("");
    parts.push(`<Stack name="NavLinks" direction="horizontal" gap="24px">${linksXml}</Stack>`);
  }
  if (Array.isArray(el.logos) && el.logos.length > 0) {
    const logosXml = el.logos
      .map((l) => `<Text color="${escapeXml(section.textColor)}99" fontSize="15px" fontWeight="600">${escapeXml(l)}</Text>`)
      .join("");
    parts.push(`<Stack name="LogosStrip" direction="horizontal" distribution="space-between" gap="24px">${logosXml}</Stack>`);
  }
  if (Array.isArray(el.buttons) && el.buttons.length > 0) {
    const btnsXml = el.buttons
      .map((b) => {
        const isPrimary = b.variant !== "secondary";
        const bg = isPrimary ? section.accentColor : "transparent";
        const fg = isPrimary ? "#FFFFFF" : section.textColor;
        return `<Frame name="Button" backgroundColor="${escapeXml(bg)}" borderRadius="8px" padding="10px 20px"><Text color="${escapeXml(fg)}" fontSize="14px" fontWeight="600">${escapeXml(b.label)}</Text></Frame>`;
      })
      .join("");
    parts.push(`<Stack name="Actions" direction="horizontal" gap="12px">${btnsXml}</Stack>`);
  }
  if (Array.isArray(el.cards) && el.cards.length > 0) {
    const cardsXml = el.cards
      .map((c) => {
        const cardImg = c.imageUrl
          ? `<Image name="CardImage" src="${escapeXml(c.imageUrl)}" width="100%" height="200px" borderRadius="8px" />`
          : "";
        const cardTagline = c.tagline
          ? `<Text color="${escapeXml(section.textColor)}99" fontSize="12px">${escapeXml(c.tagline)}</Text>`
          : "";
        return `<Stack name="${escapeXml(c.title)}" direction="vertical" gap="10px" padding="24px" backgroundColor="#FFFFFF10" borderRadius="12px">${cardImg}<Text color="${escapeXml(section.textColor)}" fontSize="18px" fontWeight="600">${escapeXml(c.title)}</Text><Text color="${escapeXml(section.textColor)}B3" fontSize="14px">${escapeXml(c.description)}</Text>${cardTagline}</Stack>`;
      })
      .join("");
    parts.push(
      `<Grid name="CardsGrid" columns="${section.columns || 3}" gap="${section.gap || grid.gutter}px">${cardsXml}</Grid>`,
    );
  }
  if (el.imageUrl && !el.backgroundImage) {
    parts.push(
      `<Image name="SectionMedia" src="${escapeXml(el.imageUrl)}" width="100%" borderRadius="12px" />`,
    );
  }

  const bgImageAttr =
    section.sectionKind === "hero" && el.backgroundImage
      ? ` backgroundImage="${escapeXml(el.backgroundImage)}"`
      : "";

  return `<Stack name="${escapeXml(section.name)}" width="${grid.desktop_width}px" backgroundColor="${escapeXml(section.background)}"${bgImageAttr} padding="${escapeXml(section.padding || "64px 32px")}" alignment="center">
  <Stack name="Container_${grid.container_max_width}" width="100%" maxWidth="${grid.container_max_width}px" direction="${section.direction}" gap="${section.gap || grid.gutter}px" distribution="${section.direction === "horizontal" ? "space-between" : "start"}">
    ${parts.join("\n    ")}
  </Stack>
</Stack>`;
}

function buildToolArgsFromSchema(
  tool: McpToolInfo,
  context: {
    projectUrl: string;
    projectId: string;
    nodeId?: string;
    xml?: string;
    colorName?: string;
    colorValue?: string;
    pagePath?: string;
    pageTitle?: string;
  },
): Record<string, unknown> {
  const props =
    (tool.inputSchema?.properties as Record<string, unknown> | undefined) ?? {};
  const args: Record<string, unknown> = {};

  for (const key of Object.keys(props)) {
    const lower = key.toLowerCase();
    if (lower === "projecturl" || lower === "url") {
      args[key] = context.projectUrl;
    } else if (lower === "projectid") {
      args[key] = context.projectId;
    } else if (lower === "nodeid" && context.nodeId) {
      args[key] = context.nodeId;
    } else if ((lower === "xml" || lower === "content" || lower === "nodexml") && context.xml) {
      args[key] = context.xml;
    } else if ((lower === "path" || lower === "webpagepath" || lower === "pagepath" || lower === "slug") && context.pagePath) {
      args[key] = context.pagePath;
    } else if ((lower === "title" || lower === "pagename") && context.pageTitle) {
      args[key] = context.pageTitle;
    } else if (lower === "name") {
      if (context.colorName) args[key] = context.colorName;
      else if (context.pageTitle) args[key] = context.pageTitle;
    } else if ((lower === "color" || lower === "light" || lower === "value") && context.colorValue) {
      args[key] = context.colorValue;
    }
  }
  return args;
}

function normalizeComparablePath(p: string): string {
  const s = String(p || "/").trim();
  if (!s || s === "/") return "/";
  const withLead = s.startsWith("/") ? s : `/${s}`;
  return withLead.replace(/\/+$/, "") || "/";
}

function extractProjectId(projectUrl: string): string {
  const match = projectUrl.match(/--([a-zA-Z0-9]+)/);
  if (match) return match[1];
  const parts = projectUrl.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || projectUrl;
}

function pickTool(tools: McpToolInfo[], candidates: RegExp[]): McpToolInfo | null {
  for (const re of candidates) {
    const found = tools.find((t) => re.test(t.name));
    if (found) return found;
  }
  return null;
}

function extractMcpText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: Array<{ text?: string }> }).content;
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || "").filter(Boolean).join("\n");
  }
  return "";
}

function extractSessionHandle(result: unknown): string | null {
  const queue: unknown[] = [result];
  const seen = new Set<unknown>();
  while (queue.length > 0 && seen.size < 40) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    if (typeof current === "string") {
      const match =
        current.match(/"session"\s*:\s*"([^"]+)"/) ||
        current.match(/Pass session\s+([A-Za-z0-9_-]+)/i);
      if (match?.[1]) return match[1];
      continue;
    }
    if (typeof current !== "object") continue;
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (typeof record.session === "string" && record.session.trim()) return record.session.trim();
    for (const value of Object.values(record)) queue.push(value);
  }
  return null;
}

function assertMcpOk(result: unknown): void {
  if (!result || typeof result !== "object") return;
  const record = result as { isError?: boolean; content?: Array<{ text?: string }> };
  if (!record.isError) return;
  const detail = record.content?.map((item) => item.text || "").join(" ").trim();
  throw new Error(detail || "Framer MCP exec 失敗");
}

function extractExecPayload(result: unknown): Record<string, unknown> {
  const candidates: unknown[] = [];
  const push = (value: unknown) => {
    if (value !== undefined) candidates.push(value);
  };
  push(result);
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    push(record.structuredContent);
    push(record.output);
    const text = extractMcpText(result);
    if (text) {
      try {
        push(JSON.parse(text));
      } catch {
        // exec 文字結果不一定是 JSON
      }
    }
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const output = record.output;
    if (output && typeof output === "object") {
      const inner = (output as { result?: unknown }).result;
      if (inner && typeof inner === "object") return inner as Record<string, unknown>;
    }
    if ("pageId" in record || "sectionId" in record) return record;
  }
  return {};
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(String(color || "").trim());
  if (!match) return color;
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeFramerPadding(raw: string | undefined, fallback: string): string {
  const parts = String(raw || fallback).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${parts[1]} ${parts[0]} ${parts[1]}`;
  if (parts.length === 3) return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[1]}`;
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
}

function usableFont(name: string | undefined): string | undefined {
  const font = String(name || "").split(",")[0]?.replace(/['"]/g, "").trim() || "";
  if (!font || /^(sans-serif|serif|monospace|system-ui)$/i.test(font)) return undefined;
  return font;
}

function isLightHex(color: string | undefined): boolean {
  const hex = String(color || "").trim();
  if (!hex.startsWith("#")) return false;
  const raw = hex.slice(1);
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 >= 0.62;
}

function htmlTagForSection(kind: string): "header" | "nav" | "footer" | "section" {
  if (kind === "navbar") return "nav";
  if (kind === "footer") return "footer";
  return "section";
}

function compactAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== "") next[key] = value;
  }
  return next;
}

type FramerWriteOp =
  | { op: "frame"; id: string; parent: string; attrs: Record<string, unknown> }
  | { op: "text"; id: string; parent: string; attrs: Record<string, unknown> }
  | { op: "image"; id: string; parent: string; url: string; attrs: Record<string, unknown> };

type FramerExecSpec = {
  stamp: string;
  pagePath: string;
  pageTitle: string;
  pageNodeId: string | null;
  desktopWidth: string;
  primaryColor: string | null;
  marker?: string;
  backgroundImage?: string | null;
  ops: FramerWriteOp[];
};

function buildSectionOps(
  section: IrSection,
  grid: IrPayload["gridConfig"],
  fontName: string | undefined,
  bodyFontName?: string,
): { ops: FramerWriteOp[]; backgroundImage: string | null } {
  const stamp = Date.now().toString(36);
  const root = `sec${stamp}`;
  const inner = `in${stamp}`;
  const ops: FramerWriteOp[] = [];
  const el = section.elements || {};
  const gap = `${section.gap || grid.gutter || 16}px`;
  const horizontal = section.direction === "horizontal";
  const headingFont = fontName || bodyFontName;
  const textFont = bodyFontName ? { fontName: bodyFontName } : headingFont ? { fontName: headingFont } : {};
  const headingFontAttr = headingFont ? { fontName: headingFont } : {};
  const lightSurface = isLightHex(section.background) || section.background === "transparent";
  const cardFill = lightSurface ? "#FBF7F1" : "rgba(255, 255, 255, 0.063)";

  ops.push({
    op: "frame",
    id: root,
    parent: "$bp",
    attrs: compactAttrs({
      name: section.name,
      elementId: `readdy-${section.id}`,
      htmlTag: htmlTagForSection(section.sectionKind),
      layout: "stack",
      stackDirection: "vertical",
      stackAlignment: "center",
      width: "100%",
      height: "auto",
      fill: section.background,
      padding: normalizeFramerPadding(section.padding, "64px 32px 64px 32px"),
      overflow: "clip",
    }),
  });
  ops.push({
    op: "frame",
    id: inner,
    parent: root,
    attrs: compactAttrs({
      name: `Container_${grid.container_max_width}`,
      layout: "stack",
      stackDirection: horizontal ? "horizontal" : "vertical",
      stackDistribution: horizontal ? "space-between" : "start",
      gap: horizontal ? undefined : gap,
      width: "100%",
      maxWidth: `${grid.container_max_width}px`,
      height: "auto",
    }),
  });

  const pushText = (
    id: string,
    parent: string,
    text: string,
    attrs: Record<string, unknown>,
    hug = false,
  ) => {
    ops.push({
      op: "text",
      id,
      parent,
      attrs: compactAttrs({
        text,
        width: hug ? undefined : "1fr",
        ...textFont,
        ...attrs,
      }),
    });
  };

  let n = 0;
  const nextId = (prefix: string) => `${prefix}${stamp}${n++}`;

  if (el.badge) {
    const badge = nextId("badge");
    ops.push({
      op: "frame",
      id: badge,
      parent: inner,
      attrs: compactAttrs({
        name: `${section.name} Badge`,
        layout: "stack",
        stackDirection: "horizontal",
        stackAlignment: "center",
        width: "auto",
        height: "auto",
        fill: withAlpha(section.accentColor, 0.13),
        radius: "999px",
        padding: "6px 14px 6px 14px",
      }),
    });
    pushText(nextId("t"), badge, el.badge, {
      name: "Badge",
      textColor: section.accentColor,
      fontSize: "12px",
      fontWeight: 600,
    }, true);
  }
  if (el.heading) {
    const size = section.sectionKind === "hero" ? "48px" : section.sectionKind === "navbar" ? "18px" : "32px";
    const tag = section.sectionKind === "hero" ? "h1" : section.sectionKind === "navbar" ? "div" : "h2";
    pushText(nextId("h"), inner, el.heading, {
      name: "Heading",
      tag,
      textColor: section.textColor,
      fontSize: size,
      fontWeight: 700,
      ...headingFontAttr,
    });
  }
  if (el.subheading) {
    pushText(nextId("sub"), inner, el.subheading, {
      name: "Subheading",
      tag: "p",
      textColor: withAlpha(section.textColor, 0.8),
      fontSize: "16px",
    });
  } else if (Array.isArray(el.paragraphs)) {
    for (const para of el.paragraphs) {
      pushText(nextId("p"), inner, para, {
        name: "Paragraph",
        tag: "p",
        textColor: withAlpha(section.textColor, 0.8),
        fontSize: "16px",
      });
    }
  }
  if (Array.isArray(el.navLinks) && el.navLinks.length > 0) {
    const row = nextId("nav");
    ops.push({
      op: "frame",
      id: row,
      parent: inner,
      attrs: {
        name: "NavLinks",
        layout: "stack",
        stackDirection: "horizontal",
        stackAlignment: "center",
        stackDistribution: "start",
        gap: "24px",
        width: "auto",
        height: "auto",
      },
    });
    for (const link of el.navLinks) {
      pushText(nextId("nl"), row, link, {
        textColor: withAlpha(section.textColor, 0.8),
        fontSize: "14px",
      }, true);
    }
  }
  if (Array.isArray(el.logos) && el.logos.length > 0) {
    const row = nextId("logos");
    ops.push({
      op: "frame",
      id: row,
      parent: inner,
      attrs: {
        name: "LogosStrip",
        layout: "stack",
        stackDirection: "horizontal",
        stackAlignment: "center",
        stackDistribution: "space-between",
        width: "100%",
        height: "auto",
      },
    });
    for (const logo of el.logos) {
      pushText(nextId("lg"), row, logo, {
        textColor: withAlpha(section.textColor, 0.6),
        fontSize: "15px",
        fontWeight: 600,
      }, true);
    }
  }
  if (Array.isArray(el.buttons) && el.buttons.length > 0) {
    const row = nextId("actions");
    ops.push({
      op: "frame",
      id: row,
      parent: inner,
      attrs: {
        name: "Actions",
        layout: "stack",
        stackDirection: "horizontal",
        stackAlignment: "center",
        gap: "12px",
        width: "auto",
        height: "auto",
      },
    });
    for (const button of el.buttons) {
      const isPrimary = button.variant !== "secondary";
      const buttonId = nextId("btn");
      ops.push({
        op: "frame",
        id: buttonId,
        parent: row,
        attrs: compactAttrs({
          name: "Button",
          htmlTag: "button",
          layout: "stack",
          stackDirection: "horizontal",
          stackAlignment: "center",
          width: "auto",
          height: "auto",
          fill: isPrimary ? section.accentColor : undefined,
          radius: "8px",
          padding: "10px 20px 10px 20px",
          overflow: "clip",
        }),
      });
      pushText(nextId("bt"), buttonId, button.label, {
        textColor: isPrimary ? "#FFFFFF" : section.textColor,
        fontSize: "14px",
        fontWeight: 600,
      }, true);
    }
  }
  if (Array.isArray(el.cards) && el.cards.length > 0) {
    const gridId = nextId("cards");
    ops.push({
      op: "frame",
      id: gridId,
      parent: inner,
      attrs: {
        name: "CardsGrid",
        layout: "grid",
        gridColumnCount: section.columns || 3,
        gap,
        width: "100%",
        height: "auto",
      },
    });
    for (const card of el.cards) {
      const cardId = nextId("card");
      ops.push({
        op: "frame",
        id: cardId,
        parent: gridId,
        attrs: {
          name: card.title,
          layout: "stack",
          stackDirection: "vertical",
          gap: "10px",
          padding: "24px 24px 24px 24px",
          fill: cardFill,
          radius: "12px",
          width: "1fr",
          height: "auto",
          overflow: "clip",
        },
      });
      if (card.imageUrl) {
        ops.push({
          op: "image",
          id: nextId("cimg"),
          parent: cardId,
          url: card.imageUrl,
          attrs: {
            name: "CardImage",
            width: "100%",
            height: "200px",
            radius: "8px",
            overflow: "clip",
          },
        });
      }
      if (card.title) {
        pushText(nextId("ct"), cardId, card.title, {
          textColor: section.textColor,
          fontSize: "18px",
          fontWeight: 600,
          ...headingFontAttr,
        });
      }
      if (card.description) {
        pushText(nextId("cd"), cardId, card.description, {
          textColor: withAlpha(section.textColor, 0.7),
          fontSize: "14px",
        });
      }
      if (card.tagline) {
        pushText(nextId("ctl"), cardId, card.tagline, {
          textColor: withAlpha(section.textColor, 0.6),
          fontSize: "12px",
        });
      }
    }
  }
  if (el.imageUrl && !el.backgroundImage) {
    ops.push({
      op: "image",
      id: nextId("media"),
      parent: inner,
      url: el.imageUrl,
      attrs: {
        name: "SectionMedia",
        width: "100%",
        height: "360px",
        radius: "12px",
        overflow: "clip",
      },
    });
  }

  return {
    ops,
    backgroundImage: el.backgroundImage || null,
  };
}

function buildFramerProgram(spec: FramerExecSpec): string {
  return `const spec = ${JSON.stringify(spec)};
const { tree } = api;
const warnings = [];
function normPath(p) {
  const s = String(p || "/").trim();
  if (!s || s === "/") return "/";
  let withLead = s.startsWith("/") ? s : "/" + s;
  while (withLead.length > 1 && withLead.endsWith("/")) withLead = withLead.slice(0, -1);
  return withLead || "/";
}
function pickBreakpoint(page) {
  const frames = (page.children || []).filter((child) => child.type === "FrameNode");
  return frames.find((child) => child.$isPrimary)
    || frames.find((child) => String(child.name || "").toLowerCase() === "desktop")
    || frames.slice().sort((a, b) => parseInt(String(b.width || "0"), 10) - parseInt(String(a.width || "0"), 10))[0]
    || null;
}
const target = normPath(spec.pagePath);
const pages = tree.getNodesOfTypes("WebPageNode");
let page = spec.pageNodeId ? tree.get(spec.pageNodeId) : null;
if (!page || page.type !== "WebPageNode" || normPath(page.path) !== target) {
  page = pages.find((item) => normPath(item.path) === target) || null;
}
let created = false;
if (!page) {
  if (target === "/") throw new Error("專案沒有路徑為 / 的首頁");
  page = tree.insert("WebPageNode", "readdy-page-" + spec.stamp, {
    name: spec.pageTitle || target,
    path: target,
  });
  created = true;
}
let breakpoint = pickBreakpoint(page);
if (!breakpoint) {
  breakpoint = tree.insert("FrameNode", "readdy-desktop-" + spec.stamp, {
    parent: page.id,
    name: "Desktop",
    layout: "stack",
    stackDirection: "vertical",
    width: spec.desktopWidth,
    height: "auto",
    overflow: "clip",
  });
}
let parent = breakpoint;
if (breakpoint.$layoutTemplateId) {
  const existing = (breakpoint.children || []).find((child) => child.elementId === "readdy-page-content");
  if (existing) parent = existing;
  else {
    parent = tree.insert("FrameNode", "readdy-content-" + spec.stamp, {
      parent: breakpoint.id,
      name: "Readdy Content",
      elementId: "readdy-page-content",
      layout: "stack",
      stackDirection: "vertical",
      width: "100%",
      height: "auto",
      overflow: "clip",
    });
  }
} else if (breakpoint.layout !== "stack") {
  tree.patch(breakpoint.id, { layout: "stack", height: "auto", stackDirection: "vertical" });
}
if (spec.primaryColor) {
  const tokens = tree.getNodesOfTypes("ColorStyleTokenNode");
  const token = tokens.find((item) => item.name === "Readdy/Primary");
  if (!token) {
    tree.insert("ColorStyleTokenNode", "readdy-primary-" + spec.stamp, {
      name: "Readdy/Primary",
      light: spec.primaryColor,
    });
  } else if (token.light !== spec.primaryColor) {
    tree.patch(token.id, { light: spec.primaryColor });
  }
}
if (spec.marker) {
  const stale = (parent.children || []).filter((child) => child.elementId === spec.marker).map((child) => child.id);
  for (const id of stale) tree.remove(id);
}
const ids = { $bp: parent.id };
let sectionId = null;
for (const op of spec.ops) {
  const parentId = ids[op.parent];
  if (!parentId) throw new Error("缺少父層 " + op.parent);
  let node;
  if (op.op === "image") {
    let fill;
    try {
      fill = await tree.assetReference(op.url);
    } catch (error) {
      warnings.push("圖片略過 " + op.url + ": " + error);
      continue;
    }
    node = tree.insert("FrameNode", op.id, { ...op.attrs, parent: parentId, fill });
  } else if (op.op === "text") {
    node = tree.insert("RichTextNode", op.id, { ...op.attrs, parent: parentId });
  } else {
    node = tree.insert("FrameNode", op.id, { ...op.attrs, parent: parentId });
  }
  ids[op.id] = node.id;
  if (op.parent === "$bp") sectionId = node.id;
}
if (spec.backgroundImage && sectionId) {
  try {
    const fill = await tree.assetReference(spec.backgroundImage);
    tree.patch(sectionId, { fill });
  } catch (error) {
    warnings.push("背景圖略過: " + error);
  }
}
return {
  pageId: page.id,
  pagePath: page.path,
  breakpointId: breakpoint.id,
  sectionId,
  created,
  warnings,
};`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!extractBearerToken(req)) {
    return jsonResponse({ error: "未登入或缺少授權標頭" }, 401);
  }

  const startedAt = Date.now();

  try {
    const body = (await req.json()) as {
      action?: string;
      call_read_docs?: boolean;
      doc_args?: Record<string, unknown>;
      doc_paths?: string[];
      open_project_id?: string;
      list_projects?: boolean;
      job_id?: string;
      step_index?: number;
      framer_project_url?: string;
      page_path?: string;
      page_title?: string;
    };

    if (body.action === "inspect_mcp") {
      const supabase = supabaseAdmin();
      const { accessToken } = await getValidFramerAccessToken(supabase);
      const mcp = new FramerMcpClient(accessToken);
      await mcp.initialize();
      const tools = await mcp.listTools();

      let projectsResult: unknown = null;
      if (body.list_projects) {
        projectsResult = await mcp.callTool("list_projects", { limit: 10 }).catch((e) => ({ error: String(e) }));
      }

      let openResult: unknown = null;
      let sessionHandle: string | null = null;
      if (body.open_project_id) {
        openResult = await mcp.callTool("open_project", { projectId: body.open_project_id });
        const rawText = typeof openResult === "string"
          ? openResult
          : JSON.stringify(openResult || "");
        const m = rawText.match(/"session"\s*:\s*"([^"]+)"/) || rawText.match(/session[^a-zA-Z0-9_-]*([a-zA-Z0-9._-]{8,})/i);
        if (m) sessionHandle = m[1];
        const structured = (openResult as { structuredContent?: { session?: string } })?.structuredContent;
        if (structured?.session) sessionHandle = structured.session;
      }

      const docResults: Record<string, unknown> = {};
      if (sessionHandle && Array.isArray(body.doc_paths)) {
        for (const p of body.doc_paths) {
          docResults[p] = await mcp.callTool("read_docs", { session: sessionHandle, path: p })
            .catch((e) => ({ error: String(e) }));
        }
      } else if (body.call_read_docs || body.doc_args) {
        docResults.default = await mcp.callTool("read_docs", body.doc_args || {})
          .catch((e) => ({ error: String(e) }));
      }

      return jsonResponse({
        ok: true,
        tools,
        projects_result: projectsResult,
        open_result: openResult,
        session_handle: sessionHandle,
        doc_results: docResults,
      });
    }

    const jobId = String(body.job_id || "").trim();
    const stepIndex = Number(body.step_index ?? 0);
    if (!jobId) {
      return jsonResponse({ error: "缺少 job_id" }, 400);
    }

    const supabase = supabaseAdmin();
    const { data: job, error: jobErr } = await supabase
      .from("framer_sync_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return jsonResponse({ error: `找不到同步任務 ${jobId}` }, 404);
    }

    const irPayload = job.ir_payload as IrPayload | null;
    if (!irPayload || !Array.isArray(irPayload.sections)) {
      return jsonResponse({ error: "此任務尚未完成 IR 解析。" }, 400);
    }

    const pagePath = String(body.page_path || irPayload.pageMeta?.path || "/").trim() || "/";
    const pageTitle = String(body.page_title || irPayload.pageMeta?.title || pagePath).trim();
    const projectUrl = String(body.framer_project_url || job.framer_project_url || "").trim();
    const projectId = extractProjectId(projectUrl);
    const existingLogs = Array.isArray(job.step_logs) ? [...job.step_logs] : [];
    const addLog = (level: string, message: string) => {
      existingLogs.push({
        ts: new Date().toISOString(),
        level,
        stage: "mcp",
        message,
      });
    };

    const { accessToken } = await getValidFramerAccessToken(supabase);
    const mcp = new FramerMcpClient(accessToken);

    await mcp.initialize();
    const tools = await mcp.listTools();
    const toolNames = tools.map((t) => t.name);

    await upsertFramerConnection(supabase, {
      last_used_at: new Date().toISOString(),
    });

    const openTool = pickTool(tools, [/^open_project$/i]);
    const execTool = pickTool(tools, [/^exec$/i]);
    const useExec = Boolean(openTool && execTool);
    const grid = irPayload.gridConfig || {
      desktop_width: 1200,
      container_max_width: 1120,
      columns: 12,
      gutter: 24,
    };
    const desktopWidth = `${grid.desktop_width || 1200}px`;
    const primaryColor = irPayload.designTokens?.colors?.primary || "#0BB59B";

    const rememberPage = (pageId: string | null, breakpointId: string | null) => {
      if (irPayload.pageMeta) {
        irPayload.pageMeta.framerPageNodeId = pageId;
        irPayload.pageMeta.framerBreakpointId = breakpointId;
        if (!irPayload.pageMeta.path) irPayload.pageMeta.path = pagePath;
        if (!irPayload.pageMeta.title) irPayload.pageMeta.title = pageTitle;
      } else {
        irPayload.pageMeta = {
          path: pagePath,
          title: pageTitle,
          framerPageNodeId: pageId,
          framerBreakpointId: breakpointId,
        };
      }
    };

    const runFramerProgram = async (spec: FramerExecSpec): Promise<Record<string, unknown>> => {
      if (!openTool || !execTool) {
        throw new Error(`Framer MCP 未暴露 open_project 或 exec（可用工具：${toolNames.join(", ")}）`);
      }
      const opened = await mcp.callTool(openTool.name, { projectId: projectUrl || projectId });
      assertMcpOk(opened);
      const session = extractSessionHandle(opened);
      if (!session) {
        throw new Error(`open_project 未回傳 session：${extractMcpText(opened).slice(0, 280)}`);
      }
      const result = await mcp.callTool(execTool.name, {
        session,
        program: buildFramerProgram(spec),
      });
      assertMcpOk(result);
      return extractExecPayload(result);
    };

    // Step 0: locate or create the target page, then sync the primary color token.
    if (stepIndex === 0) {
      addLog("info", `已連線 mcp.framer.com，目標頁面 ${pagePath}，可用工具 (${toolNames.length})：${toolNames.join(", ")}`);

      if (!useExec) {
        const msg = `Framer MCP 未暴露 open_project/exec，無法定位頁面（可用工具：${toolNames.join(", ")}）`;
        addLog("error", msg);
        await supabase
          .from("framer_sync_jobs")
          .update({
            status: "failed",
            error_log: msg,
            step_logs: existingLogs,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return jsonResponse({ error: msg, tools_discovered: toolNames }, 400);
      }

      try {
        const payload = await runFramerProgram({
          stamp: Date.now().toString(36),
          pagePath: normalizeComparablePath(pagePath),
          pageTitle,
          pageNodeId: irPayload.pageMeta?.framerPageNodeId || null,
          desktopWidth,
          primaryColor,
          ops: [],
        });
        const pageNodeId = typeof payload.pageId === "string" ? payload.pageId : null;
        const breakpointId = typeof payload.breakpointId === "string" ? payload.breakpointId : null;
        rememberPage(pageNodeId, breakpointId);
        const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];
        for (const warning of warnings) addLog("warn", warning);
        addLog(
          "success",
          `已用 exec 定位頁面 ${normalizeComparablePath(pagePath)}${pageNodeId ? `（${pageNodeId}）` : ""}${payload.created ? "，並建立缺少的頁面" : ""}，主色 ${primaryColor}`,
        );

        await supabase
          .from("framer_sync_jobs")
          .update({
            status: "syncing",
            current_step: 0,
            ir_payload: irPayload,
            step_logs: existingLogs,
            error_log: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        return jsonResponse({
          ok: true,
          step_index: 0,
          duration_ms: Date.now() - startedAt,
          tools_discovered: toolNames,
          tool_called: "exec",
          root_node_id: pageNodeId,
          page_path: pagePath,
          framer_page_node_id: pageNodeId,
          framer_breakpoint_id: breakpointId,
          logs: existingLogs.slice(-6),
          job_status: "syncing",
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        addLog("error", msg);
        await supabase
          .from("framer_sync_jobs")
          .update({
            status: "failed",
            error_log: msg,
            step_logs: existingLogs,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return jsonResponse({ error: msg, tools_discovered: toolNames }, 400);
      }
    }

    // Step 1..N: Write one section only to the matched page node
    const sectionIdx = stepIndex - 1;
    const section = irPayload.sections[sectionIdx];
    if (!section) {
      return jsonResponse({ error: `無效的區塊步驟 step_index=${stepIndex}` }, 400);
    }

    const xmlWriteTool = pickTool(tools, [
      /^updateXmlForNode$/i,
      /^updateXml$/i,
      /update.*xml/i,
      /insert.*xml/i,
    ]);

    let targetNodeId: string | null = irPayload.pageMeta?.framerPageNodeId || null;
    let toolCalled = "exec";

    if (useExec) {
      const built = buildSectionOps(
        section,
        grid,
        usableFont(irPayload.designTokens?.typography?.fontFamily),
        usableFont(irPayload.designTokens?.typography?.bodyFont),
      );
      try {
        const payload = await runFramerProgram({
          stamp: Date.now().toString(36),
          pagePath: normalizeComparablePath(pagePath),
          pageTitle,
          pageNodeId: targetNodeId,
          desktopWidth,
          primaryColor: null,
          marker: `readdy-${section.id}`,
          backgroundImage: built.backgroundImage,
          ops: built.ops,
        });
        if (typeof payload.pageId !== "string" || !payload.pageId) {
          throw new Error("exec 已執行但未回傳頁面 id");
        }
        targetNodeId = payload.pageId;
        const breakpointId = typeof payload.breakpointId === "string" ? payload.breakpointId : null;
        rememberPage(targetNodeId, breakpointId ?? irPayload.pageMeta?.framerBreakpointId ?? null);
        const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];
        for (const warning of warnings) addLog("warn", warning);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        section.syncStatus = "failed";
        addLog("error", `區塊 [${section.name}] 寫入失敗：${detail}`);
        await supabase
          .from("framer_sync_jobs")
          .update({
            status: "failed",
            ir_payload: irPayload,
            error_log: detail,
            step_logs: existingLogs,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return jsonResponse({ error: detail, tool_called: "exec", tools_discovered: toolNames }, 400);
      }
    } else if (!xmlWriteTool) {
      const msg = `Framer MCP 未暴露 exec，也沒有 XML 寫入工具（可用工具：${toolNames.join(", ")}）`;
      section.syncStatus = "failed";
      addLog("error", msg);
      await supabase
        .from("framer_sync_jobs")
        .update({
          status: "failed",
          ir_payload: irPayload,
          error_log: msg,
          step_logs: existingLogs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return jsonResponse({ error: msg, tools_discovered: toolNames }, 400);
    } else {
      toolCalled = xmlWriteTool.name;
      const xml = buildSectionFramerXml(section, grid);
      const writeArgs = buildToolArgsFromSchema(xmlWriteTool, {
        projectUrl,
        projectId,
        nodeId: targetNodeId || undefined,
        xml,
      });
      const mcpResult = await mcp.callTool(xmlWriteTool.name, writeArgs);
      const mcpResultObj = mcpResult as { isError?: boolean; content?: Array<{ text?: string }> } | null;
      if (mcpResultObj?.isError) {
        const detail = mcpResultObj.content?.map((c) => c.text).join(" ") || JSON.stringify(mcpResult);
        section.syncStatus = "failed";
        addLog("error", `區塊 [${section.name}] 寫入失敗：${detail}`);
        await supabase
          .from("framer_sync_jobs")
          .update({
            status: "failed",
            ir_payload: irPayload,
            error_log: detail,
            step_logs: existingLogs,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return jsonResponse({ error: detail, tool_called: xmlWriteTool.name }, 400);
      }
    }

    section.syncStatus = "synced";
    const allSynced = irPayload.sections.every((s) => s.syncStatus === "synced");
    const nextStatus = allSynced ? "completed" : "syncing";
    const durationMs = Date.now() - startedAt;

    addLog(
      "success",
      `Step ${stepIndex}/${irPayload.sections.length} [${section.name}] 已透過 ${toolCalled} 寫入 Framer（${durationMs}ms）`,
    );

    await supabase
      .from("framer_sync_jobs")
      .update({
        current_step: stepIndex,
        status: nextStatus,
        ir_payload: irPayload,
        step_logs: existingLogs,
        error_log: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return jsonResponse({
      ok: true,
      step_index: stepIndex,
      section_id: section.id,
      page_path: pagePath,
      framer_page_node_id: targetNodeId,
      duration_ms: durationMs,
      tools_discovered: toolNames,
      tool_called: toolCalled,
      logs: existingLogs.slice(-4),
      job_status: nextStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
