import type { VideoLoginMethod } from '../types/videoLoginMethod';

export type RelatedLoginMethodRow = {
  method: VideoLoginMethod;
  accountIds: string[];
};

export type LoginMethodLinkPatch = {
  accountId: string;
  loginMethodIds: string[];
};

export function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(id => set.has(id));
}

export function collectRelatedLoginMethods(
  accounts: Array<{ id: string; loginMethodIds?: string[] }>,
  methods: VideoLoginMethod[],
): RelatedLoginMethodRow[] {
  const methodsById = new Map(methods.map(method => [method.id, method]));
  const accountIdsByMethod = new Map<string, string[]>();

  for (const account of accounts) {
    for (const methodId of account.loginMethodIds ?? []) {
      if (!methodId) continue;
      const list = accountIdsByMethod.get(methodId) ?? [];
      if (!list.includes(account.id)) list.push(account.id);
      accountIdsByMethod.set(methodId, list);
    }
  }

  return [...accountIdsByMethod.entries()]
    .flatMap(([methodId, accountIds]) => {
      const method = methodsById.get(methodId);
      return method ? [{ method, accountIds }] : [];
    })
    .sort((left, right) => {
      const active = Number(right.method.isActive) - Number(left.method.isActive);
      if (active !== 0) return active;
      return left.method.displayName.localeCompare(right.method.displayName, 'zh-Hant');
    });
}

export function planLoginMethodAccountLinkPatches(
  accounts: Array<{ id: string; loginMethodIds?: string[] }>,
  methodId: string,
  linkAccountIds: string[],
): LoginMethodLinkPatch[] {
  if (!methodId) return [];
  const linkSet = new Set(linkAccountIds.filter(Boolean));
  const patches: LoginMethodLinkPatch[] = [];

  for (const account of accounts) {
    const current = [...new Set((account.loginMethodIds ?? []).filter(Boolean))];
    const next = linkSet.has(account.id)
      ? [...new Set([...current, methodId])]
      : current.filter(id => id !== methodId);
    if (sameIdSet(next, current)) continue;
    patches.push({ accountId: account.id, loginMethodIds: next });
  }

  return patches;
}

export function planBulkLoginMethodLinks(
  accounts: Array<{ id: string; loginMethodIds?: string[] }>,
  methodIds: string[],
  linkAccountIds: string[],
): LoginMethodLinkPatch[] {
  const uniqueMethods = [...new Set(methodIds.filter(Boolean))];
  if (uniqueMethods.length === 0) return [];
  const linkSet = new Set(linkAccountIds.filter(Boolean));
  const patches: LoginMethodLinkPatch[] = [];

  for (const account of accounts) {
    if (!linkSet.has(account.id)) continue;
    const current = [...new Set((account.loginMethodIds ?? []).filter(Boolean))];
    const next = [...new Set([...current, ...uniqueMethods])];
    if (sameIdSet(next, current)) continue;
    patches.push({ accountId: account.id, loginMethodIds: next });
  }

  return patches;
}

export function otherAccountLinksForMethod(
  allAccounts: Array<{ id: string; loginMethodIds?: string[] }>,
  channelAccountIds: string[],
  methodId: string,
): string[] {
  const channelSet = new Set(channelAccountIds);
  return allAccounts
    .filter(account => (account.loginMethodIds ?? []).includes(methodId) && !channelSet.has(account.id))
    .map(account => account.id);
}
