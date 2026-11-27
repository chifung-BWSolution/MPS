import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  type FramerActiveMcpSession,
  type FramerConnectionRow,
  FramerMcpClient,
  blockFramerProjectReopen,
  connectSharedFramerMcp,
  corsHeaders,
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
  requireUser,
  saveCachedFramerSession,
  supabaseAdmin,
  touchSharedFramerTransport,
  upsertFramerConnection,
} from "../_shared/framer-mcp.ts";
import {
  buildFramerPublishProgram,
  formatFramerPublishNote,
  readFramerPublishPayload,
  shouldPublishAfterSync,
  type FramerPublishResult,
} from "../../../src/lib/framerPublish.ts";

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
  renderedScenes?: Partial<Record<"desktop" | "tablet" | "phone", unknown>>;
  id: string;
  step: number;
  name: string;
  sectionKind: string;
  framerType: "Stack" | "Grid" | "Frame";
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
    buttons?: Array<{ label: string; variant?: string; href?: string }>;
    navLinks?: Array<string | { label: string; href?: string }>;
    logos?: string[];
    cards?: Array<{
      title: string;
      description: string;
      tag?: string;
      imageUrl?: string;
      tagline?: string;
      href?: string;
    }>;
    footerColumns?: Array<{ title: string; links: Array<{ label: string; href?: string }> }>;
    footerLead?: {
      tagline?: string;
      contactTitle?: string;
      contactLines?: Array<{ label: string; href?: string }>;
      quickTitle?: string;
      quickLinks?: Array<{ label: string; href?: string }>;
      company?: string;
    };
    imageUrl?: string;
    backgroundImage?: string;
    overlay?: string;
  };
  syncStatus?: string;
};

