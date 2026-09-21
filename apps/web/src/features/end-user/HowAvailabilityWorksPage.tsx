import { Link } from 'react-router-dom'
import { Button } from '@/design'

const POINTS = [
  'Agents tell us what they can handle right now, in four words. We never see or show their cash.',
  'We compare that with your request and show only a phrase, like “Can likely handle your request”.',
  'Every status has a time. The older it is, the less you should rely on it. After 4 hours we say “ask before you go”.',
  'The agents shown first are the nearest ones with a fresh status who can likely serve you.',
]

/** U4 — the trust explanation. Four sentences, plain language, one way out. */
export default function HowAvailabilityWorksPage() {
  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <header className="flex items-center gap-3">
        <button type="button" onClick={() => history.back()} aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
          ‹
        </button>
        <h1 className="text-xl font-bold">How availability works</h1>
      </header>

      <ol className="flex flex-col gap-4">
        {POINTS.map((p, i) => (
          <li key={p} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-brand-light text-sm font-bold text-brand-text"
            >
              {i + 1}
            </span>
            <p className="text-base leading-relaxed">{p}</p>
          </li>
        ))}
      </ol>

      <p className="text-sm text-muted">Availability is hidden overnight (20:00–07:00) for agents' safety.</p>

      <Link to="/find" className="mt-auto">
        <Button size="cta">Got it</Button>
      </Link>
    </div>
  )
}
