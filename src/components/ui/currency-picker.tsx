import { cn } from '@/lib/utils';
import {
  DEFAULT_CURRENCY,
  SYSTEM_CURRENCIES,
  SYSTEM_CURRENCY_LABELS,
  formatFxHint,
  formatMoney,
  toHkd,
  type SystemCurrency,
} from '@/lib/currency';

export function CurrencyPicker({
  value,
  onChange,
  disabled,
}: {
  value: SystemCurrency;
  onChange: (next: SystemCurrency) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <span className="text-[12px] text-muted-foreground block mb-1.5">貨幣 Currency</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="貨幣">
        {SYSTEM_CURRENCIES.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
                selected
                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                  : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
                disabled && 'opacity-50 pointer-events-none',
              )}
            >
              {SYSTEM_CURRENCY_LABELS[option]}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">{formatFxHint(value)}</p>
    </div>
  );
}

export function StoredHkdHint({
  amount,
  currency,
}: {
  amount: number | null;
  currency: SystemCurrency;
}) {
  if (currency === DEFAULT_CURRENCY || amount == null) return null;
  return (
    <p className="text-[11px] text-muted-foreground mt-1">
      將儲存為 {formatMoney(toHkd(amount, currency))}
    </p>
  );
}

export function CurrencyBadge({ currency }: { currency?: string | null }) {
  if (!currency || currency === DEFAULT_CURRENCY) return null;
  return (
    <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground align-middle">
      {currency}
    </span>
  );
}
