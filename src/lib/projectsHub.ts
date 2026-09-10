export const PROJECTS_TABLE = 'projects';

export const PROJECT_HUB_RELATED_TYPES = [
  'quotation_client',
  'webandsystem',
  'vchannel',
  'manual',
] as const;

export type ProjectHubRelatedType = (typeof PROJECT_HUB_RELATED_TYPES)[number];

export function isProjectHubRelatedType(
  value: string | undefined | null,
): value is ProjectHubRelatedType {
  return !!value && (PROJECT_HUB_RELATED_TYPES as readonly string[]).includes(value);
}

export function mergeProjectHubIds(
  ...groups: Array<string | null | undefined | string[]>
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const group of groups) {
    const values = Array.isArray(group) ? group : [group];
    for (const value of values) {
      const id = value?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Prefer the source module's own hub; fall back to the first linked pitching hub. */
export function pickWriteProjectHubId(
  ownProjectId: string | null | undefined,
  linkedProjectIds: string[] = [],
): string | null {
  return ownProjectId?.trim() || linkedProjectIds.find((id) => id.trim())?.trim() || null;
}
