import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean
  interactive?: boolean
}

export function Card({ selected, interactive, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-card border-2 bg-paper px-4 py-3.5',
        selected ? 'border-brand-deep' : 'border-line',
        interactive && 'cursor-pointer active:bg-brand-faint',
        className,
      )}
      {...rest}
    />
  )
}
