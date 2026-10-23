import type { SeenAs } from '@/types/operator'
import { ServiceStatus } from '@/features/end-user/components/ServiceStatus'
import { EdgeCard, SectionLabel } from './agentChrome'

const DOT = {
  good: 'bg-finder-likely',
  warn: 'bg-finder-accent',
  neutral: 'bg-finder-muted',
} as const

/**
 * How customers see the agent this week, in words: the listing with one status per type,
 * then why, one line per check with what raises it. The same card on the agent's dashboard
 * and the aggregator's agent page; neither ever shows the percentage or the points.
 */
export function SeenAsCard({ name, street, note, sub }: { name: string; street: string; note: SeenAs; sub?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <EdgeCard aria-label={`${name}: how customers see this listing`}>
        <div>
          <p className="text-lg font-bold leading-tight">{name}</p>
          <p className="text-sm font-bold text-finder-muted">{sub ?? street}</p>
        </div>
        <dl className="flex flex-col gap-2">
          {note.sides.map((side) => (
            <div key={side.label} className="flex min-h-[2.5rem] items-center justify-between gap-3">
              <dt className="text-base font-bold">{side.label}</dt>
              <dd>
                <ServiceStatus outcome={side.outcome} text={side.phrase} />
              </dd>
            </div>
          ))}
        </dl>
      </EdgeCard>
      <SectionLabel className="mt-3">Why</SectionLabel>
      <ul className="flex flex-col divide-y divide-finder-line border-t border-finder-line">
        {note.why.map((w) => (
          <li key={w.title} className="flex gap-3 py-3">
            <span aria-hidden className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[w.tone]}`} />
            <div className="min-w-0">
              <p className="text-base font-bold leading-snug">{w.title}</p>
              <p className="text-sm font-medium text-finder-muted">{w.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
