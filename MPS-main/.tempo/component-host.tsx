/* THIS FILE IS AUTO-GENERATED. DO NOT EDIT. */

const _rendererLoadT0 = Date.now();
// console.log("[TELEMETRY][renderer] module top-level execution START");

import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

// console.log("[TELEMETRY][renderer] static imports resolved +" + (Date.now() - _rendererLoadT0) + "ms");

// Freeze detector — logs when the event loop blocks for > 200ms.
// When a freeze occurs, the last heartbeat before the gap shows the time,
// and the first heartbeat after (if any) shows the gap duration.
let _freezeLastBeat = Date.now();
let _freezeBeatCount = 0;
const _freezeTimer = setInterval(() => {
  const now = Date.now();
  const gap = now - _freezeLastBeat;
  _freezeBeatCount++;
  if (gap > 1000) { console.warn("[FREEZE-DETECT] event loop was blocked for " + gap + "ms (beat #" + _freezeBeatCount + ")"); }
  _freezeLastBeat = now;
}, 200);
void _freezeTimer;

export type ComponentDefinition = {
  pageFile?: string;
  exportName?: string;
  importName?: string;
  importPath?: string;
  props?: Record<string, unknown>;
};

export type StartRenderingCommand = {
  renderId: string;
  page_file?: string;
  export_name?: string;
  importName?: string;
  importPath?: string;
  props?: Record<string, unknown>;
  width?: number;
  height?: number;
  /** When true, the slot's outer + inner wrappers use `max-content` so the
   *  rendered component expresses its natural intrinsic size instead of
   *  inheriting the slot's `width/height`. Used by callers who want to
   *  measure the component's actual size after mount (e.g. canvas
   *  storyboards with `intrinsicSizing: "root-element"`). When set, the
   *  `width`/`height` fields are still accepted as cached layout hints
   *  but ignored for slot sizing. */
  intrinsicSize?: boolean;
  renderReadyTimeoutMs?: number;
};

export type StopRenderingCommand = {
  renderId: string;
};

export type SetCacheLimitCommand = {
  maxCached: number;
};

export type RenderStatus = "active" | "cached";

export type RenderSummary = {
  renderId: string;
  importName: string;
  importPath: string;
  props?: Record<string, unknown>;
  width?: number;
  height?: number;
  intrinsicSize?: boolean;
  status: RenderStatus;
};

export type ProblemKind =
  | "runtime"
  | "module-load"
  | "crash"
  | "frame-load"
  | "route-load"
  | "timeout";

export type SourceLocation = {
  file?: string;
  line?: number;
  column?: number;
};

export type RuntimeProblemDetails = {
  kind: ProblemKind;
  message: string;
  stack?: string;
  location?: SourceLocation;
  frame?: string;
  plugin?: string;
  componentStack?: string;
  timestamp: number;
};

export const renderPoolRenderCommandType = "render-pool:render";
export const renderPoolUnrenderCommandType = "render-pool:unrender";
export const renderPoolSetCacheLimitCommandType = "render-pool:set-cache-limit";
export const renderPoolIsolateCommandType = "render-pool:isolate";
export const renderPoolListCommandType = "render-pool:list";
export const renderPoolQueryHealthCommandType = "render-pool:query-health";

export const renderPoolReadyMessageType = "render-pool:ready";
export const renderPoolAckMessageType = "render-pool:ack";
export const renderPoolErrorMessageType = "render-pool:error";
export const renderPoolStateMessageType = "render-pool:state";
export const renderPoolFailureMessageType = "render-pool:failure";
export const renderPoolRecoveryMessageType = "render-pool:recovery";
export const renderPoolHealthSnapshotMessageType = "render-pool:health-snapshot";
export const renderPoolBridgeCommandEvent = "__render-pool:command";
export const renderPoolBridgeEvent = "__render-pool:event";

const DEFAULT_MAX_CACHED = 20;
const DEFAULT_RENDER_READY_TIMEOUT_MS = 30000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveRenderableComponent = (
  value: unknown,
  exportName: string,
): React.ComponentType<Record<string, unknown>> => {
  if (typeof value === "function") {
    return value as React.ComponentType<Record<string, unknown>>;
  }

  if (
    value &&
    typeof value === "object" &&
    "route" in value &&
    typeof value.route === "string"
  ) {
    const route = value.route;
    return function TempoRouteStoryboard() {
      return React.createElement("iframe", {
        title: route,
        src: route,
        style: {
          border: "none",
          width: "100%",
          height: "100%",
        },
      });
    };
  }

  if (
    value &&
    typeof value === "object" &&
    "render" in value &&
    typeof value.render === "function"
  ) {
    const render = value.render as React.ComponentType<Record<string, unknown>> & {
      displayName?: string;
    };
    render.displayName = exportName;
    return render;
  }

  throw new Error(
    `Component export "${exportName}" must be a React component, a route storyboard, or an object with a render() function.`
  );
};

const getComponentDefinitionKey = (
  importPath: string,
  importName: string,
): string => `${importPath}::${importName}`;

export const registeredComponentDefinitions: readonly ComponentDefinition[] = [];

type ComponentLoader = () => Promise<{
  default: React.ComponentType<Record<string, unknown>>;
}>;

// State that must survive module re-evaluation (HMR). Stored on window
// so old React closures and new module instances share the same objects.
// Same pattern as iframe-projection's window.__REACT_DEVTOOLS_GLOBAL_HOOK__.
type CanvasModule = Record<string, unknown>;
type CanvasLoader = () => Promise<CanvasModule>;
const canvasModules: Record<string, CanvasModule> =
  ((window as any).__tempoCanvasModules ??= {});
const canvasModuleWaiters: Map<string, Set<() => void>> =
  ((window as any).__tempoCanvasModuleWaiters ??= new Map());
// Per-canvas dynamic-import factories. Disk-as-truth: every canvas file
// under pagesDir is registered as a loader, but none of them are invoked
// until waitForCanvasModule(path) asks for that specific canvas.
const canvasLoaders: Record<string, CanvasLoader> =
  ((window as any).__tempoCanvasLoaders ??= {});
// In-flight load dedup: multiple concurrent waitForCanvasModule(path)
// callers for the same path share one fetch instead of racing.
const canvasModuleLoadPromises: Map<string, Promise<CanvasModule>> =
  ((window as any).__tempoCanvasModuleLoadPromises ??= new Map());
const lazyComponentCache: Map<
  string,
  React.LazyExoticComponent<React.ComponentType<Record<string, unknown>>>
> = ((window as any).__tempoLazyComponentCache ??= new Map());

const bakedInComponentLoaders: Record<string, ComponentLoader> = {
  // No components are currently registered.
};

const invalidateLazyCacheForFile = (importPath: string): void => {
  const prefix = `${importPath}::`;
  for (const key of [...lazyComponentCache.keys()]) {
    if (key.startsWith(prefix)) {
      lazyComponentCache.delete(key);
    }
  }
};

const notifyCanvasModuleWaiters = (importPath: string): void => {
  const waiters = canvasModuleWaiters.get(importPath);
  if (!waiters || waiters.size === 0) {
    return;
  }
  canvasModuleWaiters.delete(importPath);
  for (const waiter of waiters) {
    waiter();
  }
};

const isCanvasLoadErrorModule = (value: CanvasModule | undefined): boolean =>
  Boolean(
    value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "__tempoLoadError")
  );

// Single-canvas lazy load: invoke the registered loader, store the
// in-flight promise so concurrent callers share it, write the result
// (or an error sentinel) into canvasModules, and notify any waiters.
const loadCanvasModuleViaLoader = (
  importPath: string,
  loader: CanvasLoader,
): Promise<CanvasModule> => {
  const promise = loader()
    .then((mod) => {
      const resolved: CanvasModule = (mod ?? {}) as CanvasModule;
      if (canvasLoaders[importPath] !== loader) {
        canvasModuleLoadPromises.delete(importPath);
        return resolved;
      }
      canvasModules[importPath] = resolved;
      canvasModuleLoadPromises.delete(importPath);
      notifyCanvasModuleWaiters(importPath);
      return resolved;
    })
    .catch((error) => {
      // Sentinel lets waitForCanvasModule resolve instead of hanging
      // forever on a never-resolving lazy boundary. The render-pool's
      // existing 'export not found in module' path catches the rest:
      // looking up exportName on { __tempoLoadError } evicts the slot.
      console.error("[tempo] canvas load failed for " + importPath, error);
      const sentinel: CanvasModule = { __tempoLoadError: error };
      if (canvasLoaders[importPath] !== loader) {
        canvasModuleLoadPromises.delete(importPath);
        return sentinel;
      }
      canvasModules[importPath] = sentinel;
      canvasModuleLoadPromises.delete(importPath);
      notifyCanvasModuleWaiters(importPath);
      return sentinel;
    });
  canvasModuleLoadPromises.set(importPath, promise);
  return promise;
};

