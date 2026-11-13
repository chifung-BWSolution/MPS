import { isAsanaTaskGid } from '@/lib/asanaDayReportLink';

const PROJECT_HUB_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `projects.id` is a uuid. Asana task gids and other text must not be sent to that column. */
export function isProjectHubId(value: string | null | undefined): boolean {
  return PROJECT_HUB_ID_RE.test((value ?? '').trim());
}

export function partitionReportRelatedIds(ids: Iterable<string>): {
  projectIds: string[];
  asanaTaskGids: string[];
} {
  const projectIds: string[] = [];
  const asanaTaskGids: string[] = [];
  const seenProject = new Set<string>();
  const seenAsana = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (isProjectHubId(id)) {
      if (seenProject.has(id)) continue;
      seenProject.add(id);
      projectIds.push(id);
      continue;
    }
    if (isAsanaTaskGid(id)) {
      if (seenAsana.has(id)) continue;
      seenAsana.add(id);
      asanaTaskGids.push(id);
    }
  }
  return { projectIds, asanaTaskGids };
}

export type FrequentReportEntry = {
  relatedId: string | null;
  relatedName: string | null;
  category: string;
  hours: number | null;
  createdAt: string | null;
};

export type FrequentReportItem = {
  relatedId: string;
  relatedName: string;
  category: string;
  count: number;
  lastUsed: string;
  totalHours: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Group recent day-report entries into the 常用匯報項目 cards.
 * `namesById` holds current hub and Asana names. A stored `related_name`
 * still counts when the master row is missing, so one failed lookup cannot hide the card.
 */
export function buildFrequentReportItems(
  entries: FrequentReportEntry[],
  namesById: ReadonlyMap<string, string>,
  linkModeOf: (category: string) => string,
  limit = 8,
): FrequentReportItem[] {
  const itemMap: Record<string, FrequentReportItem> = {};

  for (const entry of entries) {
    const category = (entry.category || '').trim();
    if (!category) continue;
    const linkMode = linkModeOf(category);
    const hours = Number(entry.hours) || 0;
    const createdAt = entry.createdAt || '';

    if (linkMode === 'none') {
      const key = `__none__${category}`;
      if (!itemMap[key]) {
        itemMap[key] = {
          relatedId: '',
          relatedName: 'N/A',
          category,
          count: 0,
          lastUsed: createdAt,
          totalHours: 0,
        };
      }
      itemMap[key].count += 1;
      itemMap[key].totalHours += hours;
      if (createdAt && createdAt > itemMap[key].lastUsed) itemMap[key].lastUsed = createdAt;
      continue;
    }

    const relatedId = (entry.relatedId || '').trim();
    if (!relatedId) {
      if (linkMode !== 'optional') continue;
      const key = `__optional_empty__${category}`;
      if (!itemMap[key]) {
        itemMap[key] = {
          relatedId: '',
          relatedName: '（未選項目）',
          category,
          count: 0,
          lastUsed: createdAt,
          totalHours: 0,
        };
      }
      itemMap[key].count += 1;
      itemMap[key].totalHours += hours;
      if (createdAt && createdAt > itemMap[key].lastUsed) itemMap[key].lastUsed = createdAt;
      continue;
    }

    const relatedName = (namesById.get(relatedId) || entry.relatedName || '').trim();
    if (!relatedName) continue;
    const key = `${relatedId}__${category}`;
    if (!itemMap[key]) {
      itemMap[key] = {
        relatedId,
        relatedName,
        category,
        count: 0,
        lastUsed: createdAt,
        totalHours: 0,
      };
    }
    itemMap[key].count += 1;
    itemMap[key].totalHours += hours;
    itemMap[key].relatedName = relatedName;
    if (createdAt && createdAt > itemMap[key].lastUsed) itemMap[key].lastUsed = createdAt;
  }

  return Object.values(itemMap)
    .map((item) => ({ ...item, totalHours: round1(item.totalHours) }))
    .sort((a, b) => (
      b.count !== a.count
        ? b.count - a.count
        : (b.lastUsed || '').localeCompare(a.lastUsed || '')
    ))
    .slice(0, limit);
}
