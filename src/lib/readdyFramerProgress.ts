import type { ReaddyDiscoveredPage, ReaddyPageMigrationStatus } from '@/types/readdyFramer';

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
