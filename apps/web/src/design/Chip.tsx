import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
}

/** 44 px pill toggle: quick amounts, area choice, options. */
export function Chip({ selected, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-chip items-center gap-1.5 whitespace-nowrap rounded-pill border bg-paper px-3.5 text-base font-medium',
        selected ? 'border-2 border-brand-deep font-semibold text-brand-text' : 'border-line',
        className,
      )}
      {...rest}
    />
  )
}
