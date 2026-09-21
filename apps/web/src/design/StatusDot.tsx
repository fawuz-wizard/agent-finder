/**
 * Status indicator. Shape carries the meaning; colour reinforces it; the adjacent words complete it.
 * Never render a StatusDot without text beside it.
 */
export type StatusKind = 'fresh' | 'limited' | 'ageing' | 'expired' | 'hidden' | 'closed' | 'notset'


export function StatusDot({ kind, size = 14 }: { kind: StatusKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 14 14', 'aria-hidden': true as const }
  switch (kind) {
    case 'fresh':
      return (
        <svg {...common} className="text-success">
          <circle cx="7" cy="7" r="6" fill="currentColor" />
        </svg>
      )
    case 'limited':
      return (
        <svg {...common} className="text-warning">
          <circle cx="7" cy="7" r="6" fill="currentColor" />
          <path d="M7 4v4M7 10h.01" stroke="var(--color-paper)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'ageing':
      return (
        <svg {...common} className="text-warning">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      )
    case 'expired':
      return (
        <svg {...common} className="text-muted">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.5" />
        </svg>
      )
    case 'hidden':
      return (
        <svg {...common} className="text-muted">
          <circle cx="7" cy="7" r="6" fill="currentColor" />
          <path d="M3 11L11 3" stroke="var(--color-canvas)" strokeWidth="2" />
        </svg>
      )
    case 'closed':
      return (
        <svg {...common} className="text-muted">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4.5 7h5" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case 'notset':
      return (
        <svg {...common} className="text-muted">
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
  }
}
