import type {
  FramerSiteSnapshot,
  ReaddyDiscoveredPage,
  ReaddyPageMigrationStatus,
  ReaddyProjectAnalysis,
  SourceType,
} from '@/types/readdyFramer';

const STORAGE_PREFIX = 'mps-readdy-framer-progress:';

export type SavedPageProgress = {
  migrationStatus: ReaddyPageMigrationStatus;
  jobId?: string | null;
  sectionCount?: number;
  framerPageNodeId?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  updatedAt?: string | null;
};

export type BackgroundPageState = {
  migrationStatus: ReaddyPageMigrationStatus;
  jobId?: string | null;
  sectionCount?: number;
  framerPageNodeId?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
};

export type ServerRunPageRecord = {
  pageId?: string;
  path?: string;
  status?: 'migrated' | 'failed' | string;
  jobId?: string | null;
  sectionCount?: number;
  framerPageNodeId?: string | null;
  lastSyncedAt?: string | null;
  error?: string | null;
};

export function normalizeFramerProjectKey(framerProjectUrl?: string | null): string {
  const trimmed = String(framerProjectUrl || '').trim();
  if (!trimmed) return 'unassigned';
  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const projectsIdx = segments.findIndex((seg) => seg.toLowerCase() === 'projects');
    const candidate =
      projectsIdx >= 0 && segments[projectsIdx + 1]
        ? segments[projectsIdx + 1]
        : segments[segments.length - 1] || trimmed;
    const dashMatch = candidate.match(/--([a-zA-Z0-9]+)$/);
    return (dashMatch ? dashMatch[1] : candidate).toLowerCase();
  } catch {
    const dashMatch = trimmed.match(/--([a-zA-Z0-9]+)\/?$/);
    if (dashMatch) return dashMatch[1].toLowerCase();
    return trimmed.replace(/\/+$/, '').toLowerCase() || 'unassigned';
  }
}

function progressStorageKey(projectKey: string, framerProjectUrl?: string | null): string {
  return `${STORAGE_PREFIX}${projectKey}::${normalizeFramerProjectKey(framerProjectUrl)}`;
}

export function loadSavedPageProgress(
  projectKey: string,
  framerProjectUrl?: string | null,
): Record<string, SavedPageProgress> {
  try {
    const raw = localStorage.getItem(progressStorageKey(projectKey, framerProjectUrl));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SavedPageProgress>;
  } catch {
    return {};
  }
}

