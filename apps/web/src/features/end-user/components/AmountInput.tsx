import { useId } from 'react'
import { Chip } from '@/design'

const QUICK = [100, 200, 500, 1000, 2000, 5000]

/**
 * Amount in new Leones. Large, numeric keypad, with the old-Leone equivalent underneath —
 * the single most common real-world error since redenomination.
 */
export function AmountInput({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (v: string) => void
  error?: string | null
}) {
  const id = useId()
  const parsed = Number(value)
  const helper =
    error ??
    (value && Number.isFinite(parsed) && parsed > 0
      ? `= Le ${(parsed * 1000).toLocaleString('en-US')} old Leones`
      : 'Optional — leave empty to see all agents')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-muted">
        Amount (SLE)
      </label>
      <div
        className={`flex h-cta items-center gap-3 rounded-cta border-2 bg-paper px-4 ${error ? 'border-danger' : 'border-line focus-within:border-brand-deep'}`}
      >
        <span className="text-base font-bold text-muted">SLE</span>
        <input
          id={id}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
          placeholder="0"
          className="h-full w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:text-muted/50"
        />
      </div>
      <p id={`${id}-help`} className={`text-sm ${error ? 'font-semibold text-danger' : 'text-muted'}`}>
        {helper}
      </p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {QUICK.map((q) => (
          <Chip key={q} selected={value === String(q)} onClick={() => onChange(String(q))}>
            {q.toLocaleString('en-US')}
          </Chip>
        ))}
      </div>
    </div>
  )
}
