import { Link } from 'react-router-dom'
import { FinderCta, FinderHeader } from './components/finder'
import { useBack } from './useBack'
import { ServedLikelihood } from './components/ServedLikelihood'

const POINTS = [
  'We look at recent activity at each shop: transactions, visits customers confirmed, and problems they reported. We never see or show an agent’s cash.',
  'For your request we show how likely you are to be served, as a round figure. It is never 100%: what is in the drawer can change between now and your visit.',
  'Every figure has a time. The older the picture, the lower the figure. After 4 hours we say “ask before you go”.',
  'The agents shown first are the ones nearby with the highest figure for your request.',
]

/** The two figures a customer will meet, drawn exactly as the results draw them. */
const EXAMPLES = [
  { outcome: 'likely' as const, outcome_text: 'Likely to serve you', served_pct: 85, served_text: '85% likely to serve you' },
  { outcome: 'limited' as const, outcome_text: 'Availability uncertain for this request', served_pct: 30, served_text: '30% likely to serve you' },
]

/** U4 — the trust explanation. Four sentences, the figure itself, one way out. */
export default function HowAvailabilityWorksPage() {
  const back = useBack('/find')
  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader back={back} title="How availability works" />

      <h1 className="mt-8 text-xl font-bold leading-tight">A figure, not a promise</h1>
      <p className="mt-2 text-base font-medium text-finder-muted">What the number next to each shop means, and what it does not.</p>

      <ol className="mt-8 flex flex-col gap-7">
        {POINTS.map((p, i) => (
          <li key={p} className="flex gap-5">
            <span aria-hidden="true" className="w-7 shrink-0 text-3xl font-bold leading-none text-finder-link tabular-nums">
              {i + 1}
            </span>
            <p className="pt-1 text-base font-medium leading-relaxed">{p}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 text-xs font-bold uppercase tracking-wider text-finder-muted">What it looks like</h2>
      <ul className="mt-4 flex flex-col gap-6">
        {EXAMPLES.map((e) => (
          <li key={e.served_pct}>
            <ServedLikelihood agent={e} />
          </li>
        ))}
      </ul>

      <p className="mt-10 text-sm font-medium text-finder-muted">Availability is hidden overnight (20:00–07:00) for agents’ safety.</p>

      <Link to="/find" className="mt-auto pt-10">
        <FinderCta>Got it</FinderCta>
      </Link>
    </div>
  )
}
