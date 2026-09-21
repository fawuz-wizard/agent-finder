import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Tone = 'info' | 'warning' | 'danger' | 'success' | 'night'

const toneClass: Record<Tone, string> = {
  info: 'bg-brand-light text-brand-text',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  success: 'bg-success-tint text-success',
  night: 'bg-night text-night-text',
}

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone
  icon?: ReactNode
}

/** One-sentence, persistent-while-true notice. Danger banners announce as alerts. */
export function Banner({ tone = 'info', icon, className, children, ...rest }: BannerProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-card px-3.5 py-3 text-sm leading-snug', toneClass[tone], className)}
      {...rest}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  )
}