const waitForCanvasModule = (importPath: string): Promise<CanvasModule> => {
  // 1. Already loaded — synchronous fast path
  const existing = canvasModules[importPath];
  if (existing) {
    if (isCanvasLoadErrorModule(existing) && canvasLoaders[importPath]) {
      delete canvasModules[importPath];
      invalidateLazyCacheForFile(importPath);
    } else {
      return Promise.resolve(existing);
    }
  }

  // 2. Load in flight — share the existing promise so concurrent
  //    callers don't trigger duplicate dynamic imports
  const inflight = canvasModuleLoadPromises.get(importPath);
  if (inflight) {
    return inflight;
  }

  // 3. Registry has a loader for this path — invoke it now
  const loader = canvasLoaders[importPath];
  if (loader) {
    return loadCanvasModuleViaLoader(importPath, loader);
  }

  // 4. No loader yet — fall back to a waiter. The registry may HMR in
  //    a loader for this path shortly (e.g. a new canvas file was just
  //    created and the devserver's pagesDir watcher hasn't fired the
  //    regenerate yet); registerCanvasLoaders drains pending waiters
  //    whose paths just became loadable.
  return new Promise<CanvasModule>((resolve) => {
    const resolveWhenAvailable = (): void => {
      const nextModule = canvasModules[importPath];
      if (!nextModule) {
        return;
      }
      cleanup();
      resolve(nextModule);
    };

    const cleanup = (): void => {
      const waiters = canvasModuleWaiters.get(importPath);
      if (!waiters) {
        return;
      }
      waiters.delete(resolveWhenAvailable);
      if (waiters.size === 0) {
        canvasModuleWaiters.delete(importPath);
      }
    };

    const waiters = canvasModuleWaiters.get(importPath) ?? new Set<() => void>();
    waiters.add(resolveWhenAvailable);
    canvasModuleWaiters.set(importPath, waiters);
    resolveWhenAvailable();
  });
};

export const reconcileCanvasImports = (
  modules: Record<string, CanvasModule>,
): void => {
  const nextModules = modules ?? {};

  const affectedImportPaths = new Set<string>();

  // Invalidate lazy cache for removed or changed modules
  for (const existingImportPath of Object.keys(canvasModules)) {
    if (
      !(existingImportPath in nextModules) ||
      canvasModules[existingImportPath] !== nextModules[existingImportPath]
    ) {
      affectedImportPaths.add(existingImportPath);
      invalidateLazyCacheForFile(existingImportPath);
    }
  }
  for (const nextImportPath of Object.keys(nextModules)) {
    if (nextImportPath in canvasModules) {
      affectedImportPaths.add(nextImportPath);
      invalidateLazyCacheForFile(nextImportPath);
    }
  }

  // Mutate the shared object in-place so old closures see the update.
  // (canvasModules lives on window — replacing the reference would only
  // update the local variable, not the window property.)
  for (const key of Object.keys(canvasModules)) {
    if (!(key in nextModules)) {
      delete canvasModules[key];
    }
  }
  Object.assign(canvasModules, nextModules);

  for (const importPath of Object.keys(nextModules)) {
    if (nextModules[importPath]) {
      notifyCanvasModuleWaiters(importPath);
    }
  }

  // Evict render entries whose import no longer resolves. After a module
  // update, a cached slot referencing a removed export would re-create a
  // lazy and fail with "Export not found" — that error surfaces at the
  // window level and broadcasts a host-wide crash errorDetails to every
  // other claim. Dropping the entry is the symmetric cleanup to the
  // import that removed it.
  const toRemove: string[] = [];
  for (const [renderId, entry] of runtimeState.entriesById) {
    const loadedModule = canvasModules[entry.definition.importPath];
    if (loadedModule && !(entry.definition.importName in loadedModule)) {
      toRemove.push(renderId);
    }
  }
  if (toRemove.length > 0) {
    for (const renderId of toRemove) {
      renderFailureMessages.delete(renderId);
      runtimeState.entriesById.delete(renderId);
    }
    notifyRuntimeStateChanged();
  }

  let remountedAffectedEntry = false;
  for (const entry of runtimeState.entriesById.values()) {
    if (affectedImportPaths.has(entry.definition.importPath)) {
      renderFailureMessages.delete(entry.renderId);
      entry.errorEpoch += 1;
      remountedAffectedEntry = true;
    }
  }
  if (remountedAffectedEntry) {
    notifyRuntimeStateChanged();
  }

  // Now that the registry has populated canvasModules, signal that
  // the runtime is ready to serve render commands. Idempotent: only
  // the first call to reconcileCanvasImports dispatches the message.
  markRendererReadyOnce();
};

// Disk-as-truth registration entry point. The generated registry calls
// this once per evaluation (initial load and again on HMR after a
// pagesDir change). It does NOT load any modules — each canvas is
// fetched on demand the first time waitForCanvasModule(path) needs it.
//
// On HMR with a changed loader map: any previously-loaded module whose
// loader is no longer registered (canvas file was deleted on disk) is
// evicted so subsequent waitForCanvasModule calls don't return stale
// content. The eviction half mirrors reconcileCanvasImports's behavior
// for the static-imports path that the registry used to emit.
export const registerCanvasLoaders = (
  loaders: Record<string, CanvasLoader>,
): void => {
  const nextLoaders = loaders ?? {};

  // Evict modules whose loader disappeared (canvas deleted from disk).
  for (const key of Object.keys(canvasModules)) {
    if (!(key in nextLoaders)) {
      delete canvasModules[key];
      invalidateLazyCacheForFile(key);
    }
  }

  const affectedImportPaths = new Set<string>();
  for (const key of Object.keys(nextLoaders)) {
    if (canvasLoaders[key] && canvasLoaders[key] !== nextLoaders[key]) {
      affectedImportPaths.add(key);
      delete canvasModules[key];
      invalidateLazyCacheForFile(key);
    }
  }

  // Load failures are retryable. The file may have been saved in a
  // temporarily broken state, then fixed without changing the registry
  // key. Drop sentinels whenever a loader is present so the next render
  // attempts a fresh dynamic import instead of returning stale failure.
  for (const key of Object.keys(canvasModules)) {
    if (key in nextLoaders && isCanvasLoadErrorModule(canvasModules[key])) {
      affectedImportPaths.add(key);
      delete canvasModules[key];
      invalidateLazyCacheForFile(key);
    }
  }

  // If a loader disappeared or was replaced while an import was in
  // flight, stop sharing that stale promise with future callers. The
  // old promise cannot be cancelled, but loadCanvasModuleViaLoader()
  // checks loader identity before writing into canvasModules.
  for (const key of Object.keys(canvasLoaders)) {
    if (!(key in nextLoaders) || canvasLoaders[key] !== nextLoaders[key]) {
      canvasModuleLoadPromises.delete(key);
    }
  }

  // Replace the loader map in-place so existing closures see the update.
  // canvasLoaders lives on window — reassigning the variable would only
  // update the local binding, not the shared object across HMR boundaries.
  for (const key of Object.keys(canvasLoaders)) {
    delete canvasLoaders[key];
  }
  Object.assign(canvasLoaders, nextLoaders);

  // Drain any waiters whose loader just became available. waitForCanvasModule
  // falls into the waiter path when called before the registry has registered
  // a loader for that path; now that a loader exists, kick off the load so the
  // waiter resolves.
  for (const importPath of canvasModuleWaiters.keys()) {
    if (canvasModules[importPath]) continue;
    if (canvasModuleLoadPromises.has(importPath)) continue;
    const loader = canvasLoaders[importPath];
    if (loader) {
      void loadCanvasModuleViaLoader(importPath, loader);
    }
  }

  let remountedAffectedEntry = false;
  for (const entry of runtimeState.entriesById.values()) {
    if (affectedImportPaths.has(entry.definition.importPath)) {
      renderFailureMessages.delete(entry.renderId);
      entry.errorEpoch += 1;
      remountedAffectedEntry = true;
    }
  }
  if (remountedAffectedEntry) {
    notifyRuntimeStateChanged();
  }

  // Same ready-signal as reconcileCanvasImports's terminal call. Idempotent:
  // only the first invocation dispatches the post-message; subsequent HMR
  // re-registrations are no-ops at this layer.
  markRendererReadyOnce();
};

type StoredRenderEntry = {
  renderId: string;
  definition: ComponentDefinition;
  width?: number;
  height?: number;
  intrinsicSize?: boolean;
  status: RenderStatus;
  lastInactiveAt: number;
  errorEpoch: number;
};

type RuntimeSnapshot = {
  entries: StoredRenderEntry[];
  maxCached: number;
};

type RequestId = string | number | undefined;

type RendererStatePayload = {
  renders: RenderSummary[];
  maxCached: number;
};

type RuntimeState = {
  entriesById: Map<string, StoredRenderEntry>;
  listeners: Set<() => void>;
  maxCached: number;
  snapshot: RuntimeSnapshot;
};

const runtimeState: RuntimeState = {
  entriesById: new Map(),
  listeners: new Set(),
  maxCached: DEFAULT_MAX_CACHED,
  snapshot: {
    entries: [],
    maxCached: DEFAULT_MAX_CACHED,
  },
};

const syncRuntimeSnapshot = (): void => {
  runtimeState.snapshot = {
    entries: [...runtimeState.entriesById.values()],
    maxCached: runtimeState.maxCached,
  };
};

const notifyRuntimeStateChanged = (): void => {
  syncRuntimeSnapshot();
  for (const listener of runtimeState.listeners) {
    listener();
  }
};

const subscribeRuntimeState = (listener: () => void): (() => void) => {
  runtimeState.listeners.add(listener);
  return () => {
    runtimeState.listeners.delete(listener);
  };
};

