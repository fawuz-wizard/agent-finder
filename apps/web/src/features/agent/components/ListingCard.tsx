import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CustomersSee } from '@/types/operator'
import { ServiceStatus } from '@/features/end-user/components/ServiceStatus'
import { EdgeCard, PILL_ON } from './agentChrome'

/**
 * The agent's own listing, in the finder's result-card frame: the shop's name, its street,
 * and the pill a customer gets for each side they could ask for. Greyed, with the headline
 * instead of the pills, whenever customers are not being sent here (hidden, closed, expired,
 * not on the map). The ranges line and the explanation are the agent's own; a customer sees
 * neither.
 */
export function ListingCard({ name, street, see, compact = false }: { name: string; street: string; see: CustomersSee; compact?: boolean }) {
  const open = see.state === 'open' && see.sides.length > 0
  // Compact: the name and one short pill per side; the whole card on request.
  const [expanded, setExpanded] = useState(!compact)
  const short = (label: string) => label.replace(/^(Cash out|Cash in).*$/, '$1')
  return (
    <EdgeCard muted={!open} data-state={see.state} aria-label={`Your listing: ${open ? 'customers can find you' : see.headline}`}>
      <p className={`text-md font-bold leading-tight ${open ? 'text-white' : 'text-finder-muted'}`}>{name}</p>
      <p className="-mt-1 text-sm font-bold text-finder-muted">{street}</p>
      {open && !expanded ? (
        <>
          <div className="mt-1 flex flex-wrap gap-2">
            {see.sides.map((side) => (
              <ServiceStatus key={side.label} outcome={side.outcome} text={short(side.label)} />
            ))}
          </div>
          <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} className="h-control self-start text-base font-bold text-finder-link">
            What they read ›
          </button>
        </>
      ) : open ? (
        <>
          {see.sides.map((side) => (
            <div key={side.label} className="mt-1">
              <p className="text-xs font-bold uppercase tracking-wider text-finder-muted">{side.label}</p>
              <div className="mt-1">
                <ServiceStatus outcome={side.outcome} text={side.phrase} />
              </div>
              {side.why && <p className="mt-1 text-sm font-semibold text-warning">{side.why}</p>}
            </div>
          ))}
          <p className="mt-2 text-sm font-medium text-finder-muted">
            {see.sides.map((side, i) => (
              <span key={side.label}>
                {i > 0 && ' · '}
                {side.label}: <span>{side.range_text}</span>
              </span>
            ))}
          </p>
          <p className="text-xs font-medium text-finder-muted">{see.explanation}</p>
          {compact && (
            <button type="button" onClick={() => setExpanded(false)} aria-expanded={true} className="h-control self-start text-base font-bold text-finder-link">
              Show less
            </button>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-base font-bold">{see.headline}</p>
          <p className="text-sm font-medium text-finder-muted">{see.explanation}</p>
          {see.state === 'unlocated' && (
            <Link to="/agent/profile" className={`mt-1 inline-flex h-chip w-fit items-center rounded-pill px-5 text-base font-bold ${PILL_ON}`}>
              Pin my shop
            </Link>
          )}
        </>
      )}
    </EdgeCard>
  )
}
