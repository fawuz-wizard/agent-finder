import { TRANSACTION_HINTS, TRANSACTION_LABELS, type TransactionType } from '@/types/public'
import { cn } from '@/design'

const ORDER: TransactionType[] = ['cash_out', 'deposit', 'send']

/** Radio group, 48 px targets, keyboard-navigable. Selection is the first thing the customer states. */
export function TransactionTypeSelector({
  value,
  onChange,
  variant = 'chips',
}: {
  value: TransactionType | null
  onChange: (t: TransactionType) => void
  variant?: 'chips' | 'cards'
}) {
  return (
    <div role="radiogroup" aria-label="What do you need?" className={cn(variant === 'chips' ? 'flex gap-2' : 'flex flex-col gap-2')}>
      {ORDER.map((t) => {
        const selected = value === t
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t)}
            className={cn(
              'select-none rounded-pill border text-base font-semibold transition-colors',
              variant === 'chips' ? 'h-control flex-1 px-2' : 'flex h-auto flex-col items-start gap-0.5 rounded-card px-4 py-3 text-left',
              selected
                ? 'border-2 border-brand-deep bg-brand-light text-brand-text'
                : 'border-ink/25 bg-paper text-ink hover:bg-brand-faint',
            )}
          >
            {selected && variant === 'chips' && (
              <span aria-hidden="true" className="mr-1.5">
                ✓
              </span>
            )}
            <span>{TRANSACTION_LABELS[t]}</span>
            {variant === 'cards' && <span className="text-sm font-normal text-muted">{TRANSACTION_HINTS[t]}</span>}
          </button>
        )
      })}
    </div>
  )
}