type IrPayload = {
  renderedPage?: { scenePath: string };
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
  const record = result as {
    isError?: boolean;
    error?: unknown;
    content?: Array<{ text?: string }>;
    structuredContent?: { error?: unknown; output?: { error?: unknown } };
    output?: { error?: unknown };
  };
  const nestedError = record.structuredContent?.output?.error ?? record.structuredContent?.error ?? record.output?.error ?? record.error;
  if (!record.isError && !nestedError) return;
  const detail = (nestedError ? String(nestedError) : "") || record.content?.map((item) => item.text || "").join(" ").trim();
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
    if ("pageId" in record || "sectionId" in record || typeof record.ok === "boolean") return record;
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

function framerLink(href: unknown): string | undefined {
  const url = String(href || "").trim();
  if (!url || url === "#") return undefined;
  if (url.startsWith("/") && !url.startsWith("//")) {
    const match = /^([^?#]+)([?#][\s\S]*)?$/.exec(url);
    if (match) {
      const cleanPath = match[1].replace(/\/+$/, "") || "/";
      return cleanPath + (match[2] || "");
    }
  }
  return url;
}

function readNavLink(link: unknown): { label: string; href?: string } {
  if (typeof link === "string") return { label: link };
  if (link && typeof link === "object") {
    const row = link as { label?: string; href?: string };
    return { label: String(row.label || ""), href: framerLink(row.href) };
  }
  return { label: "" };
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

type AppearSpec = { opacity: number; y: string; delay: number };

type FramerWriteOp = (
  | { op: "frame"; id: string; parent: string; attrs: Record<string, unknown>; responsive?: ResponsiveOverrides; appear?: AppearSpec }
  | { op: "text"; id: string; parent: string; attrs: Record<string, unknown>; responsive?: ResponsiveOverrides; appear?: AppearSpec }
  | { op: "image"; id: string; parent: string; url: string; attrs: Record<string, unknown>; responsive?: ResponsiveOverrides; appear?: AppearSpec }
) & { backgroundUrl?: string; replicaImages?: Partial<Record<"tablet" | "phone", string>> };

type FramerExecSpec = {
  stamp: string;
  pagePath: string;
  pageTitle: string;
  pageNodeId: string | null;
  desktopWidth: string;
  primaryColor: string | null;
  rendered?: boolean;
  pageGeometry?: Record<"desktop" | "tablet" | "phone", { height: number; background?: string }>;
  expectedMarkers?: string[];
  marker?: string;
  backgroundImage?: string | null;
  ops: FramerWriteOp[];
  sections?: Array<{ marker?: string; ops: FramerWriteOp[]; backgroundImage?: string | null }>;
};

type SceneLayout = {
  clip?: boolean;
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
  columnSpan?: number;
};

type SceneStyle = {
  gradient?: string;
  lineHeight?: string;
  letterSpacing?: string;
  opacity?: number;
  background?: string;
  backgroundImage?: string;
  color?: string;
  border?: string;
  shadow?: string;
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
  href?: string;
  appear?: AppearSpec;
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
          width: sceneTextWidth(text, parentKind),
          textColor: node.style?.color,
          fontSize: node.style?.fontSize,
          fontWeight: node.style?.fontWeight,
          fontName: usableFont(node.style?.fontFamily),
          textAlignment: node.style?.textAlign,
          textWrap: node.htmlTag === "h1" ? "balance" : undefined,
          tag: node.href ? "a" : node.htmlTag,
          link: framerLink(node.href),
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
    const childSpans = (node.children || []).map((child) => child.layout?.columnSpan || 0);
    const spanSum = childSpans.reduce((sum, span) => sum + span, 0);
    const spanRow = node.type === "grid"
      && columns > 1
      && childSpans.length > 1
      && childSpans.every((span) => span > 0)
      && spanSum === columns;
    if (spanRow) {
      for (const child of node.children || []) {
        const span = child.layout?.columnSpan || 1;
        child.layout = {
          ...(child.layout || {}),
          width: `${Math.round((span / columns) * 1000) / 10}%`,
        };
      }
    }
    const isGrid = node.type === "grid" && columns > 1 && !spanRow;
    const horizontal = spanRow || (!isGrid && node.layout?.direction === "horizontal");
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
    } else if (spanRow || (horizontal && (node.children || []).some((child) => sceneFrameWidth(child, "row") === "1fr"))) {
      responsive = { phone: { stackDirection: "vertical", width: "100%", height: "auto", gap: "24px" } };
      childPhoneFill = true;
    } else if (horizontal && (node.children?.length || 0) > 6) {
      responsive = { tablet: { visible: false }, phone: { visible: false } };
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
        gridColumnMinWidth: isGrid ? (columns > 6 ? "0px" : "180px") : undefined,
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
        link: framerLink(node.href),
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

type ColorPalette = {
  surface: string;
  onSurface: string;
  overlay: string;
  muted: string;
};

function paletteFromTokens(colors?: Record<string, string>): ColorPalette {
  const bag = colors || {};
  return {
    surface: bag.surface || bag.background || "#F7F7F5",
    onSurface: bag.onSurface || bag.text || bag.foreground || "#1A1A1A",
    overlay: bag.overlay || "rgba(0, 0, 0, 0.45)",
    muted: bag.muted || "#F4F4F2",
  };
}

const PAGE_EXEC_CHAR_LIMIT = 90_000;

function buildRenderedOps(
  section: IrSection,
  absoluteRoots = false,
  stageWidths?: Record<"desktop" | "tablet" | "phone", string>,
): FramerWriteOp[] {
  const scenes = section.renderedScenes;
  if (!scenes) return [];
  const ops: FramerWriteOp[] = [];
  type Variants = Partial<Record<"desktop" | "tablet" | "phone", SceneNode>>;
  const devices = ["desktop", "tablet", "phone"] as const;
  const readVariants = <T>(values: Partial<Record<typeof devices[number], T>>) => {
    const result: Variants = {};
    for (const key of devices) if (isSceneNode(values[key])) result[key] = values[key] as SceneNode;
    return result;
  };
  const hasTextNode = (item: SceneNode | undefined): boolean =>
    Boolean(item && (item.type === "text" || (item.children || []).some(hasTextNode)));
  const isFullWidthNode = (item: SceneNode | undefined): boolean =>
    Boolean(item && item.layout?.width === "100%" && (!item.layout?.left || item.layout.left === "0px"));
  const attributes = (node: SceneNode | undefined, root: boolean): Record<string, unknown> => {
    if (!node) return { visible: false, ...(root ? { height: "0px" } : {}) };
    const style = node.style;
    const layout = node.layout;
    const isFixed = layout?.position === "fixed";
    const absolute = absoluteRoots || !root || isFixed;
    const geometry = {
      visible: true,
      position: absoluteRoots && root && !isFixed ? "absolute" : layout?.position,
      width: layout?.width,
      height: layout?.height,
      zIndex: isFixed ? (layout?.zIndex ?? 50) : layout?.zIndex,
      opacity: style?.opacity,
      left: absolute ? (isFixed ? layout?.left || "0px" : layout?.left) : undefined,
      top: absolute ? (isFixed ? layout?.top || "0px" : layout?.top) : undefined,
      right: isFixed && layout?.width === "100%" ? "0px" : undefined,
    };
    if (node.type === "text") {
      const textLink = framerLink(node.href);
      return compactAttrs({
        ...geometry,
        text: node.text,
        textColor: style?.color,
        fontName: usableFont(style?.fontFamily),
        fontSize: style?.fontSize,
        fontWeight: style?.fontWeight,
        textAlignment: style?.textAlign,
        tag: textLink ? "a" : node.htmlTag,
        link: textLink,
      });
    }
    const link = framerLink(node.href);
    const gradientColors = style?.gradient?.match(/rgba?\([^)]*\)/g);
    return compactAttrs({
      ...geometry,
      fill: style?.background || gradientColors?.[Math.floor(gradientColors.length / 2)],
      border: style?.border,
      shadow: style?.shadow,
      radius: style?.radius,
      overflow: layout?.clip || node.type === "image" ? "clip" : undefined,
      link,
      htmlTag: link ? "a" : root && /^(nav|header|footer|main|article|section)$/.test(node.htmlTag || "") ? node.htmlTag : undefined,
    });
  };
  const visit = (variants: Variants, parent: string, root: boolean) => {
    const node = variants.desktop || variants.tablet || variants.phone;
    if (!node) return;
    const id = `render-${section.id}-${ops.length}`;
    const asset = (item?: SceneNode) => {
      const value = item?.src || item?.style?.backgroundImage;
      return /^https:\/\//i.test(value || "") ? value : undefined;
    };
    const backgroundUrl = asset(node);
    const centerStage = Boolean(root && stageWidths && isFullWidthNode(variants.desktop));
    const attrs: Record<string, unknown> = {
      ...attributes(variants.desktop || node, root),
      ...(!variants.desktop ? attributes(undefined, root) : {}),
      ...(centerStage ? { layout: "stack", stackDirection: "vertical", stackAlignment: "center" } : {}),
      name: (node.name || node.text || node.type).slice(0, 60),
      ...(root ? { elementId: `readdy-${section.id}` } : {}),
    };
    const replica = (variant: SceneNode | undefined) => {
      const overrides = attributes(variant, root);
      if (!variant) return overrides;
      if ((attrs.fill || backgroundUrl) && !overrides.fill && !asset(variant)) overrides.fill = "rgba(0, 0, 0, 0)";
      if (attrs.radius && !overrides.radius) overrides.radius = "0px";
      if (attrs.border && !overrides.border) overrides.border = "0px solid rgba(0, 0, 0, 0)";
      if (attrs.shadow && !overrides.shadow) overrides.shadow = "none";
      if (attrs.overflow === "clip" && !overrides.overflow) overrides.overflow = "visible";
      if (attrs.zIndex !== undefined && overrides.zIndex === undefined) overrides.zIndex = 0;
      if (attrs.opacity !== undefined && overrides.opacity === undefined) overrides.opacity = 1;
      return overrides;
    };
    const responsive = {
      tablet: replica(variants.tablet),
      phone: replica(variants.phone),
    };
    ops.push({
      op: node.type === "text" ? "text" : "frame",
      id, parent, attrs, responsive, backgroundUrl,
      ...(node.appear ? { appear: node.appear } : {}),
      replicaImages: { tablet: asset(variants.tablet), phone: asset(variants.phone) },
    });
    const children = new Map<string, Variants>();
    for (const device of devices) {
      for (const child of variants[device]?.children || []) {
        if (!isSceneNode(child)) continue;
        const key = child.id + "/" + child.type + "/" + (child.htmlTag || "");
        const childVariants = children.get(key) || {};
        childVariants[device] = child;
        children.set(key, childVariants);
      }
    }
    if (centerStage && stageWidths && children.size > 0) {
      const backdropItems: Variants[] = [];
      const contentItems: Variants[] = [];
      for (const child of children.values()) {
        const primary = child.desktop || child.tablet || child.phone;
        if (isFullWidthNode(primary) && !hasTextNode(primary)) {
          backdropItems.push(child);
        } else {
          contentItems.push(child);
        }
      }
      for (const child of backdropItems) visit(child, id, false);
      if (contentItems.length > 0) {
        // Emit full-bleed backdrop strips for full-width colored bars (e.g. nav bars) so their fill spans 100%
        for (const child of contentItems) {
          const d = child.desktop;
          if (!d || !isFullWidthNode(d)) continue;
          const dFill = d.style?.background || d.style?.gradient?.match(/rgba?\([^)]*\)/g)?.[0];
          const dBgUrl = asset(d);
          if (!dFill && !dBgUrl) continue;
          const stripAttrs = (variant: SceneNode | undefined): Record<string, unknown> => {
            if (!variant || !isFullWidthNode(variant)) return { visible: false };
            const fill = variant.style?.background || variant.style?.gradient?.match(/rgba?\([^)]*\)/g)?.[0];
            return compactAttrs({
              visible: true,
              position: "absolute",
              left: "0px",
              top: variant.layout?.top || "0px",
              width: "100%",
              height: variant.layout?.height,
              fill,
              opacity: variant.style?.opacity,
            });
          };
          ops.push({
            op: "frame",
            id: `render-${section.id}-${ops.length}`,
            parent: id,
            attrs: { ...stripAttrs(d), name: `${(d.name || "Bar").slice(0, 40)} Backdrop` },
            responsive: {
              tablet: stripAttrs(child.tablet),
              phone: stripAttrs(child.phone),
            },
            backgroundUrl: dBgUrl,
            replicaImages: { tablet: asset(child.tablet), phone: asset(child.phone) },
          });
        }
        const stageId = `render-${section.id}-${ops.length}`;
        const stageDevice = (variant: SceneNode | undefined, width: string): Record<string, unknown> => {
          if (!variant) return { visible: false, height: "0px" };
          return compactAttrs({
            visible: true,
            position: "relative",
            width,
            height: variant.layout?.height,
            zIndex: 1,
          });
        };
        ops.push({
          op: "frame",
          id: stageId,
          parent: id,
          attrs: { ...stageDevice(variants.desktop || node, stageWidths.desktop), name: "Content Stage" },
          responsive: {
            tablet: stageDevice(variants.tablet, stageWidths.tablet),
            phone: stageDevice(variants.phone, stageWidths.phone),
          },
        });
        for (const child of contentItems) visit(child, stageId, false);
      }
      return;
    }
    for (const child of children.values()) visit(child, id, false);
  };
  visit(readVariants(scenes), "$bp", true);
  return ops;
}

function bundleSection(
  section: IrSection,
  ir: IrPayload,
  index: number,
  legacyScene?: SceneNode | null,
  renderedScenes?: IrSection["renderedScenes"],
  absoluteRoots = false,
): { marker: string; ops: FramerWriteOp[]; backgroundImage: string | null } {
  const palette = paletteFromTokens(ir.designTokens?.colors);
  const font = usableFont(ir.designTokens?.typography?.fontFamily) || usableFont(ir.designTokens?.typography?.bodyFont);
  const stageWidths = absoluteRoots
    ? { desktop: `${ir.gridConfig?.desktop_width || 1440}px`, tablet: "834px", phone: "390px" }
    : undefined;
  const built = renderedScenes
    ? { ops: buildRenderedOps({ ...section, renderedScenes }, absoluteRoots, stageWidths), backgroundImage: null }
    : legacyScene
      ? buildNodeOps(legacyScene, section.id)
      : buildSectionOps(section, ir.gridConfig, font, usableFont(ir.designTokens?.typography?.bodyFont), palette);
  const prefix = `b${index}`;
  for (const op of built.ops) {
    op.id = prefix + op.id;
    if (op.parent !== "$bp") op.parent = prefix + op.parent;
  }
  return {
    marker: `readdy-${section.id}`,
    ops: built.ops,
    backgroundImage: built.backgroundImage,
  };
}

function buildSectionOps(
  section: IrSection,
  grid: IrPayload["gridConfig"],
  fontName: string | undefined,
  bodyFontName?: string,
  palette: ColorPalette = paletteFromTokens(),
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
  const cardHeavy = Array.isArray(el.cards) && el.cards.length >= 3;
  const brandFill =
    !isHero &&
    !isNavbar &&
    (section.sectionKind !== "cta" || cardHeavy) &&
    Boolean(section.background) &&
    Boolean(section.accentColor) &&
    section.background.trim().toUpperCase() === section.accentColor.trim().toUpperCase();
  const effectiveBg = brandFill
    ? palette.surface
    : isNavbar && isTransparentBg
      ? isLightHex(section.textColor)
        ? palette.onSurface
        : palette.surface
      : section.background;
  const effectiveText =
    brandFill && (!section.textColor || isLightHex(section.textColor))
      ? palette.onSurface
      : section.textColor || (isLightHex(effectiveBg) ? palette.onSurface : palette.surface);
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
  const cardFill = lightSurface ? palette.muted : "rgba(255, 255, 255, 0.08)";

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
    appearDelay?: number,
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
      ...(appearDelay === undefined
        ? {}
        : { appear: { opacity: 0, y: "18px", delay: appearDelay } }),
    });
  };

  let n = 0;
  const nextId = (prefix: string) => `${prefix}${stamp}${n++}`;

  if (section.sectionKind === "footer") {
    const lead = el.footerLead;
    const columns = Array.isArray(el.footerColumns) ? el.footerColumns.filter((column) => column.links?.length) : [];
    const top = nextId("ftop");
    ops.push({
      op: "frame",
      id: top,
      parent: inner,
      attrs: {
        name: "FooterTop",
        layout: "stack",
        stackDirection: "horizontal",
        stackAlignment: "start",
        gap: "40px",
        width: "100%",
        height: "auto",
      },
      responsive: {
        tablet: { stackDirection: "vertical", width: "100%", height: "auto", gap: "28px" },
        phone: { stackDirection: "vertical", width: "100%", height: "auto", gap: "24px" },
      },
    });
    const brandId = nextId("fbrand");
    ops.push({
      op: "frame",
      id: brandId,
      parent: top,
      attrs: {
        name: "FooterBrand",
        layout: "stack",
        stackDirection: "vertical",
        stackAlignment: "start",
        gap: "12px",
        width: "3fr",
        height: "auto",
      },
      responsive: { phone: { width: "100%" }, tablet: { width: "100%" } },
    });
    if (el.heading) {
      pushText(nextId("fh"), brandId, el.heading, {
        textColor: effectiveText,
        fontSize: "18px",
        fontWeight: 700,
        textAlignment: "left",
        ...headingFontAttr,
      }, true);
    }
    if (lead?.tagline) {
      pushText(nextId("ftag"), brandId, lead.tagline, {
        textColor: withAlpha(effectiveText, 0.72),
        fontSize: "14px",
        textAlignment: "left",
        width: "100%",
        maxWidth: "448px",
      });
    }
    const footerButtons = Array.isArray(el.buttons) ? el.buttons.filter((button) => button.label) : [];
    if (footerButtons.length > 0) {
      const actions = nextId("factions");
      ops.push({
        op: "frame",
        id: actions,
        parent: brandId,
        attrs: {
          name: "FooterActions",
          layout: "stack",
          stackDirection: "horizontal",
          stackAlignment: "center",
          gap: "12px",
          width: "100%",
          height: "auto",
        },
        responsive: { phone: { stackDirection: "vertical", width: "100%", stackAlignment: "start" } },
      });
      for (const button of footerButtons.slice(0, 2)) {
        const primary = button.variant !== "secondary";
        const buttonId = nextId("fbtn");
        ops.push({
          op: "frame",
          id: buttonId,
          parent: actions,
          attrs: compactAttrs({
            name: button.label,
            layout: "stack",
            stackDirection: "horizontal",
            stackAlignment: "center",
            width: "auto",
            height: "auto",
            fill: primary ? section.accentColor : undefined,
            border: primary ? undefined : `1px solid ${section.accentColor}`,
            radius: "8px",
            padding: "10px 18px 10px 18px",
            link: framerLink(button.href),
            htmlTag: framerLink(button.href) ? "a" : "button",
          }),
        });
        pushText(nextId("fbl"), buttonId, button.label, {
          textColor: primary ? "#FFFFFF" : section.accentColor,
          fontSize: "14px",
          fontWeight: 600,
        }, true);
      }
    }
    const writeLinkColumn = (
      parent: string,
      title: string | undefined,
      links: Array<{ label?: string; href?: string }>,
      width: string,
    ) => {
      if (!title && links.length === 0) return;
      const columnId = nextId("fcol");
      ops.push({
        op: "frame",
        id: columnId,
        parent,
        attrs: {
          name: title || "Links",
          layout: "stack",
          stackDirection: "vertical",
          stackAlignment: "start",
          gap: "8px",
          width,
          height: "auto",
        },
        responsive: { phone: { width: "100%" }, tablet: { width: "100%" } },
      });
      if (title) {
        pushText(nextId("fct"), columnId, title, {
          textColor: effectiveText,
          fontSize: "14px",
          fontWeight: 700,
          textAlignment: "left",
          ...headingFontAttr,
        }, true);
      }
      for (const link of links) {
        if (!link.label) continue;
        const href = framerLink(link.href);
        pushText(nextId("fcl"), columnId, link.label, compactAttrs({
          textColor: withAlpha(effectiveText, 0.78),
          fontSize: "13px",
          textAlignment: "left",
          width: "100%",
          tag: href ? "a" : undefined,
          link: href,
        }));
      }
    };
    writeLinkColumn(top, lead?.contactTitle, lead?.contactLines || [], "2fr");
    writeLinkColumn(top, lead?.quickTitle, lead?.quickLinks || [], "1fr");
    if (columns.length > 0) {
      const count = Math.min(columns.length, 6);
      const gridId = nextId("fcols");
      ops.push({
        op: "frame",
        id: gridId,
        parent: inner,
        attrs: {
          name: "FooterColumns",
          layout: "grid",
          gridColumnCount: count,
          gridRowHeightType: "fit",
          gridColumnMinWidth: count >= 5 ? "140px" : "180px",
          gap: "28px 24px",
          width: "100%",
          height: "auto",
        },
        responsive: gridResponsive(count),
      });
      for (const column of columns) writeLinkColumn(gridId, column.title, column.links || [], "1fr");
    } else if (Array.isArray(el.navLinks) && el.navLinks.length > 0) {
      writeLinkColumn(inner, undefined, el.navLinks.map(readNavLink), "100%");
    }
    if (el.subheading || lead?.company) {
      const bar = nextId("fbar");
      ops.push({
        op: "frame",
        id: bar,
        parent: inner,
        attrs: {
          name: "FooterBar",
          layout: "stack",
          stackDirection: "horizontal",
          stackAlignment: "center",
          stackDistribution: "space-between",
          width: "100%",
          height: "auto",
          padding: "16px 0px 0px 0px",
        },
        responsive: { phone: { stackDirection: "vertical", stackAlignment: "start", gap: "8px" } },
      });
      if (el.subheading) {
        pushText(nextId("fcopy"), bar, el.subheading, {
          textColor: withAlpha(effectiveText, 0.62),
          fontSize: "12px",
        }, true);
      }
      if (lead?.company) {
        pushText(nextId("fco"), bar, lead.company, {
          textColor: withAlpha(effectiveText, 0.62),
          fontSize: "12px",
        }, true);
      }
    }
    return { ops, backgroundImage: null };
  }

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
    }, isHero ? 0 : undefined);
  }
  const paragraphLines = Array.isArray(el.paragraphs)
    ? el.paragraphs.map((para) => String(para || "").trim()).filter((para) => para && !looksLikeSourceCode(para))
    : [];
  const uniqueParagraphs: string[] = [];
  const seenParagraphs = new Set<string>();
  for (const para of paragraphLines) {
    if (seenParagraphs.has(para)) continue;
    seenParagraphs.add(para);
    uniqueParagraphs.push(para);
  }
  const subheadingText = String(el.subheading || "").trim();
  const subheadingLines = subheadingText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const subheadingRepeatsParagraphs =
    uniqueParagraphs.length > 0 &&
    subheadingLines.length > 0 &&
    subheadingLines.every((line) => uniqueParagraphs.includes(line));
  if (subheadingText && !subheadingRepeatsParagraphs && !looksLikeSourceCode(subheadingText)) {
    pushText(nextId("sub"), inner, subheadingText, {
      name: "Subheading",
      tag: "p",
      textColor: withAlpha(effectiveText, 0.8),
      fontSize: "16px",
      ...(isHero ? { width: "100%" } : {}),
      textAlignment: isNavbar ? undefined : "center",
    }, false, {
      tablet: { fontSize: "16px" },
      phone: { fontSize: "15px" },
    }, isHero ? 0.12 : undefined);
  }
  if (uniqueParagraphs.length > 0) {
    uniqueParagraphs.forEach((para, index) => {
      if (!subheadingRepeatsParagraphs && subheadingText && para === subheadingText) return;
      pushText(nextId("p"), inner, para, {
        name: "Paragraph",
        tag: "p",
        textColor: withAlpha(effectiveText, 0.8),
        fontSize: "16px",
        ...(isHero ? { width: "100%" } : {}),
        textAlignment: isHero ? "center" : undefined,
      }, false, {
        phone: { fontSize: "15px" },
      }, isHero ? 0.18 + index * 0.08 : undefined);
    });
  }
  if (section.sectionKind === "footer" && Array.isArray(el.footerColumns) && el.footerColumns.length > 0) {
    const columnsId = nextId("fcols");
    ops.push({
      op: "frame",
      id: columnsId,
      parent: inner,
      attrs: {
        name: "FooterColumns",
        layout: "grid",
        gridColumnCount: Math.min(el.footerColumns.length, 4),
        gridRowHeightType: "fit",
        gap: "24px",
        width: "100%",
        height: "auto",
      },
      responsive: gridResponsive(Math.min(el.footerColumns.length, 4)),
    });
    for (const column of el.footerColumns) {
      const columnId = nextId("fcol");
      ops.push({
        op: "frame",
        id: columnId,
        parent: columnsId,
        attrs: {
          name: column.title,
          layout: "stack",
          stackDirection: "vertical",
          gap: "8px",
          width: "1fr",
          height: "auto",
        },
      });
      if (column.title) {
        pushText(nextId("fct"), columnId, column.title, {
          textColor: effectiveText,
          fontSize: "14px",
          fontWeight: 700,
        });
      }
      for (const link of column.links || []) {
        const href = framerLink(link.href);
        pushText(nextId("fcl"), columnId, link.label, compactAttrs({
          textColor: withAlpha(effectiveText, 0.8),
          fontSize: "13px",
          tag: href ? "a" : undefined,
          link: href,
        }));
      }
    }
  } else if (Array.isArray(el.navLinks) && el.navLinks.length > 0) {
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
    for (const rawLink of el.navLinks) {
      const link = readNavLink(rawLink);
      if (!link.label) continue;
      pushText(nextId("nl"), row, link.label, compactAttrs({
        textColor: withAlpha(effectiveText, 0.88),
        fontSize: denseNav ? "12px" : "13px",
        tag: link.href ? "a" : undefined,
        link: link.href,
      }), true);
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
      ...(isHero ? { appear: { opacity: 0, y: "18px", delay: 0.32 } } : {}),
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
          layout: "stack",
          stackDirection: "horizontal",
          stackAlignment: "center",
          width: "auto",
          height: "auto",
          fill: isPrimary ? section.accentColor : isNavbar ? withAlpha(effectiveText, 0.12) : undefined,
          radius: "8px",
          padding: denseNav ? "8px 12px 8px 12px" : isNavbar ? "8px 14px 8px 14px" : "10px 20px 10px 20px",
          overflow: "clip",
          link: framerLink(button.href),
          htmlTag: framerLink(button.href) ? "a" : "button",
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
    const imageRow =
      el.cards.length >= 2 &&
      el.cards.length <= 4 &&
      el.cards.every((card) => Boolean(card.imageUrl));
    const columnCount = imageRow ? el.cards.length : section.columns || 3;
    const stackCards = section.framerType === "Stack" || columnCount <= 1;
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
            gridColumnCount: columnCount,
            gridRowHeightType: "fit",
            gap,
            width: "100%",
            height: "auto",
          },
      responsive: stackCards ? undefined : gridResponsive(columnCount),
    });
    const phoneStacksCards = !stackCards && columnCount < 4;
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
          ...(framerLink(card.href) ? { link: framerLink(card.href) } : {}),
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
const writeNonce = spec.stamp + "-" + Math.random().toString(36).slice(2, 9);
function normReadBackText(value) {
  return String(value || "")
    .replace(/[\\u2018\\u2019]/g, "'")
    .replace(/[\\u201C\\u201D]/g, '"')
    .replace(/\\u00A0/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}
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
const pageByPath = new Map();
for (const item of pages) {
  if (!item || !item.path) continue;
  const normalized = normPath(item.path);
  pageByPath.set(normalized, item);
  pageByPath.set(normalized.toLowerCase(), item);
}
function matchPageForLink(rawLink) {
  if (typeof rawLink !== "string" || !rawLink.startsWith("/") || rawLink.startsWith("//")) return null;
  const match = /^([^?#]+)([?#][\s\S]*)?$/.exec(rawLink);
  if (!match) return null;
  const normalized = normPath(match[1]);
  const matched = pageByPath.get(normalized) || pageByPath.get(normalized.toLowerCase()) || null;
  return matched ? normPath(matched.path) + (match[2] || "") : null;
}
function normalizeInsertAttrs(opType, attrs) {
  const next = { ...attrs };
  if (typeof next.link === "string" && next.link) {
    next["link.href"] = matchPageForLink(next.link) || next.link;
    delete next.link;
    if (opType !== "text" && next.htmlTag === "a") delete next.htmlTag;
  }
  return next;
}
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
} else if (spec.rendered && pxOf(breakpoint.width, 0) !== pxOf(spec.desktopWidth, 0)) {
  try {
    tree.patch(breakpoint.id, { width: spec.desktopWidth });
    breakpoint = tree.get(breakpoint.id) || breakpoint;
  } catch (error) {
    warnings.push("Desktop 斷點寬度未能自動調整為 " + spec.desktopWidth + ": " + error);
  }
}
const desktopPx = spec.rendered
  ? pxOf(spec.desktopWidth, pxOf(breakpoint.width, 1200))
  : pxOf(breakpoint.width, pxOf(spec.desktopWidth, 1200));
let tabletBp = findNamedFrame(page, "Tablet");
let phoneBp = findNamedFrame(page, "Phone");
if (!tabletBp) {
  const tabletId = "readdy-tablet-" + spec.stamp;
  tabletBp = asCreatedNode(tree.createVariant(breakpoint.id, tabletId, {
    gesture: null,
    name: "Tablet",
    left: (desktopPx + 80) + "px",
    width: spec.rendered ? "834px" : "810px",
    height: "auto",
    overflow: "clip",
  }), tabletId);
} else if (spec.rendered && (pxOf(tabletBp.width, 0) !== 834 || pxOf(tabletBp.left, 0) < desktopPx + 40)) {
  try {
    tree.patch(tabletBp.id, { width: "834px", left: (desktopPx + 80) + "px" });
    tabletBp = tree.get(tabletBp.id) || tabletBp;
  } catch (error) {
    warnings.push("Tablet 斷點寬度未能自動調整為 834px: " + error);
  }
}
const tabletPx = spec.rendered ? 834 : pxOf(tabletBp && tabletBp.width, 810);
const tabletLeft = spec.rendered
  ? Math.max(pxOf(tabletBp && tabletBp.left, desktopPx + 80), desktopPx + 80)
  : pxOf(tabletBp && tabletBp.left, desktopPx + 80);
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
} else if (spec.rendered && (pxOf(phoneBp.width, 0) !== 390 || pxOf(phoneBp.left, 0) < tabletLeft + tabletPx + 40)) {
  try {
    tree.patch(phoneBp.id, { width: "390px", left: (tabletLeft + tabletPx + 80) + "px" });
    phoneBp = tree.get(phoneBp.id) || phoneBp;
  } catch (error) {
    warnings.push("Phone 斷點寬度未能自動調整為 390px: " + error);
  }
}
if (spec.rendered) {
  const expectedWidths = [[breakpoint, spec.desktopWidth], [tabletBp, "834px"], [phoneBp, "390px"]];
  for (const [node, width] of expectedWidths) {
    if (!node || pxOf(node.width, 0) !== pxOf(width, 0)) {
      warnings.push("Framer 斷點寬度和來源擷取寬度不同，請覆核 " + width);
    }
  }
}
let parent = breakpoint;
if (spec.pageGeometry || breakpoint.$layoutTemplateId) {
  const marker = breakpoint.$layoutTemplateId ? "readdy-page-content" : "readdy-rendered-content";
  const existing = (breakpoint.children || []).find((child) => child.elementId === marker);
  if (existing) parent = existing;
  else {
    parent = tree.insert("FrameNode", "readdy-content-" + spec.stamp, {
      parent: breakpoint.id,
      name: "Readdy Content",
      elementId: marker,
      layout: "stack",
      stackDirection: "vertical",
      width: "100%",
      height: "auto",
      overflow: "clip",
    });
  }
}
if (!breakpoint.$layoutTemplateId && breakpoint.layout !== "stack") {
  tree.patch(breakpoint.id, { layout: "stack", height: "auto", stackDirection: "vertical" });
}
if (spec.pageGeometry) {
  const viewportAttrs = (device) => {
    const layout = spec.pageGeometry[device];
    const fill = /^(?:rgba?[(]|#)/.test(layout.background || "") ? layout.background : undefined;
    return { height: layout.height + "px", ...(fill ? { fill } : {}) };
  };
  tree.patch(parent.id, viewportAttrs("desktop"));
  patchReplica(tabletBp, parent.id, viewportAttrs("tablet"));
  patchReplica(phoneBp, parent.id, viewportAttrs("phone"));
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
async function writeSection(sectionSpec) {
  const isFixedRoot = Boolean(
    !breakpoint.$layoutTemplateId &&
    sectionSpec.ops &&
    sectionSpec.ops[0] &&
    sectionSpec.ops[0].parent === "$bp" &&
    sectionSpec.ops[0].attrs &&
    sectionSpec.ops[0].attrs.position === "fixed",
  );
  const sectionHost = isFixedRoot ? breakpoint : parent;
  let insertIndex = null;
  let stale = [];
  if (sectionSpec.marker) {
    const hostChildren = tree.get(sectionHost.id)?.children || sectionHost.children || [];
    for (let i = 0; i < hostChildren.length; i++) {
      if (hostChildren[i].elementId === sectionSpec.marker && insertIndex === null) insertIndex = i;
    }
    const staleIds = new Set();
    for (const container of sectionHost.id === parent.id ? [parent] : [parent, breakpoint]) {
      const list = tree.get(container.id)?.children || container.children || [];
      for (const child of list) {
        if (child.elementId === sectionSpec.marker) staleIds.add(child.id);
      }
    }
    stale = Array.from(staleIds);
  }
  const assetUrls = [];
  for (const op of sectionSpec.ops || []) {
    if (op.op === "image" && op.url) assetUrls.push(op.url);
    if (op.backgroundUrl) assetUrls.push(op.backgroundUrl);
    if (op.replicaImages) assetUrls.push(...Object.values(op.replicaImages));
  }
  if (sectionSpec.backgroundImage) assetUrls.push(sectionSpec.backgroundImage);
  const assetFills = {};
  await Promise.all(assetUrls.filter((url, index) => assetUrls.indexOf(url) === index).map(async (url) => {
    try {
      assetFills[url] = await tree.assetReference(url);
    } catch (error) {
      assetFills[url] = null;
      warnings.push("圖片略過 " + url + ": " + error);
    }
  }));
  if (spec.rendered && assetUrls.some(url => !assetFills[url])) {
    throw new Error("來源圖層的圖片未能載入，請重試：" + sectionSpec.marker);
  }
  if (!spec.rendered) for (const id of stale) tree.remove(id);
  const ids = { $bp: sectionHost.id };
  let sectionId = null;
  const stagedRoots = [];
  try {
    for (const op of sectionSpec.ops || []) {
      const parentId = ids[op.parent];
      if (!parentId) throw new Error("缺少父層 " + op.parent);
      const wireId = spec.rendered ? writeNonce + "-" + op.id : op.id;
      const insertAttrs = normalizeInsertAttrs(op.op, op.attrs || {});
      const href = insertAttrs["link.href"];
      delete insertAttrs["link.href"];
      let node;
      if (op.op === "image") {
        const fill = assetFills[op.url];
        if (!fill) continue;
        node = tree.insert("FrameNode", wireId, { ...insertAttrs, parent: parentId, fill });
      } else if (op.op === "text") {
        node = tree.insert("RichTextNode", wireId, { ...insertAttrs, parent: parentId });
      } else {
        const fill = assetFills[op.backgroundUrl];
        node = tree.insert("FrameNode", wireId, { ...insertAttrs, parent: parentId, ...(fill ? { fill } : {}) });
      }
      ids[op.id] = node.id;
      if (op.parent === "$bp") stagedRoots.push(node.id);
      if (!spec.rendered && op.parent === "$bp" && insertIndex !== null && typeof tree.setParent === "function") {
        try {
          await tree.setParent(node.id, parentId, insertIndex);
        } catch (error) {
          warnings.push("區塊順序未能還原: " + error);
        }
      }
      if (op.appear) {
        tree.patch(node.id, {
          "appearEffect.enter.opacity": op.appear.opacity,
          "appearEffect.enter.y": op.appear.y,
          "appearEffect.enter.transition.type": "tween",
          "appearEffect.enter.transition.duration": 0.8,
          "appearEffect.enter.transition.delay": op.appear.delay,
          "appearEffect.enter.transition.ease": [0.22, 1, 0.36, 1],
        });
      }
      if (href) {
        try {
          tree.patch(node.id, { "link.href": href });
        } catch { /* Report unresolved links after reading the node. */ }
      }
      if (op.responsive) {
        const tabletFill = assetFills[op.replicaImages?.tablet];
        const phoneFill = assetFills[op.replicaImages?.phone];
        const tabletAttrs = op.responsive.tablet ? normalizeInsertAttrs(op.op, op.responsive.tablet) : undefined;
        const phoneAttrs = op.responsive.phone ? normalizeInsertAttrs(op.op, op.responsive.phone) : undefined;
        patchReplica(tabletBp, node.id, tabletFill ? { ...tabletAttrs, fill: tabletFill } : tabletAttrs);
        patchReplica(phoneBp, node.id, phoneFill ? { ...phoneAttrs, fill: phoneFill } : phoneAttrs);
      }
      const readBack = tree.get(node.id);
      if (href && readBack?.link?.href !== href) warnings.push("連結未能寫入 " + href);
      if (!readBack || (typeof readBack.text === "string" && op.op === "text" && normReadBackText(readBack.text) !== normReadBackText(op.attrs.text))) {
        if (spec.rendered) throw new Error("圖層寫入後讀回不一致：" + op.attrs.name);
        warnings.push("圖層讀回不一致: " + op.attrs.name);
      }
      if (op.parent === "$bp" && sectionSpec.marker && readBack && readBack.elementId !== sectionSpec.marker) {
        try {
          tree.patch(node.id, { elementId: sectionSpec.marker });
        } catch {
          warnings.push("無法寫入區塊標記: " + sectionSpec.marker);
        }
      }
      if (op.parent === "$bp") sectionId = node.id;
    }
    if (sectionSpec.backgroundImage && sectionId) {
      const fill = assetFills[sectionSpec.backgroundImage];
      if (fill) tree.patch(sectionId, { fill });
      else if (!warnings.some((item) => String(item).indexOf(sectionSpec.backgroundImage) >= 0)) {
        warnings.push("背景圖略過: " + sectionSpec.backgroundImage);
      }
    }
    if (spec.rendered) {
      if (!sectionId || stagedRoots.length !== 1) throw new Error("區塊沒有有效的根圖層：" + sectionSpec.marker);
      if (insertIndex !== null && typeof tree.setParent === "function") await tree.setParent(sectionId, sectionHost.id, insertIndex);
    }
  } catch (error) {
    if (spec.rendered) for (const id of stagedRoots) {
      try { tree.remove(id); } catch { /* A subsequent retry removes duplicate managed roots. */ }
    }
    throw error;
  }
  if (spec.rendered) for (const id of stale) tree.remove(id);
  return sectionId;
}
const sectionSpecs = (spec.sections && spec.sections.length)
  ? spec.sections
  : [{ marker: spec.marker, ops: spec.ops, backgroundImage: spec.backgroundImage }];
const sectionIds = [];
for (const sectionSpec of sectionSpecs) {
  if (!sectionSpec || !sectionSpec.ops || !sectionSpec.ops.length) continue;
  sectionIds.push(await writeSection(sectionSpec));
}
const sectionId = sectionIds.length ? sectionIds[sectionIds.length - 1] : null;
const missingMarkers = [];
let presentMarkers = [];
if (spec.expectedMarkers) {
  const realized = tree.get(parent.id);
  const children = realized?.children || [];
  const bpChildren = parent.id === breakpoint.id ? [] : (tree.get(breakpoint.id)?.children || []);
  const allChildren = [...children, ...bpChildren];
  presentMarkers = allChildren.map(child => child.elementId || child.name || child.id);
  const desired = spec.expectedMarkers.map(marker => allChildren.find(child => child.elementId === marker));
  spec.expectedMarkers.forEach((marker, index) => { if (!desired[index]) missingMarkers.push(marker); });
  if (missingMarkers.length) {
    warnings.push("頁面讀回缺少區塊，請覆核 Framer 圖層");
  } else {
    const managed = child => /^readdy-(?:sec-[0-9]+|dom(?:-[0-9]+)+)$/.test(child.elementId || "");
    const keepIds = new Set(desired.map(child => child.id));
    for (const child of children.filter(managed)) {
      if (!keepIds.has(child.id)) tree.remove(child.id);
    }
    if (spec.pageGeometry && parent.id !== breakpoint.id) {
      for (const previous of bpChildren.filter(managed)) {
        if (!keepIds.has(previous.id)) tree.remove(previous.id);
      }
    }
    const desiredInParent = desired.filter(child => children.some(item => item.id === child.id));
    const first = children.findIndex(managed);
    if (typeof tree.setParent === "function" && first >= 0) {
      for (let i = 0; i < desiredInParent.length; i++) {
        try {
          await tree.setParent(desiredInParent[i].id, parent.id, first + i);
        } catch {
          warnings.push("區塊順序未能還原: " + desiredInParent[i].elementId);
        }
      }
    }
  }
}
return {
  pageId: page.id,
  pagePath: page.path,
  breakpointId: breakpoint.id,
  tabletBreakpointId: tabletBp ? tabletBp.id : null,
  phoneBreakpointId: phoneBp ? phoneBp.id : null,
  sectionId,
  missingMarkers,
  presentMarkers,
  created,
  warnings,
};`;
}

async function execOnFramerProject(input: {
  supabase: ReturnType<typeof supabaseAdmin>;
  accessToken: string;
  rowHolder: { row: FramerConnectionRow | null };
  projectId: string;
  projectUrl: string;
  sessionSlot: number;
  hintedSession?: { project_id?: string; project_session?: string } | null;
  program: string;
}): Promise<{ payload: Record<string, unknown>; session: FramerActiveMcpSession | null }> {
  const sessionKey = framerProjectSessionKey(input.projectId, input.sessionSlot);
  const openGate = getFramerSessionOpenBlock(input.rowHolder.row, input.projectId, Date.now(), input.sessionSlot);
  const cached = readCachedFramerSession(input.rowHolder.row, sessionKey);
  const hinted = !openGate.blocked && !cached && input.hintedSession?.project_id === input.projectId
    ? String(input.hintedSession.project_session || "").trim()
    : "";
  let active: FramerActiveMcpSession | null = cached || (hinted
    ? {
      project_id: input.projectId,
      project_url: input.projectUrl,
      mcp_session_id: null,
      project_session: hinted,
      opened_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    }
    : null);

  if (!active?.project_session) {
    if (openGate.blocked) {
      throw new Error(formatFramerSessionLimitError(`retry after ${openGate.retryAfterSeconds}s`));
    }
    await invokeFramer(input.supabase, input.accessToken, input.rowHolder, async (client) => {
      const opened = await client.callTool("open_project", { projectId: input.projectUrl || input.projectId });
      assertMcpOk(opened);
      const projectSession = extractSessionHandle(opened);
      if (!projectSession) {
        throw new Error(`open_project 未回傳 session：${extractMcpText(opened).slice(0, 280)}`);
      }
      const nowIso = new Date().toISOString();
      active = {
        project_id: input.projectId,
        project_url: input.projectUrl,
        mcp_session_id: client.getSessionId(),
        project_session: projectSession,
        opened_at: nowIso,
        last_used_at: nowIso,
      };
      await saveCachedFramerSession(input.supabase, sessionKey, active);
      input.rowHolder.row = await loadFramerConnection(input.supabase);
    }, { retryTransport: false, slot: input.sessionSlot });
  }

  try {
    const payload = await invokeFramer(input.supabase, input.accessToken, input.rowHolder, async (client) => {
      if (!active?.project_session) {
        throw new Error(formatFramerSessionLimitError("missing project session"));
      }
      const result = await client.callTool("exec", {
        session: active.project_session,
        program: input.program,
      });
      assertMcpOk(result);
      const nowIso = new Date().toISOString();
      active = {
        ...active,
        project_url: input.projectUrl || active.project_url,
        mcp_session_id: client.getSessionId() ?? active.mcp_session_id,
        last_used_at: nowIso,
      };
      await saveCachedFramerSession(input.supabase, sessionKey, active);
      return extractExecPayload(result);
    }, { slot: input.sessionSlot });
    return { payload, session: active };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isFramerSessionLimitError(msg)) throw error;
    if (isFramerProjectSessionStaleError(msg)) {
      await blockFramerProjectReopen(input.supabase, input.projectId, input.projectUrl, Date.now(), input.sessionSlot);
      throw new Error(formatFramerSessionLimitError(msg));
    }
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

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
      sync_page?: boolean;
      publish?: boolean;
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

    if (body.action === "publish_project") {
      const projectUrl = String(body.framer_project_url || "").trim();
      const projectId = extractProjectId(projectUrl);
      if (!projectId) return jsonResponse({ error: "請先選擇 Framer 專案。" }, 400);
      const supabase = supabaseAdmin();
      const { accessToken, row } = await getValidFramerAccessToken(supabase);
      const rowHolder: { row: FramerConnectionRow | null } = { row };
      const requested = typeof body.publish === "boolean" ? body.publish : undefined;
      if (!shouldPublishAfterSync(row?.auto_publish, requested)) {
        return jsonResponse({ ok: true, publish: { ok: true, skipped: true } });
      }
      const sessionSlot = normalizeFramerSessionSlot(body.session_slot);
      try {
        const executed = await execOnFramerProject({
          supabase,
          accessToken,
          rowHolder,
          projectId,
          projectUrl,
          sessionSlot,
          hintedSession: body.mcp_session,
          program: buildFramerPublishProgram(),
        });
        const publish = readFramerPublishPayload(executed.payload);
        return jsonResponse({
          ok: true,
          publish,
          mcp_session: executed.session
            ? {
              project_id: executed.session.project_id,
              mcp_session_id: executed.session.mcp_session_id,
              project_session: executed.session.project_session,
            }
            : null,
        });
      } catch (error) {
        const rawMsg = error instanceof Error ? error.message : String(error);
        const isSessionLimit = isFramerSessionLimitError(rawMsg);
        const displayMsg = isSessionLimit ? formatFramerSessionLimitError(rawMsg) : rawMsg;
        if (isSessionLimit) {
          return jsonResponse({
            error: displayMsg,
            error_code: "framer_session_limit",
            retry_after_seconds: 360,
          }, 429);
        }
        return jsonResponse({ ok: true, publish: { ok: false, error: displayMsg } });
      }
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
    const scenePath = irPayload.renderedPage?.scenePath;
    const rendered = Boolean(scenePath);
    const scenesById = new Map<string, NonNullable<IrSection["renderedScenes"]>>();
    let pageGeometry: FramerExecSpec["pageGeometry"];
    if (scenePath && (body.sync_page || stepIndex > 0)) {
      if (!/^assets\/rendered\/[0-9a-f-]+\/scenes\.json$/i.test(scenePath)) {
        return jsonResponse({ error: "來源圖層路徑無效，請重新擷取頁面。" }, 400);
      }
      const { data, error } = await supabase.storage.from("readdy-framer-assets").download(scenePath);
      if (error || !data) return jsonResponse({ error: "無法讀取來源圖層，請重新擷取頁面。" }, 409);
      const recorded = JSON.parse(await data.text()) as Record<"desktop" | "tablet" | "phone", unknown[]> & {
        geometry?: FramerExecSpec["pageGeometry"];
      };
      if (recorded.geometry && (["desktop", "tablet", "phone"] as const).every((key) => {
        const height = recorded.geometry?.[key]?.height;
        return typeof height === "number" && Number.isFinite(height) && height > 0 && height <= 30000;
      })) pageGeometry = recorded.geometry;
      for (const device of ["desktop", "tablet", "phone"] as const) {
        for (const node of recorded[device] || []) {
          if (!isSceneNode(node)) continue;
          const variants = scenesById.get(node.id) || {};
          variants[device] = node;
          scenesById.set(node.id, variants);
        }
      }
      if (irPayload.sections.some((section) => !scenesById.has(section.id))) {
        return jsonResponse({ error: "來源圖層不完整，請重新擷取頁面。" }, 409);
      }
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
    const primaryColor = irPayload.designTokens?.colors?.primary || irPayload.designTokens?.colors?.accent || null;

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
      const payload = extractExecPayload(result);
      const wroteSection = Boolean((spec.sections && spec.sections.length > 0) || spec.ops.length > 0);
      if (wroteSection && !payload.sectionId) {
        const raw = extractMcpText(result).replace(/\s+/g, " ").trim().slice(0, 300);
        throw new Error(`Framer exec 未回傳 sectionId${raw ? `：${raw}` : ""}`);
      }
      return payload;
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

    const publishAfterWrite = async (): Promise<FramerPublishResult> => {
      const requested = typeof body.publish === "boolean" ? body.publish : undefined;
      if (!shouldPublishAfterSync(rowHolder.row?.auto_publish, requested)) {
        return { ok: true, skipped: true };
      }
      addLog("info", "正在 Publish 到 Framer…");
      try {
        const executed = await execOnFramerProject({
          supabase,
          accessToken,
          rowHolder,
          projectId,
          projectUrl,
          sessionSlot,
          hintedSession: activeSession
            ? { project_id: activeSession.project_id, project_session: activeSession.project_session }
            : body.mcp_session,
          program: buildFramerPublishProgram(),
        });
        if (executed.session) activeSession = executed.session;
        const publish = readFramerPublishPayload(executed.payload);
        addLog(publish.ok ? "success" : "warn", formatFramerPublishNote(publish) || "Publish 完成");
        return publish;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const publish: FramerPublishResult = { ok: false, error: message };
        addLog("warn", formatFramerPublishNote(publish) || message);
        return publish;
      }
    };

    const recordWarnings = (result: Record<string, unknown>) => {
      if (Array.isArray(result.warnings)) {
        for (const warning of result.warnings) addLog("warn", String(warning));
      }
    };
    const finalizeRenderedPage = async (pageNodeId: string | null, trace = "") => {
      const final = await runFramerProgram({
        stamp: Date.now().toString(36),
        pagePath: normalizeComparablePath(pagePath),
        pageTitle,
        pageNodeId,
        desktopWidth,
        primaryColor: null,
        rendered,
        pageGeometry,
        expectedMarkers: irPayload.sections.map((section) => `readdy-${section.id}`),
        ops: [],
      });
      recordWarnings(final);
      if (!Array.isArray(final.missingMarkers)) throw new Error("Framer 未回傳區塊讀回結果。");
      if (final.missingMarkers.length > 0) {
        const missing = new Set(final.missingMarkers);
        for (const section of irPayload.sections) {
          if (missing.has(`readdy-${section.id}`)) section.syncStatus = "failed";
        }
        const present = Array.isArray(final.presentMarkers) ? final.presentMarkers.slice(0, 12).join(", ") : "";
        throw new Error(`Framer 讀回缺少區塊（${final.missingMarkers.join(", ")}；畫布現有：${present || "無"}${trace ? `；寫入：${trace}` : ""}），請重試此頁同步。`);
      }
    };

    if (body.sync_page) {
      const hasUnsynced = irPayload.sections.some((section) => section.syncStatus !== "synced");
      const pending = irPayload.sections.flatMap((section, index) => (hasUnsynced && section.syncStatus === "synced") ? [] : [{
        section, index, bundle: bundleSection(section, irPayload, index, null, scenesById.get(section.id), Boolean(pageGeometry)),
      }]);
      const batches: typeof pending[] = [];
      let current: typeof pending = [];
      let size = 0;
      for (const item of pending) {
        const next = JSON.stringify(item.bundle).length;
        if (current.length > 0 && size + next > PAGE_EXEC_CHAR_LIMIT) {
          batches.push(current);
          current = [];
          size = 0;
        }
        current.push(item);
        size += next;
      }
      if (current.length > 0) batches.push(current);
      const batchResults: string[] = [];
      addLog("info", `整頁寫入 ${pending.length} 個區塊，分成 ${Math.max(batches.length, 1)} 次 exec`);
      try {
        const setup = await runFramerProgram({
          stamp: Date.now().toString(36),
          pagePath: normalizeComparablePath(pagePath),
          pageTitle,
          pageNodeId: irPayload.pageMeta?.framerPageNodeId || null,
          desktopWidth,
          rendered,
          pageGeometry,
          primaryColor,
          ops: [],
        });
        const pageNodeId = typeof setup.pageId === "string" ? setup.pageId : null;
        recordWarnings(setup);
        rememberPage(pageNodeId, typeof setup.breakpointId === "string" ? setup.breakpointId : null);
        for (const batch of batches) {
          try {
            const batchPayload = await runFramerProgram({
              stamp: Date.now().toString(36),
              pagePath: normalizeComparablePath(pagePath),
              pageTitle,
              pageNodeId,
              desktopWidth,
              rendered,
              pageGeometry,
              primaryColor: null,
              ops: [],
              sections: batch.map((item) => item.bundle),
            });
            recordWarnings(batchPayload);
            batchResults.push(`${batch.map((b) => b.section.id).join("+")}=>${String(batchPayload.sectionId || "null")}(ops:${batch.map((b) => b.bundle.ops.length).join("+")})`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (isFramerSessionLimitError(message)) throw error;
            addLog("warn", `整批寫入失敗，改為逐區塊：${message}`);
            for (const item of batch) {
              const singlePayload = await runFramerProgram({
                stamp: Date.now().toString(36),
                pagePath: normalizeComparablePath(pagePath),
                pageTitle,
                pageNodeId,
                desktopWidth,
                rendered,
                pageGeometry,
                primaryColor: null,
                marker: item.bundle.marker,
                backgroundImage: item.bundle.backgroundImage,
                ops: item.bundle.ops,
              });
              recordWarnings(singlePayload);
              batchResults.push(`${item.section.id}=>${String(singlePayload.sectionId || "null")}(ops:${item.bundle.ops.length})`);
              item.section.syncStatus = "synced";
              await supabase.from("framer_sync_jobs").update({
                current_step: item.index + 1,
                status: "syncing",
                ir_payload: irPayload,
                step_logs: existingLogs,
                updated_at: new Date().toISOString(),
              }).eq("id", jobId);
            }
            continue;
          }
          for (const item of batch) item.section.syncStatus = "synced";
          const last = batch[batch.length - 1];
          await supabase.from("framer_sync_jobs").update({
            current_step: last.index + 1,
            status: "syncing",
            ir_payload: irPayload,
            step_logs: existingLogs,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);
        }
        if (rendered) await finalizeRenderedPage(pageNodeId, batchResults.join("; "));
        const publish = await publishAfterWrite();
        addLog("info", publish.skipped ? "Framer 已寫入，畫面待覆核。" : "Framer 已寫入。");
        const { error: saveError } = await supabase.from("framer_sync_jobs").update({
          current_step: irPayload.sections.length,
          status: "completed",
          ir_payload: irPayload,
          step_logs: existingLogs,
          error_log: null,
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
        if (saveError) throw new Error("無法保存 Framer 同步狀態：" + saveError.message);
        return jsonResponse({
          ok: true,
          step_index: irPayload.sections.length,
          page_path: pagePath,
          framer_page_node_id: pageNodeId,
          duration_ms: Date.now() - startedAt,
          tools_discovered: toolNames,
          tool_called: "exec",
          mcp_session: serializeSessionHint(),
          session_reused: reusedSession,
          logs: existingLogs.slice(-6),
          publish,
          job_status: "completed",
        });
      } catch (error) {
        const rawMsg = error instanceof Error ? error.message : String(error);
        const isSessionLimit = isFramerSessionLimitError(rawMsg);
        const displayMsg = isSessionLimit ? formatFramerSessionLimitError(rawMsg) : rawMsg;
        addLog("error", displayMsg);
        await supabase.from("framer_sync_jobs").update({
          status: "failed",
          error_log: displayMsg,
          ir_payload: irPayload,
          step_logs: existingLogs,
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
        return jsonResponse(
          isSessionLimit
            ? { error: displayMsg, error_code: "framer_session_limit", retry_after_seconds: 360 }
            : { error: displayMsg },
          isSessionLimit ? 429 : 400,
        );
      }
    }

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
          `已用 exec（${sessionModeLabel}）定位頁面 ${normalizeComparablePath(pagePath)}${pageNodeId ? `（${pageNodeId}）` : ""}${payload.created ? "，並建立缺少的頁面" : ""}，並分別準備 Desktop / Tablet / Phone 三個斷點，主色 ${primaryColor || "未設定"}`,
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

    const built = bundleSection(section, irPayload, sectionIdx, isSceneNode(body.scene) ? body.scene : null, scenesById.get(section.id), Boolean(pageGeometry));
    addLog("info", `區塊 [${section.name}] 由伺服器場景寫入（${built.ops.length} 個節點）`);
    try {
      const payload = await runFramerProgram({
        stamp: Date.now().toString(36),
        pagePath: normalizeComparablePath(pagePath),
        pageTitle,
        pageNodeId: targetNodeId,
        desktopWidth,
        rendered,
        pageGeometry,
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
      recordWarnings(payload);
      if (rendered && irPayload.sections.every((candidate) => candidate === section || candidate.syncStatus === "synced")) {
        await finalizeRenderedPage(targetNodeId);
      }
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
    const publish = await publishAfterWrite();

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
      publish,
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
