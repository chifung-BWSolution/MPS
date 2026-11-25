import type { ReaddyDiscoveredPage, ReaddyPageMigrationStatus } from '@/types/readdyFramer';

const STORAGE_PREFIX = 'mps-readdy-framer-progress:';

export type SavedPageProgress = {
  migrationStatus: ReaddyPageMigrationStatus;
  jobId?: string | null;
  sectionCount?: number;
  framerPageNodeId?: string | null;
  lastSyncedAt?: string | null;
};

export function loadSavedPageProgress(projectKey: string): Record<string, SavedPageProgress> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectKey}`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SavedPageProgress>;
  } catch {
    return {};
  }
}

export function savePageProgress(projectKey: string, pages: ReaddyDiscoveredPage[]): void {
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
    localStorage.setItem(`${STORAGE_PREFIX}${projectKey}`, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function patchSavedPageProgress(
  projectKey: string,
  pageId: string,
  patch: SavedPageProgress,
): void {
  try {
    const map = loadSavedPageProgress(projectKey);
    map[pageId] = { ...map[pageId], ...patch };
    localStorage.setItem(`${STORAGE_PREFIX}${projectKey}`, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}
