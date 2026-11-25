import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  type FramerActiveMcpSession,
  type FramerConnectionRow,
  FramerMcpClient,
  type McpToolInfo,
  blockFramerProjectReopen,
  connectSharedFramerMcp,
  corsHeaders,
  extractBearerToken,
  formatFramerSessionLimitError,
  framerProjectSessionKey,
  getFramerSessionOpenBlock,
  getValidFramerAccessToken,
  isFramerProjectSessionStaleError,
  isFramerSessionLimitError,
  isFramerTransportStaleError,
  jsonResponse,
  loadFramerConnection,
  markFramerSessionLimit,
  normalizeFramerSessionSlot,
  readCachedFramerSession,
  replaceSharedFramerTransport,
  saveCachedFramerSession,
  supabaseAdmin,
  touchSharedFramerTransport,
  upsertFramerConnection,
} from "../_shared/framer-mcp.ts";

async function invokeFramer<T>(
  supabase: ReturnType<typeof supabaseAdmin>,
  accessToken: string,
  rowHolder: { row: FramerConnectionRow | null },
  run: (client: FramerMcpClient) => Promise<T>,
  options?: { retryTransport?: boolean; slot?: number },
): Promise<T> {
  const retryTransport = options?.retryTransport !== false;
  const slot = normalizeFramerSessionSlot(options?.slot ?? 0);
  let client = await connectSharedFramerMcp(supabase, accessToken, rowHolder.row, slot);
  const attempt = async (current: FramerMcpClient) => {
    const result = await run(current);
    await touchSharedFramerTransport(supabase, current.getSessionId(), slot);
    rowHolder.row = await loadFramerConnection(supabase);
    return result;
  };
  try {
    return await attempt(client);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isFramerSessionLimitError(msg)) {
      await markFramerSessionLimit(supabase);
      throw new Error(formatFramerSessionLimitError(msg));
    }
    if (!isFramerTransportStaleError(msg)) throw error;
    client = await replaceSharedFramerTransport(supabase, accessToken, slot);
    rowHolder.row = await loadFramerConnection(supabase);
    if (!retryTransport) throw error;
    try {
      return await attempt(client);
    } catch (retryError) {
      const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
      if (isFramerSessionLimitError(retryMsg)) {
        await markFramerSessionLimit(supabase);
        throw new Error(formatFramerSessionLimitError(retryMsg));
      }
      throw retryError;
    }
  }
}

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
  const clean = String(projectUrl || "").split(/[?#]/)[0].trim();
  const match = clean.match(/--([a-zA-Z0-9]+)/);
  if (match) return match[1];
  const parts = clean.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || clean;
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

type FramerWorkspacePayload = {
  id: string;
  name: string;
  role: string | null;
  plan: string | null;
  canCreate: boolean;
};

type FramerProjectPayload = {
  id: string;
  title: string;
  url: string;
  workspaceId: string | null;
  workspaceName: string | null;
  lastOpenedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unwrapToolRecord(result: unknown): Record<string, unknown> {
  assertMcpOk(result);
  const record = asRecord(result);
  if (!record) return {};
  const structured = asRecord(record.structuredContent);
  if (structured) return structured;
  const text = extractMcpText(result).trim();
  if (text.startsWith("{")) {
    try {
      const parsed = asRecord(JSON.parse(text));
      if (parsed) return parsed;
    } catch {
      // 文字結果不是 JSON
    }
  }
  return record;
}

function normalizeFramerWorkspaces(raw: Record<string, unknown>): FramerWorkspacePayload[] {
  const list = Array.isArray(raw.workspaces) ? raw.workspaces : [];
  const workspaces: FramerWorkspacePayload[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const id = String(row.id || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !name) continue;
    const permissions = Array.isArray(row.permissions) ? row.permissions.map((entry) => String(entry)) : [];
    workspaces.push({
      id,
      name,
      role: row.role ? String(row.role) : null,
      plan: row.plan ? String(row.plan) : null,
      canCreate: permissions.includes("create_project"),
    });
  }
  return workspaces;
}

function normalizeFramerProjects(raw: Record<string, unknown>): {
  projects: FramerProjectPayload[];
  nextCursor: string;
} {
  const list = Array.isArray(raw.projects) ? raw.projects : [];
  const projects: FramerProjectPayload[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const id = String(row.id || "").trim();
    if (!id) continue;
    const workspace = asRecord(row.workspace);
    projects.push({
      id,
      title: String(row.title || id).trim() || id,
      url: String(row.url || `https://framer.com/projects/${id}`).trim(),
      workspaceId: workspace ? String(workspace.id || "").trim() || null : null,
      workspaceName: workspace ? String(workspace.name || "").trim() || null : null,
      lastOpenedAt: row.lastOpenedAt ? String(row.lastOpenedAt) : null,
    });
  }
  const nextCursor = typeof raw.nextCursor === "string" ? raw.nextCursor.trim() : "";
  return { projects, nextCursor };
}

function normalizeCreatedProject(
  raw: Record<string, unknown>,
  fallbackTitle: string,
  workspaceId: string,
): FramerProjectPayload {
  const nested = asRecord(raw.project) || raw;
  const id = String(nested.id || nested.projectId || "").trim();
  if (!id) throw new Error("Framer 沒有回傳新專案編號。");
  const workspace = asRecord(nested.workspace);
  return {
    id,
    title: String(nested.title || fallbackTitle).trim() || fallbackTitle,
    url: String(nested.url || `https://framer.com/projects/${id}`).trim(),
    workspaceId: (workspace ? String(workspace.id || "").trim() : "") || workspaceId,
    workspaceName: workspace ? String(workspace.name || "").trim() || null : null,
    lastOpenedAt: null,
  };
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

function looksLikeSourceCode(text: string): boolean {
  return /(?:className|onClick|onChange|onSubmit)\s*=|\bset[A-Z]\w*\(|=>\s*\{|<\/?[A-Za-z][^>\n]{0,80}>/.test(text);
}

function gridResponsive(columns: number): ResponsiveOverrides | undefined {
  if (columns <= 1) return undefined;
  const tabletColumns = columns >= 3 ? 2 : columns;
  const tablet = tabletColumns !== columns ? { gridColumnCount: tabletColumns } : undefined;
  const phone = columns >= 4
    ? { gridColumnCount: 2 }
    : {
        layout: "stack",
        stackDirection: "vertical",
        gap: "16px",
        width: "100%",
        height: "auto",
      };
  return { tablet, phone };
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

type ResponsiveOverrides = {
  tablet?: Record<string, unknown>;
  phone?: Record<string, unknown>;
};

type FramerWriteOp =
  | { op: "frame"; id: string; parent: string; attrs: Record<string, unknown>; responsive?: ResponsiveOverrides }
  | { op: "text"; id: string; parent: string; attrs: Record<string, unknown>; responsive?: ResponsiveOverrides }
  | { op: "image"; id: string; parent: string; url: string; attrs: Record<string, unknown>; responsive?: ResponsiveOverrides };

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

type SceneLayout = {
  direction?: "horizontal" | "vertical";
  columns?: number;
  tabletColumns?: number;
  phoneColumns?: number;
  gap?: string;
  padding?: string;
  width?: string;
  height?: string;
  maxWidth?: string;
  align?: "start" | "center" | "end";
  justify?: "start" | "center" | "space-between";
  position?: "relative" | "absolute" | "fixed";
  wrap?: boolean;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: number;
  minHeight?: string;
};

type SceneStyle = {
  background?: string;
  backgroundImage?: string;
  color?: string;
  border?: string;
  radius?: string;
  fontSize?: string;
  fontWeight?: number;
  fontFamily?: string;
  textAlign?: "left" | "center" | "right";
};

type SceneNode = {
  id: string;
  type: "section" | "stack" | "grid" | "text" | "image";
  name?: string;
  text?: string;
  src?: string;
  htmlTag?: string;
  layout?: SceneLayout;
  style?: SceneStyle;
  children?: SceneNode[];
};

function isSceneNode(value: unknown): value is SceneNode {
  if (!value || typeof value !== "object") return false;
  const node = value as SceneNode;
  return typeof node.id === "string" &&
    (node.type === "section" || node.type === "stack" || node.type === "grid" || node.type === "text" || node.type === "image");
}

function sceneTextWidth(text: string, parentKind: "grid" | "row" | "stack"): string {
  if (parentKind === "row" && text.length < 32) return "auto";
  return "1fr";
}

function sceneFrameWidth(node: SceneNode, parentKind: "grid" | "row" | "stack"): string {
  if (node.layout?.width) return node.layout.width;
  if (parentKind === "grid") return "1fr";
  if (parentKind === "row") {
    const textLength = (node.children || []).reduce((sum, child) => sum + String(child.text || "").length, 0);
    return textLength > 40 || (node.children?.length || 0) >= 3 ? "1fr" : "auto";
  }
  return "100%";
}

function buildNodeOps(
  scene: SceneNode,
  sectionId: string,
): { ops: FramerWriteOp[]; backgroundImage: string | null } {
  const stamp = Date.now().toString(36);
  const ops: FramerWriteOp[] = [];
  let seq = 0;
  const nextId = () => `sn${stamp}${seq++}`;

  const visit = (
    node: SceneNode,
    parent: string,
    parentKind: "grid" | "row" | "stack",
    isRoot: boolean,
    phoneFill: boolean,
  ) => {
    if (node.type === "text") {
      const text = String(node.text || "").trim();
      if (!text || looksLikeSourceCode(text)) return;
      ops.push({
        op: "text",
        id: nextId(),
        parent,
        attrs: compactAttrs({
          name: (node.name || text).slice(0, 48),
          text,
          tag: node.htmlTag,
          width: sceneTextWidth(text, parentKind),
          textColor: node.style?.color,
          fontSize: node.style?.fontSize,
          fontWeight: node.style?.fontWeight,
          fontName: node.style?.fontFamily?.includes("Noto Serif HK") ? "Noto Serif HK" : undefined,
          textAlignment: node.style?.textAlign,
          textWrap: node.htmlTag === "h1" ? "balance" : undefined,
        }),
        responsive: phoneFill ? { phone: { width: "100%" } } : undefined,
      });
      return;
    }

    if (node.type === "image") {
      if (!node.src) return;
      ops.push({
        op: "image",
        id: nextId(),
        parent,
        url: node.src,
        attrs: compactAttrs({
          name: (node.name || "Image").slice(0, 48),
          width: node.layout?.width || "100%",
          height: node.layout?.height || "auto",
          radius: node.style?.radius,
          overflow: "clip",
        }),
        responsive: phoneFill ? { phone: { width: "100%", height: "auto" } } : undefined,
      });
      return;
    }

    const columns = node.layout?.columns || 1;
    const isGrid = node.type === "grid" && columns > 1;
    const horizontal = !isGrid && node.layout?.direction === "horizontal";
    const absolute = node.layout?.position === "absolute";
    const fixed = isRoot && node.layout?.position === "fixed";
    const phoneColumns = node.layout?.phoneColumns;
    const tabletColumns = node.layout?.tabletColumns;
    let responsive: ResponsiveOverrides | undefined;
    let childPhoneFill = phoneFill;
    if (isGrid) {
      const resolvedPhone = phoneColumns ?? (columns >= 4 ? 2 : 1);
      const phone = resolvedPhone <= 1
        ? { layout: "stack", stackDirection: "vertical", gap: "16px", width: "100%", height: "auto" }
        : { gridColumnCount: resolvedPhone };
      const resolvedTablet = tabletColumns ?? (columns >= 3 ? 2 : columns);
      const tablet = resolvedTablet === columns
        ? undefined
        : resolvedTablet <= 1
          ? { layout: "stack", stackDirection: "vertical", gap: "16px", width: "100%", height: "auto" }
          : { gridColumnCount: resolvedTablet };
      responsive = { tablet, phone };
      childPhoneFill = resolvedPhone <= 1;
    } else if (horizontal && (node.children?.length || 0) > 6) {
      responsive = { tablet: { visible: false }, phone: { visible: false } };
    } else if (horizontal && (node.children || []).some((child) => sceneFrameWidth(child, "row") === "1fr")) {
      responsive = { phone: { stackDirection: "vertical", width: "100%", height: "auto", gap: "24px" } };
      childPhoneFill = true;
    }
    if (phoneFill && !isRoot) {
      responsive = {
        tablet: responsive?.tablet,
        phone: { ...(responsive?.phone || {}), width: "100%", height: "auto" },
      };
    }

    const id = nextId();
    const distribute = node.layout?.justify === "space-between"
      ? "space-between"
      : node.layout?.justify === "center"
        ? "center"
        : "start";
    ops.push({
      op: "frame",
      id,
      parent,
      attrs: compactAttrs({
        name: (node.name || node.type).slice(0, 60),
        elementId: isRoot ? `readdy-${sectionId}` : `readdy-${sectionId}--${node.id}`,
        htmlTag: isRoot
          ? node.htmlTag === "header" || node.htmlTag === "nav" || node.htmlTag === "footer" ? node.htmlTag : "section"
          : undefined,
        layout: isGrid ? "grid" : "stack",
        stackDirection: isGrid ? undefined : horizontal ? "horizontal" : "vertical",
        stackAlignment: node.layout?.align,
        stackDistribution: distribute,
        gridColumnCount: isGrid ? columns : undefined,
        gridRowHeightType: isGrid ? "fit" : undefined,
        gridColumnMinWidth: isGrid ? "180px" : undefined,
        gap: distribute === "space-between" ? undefined : node.layout?.gap,
        width: absolute ? "100%" : isRoot ? "100%" : sceneFrameWidth(node, parentKind),
        height: node.layout?.height || "auto",
        maxWidth: isRoot ? undefined : node.layout?.maxWidth,
        padding: node.layout?.padding,
        minHeight: node.layout?.minHeight,
        fill: node.style?.background,
        border: node.style?.border,
        radius: node.style?.radius,
        overflow: "clip",
        position: fixed ? "fixed" : absolute ? "absolute" : node.layout?.position === "relative" ? "relative" : undefined,
        top: fixed ? "0px" : absolute ? node.layout?.top || "0px" : undefined,
        left: fixed ? "0px" : absolute ? node.layout?.left || "0px" : undefined,
        right: fixed ? "0px" : absolute ? node.layout?.right || "0px" : undefined,
        bottom: absolute ? node.layout?.bottom || "0px" : undefined,
        zIndex: fixed ? 5 : node.layout?.zIndex,
      }),
      responsive,
    });

    const childKind = isGrid ? "grid" : horizontal ? "row" : "stack";
    for (const child of node.children || []) visit(child, id, childKind, false, childPhoneFill);
  };

  visit(scene, "$bp", "stack", true, false);
  return {
    ops,
    backgroundImage: scene.style?.backgroundImage || null,
  };
}

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
  const isNavbar = section.sectionKind === "navbar";
  const isHero = section.sectionKind === "hero";
  const isTransparentBg = String(section.background || "").trim().toLowerCase() === "transparent";
  const effectiveBg =
    isNavbar && isTransparentBg
      ? isLightHex(section.textColor)
        ? "#17120E"
        : "#F9F4EE"
      : section.background;
  const effectiveText = section.textColor || (isLightHex(effectiveBg) ? "#1F0000" : "#F9F4EE");
  const denseNav = isNavbar && Array.isArray(el.navLinks) && el.navLinks.length > 8;
  const containerMaxWidth = isNavbar
    ? Math.max(grid.container_max_width, (grid.desktop_width || 1440) - 48)
    : isHero
      ? Math.min(grid.container_max_width, 720)
      : grid.container_max_width;
  const sectionPadding = denseNav
    ? "12px 16px 12px 16px"
    : normalizeFramerPadding(section.padding, isNavbar ? "16px 24px 16px 24px" : "64px 32px 64px 32px");
  const headingFont = fontName || bodyFontName;
  const textFont = bodyFontName ? { fontName: bodyFontName } : headingFont ? { fontName: headingFont } : {};
  const headingFontAttr = headingFont ? { fontName: headingFont } : {};
  const lightSurface = isLightHex(effectiveBg) || effectiveBg === "transparent";
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
      fill: effectiveBg,
      padding: sectionPadding,
      overflow: isNavbar ? "visible" : "clip",
      position: isNavbar ? "fixed" : undefined,
      top: isNavbar ? "0px" : undefined,
      left: isNavbar ? "0px" : undefined,
      right: isNavbar ? "0px" : undefined,
      zIndex: isNavbar ? 5 : undefined,
      minHeight: isHero ? "720px" : undefined,
      stackDistribution: isHero ? "center" : undefined,
      fillImagePositionX: isHero ? "center" : undefined,
      fillImagePositionY: isHero ? "top" : undefined,
    }),
    responsive: isHero
      ? {
          tablet: { minHeight: "640px", padding: "96px 24px 72px 24px" },
          phone: { minHeight: "560px", padding: "88px 16px 56px 16px" },
        }
      : isNavbar
        ? {
            tablet: { padding: "12px 20px 12px 20px" },
            phone: { padding: "12px 16px 12px 16px" },
          }
        : {
            tablet: { padding: "56px 24px 56px 24px" },
            phone: { padding: "48px 16px 48px 16px" },
          },
  });
  ops.push({
    op: "frame",
    id: inner,
    parent: root,
    attrs: compactAttrs({
      name: `Container_${containerMaxWidth}`,
      layout: "stack",
      stackDirection: horizontal ? "horizontal" : "vertical",
      stackAlignment: horizontal || isHero ? "center" : undefined,
      stackDistribution: horizontal ? "space-between" : "start",
      gap: horizontal ? (isNavbar ? (denseNav ? "8px" : "12px") : "16px") : gap,
      width: isHero ? "720px" : "100%",
      maxWidth: isHero ? "100%" : `${containerMaxWidth}px`,
      height: "auto",
    }),
    responsive: isNavbar
      ? {
          phone: {
            stackDirection: "vertical",
            stackDistribution: "center",
            stackAlignment: "center",
            gap: "12px",
            width: "100%",
            height: "auto",
          },
        }
      : undefined,
  });

  const pushText = (
    id: string,
    parent: string,
    text: string,
    attrs: Record<string, unknown>,
    hug = false,
    responsive?: ResponsiveOverrides,
  ) => {
    if (looksLikeSourceCode(text)) return;
    ops.push({
      op: "text",
      id,
      parent,
      attrs: compactAttrs({
        text,
        width: hug ? "auto" : "1fr",
        ...textFont,
        ...attrs,
      }),
      responsive,
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
  if (el.heading && !looksLikeSourceCode(el.heading)) {
    const size = isHero ? "48px" : isNavbar ? "17px" : "32px";
    const tag = isHero ? "h1" : isNavbar ? "div" : "h2";
    pushText(nextId("h"), inner, el.heading, {
      name: "Heading",
      tag,
      textColor: effectiveText,
      fontSize: size,
      fontWeight: 700,
      ...(isHero ? { width: "100%", textWrap: "balance" } : {}),
      textAlignment: isNavbar ? undefined : "center",
      ...headingFontAttr,
    }, isNavbar, isNavbar ? undefined : {
      tablet: { fontSize: isHero ? "40px" : "28px" },
      phone: { fontSize: isHero ? "32px" : "24px" },
    });
  }
  if (el.subheading && !looksLikeSourceCode(el.subheading)) {
    pushText(nextId("sub"), inner, el.subheading, {
      name: "Subheading",
      tag: "p",
      textColor: withAlpha(effectiveText, 0.8),
      fontSize: "16px",
      ...(isHero ? { width: "100%" } : {}),
      textAlignment: isNavbar ? undefined : "center",
    }, false, {
      tablet: { fontSize: "16px" },
      phone: { fontSize: "15px" },
    });
  }
  if (Array.isArray(el.paragraphs)) {
    const subheadingText = String(el.subheading || "").trim();
    for (const para of el.paragraphs) {
      if (looksLikeSourceCode(para)) continue;
      if (subheadingText && para.trim() === subheadingText) continue;
      pushText(nextId("p"), inner, para, {
        name: "Paragraph",
        tag: "p",
        textColor: withAlpha(effectiveText, 0.8),
        fontSize: "16px",
        ...(isHero ? { width: "100%" } : {}),
        textAlignment: isHero ? "center" : undefined,
      }, false, {
        phone: { fontSize: "15px" },
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
        gap: denseNav ? "8px" : "20px",
        width: "auto",
        height: "auto",
      },
      responsive: {
        tablet: { visible: false },
        phone: { visible: false },
      },
    });
    for (const link of el.navLinks) {
      pushText(nextId("nl"), row, link, {
        textColor: withAlpha(effectiveText, 0.88),
        fontSize: denseNav ? "12px" : "13px",
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
        textColor: withAlpha(effectiveText, 0.6),
        fontSize: "15px",
        fontWeight: 600,
      }, true);
    }
  }
  if (Array.isArray(el.buttons) && el.buttons.length > 0) {
    const usableButtons = el.buttons.filter((button) => button.label && !looksLikeSourceCode(button.label));
    if (usableButtons.length > 0) {
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
        stackDistribution: isNavbar ? "start" : "center",
        gap: isNavbar ? "8px" : "12px",
        width: isNavbar ? "auto" : "100%",
        height: "auto",
      },
      responsive: isNavbar
        ? undefined
        : {
            phone: {
              stackDirection: "vertical",
              stackAlignment: "center",
              width: "100%",
              height: "auto",
            },
          },
    });
    for (const button of usableButtons) {
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
          fill: isPrimary ? section.accentColor : isNavbar ? withAlpha(effectiveText, 0.12) : undefined,
          radius: "8px",
          padding: denseNav ? "8px 12px 8px 12px" : isNavbar ? "8px 14px 8px 14px" : "10px 20px 10px 20px",
          overflow: "clip",
        }),
      });
      pushText(nextId("bt"), buttonId, button.label, {
        textColor: isPrimary ? "#FFFFFF" : effectiveText,
        fontSize: isNavbar ? "12px" : "14px",
        fontWeight: 600,
      }, true);
    }
    }
  }
  if (Array.isArray(el.cards) && el.cards.length > 0) {
    const stackCards = section.framerType === "Stack" || (section.columns || 0) <= 1;
    const gridId = nextId("cards");
    ops.push({
      op: "frame",
      id: gridId,
      parent: inner,
      attrs: stackCards
        ? {
            name: "CardsStack",
            layout: "stack",
            stackDirection: "vertical",
            gap: "12px",
            width: "100%",
            height: "auto",
          }
        : {
            name: "CardsGrid",
            layout: "grid",
            gridColumnCount: section.columns || 3,
            gridRowHeightType: "fit",
            gap,
            width: "100%",
            height: "auto",
          },
      responsive: stackCards ? undefined : gridResponsive(section.columns || 3),
    });
    const phoneStacksCards = !stackCards && (section.columns || 3) < 4;
    for (const card of el.cards) {
      if (looksLikeSourceCode(card.title) || looksLikeSourceCode(card.description || "")) continue;
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
          width: stackCards ? "100%" : "1fr",
          height: "auto",
          overflow: "clip",
        },
        responsive: phoneStacksCards
          ? { phone: { width: "100%", height: "auto" } }
          : undefined,
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
          textColor: effectiveText,
          fontSize: "18px",
          fontWeight: 600,
          ...headingFontAttr,
        });
      }
      if (card.description) {
        pushText(nextId("cd"), cardId, card.description, {
          textColor: withAlpha(effectiveText, 0.7),
          fontSize: "14px",
        });
      }
      if (card.tagline) {
        pushText(nextId("ctl"), cardId, card.tagline, {
          textColor: withAlpha(effectiveText, 0.6),
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
function framesOf(page) {
  return (page.children || []).filter((child) => child.type === "FrameNode");
}
function findNamedFrame(page, name) {
  const target = String(name || "").toLowerCase();
  return framesOf(page).find((child) => String(child.name || "").toLowerCase() === target) || null;
}
function pxOf(value, fallback) {
  const n = parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function asCreatedNode(created, id) {
  if (created && typeof created === "object" && created.id) return created;
  return tree.get(id);
}
function patchReplica(replica, nodeId, attrs) {
  if (!replica || !nodeId || !attrs) return;
  const keys = Object.keys(attrs).filter((key) => attrs[key] !== undefined && attrs[key] !== null);
  if (!keys.length) return;
  const next = {};
  for (const key of keys) next[key] = attrs[key];
  tree.patch(String(replica.id) + String(nodeId), next);
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
const desktopPx = pxOf(breakpoint.width, pxOf(spec.desktopWidth, 1200));
let tabletBp = findNamedFrame(page, "Tablet");
let phoneBp = findNamedFrame(page, "Phone");
if (!tabletBp) {
  const tabletId = "readdy-tablet-" + spec.stamp;
  tabletBp = asCreatedNode(tree.createVariant(breakpoint.id, tabletId, {
    gesture: null,
    name: "Tablet",
    left: (desktopPx + 80) + "px",
    width: "810px",
    height: "auto",
    overflow: "clip",
  }), tabletId);
}
const tabletPx = pxOf(tabletBp && tabletBp.width, 810);
const tabletLeft = pxOf(tabletBp && tabletBp.left, desktopPx + 80);
if (!phoneBp) {
  const phoneId = "readdy-phone-" + spec.stamp;
  phoneBp = asCreatedNode(tree.createVariant(breakpoint.id, phoneId, {
    gesture: null,
    name: "Phone",
    left: (tabletLeft + tabletPx + 80) + "px",
    width: "390px",
    height: "auto",
    overflow: "clip",
  }), phoneId);
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
  if (op.responsive) {
    patchReplica(tabletBp, node.id, op.responsive.tablet);
    patchReplica(phoneBp, node.id, op.responsive.phone);
  }
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
  tabletBreakpointId: tabletBp ? tabletBp.id : null,
  phoneBreakpointId: phoneBp ? phoneBp.id : null,
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
      title?: string;
      workspace_id?: string;
      job_id?: string;
      step_index?: number;
      framer_project_url?: string;
      page_path?: string;
      page_title?: string;
      session_slot?: number;
      mcp_session?: {
        project_id?: string;
        mcp_session_id?: string | null;
        project_session?: string;
      } | null;
      scene?: unknown;
    };

    if (body.action === "inspect_mcp") {
      const supabase = supabaseAdmin();
      const { accessToken, row } = await getValidFramerAccessToken(supabase);
      const rowHolder = { row };
      const projectId = String(body.open_project_id || "").trim();
      const cached = projectId ? readCachedFramerSession(row, projectId) : null;
      let sessionHandle = cached?.project_session || null;
      const tools = await invokeFramer(supabase, accessToken, rowHolder, (mcp) => mcp.listTools());

      let projectsResult: unknown = null;
      if (body.list_projects) {
        projectsResult = await invokeFramer(
          supabase,
          accessToken,
          rowHolder,
          (mcp) => mcp.callTool("list_projects", { limit: 10 }),
        ).catch((e) => ({ error: String(e) }));
      }

      let openResult: unknown = null;
      if (projectId && !sessionHandle) {
        const gate = getFramerSessionOpenBlock(rowHolder.row, projectId);
        if (gate.blocked) {
          throw new Error(formatFramerSessionLimitError(`retry after ${gate.retryAfterSeconds}s`));
        }
        openResult = await invokeFramer(supabase, accessToken, rowHolder, async (mcp) => {
          const opened = await mcp.callTool("open_project", { projectId });
          assertMcpOk(opened);
          return opened;
        }, { retryTransport: false });
        sessionHandle = extractSessionHandle(openResult);
        if (sessionHandle) {
          const nowIso = new Date().toISOString();
          await saveCachedFramerSession(supabase, projectId, {
            project_id: projectId,
            project_url: projectId,
            mcp_session_id: null,
            project_session: sessionHandle,
            opened_at: nowIso,
            last_used_at: nowIso,
          });
        }
      }

      const docResults: Record<string, unknown> = {};
      if (sessionHandle && Array.isArray(body.doc_paths)) {
        for (const p of body.doc_paths) {
          docResults[p] = await invokeFramer(
            supabase,
            accessToken,
            rowHolder,
            (mcp) => mcp.callTool("read_docs", { session: sessionHandle, path: p }),
          ).catch((e) => ({ error: String(e) }));
        }
      } else if (body.call_read_docs || body.doc_args) {
        docResults.default = await invokeFramer(
          supabase,
          accessToken,
          rowHolder,
          (mcp) => mcp.callTool("read_docs", body.doc_args || {}),
        ).catch((e) => ({ error: String(e) }));
      }

      return jsonResponse({
        ok: true,
        tools,
        projects_result: projectsResult,
        open_result: openResult,
        session_handle: sessionHandle,
        session_reused: Boolean(cached?.project_session),
        doc_results: docResults,
      });
    }

    if (body.action === "list_framer_catalog" || body.action === "create_framer_project") {
      const supabase = supabaseAdmin();
      const { accessToken, row } = await getValidFramerAccessToken(supabase);
      const rowHolder = { row };

      if (body.action === "list_framer_catalog") {
        const listed = await invokeFramer(supabase, accessToken, rowHolder, async (mcp) => {
          const workspaces = normalizeFramerWorkspaces(
            unwrapToolRecord(await mcp.callTool("list_workspaces", {})),
          );
          const projects: FramerProjectPayload[] = [];
          const seen = new Set<string>();
          let cursor = "";
          let truncated = false;
          for (let page = 0; page < 8; page++) {
            const args: Record<string, unknown> = { limit: 100 };
            if (cursor) args.cursor = cursor;
            let pageRaw: Record<string, unknown>;
            try {
              pageRaw = unwrapToolRecord(await mcp.callTool("list_projects", args));
            } catch (error) {
              if (projects.length === 0) throw error;
              truncated = true;
              break;
            }
            const batch = normalizeFramerProjects(pageRaw);
            for (const project of batch.projects) {
              if (seen.has(project.id)) continue;
              seen.add(project.id);
              projects.push(project);
            }
            if (!batch.nextCursor || batch.nextCursor === cursor || batch.projects.length === 0) {
              cursor = "";
              break;
            }
            cursor = batch.nextCursor;
            if (page === 7) truncated = true;
          }
          return { workspaces, projects, truncated };
        });
        await upsertFramerConnection(supabase, { last_used_at: new Date().toISOString() });
        return jsonResponse({ ok: true, ...listed });
      }

      const title = String(body.title || "").trim();
      const workspaceId = String(body.workspace_id || "").trim();
      if (!title) return jsonResponse({ error: "請輸入 Framer 專案名稱。" }, 400);
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(workspaceId)) {
        return jsonResponse({ error: "請選擇 Framer 工作區。" }, 400);
      }
      const created = await invokeFramer(supabase, accessToken, rowHolder, async (mcp) => {
        return normalizeCreatedProject(
          unwrapToolRecord(await mcp.callTool("create_project", { title, workspaceId })),
          title,
          workspaceId,
        );
      }, { retryTransport: false });
      await upsertFramerConnection(supabase, { last_used_at: new Date().toISOString() });
      return jsonResponse({ ok: true, project: created });
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
    const sessionSlot = normalizeFramerSessionSlot(body.session_slot);
    const sessionKey = framerProjectSessionKey(projectId, sessionSlot);
    const existingLogs = Array.isArray(job.step_logs) ? [...job.step_logs] : [];
    const addLog = (level: string, message: string) => {
      existingLogs.push({
        ts: new Date().toISOString(),
        level,
        stage: "mcp",
        message,
      });
    };

    const { accessToken, row } = await getValidFramerAccessToken(supabase);
    const rowHolder: { row: FramerConnectionRow | null } = { row };
    const openGate = getFramerSessionOpenBlock(row, projectId, Date.now(), sessionSlot);
    const cachedSession = readCachedFramerSession(row, sessionKey);
    const hintedProjectSession =
      !openGate.blocked &&
      !cachedSession &&
      body.mcp_session &&
      body.mcp_session.project_id === projectId &&
      typeof body.mcp_session.project_session === "string"
        ? body.mcp_session.project_session.trim()
        : "";
    const clientHintSession: FramerActiveMcpSession | null = hintedProjectSession
      ? {
          project_id: projectId,
          project_url: projectUrl,
          mcp_session_id: null,
          project_session: hintedProjectSession,
          opened_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
        }
      : null;

    let activeSession: FramerActiveMcpSession | null = cachedSession || clientHintSession;
    let toolNames: string[] = [];
    let reusedSession = Boolean(activeSession?.project_session);

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

    const execWithClient = async (
      mcpClient: FramerMcpClient,
      projectSession: string,
      spec: FramerExecSpec,
    ): Promise<Record<string, unknown>> => {
      const result = await mcpClient.callTool("exec", {
        session: projectSession,
        program: buildFramerProgram(spec),
      });
      assertMcpOk(result);
      return extractExecPayload(result);
    };

    const runFramerProgram = async (spec: FramerExecSpec): Promise<Record<string, unknown>> => {
      if (!activeSession?.project_session) {
        const gate = getFramerSessionOpenBlock(rowHolder.row, projectId, Date.now(), sessionSlot);
        if (gate.blocked) {
          throw new Error(formatFramerSessionLimitError(`retry after ${gate.retryAfterSeconds}s`));
        }
        await invokeFramer(supabase, accessToken, rowHolder, async (client) => {
          if (toolNames.length === 0) {
            const tools = await client.listTools();
            toolNames = tools.map((tool) => tool.name);
          }
          const opened = await client.callTool("open_project", { projectId: projectUrl || projectId });
          assertMcpOk(opened);
          const projectSession = extractSessionHandle(opened);
          if (!projectSession) {
            throw new Error(`open_project 未回傳 session：${extractMcpText(opened).slice(0, 280)}`);
          }
          const nowIso = new Date().toISOString();
          const session: FramerActiveMcpSession = {
            project_id: projectId,
            project_url: projectUrl,
            mcp_session_id: client.getSessionId(),
            project_session: projectSession,
            opened_at: nowIso,
            last_used_at: nowIso,
          };
          activeSession = session;
          reusedSession = false;
          await saveCachedFramerSession(supabase, sessionKey, session);
          rowHolder.row = await loadFramerConnection(supabase);
        }, { retryTransport: false, slot: sessionSlot });
      }

      try {
        return await invokeFramer(supabase, accessToken, rowHolder, async (client) => {
          if (!activeSession?.project_session) {
            throw new Error(formatFramerSessionLimitError("missing project session"));
          }
          const payload = await execWithClient(client, activeSession.project_session, spec);
          const nowIso = new Date().toISOString();
          const updated: FramerActiveMcpSession = {
            ...activeSession,
            project_url: projectUrl || activeSession.project_url,
            mcp_session_id: client.getSessionId() ?? activeSession.mcp_session_id,
            last_used_at: nowIso,
          };
          activeSession = updated;
          await saveCachedFramerSession(supabase, sessionKey, updated);
          return payload;
        }, { slot: sessionSlot });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (isFramerSessionLimitError(msg)) throw error;
        if (isFramerProjectSessionStaleError(msg)) {
          await blockFramerProjectReopen(supabase, projectId, projectUrl, Date.now(), sessionSlot);
          activeSession = null;
          throw new Error(formatFramerSessionLimitError(msg));
        }
        throw error;
      }
    };

    const serializeSessionHint = () =>
      activeSession
        ? {
            project_id: activeSession.project_id,
            mcp_session_id: activeSession.mcp_session_id,
            project_session: activeSession.project_session,
          }
        : null;

    // Step 0: locate or create the target page, then sync the primary color token.
    if (stepIndex === 0) {
      addLog(
        "info",
        activeSession
          ? `準備同步 mcp.framer.com，目標頁面 ${pagePath}（複用既有工作階段）`
          : `已連線 mcp.framer.com，目標頁面 ${pagePath}`,
      );

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
        const sessionModeLabel = reusedSession ? "複用既有工作階段" : "開啟工作階段";
        addLog(
          "success",
          `已用 exec（${sessionModeLabel}）定位頁面 ${normalizeComparablePath(pagePath)}${pageNodeId ? `（${pageNodeId}）` : ""}${payload.created ? "，並建立缺少的頁面" : ""}，並分別準備 Desktop / Tablet / Phone 三個斷點，主色 ${primaryColor}`,
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
          mcp_session: serializeSessionHint(),
          session_reused: reusedSession,
          logs: existingLogs.slice(-6),
          job_status: "syncing",
        });
      } catch (error) {
        const rawMsg = error instanceof Error ? error.message : String(error);
        const isSessionLimit = isFramerSessionLimitError(rawMsg);
        const displayMsg = isSessionLimit ? formatFramerSessionLimitError(rawMsg) : rawMsg;
        addLog("error", displayMsg);
        await supabase
          .from("framer_sync_jobs")
          .update({
            status: "failed",
            error_log: displayMsg,
            step_logs: existingLogs,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return jsonResponse(
          isSessionLimit
            ? {
                error: displayMsg,
                error_code: "framer_session_limit",
                retry_after_seconds: 360,
                tools_discovered: toolNames,
              }
            : { error: displayMsg, tools_discovered: toolNames },
          isSessionLimit ? 429 : 400,
        );
      }
    }

    // Step 1..N: Write one section only to the matched page node
    const sectionIdx = stepIndex - 1;
    const section = irPayload.sections[sectionIdx];
    if (!section) {
      return jsonResponse({ error: `無效的區塊步驟 step_index=${stepIndex}` }, 400);
    }

    let targetNodeId: string | null = irPayload.pageMeta?.framerPageNodeId || null;
    const toolCalled = "exec";

    const scene = isSceneNode(body.scene) ? body.scene : null;
    const built = scene
      ? buildNodeOps(scene, section.id)
      : buildSectionOps(
          section,
          grid,
          usableFont(irPayload.designTokens?.typography?.fontFamily),
          usableFont(irPayload.designTokens?.typography?.bodyFont),
        );
    addLog("info", scene
      ? `區塊 [${section.name}] 使用預覽場景樹（${built.ops.length} 個節點）`
      : `區塊 [${section.name}] 沒有場景樹，沿用扁平版型`);
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
      const rawMsg = error instanceof Error ? error.message : String(error);
      const isSessionLimit = isFramerSessionLimitError(rawMsg);
      const displayMsg = isSessionLimit ? formatFramerSessionLimitError(rawMsg) : rawMsg;
      section.syncStatus = "failed";
      addLog("error", `區塊 [${section.name}] 寫入失敗：${displayMsg}`);
      await supabase
        .from("framer_sync_jobs")
        .update({
          status: "failed",
          ir_payload: irPayload,
          error_log: displayMsg,
          step_logs: existingLogs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return jsonResponse(
        isSessionLimit
          ? {
              error: displayMsg,
              error_code: "framer_session_limit",
              retry_after_seconds: 360,
              tool_called: "exec",
              tools_discovered: toolNames,
            }
          : { error: displayMsg, tool_called: "exec", tools_discovered: toolNames },
        isSessionLimit ? 429 : 400,
      );
    }

    section.syncStatus = "synced";
    const allSynced = irPayload.sections.every((s) => s.syncStatus === "synced");
    const nextStatus = allSynced ? "completed" : "syncing";
    const durationMs = Date.now() - startedAt;
    const sessionModeLabel = reusedSession ? "複用既有工作階段" : "開啟工作階段";

    addLog(
      "success",
      `Step ${stepIndex}/${irPayload.sections.length} [${section.name}] 已分別寫入 Desktop、Tablet、Phone（${sessionModeLabel}，${durationMs}ms）`,
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
      mcp_session: serializeSessionHint(),
      session_reused: reusedSession,
      logs: existingLogs.slice(-4),
      job_status: nextStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isFramerSessionLimitError(message)) {
      return jsonResponse({
        error: formatFramerSessionLimitError(message),
        error_code: "framer_session_limit",
        retry_after_seconds: 360,
      }, 429);
    }
    return jsonResponse({ error: message }, 500);
  }
});
