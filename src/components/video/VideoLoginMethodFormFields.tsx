import { ChevronsUpDown, Eye, EyeOff } from 'lucide-react';
import {
  VIDEO_LOGIN_METHOD_OPTIONS,
  VIDEO_TWO_FA_OPTIONS,
  normalizeLoginMethods,
  normalizeTwoFaMethods,
  videoLoginMethodLabel,
  type VideoLoginMethodKind,
  type VideoTwoFaMethod,
} from '@/types/videoLoginMethod';
import type { LoginMethodForm } from '@/lib/videoLoginMethodForm';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function LoginMethodKindMultiSelect({
  value,
  onChange,
  triggerClassName,
}: {
  value: VideoLoginMethodKind[];
  onChange: (next: VideoLoginMethodKind[]) => void;
  triggerClassName?: string;
}) {
  const selected = normalizeLoginMethods(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 w-full justify-between px-3 text-[13px] font-normal',
            triggerClassName,
          )}
        >
          <span className={cn('truncate text-left', selected.length === 0 && 'text-muted-foreground')}>
            {selected.length > 0 ? selected.map(videoLoginMethodLabel).join('、') : '登入方式'}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[120] w-[220px] p-2" align="start">
        <div className="space-y-1">
          {VIDEO_LOGIN_METHOD_OPTIONS.map(option => {
            const checked = selected.includes(option.id);
            return (
              <label
                key={option.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    const values = next === true
                      ? [...selected, option.id]
                      : selected.filter(id => id !== option.id);
                    onChange(normalizeLoginMethods(values));
                  }}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function VideoLoginMethodFormFields({
  form,
  setForm,
  showPassword,
  onTogglePassword,
}: {
  form: LoginMethodForm;
  setForm: (next: LoginMethodForm | ((prev: LoginMethodForm) => LoginMethodForm)) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
}) {
  const toggleTwoFa = (method: VideoTwoFaMethod, checked: boolean) => {
    setForm(prev => {
      const next = checked
        ? [...prev.twoFaMethods, method]
        : prev.twoFaMethods.filter(value => value !== method);
      return { ...prev, twoFaMethods: normalizeTwoFaMethods(next) };
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">
          登入方式顯示名稱 *
        </label>
        <div className="grid grid-cols-[minmax(9.5rem,0.9fr)_1.1fr] gap-2">
          <LoginMethodKindMultiSelect
            value={form.loginMethods}
            onChange={(loginMethods) => setForm(prev => ({ ...prev, loginMethods }))}
          />
          <Input
            value={form.displayName}
            onChange={e => setForm(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder="例如 CFB M10"
            className="h-9 text-[13px]"
          />
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">
          帳號名稱
        </label>
        <Input
          value={form.accountName}
          onChange={e => setForm(prev => ({ ...prev, accountName: e.target.value }))}
          placeholder="帳號 / 用戶名稱 / 用戶 ID"
          className="h-9 text-[13px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">
            電話號碼
          </label>
          <Input
            value={form.phoneNumber}
            onChange={e => setForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
            placeholder="例如 +852 9123 4567"
            className="h-9 text-[13px]"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">
            電郵
          </label>
          <Input
            type="email"
            value={form.email}
            onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
            placeholder="name@example.com"
            className="h-9 text-[13px]"
          />
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">
          密碼
        </label>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
            className="h-9 text-[13px] pr-10"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title={showPassword ? '隱藏密碼' : '顯示密碼'}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-2">
          雙重驗證方式（可多選）
        </label>
        <div className="grid grid-cols-2 gap-2">
          {VIDEO_TWO_FA_OPTIONS.map(option => {
            const checked = form.twoFaMethods.includes(option.id);
            return (
              <label
                key={option.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] cursor-pointer',
                  checked ? 'border-teal-200 bg-teal-50' : 'border-border hover:bg-muted/30',
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={value => toggleTwoFa(option.id, value === true)}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">
          備註
        </label>
        <Textarea
          value={form.note}
          onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
          placeholder="補充說明、注意事項…"
          className="min-h-[72px] text-[13px]"
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <div className="text-[13px] font-medium">啟用</div>
          <div className="text-[11px] text-muted-foreground">停用後此登入方式會標示為停用</div>
        </div>
        <Switch
          checked={form.isActive}
          onCheckedChange={checked => setForm(prev => ({ ...prev, isActive: checked }))}
        />
      </div>
    </div>
  );
}
