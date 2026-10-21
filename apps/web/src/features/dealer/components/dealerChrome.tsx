import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { FinderBox } from '@/features/end-user/components/finder'
import { PILL_OFF, PILL_ON } from '@/features/agent/components/agentChrome'

/**
 * The aggregator console's own pieces, on top of the Agent App's chrome: a titled section
 * panel, a pill button in three tones, and the small status tags on an agent's row.
 */

/** A panel with a small uppercase title: the console's card. `tone` colours the left edge. */
export function Section({ id, heading, tone, className = '', children, ...rest }: React.HTMLAttributes<HTMLElement> & { id?: string | undefined; heading: ReactNode; tone?: 'warning' | 'danger' | undefined }) {
  const edge = tone === 'warning' ? 'border-l-4 border-warning' : tone === 'danger' ? 'border-l-4 border-danger' : ''
  return (
    <FinderBox className={`flex flex-col gap-2 px-4 py-4 ${edge} ${className}`} aria-labelledby={id} {...rest}>
      <p id={id} className="text-xs font-bold uppercase tracking-wider text-finder-muted">
        {heading}
      </p>
      {children}
    </FinderBox>
  )
}

/** A section without the box: a small uppercase title, then its lines. `tone` draws a left rule. */
export function Block({ id, heading, tone, className = '', children, ...rest }: React.HTMLAttributes<HTMLElement> & { id?: string | undefined; heading: ReactNode; tone?: 'warning' | 'danger' | undefined }) {
  const edge = tone === 'warning' ? 'border-l-4 border-warning pl-4' : tone === 'danger' ? 'border-l-4 border-danger pl-4' : ''
  return (
    <section className={`flex flex-col gap-2 ${edge} ${className}`} aria-labelledby={id} {...rest}>
      <p id={id} className="text-sm font-bold uppercase tracking-wider text-finder-muted">
        {heading}
      </p>
      {children}
    </section>
  )
}

/** A 44 px pill button: orange when it is the main action, outlined otherwise, red to escalate. */
export function PillButton({ tone = 'off', className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'on' | 'off' | 'danger' }) {
  const look = tone === 'on' ? PILL_ON : tone === 'danger' ? 'border-2 border-danger bg-transparent text-danger' : PILL_OFF
  return <button type={type} className={`min-h-chip rounded-pill px-5 py-2 text-center text-base font-bold leading-tight disabled:opacity-60 ${look} ${className}`} {...rest} />
}

/** A small status tag: "Not on the map", "Pin to confirm", "Inactive at Orange". */
export function Tag({ tone, children }: { tone: 'likely' | 'warning' | 'danger' | 'muted'; children: ReactNode }) {
  const look =
    tone === 'likely'
      ? 'border-finder-likely text-finder-likely'
      : tone === 'warning'
        ? 'border-warning text-warning'
        : tone === 'danger'
          ? 'border-danger text-danger'
          : 'border-finder-muted text-finder-muted'
  return <span className={`inline-flex h-7 w-fit items-center whitespace-nowrap rounded-pill border px-2.5 text-xs font-bold ${look}`}>{children}</span>
}

/** A label-value line inside a section. */
export function Line({ label, value, tone = '' }: { label: ReactNode; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-finder-line py-2 last:border-b-0">
      <span className="text-sm font-medium text-finder-muted">{label}</span>
      <span className={`text-right text-sm font-bold ${tone}`}>{value}</span>
    </div>
  )
}
