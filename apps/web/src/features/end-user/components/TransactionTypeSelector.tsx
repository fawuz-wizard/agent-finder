import { TRANSACTION_LABELS, type TransactionType } from '@/types/public'

const ORDER: TransactionType[] = ['cash_out', 'deposit']

/**
 * Two pills of equal width, as the file draws them: the chosen one filled orange with a
 * tick, the other outlined in white. A radio group, so arrow keys move between them.
 */
export function TransactionTypeSelector({
  value,
  onChange,
}: {
  value: TransactionType | null
  onChange: (t: TransactionType) => void
}) {
  return (
    <div role="radiogroup" aria-label="What do you need?" className="flex gap-3">
      {ORDER.map((t) => {
        const selected = value === t
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t)}
            className={`flex h-control flex-1 select-none items-center justify-center gap-2 rounded-pill text-base font-bold transition-colors ${
              selected ? 'bg-finder-link text-finder-on-orange' : 'border-2 border-white bg-transparent text-white'
            }`}
          >
            {selected && (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {TRANSACTION_LABELS[t]}
          </button>
        )
      })}
    </div>
  )
}
