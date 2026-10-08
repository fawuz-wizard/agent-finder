import { useState } from 'react'
import { Button } from '@/design'
import { customerApi } from '@/services/customerApi'
import { ApiRequestError } from '@/lib/api'
import { OUTCOME_REASONS } from '@/lib/reference'
import type { OutcomeAnswer, TransactionType, VisitReport } from '@/types/public'

const COMMENT_MAX_CHARS = 1000

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
      comment: comment.trim() ? comment.trim() : null,
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
        <p className="text-base text-white/65">
          Your report goes to the Orange network. A star rating may appear later as an anonymous aggregate. Your separate comment is private to the network and is never shown to other customers or the agent.
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
          <p className="text-sm text-white/60">Optional · {agentName}</p>
        </div>
        <div role="radiogroup" aria-label="Rating out of five" className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} out of 5`}
              onClick={() => setRating((current) => current === n ? (n === 1 ? null : n - 1) : n)}
              className={`h-control w-full rounded-card border text-2xl leading-none transition-colors ${
                rating !== null && n <= rating ? 'border-brand bg-brand text-ink' : 'border-white/15 bg-app-panel text-white/65'
              }`}
            >
              ★
            </button>
          ))}
        </div>
        <p className="text-sm text-white/60">
          Your star rating goes to the Orange network and is shown only as an anonymous aggregate after at least three submissions. Your separate comment is never other customers or the agent can see; it is private to the Orange network.
        </p>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <Button size="cta" onClick={() => void send(true)} disabled={submitting}>
          {submitting ? 'Sending…' : 'Send'}
        </Button>
        <Button variant="tertiary" size="control" onClick={() => void send(false)} disabled={submitting}>
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
              answer === value ? 'border-brand bg-app-selected text-white' : 'border-white/15 bg-app-panel text-white/80'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-5 w-5 rounded-pill border-2 ${answer === value ? 'border-brand bg-brand' : 'border-white/40'}`}
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
                reason === r.code ? 'border-brand bg-app-selected font-semibold text-white' : 'border-white/15 bg-app-panel text-white/80'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 rounded-pill border-2 ${reason === r.code ? 'border-brand bg-brand' : 'border-white/40'}`}
              />
              {r.label}
            </button>
          ))}
        </fieldset>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white/65">Your experience (optional)</span>
        <textarea
          value={comment}
          maxLength={COMMENT_MAX_CHARS}
          onChange={(e) => setComment(e.target.value)}
          rows={6}
          placeholder="Describe what happened. For example, if you were asked to pay extra or noticed a problem with how the shop was run. This is separate from your star rating."
          className="rounded-card border-2 border-white/15 bg-app-panel p-3 text-base text-white outline-none placeholder:text-white/30 focus:border-brand"
        />
        <span className="text-xs text-white/45">{comment.length}/{COMMENT_MAX_CHARS} characters · Separate from your rating. Private to the Orange network; never shown to the agent or other customers.</span>
      </label>

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
