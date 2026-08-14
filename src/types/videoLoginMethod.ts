export const VIDEO_LOGIN_METHOD_OPTIONS = [
  { id: 'account_password', label: '帳號及密碼' },
  { id: 'email_password', label: '電郵及密碼' },
  { id: 'phone', label: '電話號碼' },
  { id: 'google', label: 'Google 登入' },
  { id: 'wechat_scan', label: '微信掃碼' },
] as const;

export type VideoLoginMethodKind = (typeof VIDEO_LOGIN_METHOD_OPTIONS)[number]['id'];

export const VIDEO_TWO_FA_OPTIONS = [
  { id: 'email', label: '電郵' },
  { id: 'sms', label: '短訊 SMS' },
  { id: 'authenticator', label: 'Authenticator' },
  { id: 'mobile_app', label: '手機 App' },
  { id: 'na', label: '不適用' },
] as const;

export type VideoTwoFaMethod = (typeof VIDEO_TWO_FA_OPTIONS)[number]['id'];

export type VideoLoginMethod = {
  id: string;
  loginMethod: VideoLoginMethodKind;
  displayName: string;
  accountName: string;
  phoneNumber: string;
  email: string;
  password: string;
  twoFaMethods: VideoTwoFaMethod[];
  createdAt?: string;
  updatedAt?: string;
};

export type VideoLoginMethodInput = {
  loginMethod: VideoLoginMethodKind;
  displayName: string;
  accountName?: string;
  phoneNumber?: string;
  email?: string;
  password?: string;
  twoFaMethods?: VideoTwoFaMethod[];
};

const LOGIN_METHOD_IDS = new Set<string>(VIDEO_LOGIN_METHOD_OPTIONS.map((option) => option.id));
const TWO_FA_IDS = new Set<string>(VIDEO_TWO_FA_OPTIONS.map((option) => option.id));

export function isVideoLoginMethodKind(value: string): value is VideoLoginMethodKind {
  return LOGIN_METHOD_IDS.has(value);
}

export function isVideoTwoFaMethod(value: string): value is VideoTwoFaMethod {
  return TWO_FA_IDS.has(value);
}

export function videoLoginMethodLabel(kind: string): string {
  return VIDEO_LOGIN_METHOD_OPTIONS.find((option) => option.id === kind)?.label ?? kind;
}

export function videoTwoFaLabel(method: string): string {
  return VIDEO_TWO_FA_OPTIONS.find((option) => option.id === method)?.label ?? method;
}

export function normalizeTwoFaMethods(values: string[]): VideoTwoFaMethod[] {
  const unique = [...new Set(values.filter(isVideoTwoFaMethod))];
  if (unique.includes('na')) return ['na'];
  return unique;
}
