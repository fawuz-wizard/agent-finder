import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/design'
import { usePendingVisit } from '@/hooks/usePendingVisit'
import { OutcomeForm } from './OutcomeForm'

/**
 * U6 — Report a visit. For an agent the customer found on their own: pick the agent by
 * code or name, then answer the same outcome question. No account, no identity.
 */
export default function ReportVisitPage() {
  const navigate = useNavigate()
  const { visit, clear } = usePendingVisit()
  const [code, setCode] = useState('')
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(
    visit ? { id: visit.agentId, name: visit.agentName } : null,
  )

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <button type="button" onClick={() => history.back()} aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
          ‹
        </button>
        <h1 className="text-xl font-bold">Report a visit</h1>
      </header>

      {!chosen ? (
        <>
          <p className="text-base text-muted">
            Went to an agent without searching? Tell us how it went. This is not a review — nothing is published.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted">Agent code shown at the shop</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10))}
              inputMode="text"
              autoCapitalize="characters"
              placeholder="AF-4821"
              className="h-cta rounded-cta border-2 border-line bg-paper px-4 text-xl font-bold tracking-wider outline-none focus:border-brand-deep"
            />
          </label>
          <Button
            size="cta"
            disabled={code.length < 4}
            onClick={() => setChosen({ id: code.toLowerCase(), name: `Agent ${code}` })}
          >
            Continue
          </Button>
          <Card className="bg-canvas">
            <p className="text-sm text-muted">
              Your report goes only to the agent's distributor network, without your name or number.
            </p>
          </Card>
        </>
      ) : (
        <OutcomeForm
          agentId={chosen.id}
          agentName={chosen.name}
          transaction={visit?.transaction ?? null}
          amount={visit?.amount ?? null}
          source="direct"
          onDone={() => {
            clear()
            navigate('/find')
          }}
          onSkip={() => navigate('/find')}
        />
      )}
    </div>
  )
}
