import { TRANSACTION_LABELS, type TransactionType } from '@/types/public'

const ORDER: TransactionType[] = ['cash_out', 'deposit']

/**
 * Two pills, 117 × 50, as the file draws them: the chosen one filled orange, the other
 * outlined in white. A radio group, so arrow keys move between them.
 */
export function TransactionTypeSelector({
  value,
  onChange,
}: {
  value: TransactionType | null
  onChange: (t: TransactionType) => void
}) {
  return (
    <div role="radiogroup" aria-label="What do you need?" className="flex gap-10">
      {ORDER.map((t) => {
        const selected = value === t
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t)}
            className={`h-[50px] w-[117px] select-none rounded-pill text-base font-bold text-white transition-colors ${
              selected ? 'bg-finder-link' : 'border-2 border-white bg-transparent'
            }`}
          >
            {TRANSACTION_LABELS[t]}
          </button>
        )
      })}
    </div>
  )
}