const getRuntimeSnapshot = (): RuntimeSnapshot => runtimeState.snapshot;

type FiberLike = {
  return: FiberLike | null;
  stateNode: unknown;
};

type PortalWatcher = {
  element: Element;
  onPortalFound: (portalRoot: Element) => void;
  onPortalRemoved: (portalRoot: Element) => void;
};

type PortalInlineStyle = {
  visibility: string;
  pointerEvents: string;
  contentVisibility: string;
  transition: string;
  animation: string;
};

const portalInlineStyleByElement = new Map<Element, PortalInlineStyle>();
const portalOwnerRenderIdsByElement = new Map<Element, Set<string>>();
const portalElementsByRenderId = new Map<string, Set<Element>>();

const findFiberKey = (element: Element): string | null =>
  Object.keys(element).find(
    (key) =>
      key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
  ) ?? null;

const findContainerKey = (element: Element): string | null =>
  Object.keys(element).find((key) => key.startsWith("__reactContainer$")) ?? null;

const getFiberFromElement = (element: Element): FiberLike | null => {
  const fiberKey = findFiberKey(element);
  if (fiberKey) {
    return (element as unknown as Record<string, FiberLike | undefined>)[fiberKey] ?? null;
  }

  const containerKey = findContainerKey(element);
  if (containerKey) {
    return (element as unknown as Record<string, FiberLike | undefined>)[containerKey] ?? null;
  }

  return null;
};

class PortalTracker {
  private readonly watchers = new Set<PortalWatcher>();
  private readonly ownerWatchersByPortalRoot = new Map<Element, Set<PortalWatcher>>();
  private observer: MutationObserver | null = null;

  register(watcher: PortalWatcher): () => void {
    this.watchers.add(watcher);

    if (this.watchers.size === 1) {
      this.startObserving();
    }

    if (typeof document !== "undefined" && document.body) {
      for (const child of Array.from(document.body.children)) {
        this.checkElement(child);
      }
    }

    return () => this.unregister(watcher);
  }

  destroy(): void {
    this.stopObserving();
    this.watchers.clear();
    this.ownerWatchersByPortalRoot.clear();
  }

  private unregister(watcher: PortalWatcher): void {
    this.watchers.delete(watcher);

    for (const [portalRoot, owners] of this.ownerWatchersByPortalRoot) {
      owners.delete(watcher);
      if (owners.size === 0) {
        this.ownerWatchersByPortalRoot.delete(portalRoot);
      }
    }

    if (this.watchers.size === 0) {
      this.stopObserving();
    }
  }

  private startObserving(): void {
    if (this.observer || typeof document === "undefined" || !document.body) {
      return;
    }

    this.observer = new MutationObserver(this.handleMutations);
    this.observer.observe(document.body, { childList: true });
  }

  private stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private handleMutations = (mutations: MutationRecord[]): void => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          queueMicrotask(() => this.checkElement(node));
        }
      }

      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }

        const owners = this.ownerWatchersByPortalRoot.get(node);
        if (!owners) {
          continue;
        }

        for (const owner of owners) {
          owner.onPortalRemoved(node);
        }

        this.ownerWatchersByPortalRoot.delete(node);
      }
    }
  };

  private _checkCount = 0;
  private checkElement(element: Element): void {
    this._checkCount++;
    if (this._checkCount <= 10 || this._checkCount % 50 === 0) { console.log("[PORTAL-TRACKER] checkElement #" + this._checkCount, element.tagName, element.className?.toString?.()?.slice(0, 50)); }
    if (this._checkCount > 500) { console.error("[PORTAL-TRACKER] RUNAWAY LOOP — " + this._checkCount + " calls. Last element:", element.tagName, element.outerHTML?.slice(0, 200)); if (this._checkCount > 510) { this.stopObserving(); console.error("[PORTAL-TRACKER] Observer disconnected to prevent freeze"); return; } }
    const ancestorDomNodes = this.getDomAncestorsViaFiber(element);
    if (ancestorDomNodes.length === 0) {
      return;
    }

    let owners = this.ownerWatchersByPortalRoot.get(element);

    for (const watcher of this.watchers) {
      const belongsToWatcher = ancestorDomNodes.some(
        (node) => watcher.element.contains(node) || watcher.element === node
      );

      if (!belongsToWatcher) {
        continue;
      }

      if (!owners) {
        owners = new Set<PortalWatcher>();
        this.ownerWatchersByPortalRoot.set(element, owners);
      }

      if (owners.has(watcher)) {
        continue;
      }

      owners.add(watcher);
      watcher.onPortalFound(element);
    }
  }

  private getDomAncestorsViaFiber(element: Element): Element[] {
    const fiber = getFiberFromElement(element);
    if (!fiber) {
      return [];
    }

    const domNodes: Element[] = [];
    let current: FiberLike | null = fiber.return;

    while (current) {
      if (current.stateNode instanceof Element) {
        domNodes.push(current.stateNode);
      }
      current = current.return;
    }

    return domNodes;
  }
}

let portalTracker: PortalTracker | null = null;

const getPortalTracker = (): PortalTracker => {
  if (!portalTracker) {
    portalTracker = new PortalTracker();
  }
  return portalTracker;
};

const getStylablePortalElement = (
  portalRoot: Element
): HTMLElement | SVGElement | null => {
  if (portalRoot instanceof HTMLElement || portalRoot instanceof SVGElement) {
    return portalRoot;
  }
  return null;
};

const capturePortalInlineStyle = (portalRoot: Element): PortalInlineStyle => {
  const stylableElement = getStylablePortalElement(portalRoot);
  if (!stylableElement) {
    return {
      visibility: "",
      pointerEvents: "",
      contentVisibility: "",
      transition: "",
      animation: "",
    };
  }

  const style = stylableElement.style;
  return {
    visibility: style.getPropertyValue("visibility"),
    pointerEvents: style.getPropertyValue("pointer-events"),
    contentVisibility: style.getPropertyValue("content-visibility"),
    transition: style.getPropertyValue("transition"),
    animation: style.getPropertyValue("animation"),
  };
};

const ensurePortalInlineStyle = (portalRoot: Element): PortalInlineStyle => {
  const existing = portalInlineStyleByElement.get(portalRoot);
  if (existing) {
    return existing;
  }

  const baseline = capturePortalInlineStyle(portalRoot);
  portalInlineStyleByElement.set(portalRoot, baseline);
  return baseline;
};

const setInlineStyleValue = (
  style: CSSStyleDeclaration,
  propertyName: string,
  value: string
): void => {
  if (value.length > 0) {
    style.setProperty(propertyName, value);
    return;
  }

  style.removeProperty(propertyName);
};

const restorePortalInlineStyle = (portalRoot: Element): void => {
  const stylableElement = getStylablePortalElement(portalRoot);
  const baseline = portalInlineStyleByElement.get(portalRoot);
  if (!stylableElement || !baseline) {
    return;
  }

  const style = stylableElement.style;
  setInlineStyleValue(style, "visibility", baseline.visibility);
  setInlineStyleValue(style, "pointer-events", baseline.pointerEvents);
  setInlineStyleValue(style, "content-visibility", baseline.contentVisibility);
  setInlineStyleValue(style, "transition", baseline.transition);
  setInlineStyleValue(style, "animation", baseline.animation);
};

const isRenderIdActive = (renderId: string): boolean =>
  runtimeState.entriesById.get(renderId)?.status === "active";

const syncPortalVisibility = (portalRoot: Element): void => {
  const owners = portalOwnerRenderIdsByElement.get(portalRoot);
  if (!owners || owners.size === 0) {
    restorePortalInlineStyle(portalRoot);
    portalInlineStyleByElement.delete(portalRoot);
    return;
  }

  const stylableElement = getStylablePortalElement(portalRoot);
  if (!stylableElement) {
    return;
  }

  const shouldBeVisible = [...owners].some((renderId) => isRenderIdActive(renderId));
  ensurePortalInlineStyle(portalRoot);

  if (shouldBeVisible) {
    restorePortalInlineStyle(portalRoot);
    return;
  }

  const style = stylableElement.style;
  style.setProperty("visibility", "hidden", "important");
  style.setProperty("pointer-events", "none", "important");
  style.setProperty("content-visibility", "hidden", "important");
  style.setProperty("transition", "none", "important");
  style.setProperty("animation", "none", "important");
};

const trackRenderPortal = (renderId: string, portalRoot: Element): void => {
  let portals = portalElementsByRenderId.get(renderId);
  if (!portals) {
    portals = new Set<Element>();
    portalElementsByRenderId.set(renderId, portals);
  }
  portals.add(portalRoot);

  let owners = portalOwnerRenderIdsByElement.get(portalRoot);
  if (!owners) {
    owners = new Set<string>();
    portalOwnerRenderIdsByElement.set(portalRoot, owners);
  }
  owners.add(renderId);

  syncPortalVisibility(portalRoot);
};

const untrackRenderPortal = (renderId: string, portalRoot: Element): void => {
  const portals = portalElementsByRenderId.get(renderId);
  if (portals) {
    portals.delete(portalRoot);
    if (portals.size === 0) {
      portalElementsByRenderId.delete(renderId);
    }
  }

  const owners = portalOwnerRenderIdsByElement.get(portalRoot);
  if (owners) {
    owners.delete(renderId);
    if (owners.size === 0) {
      portalOwnerRenderIdsByElement.delete(portalRoot);
    }
  }

  syncPortalVisibility(portalRoot);
};

