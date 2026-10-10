import { useId } from 'react'
import { FinderBox } from './finder'

/**
 * Amount in new Leones: a 60 px field with "SLE" in front and the figure at 36 px, the
 * old-Leone equivalent underneath — the single most common real-world error since
 * redenomination.
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
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-[15px] font-medium text-white">
        Amount (SLE)
      </label>
      <FinderBox className={`flex h-[60px] items-center gap-4 px-4 ${error ? 'outline outline-2 outline-danger' : 'focus-within:outline focus-within:outline-2 focus-within:outline-finder-link'}`}>
        <span className="text-md font-bold text-finder-muted">SLE</span>
        <input
          id={id}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value ? Number(value).toLocaleString('en-US') : ''}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
          placeholder="0"
          className="h-full w-full min-w-0 bg-transparent text-3xl font-bold tabular-nums text-white outline-none placeholder:text-finder-muted/50"
        />
      </FinderBox>
      <p id={`${id}-help`} className={`-mt-1 text-[15px] font-medium ${error ? 'text-danger' : 'text-finder-muted'}`}>
        {helper}
      </p>
    </div>
  )
}
