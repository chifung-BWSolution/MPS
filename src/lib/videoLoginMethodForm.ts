import {
  composeLoginMethodDisplayName,
  normalizeLoginMethods,
  normalizeTwoFaMethods,
  stripLoginMethodDisplayPrefix,
  type VideoLoginMethod,
  type VideoLoginMethodInput,
  type VideoLoginMethodKind,
  type VideoTwoFaMethod,
} from '../types/videoLoginMethod';

export type LoginMethodForm = {
  loginMethods: VideoLoginMethodKind[];
  displayName: string;
  accountName: string;
  phoneNumber: string;
  email: string;
  password: string;
  twoFaMethods: VideoTwoFaMethod[];
  note: string;
  isActive: boolean;
};

export const emptyLoginMethodForm = (): LoginMethodForm => ({
  loginMethods: [],
  displayName: '',
  accountName: '',
  phoneNumber: '',
  email: '',
  password: '',
  twoFaMethods: [],
  note: '',
  isActive: true,
});

export function loginMethodFormFromItem(
  item: VideoLoginMethod,
  group: VideoLoginMethod[] = [item],
): LoginMethodForm {
  const siblings = item.credentialGroupId
    ? group.filter((row) => row.credentialGroupId === item.credentialGroupId)
    : [];
  const rows = siblings.length > 0 ? siblings : [item];
  return {
    loginMethods: normalizeLoginMethods(rows.map((row) => row.loginMethod)),
    displayName: stripLoginMethodDisplayPrefix(item.displayName),
    accountName: item.accountName,
    phoneNumber: item.phoneNumber,
    email: item.email,
    password: item.password,
    twoFaMethods: item.twoFaMethods,
    note: item.note,
    isActive: item.isActive,
  };
}

/** One input per selected kind. Display names stay kind-specific so accounts can link one of them. */
export function loginMethodFormToInputs(form: LoginMethodForm): VideoLoginMethodInput[] | null {
  const kinds = normalizeLoginMethods(form.loginMethods);
  if (kinds.length === 0) return null;
  const displayNameRest = stripLoginMethodDisplayPrefix(form.displayName);
  if (!displayNameRest) return null;
  const shared = {
    accountName: form.accountName,
    phoneNumber: form.phoneNumber,
    email: form.email,
    password: form.password,
    twoFaMethods: normalizeTwoFaMethods(form.twoFaMethods),
    note: form.note,
    isActive: form.isActive,
  };
  return kinds.map((loginMethod) => ({
    loginMethod,
    displayName: composeLoginMethodDisplayName(loginMethod, displayNameRest),
    ...shared,
  }));
}

export function planLoginMethodGroupWrite(
  existing: { id: string; loginMethod: string }[],
  nextKinds: readonly string[],
): { updateIds: string[]; insertKinds: VideoLoginMethodKind[]; removeIds: string[] } {
  const kinds = normalizeLoginMethods(nextKinds);
  const kindSet = new Set<string>(kinds);
  const existingByKind = new Map<string, string>();
  for (const row of existing) {
    if (!existingByKind.has(row.loginMethod)) existingByKind.set(row.loginMethod, row.id);
  }
  return {
    updateIds: kinds.flatMap((kind) => {
      const id = existingByKind.get(kind);
      return id ? [id] : [];
    }),
    insertKinds: kinds.filter((kind) => !existingByKind.has(kind)),
    removeIds: existing.filter((row) => !kindSet.has(row.loginMethod)).map((row) => row.id),
  };
}
