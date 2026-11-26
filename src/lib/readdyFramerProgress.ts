import type { FramerSiteSnapshot, ReaddyDiscoveredPage, ReaddyPageMigrationStatus } from '@/types/readdyFramer';

const STORAGE_PREFIX = 'mps-readdy-framer-progress:';

export type SavedPageProgress = {
  migrationStatus: ReaddyPageMigrationStatus;
  jobId?: string | null;
  sectionCount?: number;
  framerPageNodeId?: string | null;
  lastSyncedAt?: string | null;
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
    const map: Record<string, SavedPageProgress> = {};
    for (const page of pages) {
      if (page.migrationStatus !== 'pending' || page.jobId) {
        map[page.id] = {
          migrationStatus: page.migrationStatus,
          jobId: page.jobId,
          sectionCount: page.sectionCount,
          framerPageNodeId: page.framerPageNodeId,
          lastSyncedAt: page.lastSyncedAt,
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
    map[pageId] = { ...map[pageId], ...patch };
    localStorage.setItem(progressStorageKey(projectKey, framerProjectUrl), JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
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
