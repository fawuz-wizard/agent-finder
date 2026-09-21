import { useState } from 'react'
import { Button } from '@/design'
import { customerApi } from '@/services/customerApi'
import { ApiRequestError } from '@/lib/api'
import { OUTCOME_REASONS } from '@/lib/reference'
import type { OutcomeAnswer, TransactionType, VisitReport } from '@/types/public'

function token(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * U7 — service outcome. Yes or No in one tap, one reason if No, then an optional rating
 * and comment that never leave the network. No customer identity is collected or sent.
 */
export function OutcomeForm({
  agentId,
  agentName,
  transaction,
  amount,
  source,
  onDone,
  onSkip,
  embedded = false,
}: {
  agentId: string
  agentName: string
  transaction: TransactionType | null
  amount: number | null
  source: 'search' | 'direct'
  onDone: () => void
  onSkip: () => void
  /** Inside a sheet that already carries the question as its title: skip the form's own heading. */
  embedded?: boolean
}) {
  const [answer, setAnswer] = useState<OutcomeAnswer | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [step, setStep] = useState<'answer' | 'rate' | 'done'>('answer')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tok] = useState(token)

  async function send(final: boolean) {
    if (!answer || submitting) return
    setSubmitting(true)
    setError(null)
    const body: VisitReport = {
      agent_id: agentId,
      transaction,
      amount_sle: amount,
      answer,
      reason_code: reason,
      rating: final ? rating : null,
      comment: final && comment.trim() ? comment.trim() : null,
      source,
      client_token: tok,
    }
    try {
      await customerApi.report(body)
      setStep('done')
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'We could not send that. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-xl font-bold">Thanks — this helps keep statuses honest.</h2>
        <p className="text-base text-muted">
          Only the agent's network sees this. Nothing is published, and no rating is shown to other customers.
        </p>
        <Button size="cta" onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }

  if (step === 'rate') {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-bold">Rate this visit</h2>
          <p className="text-sm text-muted">Optional · {agentName}</p>
        </div>
        <div role="radiogroup" aria-label="Rating out of five" className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} out of 5`}
              onClick={() => setRating(n)}
              className={`h-control w-full rounded-card border text-2xl leading-none ${
                rating !== null && n <= rating ? 'border-brand bg-brand-light text-brand-deep' : 'border-line bg-paper text-muted'
              }`}
            >
              ★
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted">Comment (optional)</span>
          <textarea
            value={comment}
            maxLength={120}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="rounded-card border-2 border-line bg-paper p-3 text-base outline-none focus:border-brand-deep"
          />
        </label>
        <p className="text-sm text-muted">
          Only the agent's network sees this — never other customers or the agent. This is not published anywhere.
        </p>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <Button size="cta" onClick={() => void send(true)} disabled={submitting}>
          {submitting ? 'Sending…' : 'Send'}
        </Button>
        <Button variant="tertiary" size="control" onClick={() => void send(true)} disabled={submitting}>
          Skip rating
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!embedded && (
        <div>
          <h2 className="text-xl font-bold">Did the agent complete your request?</h2>
          <p className="text-sm text-muted">{agentName}</p>
        </div>
      )}

      <div role="radiogroup" aria-label="Did the agent complete your request?" className="flex flex-col gap-2">
        {(
          [
            ['yes', 'Yes'],
            ['no', 'No'],
            ['did_not_go', "I didn't go"],
          ] as [OutcomeAnswer, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={answer === value}
            onClick={() => {
              setAnswer(value)
              if (value !== 'no') setReason(null)
            }}
            className={`flex h-cta items-center gap-3 rounded-cta border-2 px-4 text-lg font-semibold ${
              answer === value ? 'border-brand bg-brand-light' : 'border-line bg-paper'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-5 w-5 rounded-pill border-2 ${answer === value ? 'border-brand bg-brand' : 'border-ink/40'}`}
            />
            {label}
          </button>
        ))}
      </div>

      {answer === 'no' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-base font-bold">Why?</legend>
          {OUTCOME_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              role="radio"
              aria-checked={reason === r.code}
              onClick={() => setReason(r.code)}
              className={`flex min-h-control items-center gap-3 rounded-card border px-3 py-2 text-left text-base ${
                reason === r.code ? 'border-brand bg-brand-light font-semibold' : 'border-line bg-paper'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 rounded-pill border-2 ${reason === r.code ? 'border-brand bg-brand' : 'border-ink/40'}`}
              />
              {r.label}
            </button>
          ))}
        </fieldset>
      )}

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <Button
        size="cta"
        disabled={!answer || (answer === 'no' && !reason) || submitting}
        onClick={() => (answer === 'did_not_go' ? void send(true) : setStep('rate'))}
      >
        {submitting ? 'Sending…' : 'Continue'}
      </Button>
      <Button variant="tertiary" size="control" onClick={onSkip} disabled={submitting}>
        Skip
      </Button>
    </div>
  )
}