export function savePageProgress(
  projectKey: string,
  pages: ReaddyDiscoveredPage[],
  framerProjectUrl?: string | null,
): void {
  try {
    const prev = loadSavedPageProgress(projectKey, framerProjectUrl);
    const now = new Date().toISOString();
    const map: Record<string, SavedPageProgress> = {};
    for (const page of pages) {
      const prevEntry = prev[page.id];
      if (page.migrationStatus === 'syncing') {
        if (prevEntry) {
          map[page.id] = prevEntry;
        }
        continue;
      }
      if (page.migrationStatus !== 'pending' || page.jobId) {
        const nextLastError = page.migrationStatus === 'failed' ? (page.lastError ?? null) : null;
        const unchanged =
          prevEntry &&
          prevEntry.migrationStatus === page.migrationStatus &&
          (prevEntry.jobId ?? null) === (page.jobId ?? null) &&
          (prevEntry.lastSyncedAt ?? null) === (page.lastSyncedAt ?? null) &&
          (prevEntry.lastError ?? null) === nextLastError;
        map[page.id] = {
          migrationStatus: page.migrationStatus,
          jobId: page.jobId,
          sectionCount: page.sectionCount,
          framerPageNodeId: page.framerPageNodeId,
          lastSyncedAt: page.lastSyncedAt,
          lastError: nextLastError,
          updatedAt: unchanged ? prevEntry.updatedAt : now,
        };
      }
    }
    localStorage.setItem(progressStorageKey(projectKey, framerProjectUrl), JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function patchSavedPageProgress(
  projectKey: string,
  pageId: string,
  patch: SavedPageProgress,
  framerProjectUrl?: string | null,
): void {
  try {
    const map = loadSavedPageProgress(projectKey, framerProjectUrl);
    const prev = map[pageId];
    const nextStatus = patch.migrationStatus ?? prev?.migrationStatus ?? 'pending';
    const nextLastError =
      nextStatus === 'migrated' || nextStatus === 'parsed'
        ? null
        : nextStatus === 'failed'
          ? (patch.lastError ?? prev?.lastError ?? null)
          : (patch.lastError ?? null);
    map[pageId] = {
      ...prev,
      ...patch,
      lastError: nextLastError,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    localStorage.setItem(progressStorageKey(projectKey, framerProjectUrl), JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function createInitialBackgroundPageStates(
  pages: Array<{ id: string }>,
): Record<string, BackgroundPageState> {
  const states: Record<string, BackgroundPageState> = {};
  for (const page of pages) {
    states[page.id] = { migrationStatus: 'pending' };
  }
  return states;
}

export function buildServerRunPageStates(params: {
  pages: Array<{ id: string; path: string }>;
  runStatus: string;
  pageIndex?: number | null;
  currentPageId?: string | null;
  progressPages?: Array<ServerRunPageRecord | null | undefined>;
}): {
  pageStates: Record<string, BackgroundPageState>;
  done: number;
  finishedEntries: Array<{ pageId: string; state: BackgroundPageState }>;
} {
  const pageStates = createInitialBackgroundPageStates(params.pages);
  const validIds = new Set(params.pages.map((p) => p.id));
  const idByPath = new Map<string, string>();
  for (const p of params.pages) {
    if (!idByPath.has(p.path)) idByPath.set(p.path, p.id);
  }

  const finishedEntries: Array<{ pageId: string; state: BackgroundPageState }> = [];
  for (const entry of params.progressPages ?? []) {
    if (!entry) continue;
    if (entry.status !== 'migrated' && entry.status !== 'failed') continue;
    const resolvedId =
      entry.pageId && validIds.has(entry.pageId)
        ? entry.pageId
        : entry.path
          ? idByPath.get(entry.path)
          : undefined;
    if (!resolvedId) continue;
    const state: BackgroundPageState = {
      migrationStatus: entry.status === 'migrated' ? 'migrated' : 'failed',
      jobId: entry.jobId,
      sectionCount: entry.sectionCount,
      framerPageNodeId: entry.framerPageNodeId,
      lastSyncedAt: entry.lastSyncedAt,
      lastError: entry.status === 'failed' ? (entry.error || null) : null,
    };
    pageStates[resolvedId] = state;
    finishedEntries.push({ pageId: resolvedId, state });
  }

  const terminal =
    params.runStatus === 'success' ||
    params.runStatus === 'failed' ||
    params.runStatus === 'cancelled';

  if (!terminal && (params.runStatus === 'running' || Boolean(params.currentPageId))) {
    let activePageId: string | undefined;
    if (
      params.currentPageId &&
      validIds.has(params.currentPageId) &&
      pageStates[params.currentPageId]?.migrationStatus === 'pending'
    ) {
      activePageId = params.currentPageId;
    } else if (
      typeof params.pageIndex === 'number' &&
      Number.isInteger(params.pageIndex) &&
      params.pageIndex >= 0 &&
      params.pageIndex < params.pages.length
    ) {
      activePageId = params.pages[params.pageIndex].id;
    }
    if (activePageId && pageStates[activePageId]?.migrationStatus === 'pending') {
      pageStates[activePageId] = {
        ...pageStates[activePageId],
        migrationStatus: 'syncing',
      };
    }
  }

  let done = 0;
  for (const state of Object.values(pageStates)) {
    if (state.migrationStatus === 'migrated' || state.migrationStatus === 'failed') {
      done += 1;
    }
  }

  return { pageStates, done, finishedEntries };
}

export function applyBackgroundConversionOverlay(
  pages: ReaddyDiscoveredPage[],
  overlay: { active: boolean; pageStates: Record<string, BackgroundPageState> },
): ReaddyDiscoveredPage[] {
  if (!overlay.active) return pages;
  return pages.map((page) => {
    const live = overlay.pageStates[page.id];
    if (!live) return page;
    return {
      ...page,
      migrationStatus: live.migrationStatus,
      jobId: live.jobId !== undefined ? live.jobId : page.jobId,
      sectionCount: live.sectionCount !== undefined ? live.sectionCount : page.sectionCount,
      framerPageNodeId:
        live.framerPageNodeId !== undefined ? live.framerPageNodeId : page.framerPageNodeId,
      lastSyncedAt: live.lastSyncedAt !== undefined ? live.lastSyncedAt : page.lastSyncedAt,
      lastError:
        live.lastError !== undefined
          ? live.lastError
          : live.migrationStatus === 'failed'
            ? page.lastError
            : null,
    };
  });
}

export function isRemoteJobNewerThanLocal(
  local: SavedPageProgress,
  remoteTimestamp?: string | null,
): boolean {
  const localTs = Date.parse(local.updatedAt || local.lastSyncedAt || '');
  if (!Number.isFinite(localTs)) return true;
  const remoteTs = Date.parse(remoteTimestamp || '');
  if (!Number.isFinite(remoteTs)) return false;
  return remoteTs > localTs;
}

/** owner/repo, ignoring branch, commit, and URL spelling. */
function normalizeGithubRepo(raw: string | null | undefined): string | null {
  let value = String(raw || '').trim();
  if (!value) return null;
  value = value.replace(/^git@github\.com:/i, '');
  value = value.replace(/^https?:\/\/github\.com\//i, '');
  value = value.replace(/\.git$/i, '');
  value = value.replace(/[?#].*$/, '');
  value = value.replace(/\/+$/, '');
  const fromKey = value.match(/^gh:([^:\s]+)/i);
  if (fromKey) value = fromKey[1];
  const [owner, repo] = value.split('/').filter(Boolean);
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return `${owner}/${repo}`.toLowerCase();
}

/** One row per imported website. Repeated analyses of the same source collapse to the newest. */
export function framerSiteSnapshotIdentity(site: FramerSiteSnapshot): string {
  if (site.source_type === 'github') {
    const repo =
      normalizeGithubRepo(site.analysis?.githubMeta?.full_name) ||
      normalizeGithubRepo(site.source_label) ||
      normalizeGithubRepo(site.github_repo_url) ||
      normalizeGithubRepo(site.project_key);
    if (repo) return `gh:${repo}`;
    const label = site.source_label?.trim().toLowerCase();
    if (label) return `gh:${label}`;
  }
  if (site.source_type === 'upload') {
    const origin = site.analysis?.sourceOrigin?.trim().toLowerCase().replace(/\/+$/, '');
    if (origin) return `upload:${origin}`;
  }
  const label = site.source_label?.trim().toLowerCase();
  if (label) return `${site.source_type}:${label}`;
  const name = site.project_name?.trim().toLowerCase();
  if (name) return `${site.source_type}:${name}`;
  return site.project_key || site.id;
}

/** A router template such as /design-center/:slug is not a page that can be captured. */
export function isTemplateRoutePath(routePath: string): boolean {
  return routePath.split('/').some((segment) => segment.startsWith(':') || segment === '*');
}

/** One-click conversion always re-parses and syncs every active (non-skipped) page, including already-migrated ones. */
export function selectPagesForOneClickConversion(
  pages: ReaddyDiscoveredPage[],
): ReaddyDiscoveredPage[] {
  return pages.filter((page) => page.migrationStatus !== 'skipped' && !isTemplateRoutePath(page.path));
}

function isConversionAnalysis(value: unknown): value is ReaddyProjectAnalysis {
  if (!value || typeof value !== 'object') return false;
  const record = value as ReaddyProjectAnalysis;
  return typeof record.projectKey === 'string' && Array.isArray(record.pages);
}

function conversionSourceType(value: unknown, analysis: ReaddyProjectAnalysis): SourceType {
  if (value === 'github' || value === 'upload' || value === 'paste') return value;
  if (analysis.sourceType === 'github' || analysis.sourceType === 'upload' || analysis.sourceType === 'paste') {
    return analysis.sourceType;
  }
  return 'paste';
}

/** Rebuild the workbench project from the conversion run that is still in progress. */
export function siteSnapshotFromConversionRun(input: {
  projectKey: string;
  siteName?: string;
  framerProjectUrl?: string;
  sourceType?: unknown;
  analysis?: unknown;
  githubRepoUrl?: string;
  githubAllPaths?: unknown;
  createdAt?: string;
}): FramerSiteSnapshot | null {
  if (!isConversionAnalysis(input.analysis)) return null;
  const projectKey = input.projectKey.trim() || input.analysis.projectKey;
  if (!projectKey) return null;
  const paths = Array.isArray(input.githubAllPaths) ? input.githubAllPaths.map(String) : [];
  return {
    id: '',
    project_key: projectKey,
    project_name: input.siteName?.trim() || input.analysis.projectName || '未命名網站',
    source_type: conversionSourceType(input.sourceType, input.analysis),
    source_label: input.siteName?.trim() || input.analysis.projectName || null,
    framer_project_url: input.framerProjectUrl?.trim() || null,
    github_repo_url: input.githubRepoUrl?.trim() || null,
    github_branch: input.analysis.githubMeta?.branch || null,
    github_all_paths: paths,
    storage_bundle_path: input.analysis.storageBundlePath ?? null,
    analysis: input.analysis.projectKey ? input.analysis : { ...input.analysis, projectKey },
    page_count: input.analysis.pages.length,
    created_at: input.createdAt || new Date(0).toISOString(),
  };
}

/** Prefer the saved site whose Framer project is the one this conversion is writing to. */
export function pickSiteSnapshotForConversion(
  snapshots: FramerSiteSnapshot[],
  projectKey: string,
  framerProjectUrl?: string | null,
): FramerSiteSnapshot | null {
  const key = projectKey.trim();
  if (!key) return null;
  const matches = snapshots.filter(
    (row) => row.project_key === key || row.analysis?.projectKey === key,
  );
  if (!matches.length) return null;
  const framerKey = normalizeFramerProjectKey(framerProjectUrl);
  const sameFramer =
    framerKey === 'unassigned'
      ? []
      : matches.filter((row) => normalizeFramerProjectKey(row.framer_project_url) === framerKey);
  const pool = sameFramer.length > 0 ? sameFramer : matches;
  return mergeFramerSiteSnapshots(pool, pool.length)[0] ?? null;
}

export function mergeFramerSiteSnapshots(rows: FramerSiteSnapshot[], limit: number): FramerSiteSnapshot[] {
  const newestFirst = [...rows].sort((a, b) => {
    const time = (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
    if (time !== 0) return time;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  const seen = new Set<string>();
  return newestFirst.filter((site) => {
    const key = framerSiteSnapshotIdentity(site);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}
