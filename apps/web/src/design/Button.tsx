import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'attention'
type Size = 'cta' | 'control' | 'chip'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Full width is the mobile default for primary actions. */
  block?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand text-ink font-bold hover:brightness-95 active:brightness-90',
  attention: 'bg-warning text-paper font-bold hover:brightness-95',
  secondary: 'border-2 border-brand-deep text-brand-text font-semibold bg-transparent hover:bg-brand-faint',
  tertiary: 'text-brand-text font-semibold bg-transparent hover:bg-brand-faint px-2',
  destructive: 'border-2 border-danger text-danger font-semibold bg-transparent',
}

const sizeClass: Record<Size, string> = {
  cta: 'h-cta text-lg rounded-cta px-4',
  control: 'h-control text-base rounded-card px-3',
  chip: 'h-chip text-base rounded-pill px-3.5',
}

export function Button({
  variant = 'primary',
  size = 'cta',
  block = variant === 'primary',
  leading,
  trailing,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap select-none transition-[filter,background-color] duration-150',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </button>
  )
}