const releaseRenderPortals = (renderId: string): void => {
  const portals = portalElementsByRenderId.get(renderId);
  if (!portals || portals.size === 0) {
    portalElementsByRenderId.delete(renderId);
    return;
  }

  for (const portalRoot of [...portals]) {
    untrackRenderPortal(renderId, portalRoot);
  }

  portalElementsByRenderId.delete(renderId);
};

const syncRenderPortals = (renderId: string): void => {
  const portals = portalElementsByRenderId.get(renderId);
  if (!portals) {
    return;
  }

  for (const portalRoot of portals) {
    syncPortalVisibility(portalRoot);
  }
};

const normalizeNonEmptyString = (
  value: unknown,
  fieldName: string
): string => {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  return normalized;
};

const normalizePropsRecord = (
  props: unknown,
  fieldName: string
): Record<string, unknown> | undefined => {
  if (props == null) {
    return undefined;
  }

  if (!isRecord(props)) {
    throw new Error(`${fieldName} must be an object when provided`);
  }

  return props;
};

const normalizeOptionalFrameDimension = (
  value: unknown,
  fieldName: string
): number | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`${fieldName} must be a number when provided`);
  }

  const normalized = Math.max(1, Math.round(value));
  if (!Number.isFinite(normalized)) {
    throw new Error(`${fieldName} must be finite`);
  }

  return normalized;
};

const normalizeComponentDefinition = (
  definition: Partial<ComponentDefinition>,
  context: string
): ComponentDefinition => {
  const importPath = normalizeNonEmptyString(
    definition.importPath ?? definition.pageFile,
    `${context}.importPath`
  );
  const importName = normalizeNonEmptyString(
    definition.importName ?? definition.exportName,
    `${context}.importName`
  );
  const pageFile = normalizeNonEmptyString(
    definition.pageFile ?? importPath,
    `${context}.pageFile`
  );
  const exportName = normalizeNonEmptyString(
    definition.exportName ?? importName,
    `${context}.exportName`
  );
  return {
    pageFile,
    exportName,
    importPath,
    importName,
    props: normalizePropsRecord(definition.props, `${context}.props`),
  };
};

const getRenderStatePayload = (): RendererStatePayload => ({
  renders: [...runtimeState.entriesById.values()].map((entry) => ({
    renderId: entry.renderId,
    importName: entry.definition.importName,
    importPath: entry.definition.importPath,
    props: entry.definition.props,
    width: entry.width,
    height: entry.height,
    intrinsicSize: entry.intrinsicSize,
    status: entry.status,
  })),
  maxCached: runtimeState.maxCached,
});

const pruneCachedRenders = (): void => {
  const cachedEntries = [...runtimeState.entriesById.values()]
    .filter((entry) => entry.status === "cached")
    .sort((left, right) => {
      if (left.lastInactiveAt === right.lastInactiveAt) {
        return left.renderId.localeCompare(right.renderId);
      }
      return left.lastInactiveAt - right.lastInactiveAt;
    });

  const overage = cachedEntries.length - runtimeState.maxCached;
  if (overage <= 0) {
    return;
  }

  for (const entry of cachedEntries.slice(0, overage)) {
    runtimeState.entriesById.delete(entry.renderId);
  }
};

const applySlotStyles = (renderId: string, entry: StoredRenderEntry): void => {
  if (typeof document === "undefined") return;
  const el = document.querySelector(
    `[data-render-id="${renderId}"]`
  ) as HTMLElement | null;
  if (!el) return;

  const isActive = entry.status === "active";
  el.style.visibility = isActive ? "visible" : "hidden";
  el.style.zIndex = isActive ? "2" : "1";
  el.style.pointerEvents = isActive ? "auto" : "none";
  if (entry.intrinsicSize) {
    // Shrink-to-content slot — the caller wants to measure the rendered
    // component's natural size, so neither the outer nor inner wrapper
    // can force a size on the user's root element.
    el.style.width = "max-content";
    el.style.height = "max-content";
    el.style.overflow = "visible";
    const inner = el.querySelector(`[data-render-content="${renderId}"]`) as HTMLElement | null;
    if (inner) {
      inner.style.width = "max-content";
      inner.style.height = "max-content";
    }
  } else {
    el.style.width = entry.width != null ? entry.width + "px" : "100%";
    el.style.height = entry.height != null ? entry.height + "px" : "100%";
    el.style.overflow = (entry.width != null || entry.height != null) ? "hidden" : "visible";
    const inner = el.querySelector(`[data-render-content="${renderId}"]`) as HTMLElement | null;
    if (inner) {
      inner.style.width = "100%";
      inner.style.height = "100%";
    }
  }
  el.setAttribute("data-render-status", entry.status);
};

export const startRendering = (command: StartRenderingCommand): void => {
  const renderId = normalizeNonEmptyString(command.renderId, "renderId");
  const definition = normalizeComponentDefinition(command, "render");
  const width = normalizeOptionalFrameDimension(command.width, "render.width");
  const height = normalizeOptionalFrameDimension(command.height, "render.height");
  const intrinsicSize = command.intrinsicSize === true;
  const hadFailure = renderFailureMessages.has(renderId);
  renderFailureMessages.delete(renderId);

  const existingEntry = runtimeState.entriesById.get(renderId);
  if (existingEntry) {
    existingEntry.definition = definition;
    existingEntry.width = width;
    existingEntry.height = height;
    existingEntry.intrinsicSize = intrinsicSize ? true : undefined;
    existingEntry.status = "active";
    existingEntry.lastInactiveAt = 0;
    if (hadFailure) {
      existingEntry.errorEpoch += 1;
    }
  } else {
    runtimeState.entriesById.set(renderId, {
      renderId,
      definition,
      width,
      height,
      intrinsicSize: intrinsicSize ? true : undefined,
      status: "active",
      lastInactiveAt: 0,
      errorEpoch: 0,
    });
  }

  notifyRuntimeStateChanged();

  const entry = runtimeState.entriesById.get(renderId);
  if (entry) applySlotStyles(renderId, entry);
};

export const stopRendering = (command: StopRenderingCommand): void => {
  const renderId = normalizeNonEmptyString(command.renderId, "renderId");
  renderFailureMessages.delete(renderId);
  const existingEntry = runtimeState.entriesById.get(renderId);
  if (!existingEntry) {
    return;
  }

  if (existingEntry.status === "cached") {
    return;
  }

  existingEntry.status = "cached";
  existingEntry.lastInactiveAt = Date.now();
  pruneCachedRenders();
  notifyRuntimeStateChanged();
  applySlotStyles(renderId, existingEntry);
};

const removeRenderingById = (renderId: string): void => {
  renderFailureMessages.delete(renderId);
  if (!runtimeState.entriesById.has(renderId)) {
    return;
  }
  runtimeState.entriesById.delete(renderId);
  notifyRuntimeStateChanged();
};

export const setCacheLimit = (command: SetCacheLimitCommand): void => {
  const maxCached = command.maxCached;
  if (!Number.isInteger(maxCached) || maxCached < 0) {
    throw new Error("maxCached must be a non-negative integer");
  }

  runtimeState.maxCached = maxCached;
  pruneCachedRenders();
  notifyRuntimeStateChanged();
};

type PendingRenderAck = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  cleanup?: () => void;
};

const pendingRenderAcks = new Map<string, PendingRenderAck>();
const renderFailureMessages = new Map<string, string>();

// Watchdog state — most-recent successful (non-error) commit timestamps
// per renderId and host-wide. Read by the queryHealth command handler so
// the renderer-side error-clear watchdog can prove a stuck error pill is
// stale. trippedRenderIds tracks which RenderErrorBoundary instances are
// currently caught (added on componentDidCatch, removed on unmount).
let lastHostRenderCommitAt: number | null = null;
const lastClaimRenderCommitAt = new Map<string, number>();
const trippedRenderIds = new Set<string>();

const noteSuccessfulRenderCommit = (renderId: string): void => {
  const now = Date.now();
  lastClaimRenderCommitAt.set(renderId, now);
  lastHostRenderCommitAt = now;
  // Host-wide fast-clear: if no boundary is tripped and no Vite overlay is
  // up, vouch for the host. The receiving slot's maxProblemTimestamp guard
  // preserves any error newer than (now - 250ms).
  if (
    trippedRenderIds.size === 0 &&
    typeof document !== "undefined" &&
    document.querySelector("vite-error-overlay") == null
  ) {
    postRecovery(null, now - 250);
  }
};

const toFailurePayload = (errorDetails: RuntimeProblemDetails): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    sourceKind: "page-error",
    message: errorDetails.message,
  };

  if (errorDetails.stack) payload.stack = errorDetails.stack;
  if (errorDetails.componentStack) payload.componentStack = errorDetails.componentStack;

  if (errorDetails.location) {
    if (errorDetails.location.file) payload.filename = errorDetails.location.file;
    if (errorDetails.location.line != null) payload.line = errorDetails.location.line;
    if (errorDetails.location.column != null) payload.column = errorDetails.location.column;
  }

  return payload;
};

