import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix' | 'placeholder'> & {
  label: string
  value: string
  onChange: (value: string) => void
  /** Shown before the value once the label has floated (OUDS prefix), and read out via the description. */
  prefix?: string
  helper?: string
  /** Replaces the helper and marks the field invalid. */
  error?: string | null
  /** A 48 px icon button at the end of the field (OUDS trailing action). */
  trailing?: ReactNode
}

/**
 * OUDS text input (Web v1.4.0): filled, square, 60 px tall, label inside the field that
 * floats to 12 px once the field is focused or filled. The bottom border thickens to 2 px
 * and the fill deepens on focus; an error turns the border and label negative and its
 * message replaces the helper. The Orange focus ring is the border itself, not an outline.
 */
export function TextInput({ label, value, onChange, prefix, helper, error, trailing, id, className, onFocus, onBlur, ...input }: Props) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const [focused, setFocused] = useState(false)
  const floated = focused || value.length > 0
  const invalid = Boolean(error)
  const describedBy = [prefix && `${fieldId}-prefix`, invalid ? `${fieldId}-error` : helper && `${fieldId}-helper`]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative flex min-h-[max(3.75rem,52px)] flex-col justify-center py-[6px] pl-[1rem] transition-[background-color,box-shadow] duration-150',
          trailing ? 'pr-[calc(6px+48px+12px)]' : 'pr-[1rem]',
          invalid
            ? focused
              ? 'bg-ouds-field-pressed shadow-[inset_0_-2px_0_0_var(--color-ouds-negative-pressed)]'
              : 'bg-ouds-field shadow-[inset_0_-1px_0_0_var(--color-ouds-negative)] hover:shadow-[inset_0_-1px_0_0_var(--color-ouds-negative-hover)]'
            : focused
              ? 'bg-ouds-field-pressed shadow-[inset_0_-2px_0_0_var(--color-ouds-border-emphasized)]'
              : 'bg-ouds-field shadow-[inset_0_-1px_0_0_var(--color-ouds-border)] hover:shadow-[inset_0_-1px_0_0_var(--color-ouds-action-hover)]',
        )}
      >
        <label
          htmlFor={fieldId}
          className={cn(
            'pointer-events-none relative z-[1] truncate transition-[font-size,line-height] duration-150',
            floated ? 'text-[0.75rem] leading-[1.3333]' : 'text-[1rem] leading-[1.5]',
            invalid ? (focused ? 'text-ouds-negative-pressed' : 'text-ouds-negative') : 'text-ouds-muted',
          )}
        >
          {label}
        </label>
        <div className={cn('flex items-center gap-[6px]', !floated && 'absolute inset-0')}>
          {prefix && (
            <span id={`${fieldId}-prefix`} aria-hidden={!floated} className={cn('shrink-0 text-[1rem] leading-[1.5] text-ouds-muted', !floated && 'sr-only')}>
              <span className="sr-only">Country code </span>
              {prefix}
            </span>
          )}
          <input
            {...input}
            id={fieldId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={(e) => {
              setFocused(true)
              onFocus?.(e)
            }}
            onBlur={(e) => {
              setFocused(false)
              onBlur?.(e)
            }}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy || undefined}
            className={cn(
              'w-full min-w-0 bg-transparent text-[1rem] leading-[1.5] font-medium text-ouds-content outline-none focus-visible:outline-none',
              invalid ? 'caret-ouds-negative-pressed' : 'caret-ouds-content',
              floated ? 'p-0' : 'h-full cursor-text px-[1rem] opacity-0',
            )}
          />
        </div>
        {trailing && <div className="absolute right-[6px] top-1/2 z-[2] -translate-y-1/2">{trailing}</div>}
      </div>
      {invalid ? (
        <p id={`${fieldId}-error`} className="mt-[8px] px-[1rem] text-[0.875rem] leading-[1.4286] text-ouds-negative">
          {error}
        </p>
      ) : (
        helper && (
          <p id={`${fieldId}-helper`} className="mt-[8px] px-[1rem] text-[0.875rem] leading-[1.4286] text-ouds-muted">
            {helper}
          </p>
        )
      )}
    </div>
  )
}
