import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiRequestError } from '@/lib/api'
import { customerApi } from '@/services/customerApi'
import type { VisitReport } from '@/types/public'
import { FinderBox, FinderCta, FinderHeader } from './components/finder'

const COMMENT_MAX_CHARS = 1000

function token(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

interface ReportVisitState {
  agentId?: unknown
  agentName?: unknown
}

function reportTarget(state: unknown) {
  const candidate = state as ReportVisitState | null
  if (typeof candidate?.agentId === 'string' && typeof candidate.agentName === 'string') {
    return { agentId: candidate.agentId, agentName: candidate.agentName }
  }
  return null
}

/**
 * A comment about the shop the customer was just looking at. The agent reads it, never who
 * wrote it; other customers never see it. One question, one field, one button.
 */
export default function ReportVisitPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const target = reportTarget(location.state)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [clientToken] = useState(token)

  async function submit() {
    if (!target || !comment.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    const body: VisitReport = {
      agent_id: target.agentId,
      transaction: null,
      amount_sle: null,
      answer: 'comment',
      reason_code: null,
      rating: null,
      comment: comment.trim(),
      source: 'direct',
      client_token: clientToken,
    }
    try {
      await customerApi.report(body)
      setSent(true)
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.error.message : 'We could not send that. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader back={() => history.back()} title="Report a visit" />

      {sent && target ? (
        <div className="mt-8 flex flex-col gap-3" role="status">
          <h1 className="text-xl font-bold leading-tight">Thank you.</h1>
          <p className="text-base font-medium text-finder-muted">
            Your comment has been recorded for {target.agentName}. The agent can read it, but never who wrote it. Other customers never see it.
          </p>
          <FinderCta className="mt-5" onClick={() => navigate('/find')}>
            Done
          </FinderCta>
        </div>
      ) : target ? (
        <>
          <h1 className="mt-8 text-xl font-bold leading-tight">How did it go at {target.agentName}?</h1>
          <p className="mt-2 text-base font-medium text-finder-muted">
            Say what happened, in your own words. The shop is already chosen; you do not need its agent code.
          </p>

          <label className="mt-8 flex flex-col gap-3">
            <span className="text-[0.95rem] font-medium">Your comment</span>
            <FinderBox className="focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
              <textarea
                value={comment}
                maxLength={COMMENT_MAX_CHARS}
                onChange={(event) => setComment(event.target.value)}
                rows={7}
                placeholder="For example: asked to pay extra, had less than I needed, or served quickly."
                className="block min-h-44 w-full resize-y bg-transparent p-4 text-base font-medium text-white outline-none placeholder:text-finder-muted/60"
              />
            </FinderBox>
            <span className="text-sm font-medium text-finder-muted">
              {comment.length}/{COMMENT_MAX_CHARS} · The agent reads it without your name or number. Other customers never see it.
            </span>
          </label>

          {error && <p className="mt-3 text-sm font-semibold text-danger" role="alert">{error}</p>}

          <FinderCta className="mt-6" onClick={() => void submit()} disabled={!comment.trim() || submitting}>
            {submitting ? 'Sending…' : 'Send comment'}
          </FinderCta>
        </>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          <h1 className="text-xl font-bold leading-tight">Choose the shop first</h1>
          <p className="text-base font-medium text-finder-muted">
            Open the shop’s details and choose Report a visit. Your comment is linked to that shop; you never need its agent code.
          </p>
          <Link to="/find" className="mt-5">
            <FinderCta>Find an agent</FinderCta>
          </Link>
        </div>
      )}
    </div>
  )
}
