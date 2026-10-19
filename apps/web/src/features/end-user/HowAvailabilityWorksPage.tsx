import { Link } from 'react-router-dom'
import { Button } from '@/design'

const POINTS = [
  'We look at recent activity at each shop: transactions, visits customers confirmed, and problems they reported. We never see or show an agent’s cash.',
  'For your request we show how likely you are to be served, as a round figure. It is never 100%: what is in the drawer can change between now and your visit.',
  'Every figure has a time. The older the picture, the lower the figure. After 4 hours we say “ask before you go”.',
  'The agents shown first are the ones nearby with the highest figure for your request.',
]

/** U4 — the trust explanation. Four sentences, plain language, one way out. */
export default function HowAvailabilityWorksPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 bg-app-bg p-4 text-white">
      <header className="flex items-center gap-3">
        <button type="button" onClick={() => history.back()} aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-white/70 transition-colors hover:bg-white/10">
          ‹
        </button>
        <h1 className="text-xl font-bold">How availability works</h1>
      </header>

      <p className="text-sm text-white/60">A quick guide to what the availability message means.</p>

      <ol className="flex flex-col gap-3">
        {POINTS.map((p, i) => (
          <li key={p} className="flex gap-3 rounded-card border border-white/10 bg-app-panel p-4">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand text-sm font-bold text-ink"
            >
              {i + 1}
            </span>
            <p className="text-base leading-relaxed text-white/85">{p}</p>
          </li>
        ))}
      </ol>

      <p className="rounded-card bg-app-surface p-3 text-sm leading-relaxed text-white/65">Availability is hidden overnight (20:00–07:00) for agents’ safety.</p>

      <Link to="/find" className="mt-auto">
        <Button size="cta">Got it</Button>
      </Link>
    </div>
  )
}