const postFailure = (renderId: string | null, errorDetails: RuntimeProblemDetails): void => {
  if (typeof window === "undefined" || typeof window.postMessage !== "function") {
    return;
  }
  window.postMessage(
    {
      type: renderPoolFailureMessageType,
      renderId,
      failure: toFailurePayload(errorDetails),
    },
    "*"
  );
};

const postRecovery = (renderId: string | null, maxProblemTimestamp?: number): void => {
  if (typeof window === "undefined" || typeof window.postMessage !== "function") {
    return;
  }
  const payload: { type: string; renderId: string | null; maxProblemTimestamp?: number } = {
    type: renderPoolRecoveryMessageType,
    renderId,
  };
  if (typeof maxProblemTimestamp === "number") {
    payload.maxProblemTimestamp = maxProblemTimestamp;
  }
  window.postMessage(payload, "*");
};

// Recover from transient Vite module errors after HMR. When a module fails
// to load during HMR (e.g. file saved mid-write), the error boundary catches
// it and the errorDetails gets stuck. Listening for vite:afterUpdate lets us
// retry once the module is available again.
const setupHmrRecovery = (): void => {
  try {
    const hot = (import.meta as { hot?: { on: (name: string, cb: () => void) => void } }).hot;
    if (!hot || typeof hot.on !== "function") {
      return;
    }

    let lastHmrUpdateStartedAt = 0;
    hot.on("vite:beforeUpdate", () => {
      lastHmrUpdateStartedAt = Date.now();
    });
    hot.on("vite:afterUpdate", () => {
      const recoveryCutoff = lastHmrUpdateStartedAt || Date.now();
      window.setTimeout(() => postRecovery(null, recoveryCutoff), 250);
      const failedRenderIds = [...renderFailureMessages.keys()];
      if (failedRenderIds.length === 0) return;

      for (const renderId of failedRenderIds) {
        renderFailureMessages.delete(renderId);
        const entry = runtimeState.entriesById.get(renderId);
        if (entry) {
          if (isCanvasLoadErrorModule(canvasModules[entry.definition.importPath])) {
            delete canvasModules[entry.definition.importPath];
          }
          canvasModuleLoadPromises.delete(entry.definition.importPath);
          invalidateLazyCacheForFile(entry.definition.importPath);
          // Bump errorEpoch to remount the RenderErrorBoundary, which
          // clears the caught error state and retries the component render.
          entry.errorEpoch += 1;
        }
      }
      notifyRuntimeStateChanged();
    });
  } catch {
    // HMR not available
  }
};

const waitForRendererPaint = (): Promise<void> =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });

const resolvePendingAck = (renderId: string): void => {
  const pending = pendingRenderAcks.get(renderId);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  pending.cleanup?.();
  pendingRenderAcks.delete(renderId);
  waitForRendererPaint().then(() => pending.resolve());
};

const moduleLoadErrorMarkers = [
  "was not found in module",
  "does not provide an export",
  "Failed to fetch dynamically imported module",
  "is not imported in the component renderer",
  "was not found in canvas file",
  "Failed to reload",
];

