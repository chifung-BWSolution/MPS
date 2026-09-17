import {
  composeLoginMethodDisplayName,
  normalizeTwoFaMethods,
  stripLoginMethodDisplayPrefix,
  type VideoLoginMethod,
  type VideoLoginMethodInput,
  type VideoLoginMethodKind,
  type VideoTwoFaMethod,
} from '../types/videoLoginMethod';

export type LoginMethodForm = {
  loginMethod: VideoLoginMethodKind | '';
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
  loginMethod: '',
  displayName: '',
  accountName: '',
  phoneNumber: '',
  email: '',
  password: '',
  twoFaMethods: [],
  note: '',
  isActive: true,
});

export function loginMethodFormFromItem(item: VideoLoginMethod): LoginMethodForm {
  return {
    loginMethod: item.loginMethod,
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

export function loginMethodFormToInput(form: LoginMethodForm): VideoLoginMethodInput | null {
  if (!form.loginMethod) return null;
  const displayNameRest = stripLoginMethodDisplayPrefix(form.displayName);
  if (!displayNameRest) return null;
  return {
    loginMethod: form.loginMethod,
    displayName: composeLoginMethodDisplayName(form.loginMethod, displayNameRest),
    accountName: form.accountName,
    phoneNumber: form.phoneNumber,
    email: form.email,
    password: form.password,
    twoFaMethods: normalizeTwoFaMethods(form.twoFaMethods),
    note: form.note,
    isActive: form.isActive,
  };
}