const safeErrorToString = (error: unknown): string => {
  try {
    return String(error);
  } catch {
    try {
      return Object.prototype.toString.call(error);
    } catch {
      return "Unknown error";
    }
  }
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : safeErrorToString(error);

const noteRenderFailure = (renderId: string, error: unknown): void => {
  renderFailureMessages.set(renderId, toErrorMessage(error));
};

const classifyRenderProblem = (error: unknown): ProblemKind => {
  const message = toErrorMessage(error);
  if (moduleLoadErrorMarkers.some((marker) => message.includes(marker))) {
    return "module-load";
  }
  return "runtime";
};


const waitForRenderReady = (renderId: string, componentKey: string, timeoutMs: number): Promise<void> => {
  const isRenderMarkedReady = (): boolean => {
    const existing = document.querySelector(
      `[data-render-id="${renderId}"]`
    ) as HTMLElement | null;
    return Boolean(existing?.querySelector(`[data-rendered="${componentKey}"]`));
  };

  if (isRenderMarkedReady()) {
    return Promise.resolve();
  }

  const previousPending = pendingRenderAcks.get(renderId);
  if (previousPending) {
    clearTimeout(previousPending.timeoutId);
    previousPending.cleanup?.();
    pendingRenderAcks.delete(renderId);
    previousPending.reject(new Error("Superseded by a newer render command"));
  }

  return new Promise<void>((resolve, reject) => {
    let observer: MutationObserver | null = null;

    const cleanupObserver = (): void => {
      if (!observer) {
        return;
      }
      observer.disconnect();
      observer = null;
    };

    const resolveWithCleanup = (): void => {
      cleanupObserver();
      resolve();
    };

    const rejectWithCleanup = (error: Error): void => {
      cleanupObserver();
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      pendingRenderAcks.delete(renderId);
      const pendingFailure = renderFailureMessages.get(renderId);
      const failureContext = pendingFailure ? `; last error: ${pendingFailure}` : "";
      const timeoutMessage = `Component render timed out after ${timeoutMs}ms${failureContext}`;

      console.warn("[component-render-runtime] render ready timeout", {
        renderId,
        timeoutMs,
        timeoutMessage,
      });

      rejectWithCleanup(new Error(
        `waitForRenderReady timed out after ${timeoutMs}ms for renderId "${renderId}"${failureContext}`
      ));
    }, timeoutMs);

    pendingRenderAcks.set(renderId, {
      resolve: resolveWithCleanup,
      reject: rejectWithCleanup,
      timeoutId,
      cleanup: cleanupObserver,
    });

    observer = new MutationObserver(() => {
      if (isRenderMarkedReady()) {
        resolvePendingAck(renderId);
        return;
      }
    });

    const observeTarget = document.documentElement ?? document.body;
    if (observeTarget) {
      observer.observe(observeTarget, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }

    if (isRenderMarkedReady()) {
      resolvePendingAck(renderId);
      return;
    }
  });
};

export const listRenders = (): RenderSummary[] =>
  [...runtimeState.entriesById.values()].map((entry) => ({
    renderId: entry.renderId,
    importName: entry.definition.importName,
    importPath: entry.definition.importPath,
    props: entry.definition.props,
    width: entry.width,
    height: entry.height,
    intrinsicSize: entry.intrinsicSize,
    status: entry.status,
  }));

const getLazyComponent = (
  definition: ComponentDefinition
): React.LazyExoticComponent<React.ComponentType<Record<string, unknown>>> => {
  const componentKey = getComponentDefinitionKey(
    definition.importPath,
    definition.importName
  );
  const existing = lazyComponentCache.get(componentKey);
  if (existing) {
    return existing;
  }

  const bakedInLoader = bakedInComponentLoaders[componentKey];
  const lazyComponent = lazy(
    bakedInLoader
      ? bakedInLoader
      : async () => {
          const canvasModule = await waitForCanvasModule(
            definition.importPath,
          );
          const rawExport = canvasModule[definition.importName];
          if (typeof rawExport === "undefined") {
            throw new Error(
              `Export "${definition.importName}" was not found in canvas file "${definition.importPath}"`
            );
          }
          return {
            default: resolveRenderableComponent(
              rawExport,
              definition.importName,
            ),
          };
        },
  );
  lazyComponentCache.set(componentKey, lazyComponent);
  return lazyComponent;
};

const INTERNAL_COMPONENT_STACK_MARKERS = [
  "at Lazy (<anonymous>)",
  "at Suspense (<anonymous>)",
  "at RenderErrorBoundary",
  "at RenderSlot",
  "at ComponentRendererHost",
  "render-pool-runtime.tsx",
  "at div (<anonymous>)",
];

const MAX_DISPLAY_PATH_LENGTH = 92;
const DISPLAY_PATH_HEAD_LENGTH = 56;
const DISPLAY_PATH_TAIL_LENGTH = 32;

const problemBadgeLabel: Record<ProblemKind, string> = {
  runtime: "Runtime error",
  "module-load": "Module load",
  crash: "Frame crash",
  "frame-load": "Frame load",
  "route-load": "Route load",
  timeout: "Timeout",
};

const problemStyleMeta: Record<
  ProblemKind,
  { badgeBackground: string; badgeText: string; borderColor: string }
> = {
  runtime: {
    badgeBackground: "#fb923c",
    badgeText: "#18181b",
    borderColor: "rgba(234, 88, 12, 0.48)",
  },
  "module-load": {
    badgeBackground: "#facc15",
    badgeText: "#18181b",
    borderColor: "rgba(202, 138, 4, 0.56)",
  },
  crash: {
    badgeBackground: "#f87171",
    badgeText: "#111827",
    borderColor: "rgba(220, 38, 38, 0.52)",
  },
  "frame-load": {
    badgeBackground: "#f87171",
    badgeText: "#111827",
    borderColor: "rgba(220, 38, 38, 0.52)",
  },
  "route-load": {
    badgeBackground: "#22d3ee",
    badgeText: "#0f172a",
    borderColor: "rgba(8, 145, 178, 0.5)",
  },
  timeout: {
    badgeBackground: "#a78bfa",
    badgeText: "#111827",
    borderColor: "rgba(99, 102, 241, 0.5)",
  },
};

const normalizePathSeparators = (value: string): string => value.replace(/\\/g, "/");

const stripFsPrefix = (value: string): string =>
  value
    .replace(/^https?:\/\/[^/\s]+\/@fs\//, "/")
    .replace(/^\/@fs\//, "/");

const extractRelativePath = (value: string): string => {
  const normalized = stripFsPrefix(normalizePathSeparators(value));
  const markers = ["/tempo-monorepo/", "/annotated/"];
  for (const marker of markers) {
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) {
      return normalized.slice(markerIndex + marker.length);
    }
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 6) {
    return normalized.replace(/^\/+/, "");
  }
  return `.../${segments.slice(-6).join("/")}`;
};

const collapseMiddle = (value: string): string => {
  if (value.length <= MAX_DISPLAY_PATH_LENGTH) {
    return value;
  }
  return `${value.slice(0, DISPLAY_PATH_HEAD_LENGTH)}...${value.slice(-DISPLAY_PATH_TAIL_LENGTH)}`;
};

const toDisplayPath = (value: string): string => collapseMiddle(extractRelativePath(value));

const splitNonEmptyLines = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
};

const toComparableLine = (line: string): string =>
  line
    .replace(/^[A-Za-z]*Error:\s*/i, "")
    .replace(/^\s*at\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isInternalComponentStackLine = (line: string): boolean => {
  const normalized = line.trim();
  return INTERNAL_COMPONENT_STACK_MARKERS.some((marker) => normalized.includes(marker));
};

const dedupeLines = (
  lines: string[],
  seen: Set<string>,
  options?: { dropInternalComponentFrames?: boolean }
): string[] => {
  const output: string[] = [];
  for (const line of lines) {
    if (options?.dropInternalComponentFrames && isInternalComponentStackLine(line)) {
      continue;
    }
    const comparable = toComparableLine(line);
    if (!comparable || seen.has(comparable)) {
      continue;
    }
    seen.add(comparable);
    output.push(line);
  }
  return output;
};

const toLocationLabel = (
  path: string,
  line: number | undefined,
  column: number | undefined
): string => {
  if (line != null && column != null) {
    return `${path}:${line}:${column}`;
  }
  if (line != null) {
    return `${path}:${line}`;
  }
  return path;
};

const isLocationEquivalent = (candidate: string, locationLabel: string): boolean => {
  const comparableCandidate = toComparableLine(candidate);
  const comparableLocation = toComparableLine(locationLabel);
  if (!comparableCandidate || !comparableLocation) {
    return false;
  }
  return (
    comparableCandidate === comparableLocation ||
    comparableCandidate.includes(comparableLocation) ||
    comparableLocation.includes(comparableCandidate)
  );
};

const toErrorHeadline = (errorDetails: RuntimeProblemDetails): string => {
  if (errorDetails.kind === "module-load") {
    const missingExport = errorDetails.message.match(/export named ['\"]([^'\"]+)['\"]/i);
    if (missingExport?.[1]) {
      return `Missing export: ${missingExport[1]}`;
    }
    if (/failed to fetch dynamically imported module/i.test(errorDetails.message)) {
      return "Dynamic import failed";
    }
    return "Module failed to load";
  }
  if (errorDetails.kind === "timeout") {
    return "Render timed out";
  }
  if (errorDetails.kind === "crash") {
    return "Frame renderer process crashed";
  }
  return "Component render crashed";
};

const toErrorSource = (errorDetails: RuntimeProblemDetails): string => {
  if (errorDetails.plugin?.toLowerCase().includes("vite")) {
    return "vite";
  }
  return "react";
};

const pluginAlreadyRepresented = (plugin: string, lines: readonly string[]): boolean => {
  const comparablePlugin = toComparableLine(plugin);
  if (!comparablePlugin) {
    return false;
  }
  return lines.some((line) => toComparableLine(line).includes(comparablePlugin));
};

type InternalWrapperDataProps = Partial<Record<`data-${string}`, unknown>>;

type RenderErrorDisplayProps = {
  errorDetails: RuntimeProblemDetails;
} & InternalWrapperDataProps;

const RenderErrorDisplay = ({ errorDetails, ...dataProps }: RenderErrorDisplayProps): React.ReactNode => {
  const seen = new Set<string>();
  const messageLines = dedupeLines(splitNonEmptyLines(errorDetails.message), seen);
  const locationLabel =
    errorDetails.location?.file != null
      ? toLocationLabel(
          toDisplayPath(errorDetails.location.file),
          errorDetails.location.line,
          errorDetails.location.column
        )
      : null;
  const rawFrameLines = splitNonEmptyLines(errorDetails.frame);
  const frameLines = dedupeLines(
    locationLabel && rawFrameLines.length > 0 && isLocationEquivalent(rawFrameLines[0], locationLabel)
      ? rawFrameLines.slice(1)
      : rawFrameLines,
    seen
  );
  const stackLines = dedupeLines(splitNonEmptyLines(errorDetails.stack), seen);
  const componentStackLines = dedupeLines(
    splitNonEmptyLines(errorDetails.componentStack),
    seen,
    { dropInternalComponentFrames: true }
  );
  const pluginLabel =
    errorDetails.plugin &&
    !pluginAlreadyRepresented(errorDetails.plugin, [
      ...messageLines,
      ...frameLines,
      ...stackLines,
      ...componentStackLines,
      ...(locationLabel ? [locationLabel] : []),
    ])
      ? errorDetails.plugin
      : null;
  const styleMeta = problemStyleMeta[errorDetails.kind] ?? problemStyleMeta.runtime;
  const showSourceFrame = frameLines.length > 0;
  const showStack = stackLines.length > 0;
  const showComponentStack = componentStackLines.length > 0;

  return (
    <div
      {...dataProps}
      data-render-error="true"
      data-render-error-kind={errorDetails.kind}
      data-render-error-source={toErrorSource(errorDetails)}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 120,
        boxSizing: "border-box",
        overflow: "hidden",
        padding: 18,
        border: `1px solid ${styleMeta.borderColor}`,
        background: "linear-gradient(145deg, #11131a 0%, #0b0f1a 56%, #090d16 100%)",
        color: "#f4f4f5",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
        pointerEvents: "none",
      }}
     data-tempo-hide-fiber={true}>
      <div
        style={{
          width: "100%",
          height: "100%",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
       data-tempo-hide-fiber={true}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
         data-tempo-hide-fiber={true}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }} data-tempo-hide-fiber={true}>
            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                borderRadius: 9999,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                background: styleMeta.badgeBackground,
                color: styleMeta.badgeText,
              }}
             data-tempo-hide-fiber={true}>
              {problemBadgeLabel[errorDetails.kind] ?? problemBadgeLabel.runtime}
            </div>
            <div
              style={{
                fontSize: 22,
                lineHeight: 1.2,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: "#fafafa",
              }}
             data-tempo-hide-fiber={true}>
              {toErrorHeadline(errorDetails)}
            </div>
          </div>
          {pluginLabel ? (
            <div
              style={{
                alignSelf: "flex-start",
                color: "#d4d4d8",
                fontSize: 11,
                border: "1px solid rgba(113, 113, 122, 0.45)",
                borderRadius: 9999,
                padding: "6px 10px",
                background: "rgba(39, 39, 42, 0.72)",
                whiteSpace: "nowrap",
              }}
             data-tempo-hide-fiber={true}>
              {`Plugin: ${pluginLabel}`}
            </div>
          ) : null}
        </div>

        {locationLabel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }} data-tempo-hide-fiber={true}>
            <span style={{ color: "#a1a1aa" }} data-tempo-hide-fiber={true}>Source</span>
            <code
              title={locationLabel}
              style={{
                color: "#fde68a",
                background: "rgba(82, 82, 91, 0.26)",
                border: "1px solid rgba(113, 113, 122, 0.45)",
                borderRadius: 6,
                padding: "2px 6px",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
             data-tempo-hide-fiber={true}>
              {locationLabel}
            </code>
          </div>
        ) : null}

        {messageLines.length > 0 ? (
          <section data-tempo-hide-fiber={true}>
            <div style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 6 }} data-tempo-hide-fiber={true}>Message</div>
            <pre
              style={{
                margin: 0,
                maxHeight: 180,
                overflow: "auto",
                padding: 10,
                background: "rgba(9, 9, 11, 0.5)",
                border: "1px solid rgba(82, 82, 91, 0.45)",
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
             data-tempo-hide-fiber={true}>
              {messageLines.join("\n")}
            </pre>
          </section>
        ) : null}

        {showSourceFrame ? (
          <section data-tempo-hide-fiber={true}>
            <div style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 6 }} data-tempo-hide-fiber={true}>Source Frame</div>
            <pre
              style={{
                margin: 0,
                maxHeight: 260,
                overflow: "auto",
                padding: 10,
                background: "rgba(4, 4, 5, 0.6)",
                border: "1px solid rgba(82, 82, 91, 0.5)",
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.45,
                whiteSpace: "pre",
              }}
             data-tempo-hide-fiber={true}>
              {frameLines.join("\n")}
            </pre>
          </section>
        ) : null}

        {showStack ? (
          <section data-tempo-hide-fiber={true}>
            <div style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 6 }} data-tempo-hide-fiber={true}>Stack Trace</div>
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                padding: 10,
                background: "rgba(9, 9, 11, 0.45)",
                border: "1px solid rgba(82, 82, 91, 0.42)",
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.4,
                color: "#d4d4d8",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
             data-tempo-hide-fiber={true}>
              {stackLines.join("\n")}
            </pre>
          </section>
        ) : null}

        {showComponentStack ? (
          <section data-tempo-hide-fiber={true}>
            <div style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 6 }} data-tempo-hide-fiber={true}>Component Stack</div>
            <pre
              style={{
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                padding: 10,
                background: "rgba(9, 9, 11, 0.45)",
                border: "1px solid rgba(82, 82, 91, 0.42)",
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.4,
                color: "#d4d4d8",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
             data-tempo-hide-fiber={true}>
              {componentStackLines.join("\n")}
            </pre>
          </section>
        ) : null}
      </div>
    </div>
  );
};

type RenderErrorBoundaryProps = {
  renderId: string;
  children: React.ReactNode;
} & InternalWrapperDataProps;

type RenderReadySentinelProps = {
  renderId: string;
  componentKey: string;
} & InternalWrapperDataProps;

class RenderErrorBoundary extends React.Component<
  RenderErrorBoundaryProps,
  { errorDetails: RuntimeProblemDetails | null }
> {
  constructor(props: RenderErrorBoundaryProps) {
    super(props);
    this.state = { errorDetails: null };
  }

  static getDerivedStateFromError(error: unknown): { errorDetails: RuntimeProblemDetails } {
    return {
      errorDetails: {
        kind: classifyRenderProblem(error),
        message: toErrorMessage(error),
        timestamp: Date.now(),
      },
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    const normalizedError =
      error instanceof Error ? error : new Error(toErrorMessage(error));

    const errorDetails: RuntimeProblemDetails = {
      kind: classifyRenderProblem(error),
      message: toErrorMessage(error),
      stack: normalizedError.stack,
      componentStack:
        typeof errorInfo.componentStack === "string"
          ? errorInfo.componentStack
          : undefined,
      timestamp: Date.now(),
    };

    trippedRenderIds.add(this.props.renderId);
    noteRenderFailure(this.props.renderId, normalizedError);
    postFailure(this.props.renderId, errorDetails);
    this.setState({ errorDetails });
  }

  componentWillUnmount(): void {
    // Boundary unmounts on errorEpoch bump (HMR remount) or claim release.
    // Either way the caught state no longer reflects a current problem.
    trippedRenderIds.delete(this.props.renderId);
  }

  render(): React.ReactNode {
    if (this.state.errorDetails) {
      const { children: _children, renderId: _renderId, ...dataProps } = this.props;
      return <RenderErrorDisplay errorDetails={this.state.errorDetails} {...dataProps} data-tempo-hide-fiber={true} />;
    }

    return this.props.children;
  }
}

const RenderReadySentinel = ({ renderId, componentKey }: RenderReadySentinelProps): null => {
  useLayoutEffect(() => {
    // console.log("[TELEMETRY][renderer] RenderReadySentinel fired for " + renderId + " +" + (Date.now() - _rendererLoadT0) + "ms");
    const hadFailure = renderFailureMessages.has(renderId);
    resolvePendingAck(renderId);
    if (!hadFailure) {
      noteSuccessfulRenderCommit(renderId);
      postRecovery(renderId);
    }
  }, [renderId, componentKey]);
  return null;
};

const RenderSlot = ({ entry }: { entry: StoredRenderEntry }): React.ReactNode => {
  const Component = getLazyComponent(entry.definition);
  const componentKey = getComponentDefinitionKey(
    entry.definition.importPath,
    entry.definition.importName
  );
  const slotElementRef = useRef<HTMLDivElement | null>(null);
  const isActive = entry.status === "active";
  const visibility = isActive ? "visible" : "hidden";
  const zIndex = isActive ? 2 : 1;

  useEffect(() => {
    const slotElement = slotElementRef.current;
    if (!slotElement) {
      return;
    }

    const unregisterPortalWatcher = getPortalTracker().register({
      element: slotElement,
      onPortalFound: (portalRoot) => {
        trackRenderPortal(entry.renderId, portalRoot);
      },
      onPortalRemoved: (portalRoot) => {
        untrackRenderPortal(entry.renderId, portalRoot);
      },
    });

    syncRenderPortals(entry.renderId);

    return () => {
      unregisterPortalWatcher();
      releaseRenderPortals(entry.renderId);
    };
  }, [entry.renderId]);

  useEffect(() => {
    syncRenderPortals(entry.renderId);
  }, [entry.renderId, entry.status]);

  const intrinsic = entry.intrinsicSize === true;
  const slotWidth = intrinsic ? "max-content" : (entry.width ?? "100vw");
  const slotHeight = intrinsic ? "max-content" : (entry.height ?? "100vh");
  const slotOverflow = intrinsic
    ? "visible"
    : (entry.width != null || entry.height != null ? "hidden" : "visible");
  const innerWidth = intrinsic ? "max-content" : "100%";
  const innerHeight = intrinsic ? "max-content" : "100%";
  return (
    <div
      key={entry.renderId}
      ref={slotElementRef}
      data-render-id={entry.renderId}
      data-render-status={entry.status}
      data-component-key={componentKey}
      style={{
        display: "inline-block",
        position: "absolute",
        left: 0,
        top: 0,
        background: "transparent",
        width: slotWidth,
        height: slotHeight,
        overflow: slotOverflow,
        visibility,
        zIndex,
        pointerEvents: isActive ? "auto" : "none",
      }}
     data-tempo-hide-fiber={true}>
      <div data-render-content={entry.renderId} style={{ width: innerWidth, height: innerHeight }} data-tempo-hide-fiber={true}>
        <Suspense fallback={null} data-tempo-hide-fiber={true}>
          <RenderErrorBoundary key={`${entry.renderId}:${entry.errorEpoch}`} renderId={entry.renderId} data-tempo-hide-fiber={true}>
            <Component {...(entry.definition.props ?? {})} data-tempo-hide-fiber={true} />
          </RenderErrorBoundary>
          <RenderReadySentinel
            renderId={entry.renderId}
            componentKey={componentKey} data-tempo-hide-fiber={true}
          />
          <span data-rendered={componentKey} style={{ display: "none" }} data-tempo-hide-fiber={true} />
        </Suspense>
      </div>
    </div>
  );
};

const ComponentRendererHost = (): React.ReactNode => {
  const snapshot = useSyncExternalStore(
    subscribeRuntimeState,
    getRuntimeSnapshot,
    getRuntimeSnapshot
  );

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) {
      return;
    }

    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    const previousHtmlBackground = htmlElement.style.background;
    const previousBodyBackground = bodyElement.style.background;
    const previousBodyBackgroundColor = bodyElement.style.backgroundColor;

    htmlElement.style.background = "transparent";
    bodyElement.style.background = "transparent";
    bodyElement.style.backgroundColor = "transparent";

    return () => {
      htmlElement.style.background = previousHtmlBackground;
      bodyElement.style.background = previousBodyBackground;
      bodyElement.style.backgroundColor = previousBodyBackgroundColor;
    };
  }, []);

  return (
    <div
      data-render-host
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "visible",
        background: "transparent",
      }}
     data-tempo-hide-fiber={true}>
      {snapshot.entries.map((entry) => (
        <RenderSlot key={entry.renderId} entry={entry} data-tempo-hide-fiber={true} />
      ))}
    </div>
  );
};

const postMessageToSource = (
  event: MessageEvent<unknown>,
  message: Record<string, unknown>
): void => {
  const source = event.source;
  if (!source) {
    if (typeof window !== "undefined" && typeof window.postMessage === "function") {
      window.postMessage(message, "*");
    }
    return;
  }

  if (typeof Window !== "undefined" && source instanceof Window) {
    source.postMessage(message, "*");
    return;
  }

  if ("postMessage" in source && typeof source.postMessage === "function") {
    source.postMessage(message);
  }
};

const postAck = (
  event: MessageEvent<unknown>,
  command: string,
  requestId: RequestId
): void => {
  postMessageToSource(event, {
    type: renderPoolAckMessageType,
    command,
    requestId,
    payload: getRenderStatePayload(),
  });
};

const postError = (
  event: MessageEvent<unknown>,
  command: string,
  requestId: RequestId,
  error: unknown
): void => {
  postMessageToSource(event, {
    type: renderPoolErrorMessageType,
    command,
    requestId,
    error: toErrorMessage(error),
  });
};

const postState = (event: MessageEvent<unknown>, requestId: RequestId): void => {
  postMessageToSource(event, {
    type: renderPoolStateMessageType,
    requestId,
    payload: getRenderStatePayload(),
  });
};

const buildHealthSnapshot = (renderId: string): {
  alive: boolean;
  reactConnected: boolean;
  documentReadyState: DocumentReadyState;
  hasViteOverlayElement: boolean;
  lastHostRenderCommitAt: number | null;
  lastClaimRenderCommitAt: number | null;
  claimErrorBoundaryTripped: boolean;
  observedAt: number;
} => {
  const hook = (window as unknown as {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: { renderers?: { size?: number } };
  }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const renderers = hook?.renderers;
  const reactConnected = !!renderers && typeof renderers.size === "number" && renderers.size > 0;

  return {
    alive: true,
    reactConnected,
    documentReadyState: document.readyState,
    hasViteOverlayElement: document.querySelector("vite-error-overlay") != null,
    lastHostRenderCommitAt,
    lastClaimRenderCommitAt: renderId
      ? lastClaimRenderCommitAt.get(renderId) ?? null
      : null,
    claimErrorBoundaryTripped: renderId ? trippedRenderIds.has(renderId) : false,
    observedAt: Date.now(),
  };
};

const postHealthSnapshot = (
  event: MessageEvent<unknown>,
  requestId: RequestId,
  renderId: string
): void => {
  postMessageToSource(event, {
    type: renderPoolHealthSnapshotMessageType,
    requestId,
    snapshot: buildHealthSnapshot(renderId),
  });
};

const readRequestId = (value: unknown): RequestId =>
  typeof value === "string" || typeof value === "number"
    ? value
    : undefined;

const readPayloadRecord = (
  value: unknown,
  command: string
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${command} payload must be an object`);
  }
  return value;
};

const onCommandMessage = (event: MessageEvent<unknown>): void => {
  const message = event.data;
  if (!isRecord(message) || typeof message.type !== "string") {
    return;
  }

  const requestId = readRequestId(message.requestId);

  if (message.type === renderPoolRenderCommandType) {
    const _renderCmdT0 = Date.now();
    const payload = readPayloadRecord(message.payload, renderPoolRenderCommandType);
    const command = payload as unknown as StartRenderingCommand;
    const normalizedCommand = {
      ...command,
      importPath: command.importPath ?? command.page_file,
      importName: command.importName ?? command.export_name,
      pageFile: command.page_file ?? command.importPath,
      exportName: command.export_name ?? command.importName,
    };
    const renderId = (command.renderId ?? "").trim();
    // console.log("[TELEMETRY][renderer] render command received for " + renderId + " (" + (normalizedCommand.pageFile ?? "") + "#" + (normalizedCommand.exportName ?? "") + ")");
    try {
      startRendering(normalizedCommand);
    } catch (error) {
      postError(event, renderPoolRenderCommandType, requestId, error);
      return;
    }

    const timeoutMs = typeof command.renderReadyTimeoutMs === "number"
      ? command.renderReadyTimeoutMs
      : DEFAULT_RENDER_READY_TIMEOUT_MS;

    const componentKey = getComponentDefinitionKey(normalizedCommand.importPath ?? "", normalizedCommand.importName ?? "");
    waitForRenderReady(renderId, componentKey, timeoutMs).then(
      () => { postAck(event, renderPoolRenderCommandType, requestId); },
      (error) => { postError(event, renderPoolRenderCommandType, requestId, error); }
    );
    return;
  }

  if (message.type === renderPoolUnrenderCommandType) {
    try {
      const payload = readPayloadRecord(message.payload, renderPoolUnrenderCommandType);
      stopRendering(payload as unknown as StopRenderingCommand);
      postAck(event, renderPoolUnrenderCommandType, requestId);
    } catch (error) {
      postError(event, renderPoolUnrenderCommandType, requestId, error);
    }
    return;
  }

  if (message.type === renderPoolSetCacheLimitCommandType) {
    try {
      const payload = readPayloadRecord(message.payload, renderPoolSetCacheLimitCommandType);
      setCacheLimit(payload as unknown as SetCacheLimitCommand);
      postAck(event, renderPoolSetCacheLimitCommandType, requestId);
    } catch (error) {
      postError(event, renderPoolSetCacheLimitCommandType, requestId, error);
    }
    return;
  }

  if (message.type === renderPoolIsolateCommandType) {
    try {
      const payload = readPayloadRecord(message.payload, renderPoolIsolateCommandType);
      const renderId = typeof payload.renderId === "string" ? payload.renderId.trim() : "";

      const existing = document.querySelector("[data-render-isolation]");
      if (existing) existing.remove();

      if (renderId) {
        const style = document.createElement("style");
        style.setAttribute("data-render-isolation", "");
        const escapedId = CSS.escape(renderId);
        style.textContent = `[data-render-id]:not([data-render-id="${escapedId}"]) { opacity: 0 !important; pointer-events: none !important; }`;
        document.head.appendChild(style);
      }

      postAck(event, renderPoolIsolateCommandType, requestId);
    } catch (error) {
      postError(event, renderPoolIsolateCommandType, requestId, error);
    }
    return;
  }

  if (message.type === renderPoolListCommandType) {
    // console.log("[TELEMETRY][renderer] list command received +" + (Date.now() - _rendererLoadT0) + "ms");
    postState(event, requestId);
    return;
  }

  if (message.type === renderPoolQueryHealthCommandType) {
    try {
      const payload = readPayloadRecord(message.payload, renderPoolQueryHealthCommandType);
      const renderId = typeof payload.renderId === "string" ? payload.renderId.trim() : "";
      postHealthSnapshot(event, requestId, renderId);
    } catch (error) {
      postError(event, renderPoolQueryHealthCommandType, requestId, error);
    }
    return;
  }
};

let isMessageBridgeAttached = false;

const ensureMessageBridgeAttached = (): void => {
  if (isMessageBridgeAttached || typeof window === "undefined") {
    return;
  }

  window.addEventListener("message", onCommandMessage);
  window.addEventListener(
    renderPoolBridgeCommandEvent,
    ((event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      const message = customEvent.detail;
      if (!isRecord(message)) {
        return;
      }

      onCommandMessage({
        data: message,
        source: null,
      } as MessageEvent<unknown>);
    }) as EventListener
  );
  isMessageBridgeAttached = true;
};

const resolveDirectRenderCommandFromUrl = (): StartRenderingCommand | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const pageFile = params.get("pageFile")?.trim() ?? "";
  const exportName = params.get("exportName")?.trim() ?? "";
  const widthParam = params.get("width")?.trim();
  const heightParam = params.get("height")?.trim();
  const width = widthParam ? Number(widthParam) : undefined;
  const height = heightParam ? Number(heightParam) : undefined;
  if (pageFile && exportName) {
    return {
      renderId: "url",
      page_file: pageFile,
      export_name: exportName,
      importPath: pageFile,
      importName: exportName,
      width,
      height,
    };
  }

  const registryPath = params.get("path")?.trim() ?? "";
  if (!registryPath) {
    return null;
  }

  const namedExportMatch = registryPath.match(/^(.*\.[^/?#]+)\/([^/?#]+)$/);
  if (namedExportMatch) {
    return {
      renderId: "url",
      page_file: namedExportMatch[1],
      export_name: namedExportMatch[2],
      importPath: namedExportMatch[1],
      importName: namedExportMatch[2],
    };
  }

  return {
    renderId: "url",
    page_file: registryPath,
    export_name: "default",
    importPath: registryPath,
    importName: "default",
  };
};

const bootstrapDirectRenderFromUrl = (): void => {
  const directRenderCommand = resolveDirectRenderCommandFromUrl();
  if (!directRenderCommand) {
    return;
  }

  const runDirectRender = (): void => {
    try {
      // console.log("[TELEMETRY][renderer] direct URL render bootstrap", directRenderCommand);
      startRendering(directRenderCommand);
    } catch (error) {
      // console.error("[TELEMETRY][renderer] direct URL render bootstrap failed", error);
    }
  };

  if (typeof queueMicrotask === "function") {
    queueMicrotask(runDirectRender);
    return;
  }

  void Promise.resolve().then(runDirectRender);
};

ensureMessageBridgeAttached();
setupHmrRecovery();
// console.log("[TELEMETRY][renderer] message bridge attached +" + (Date.now() - _rendererLoadT0) + "ms");
bootstrapDirectRenderFromUrl();

// Expose healthcheck for debug overlay — probed via executeJavaScript from main process.
// Returns the registered component keys so the overlay can diagnose 'not registered' errors.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__renderPoolHost = {
    healthcheck: () => ({
      status: "ready",
      registeredCount: Object.keys(canvasModules).length,
      registeredComponents: Object.keys(canvasModules),
      bakedInComponentCount: Object.keys(bakedInComponentLoaders).length,
    }),
  };
}

// Signal readiness to the host. Deferred until reconcileCanvasImports
// runs at least once, because 'ready' must mean 'the canvas modules are
// registered and the runtime can serve render commands' — not just
// 'the runtime module loaded'. Firing ready at module-eval time was
// misleading: when the auto-generated component-registry fails to
// load (e.g. a canvas file has a broken import), this module still
// loads, ready still fired, and component-pool's clearIfRecovered
// would wipe the legitimate page-error as 'recovered'.
//
// reconcileCanvasImports({}) is the empty-canvases case; the registry
// always loads and always calls reconcileCanvasImports, so this fires
// on every successful host boot. If the registry fails to load, ready
// never fires, untilReady times out at the host, and the underlying
// page-error survives to be reported.
const markRendererReadyOnce = (): void => {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w.__renderPoolReadyDispatched) return;
  w.__renderPoolReadyDispatched = true;
  window.postMessage({ type: renderPoolReadyMessageType }, "*");
};

export default function Tempobook(): React.ReactNode {
  return <ComponentRendererHost data-tempo-hide-fiber={true} />;
}

// Safe to self-accept because all critical state (canvasModules,
// canvasModuleWaiters, lazyComponentCache) lives on window and
// survives re-evaluation. Without this, a content change would
// cascade to TempoHost causing a full remount.
if (typeof import.meta !== "undefined" && (import.meta as any).hot) {
  (import.meta as any).hot.accept();
}
