import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/design'
import { ApiRequestError } from '@/lib/api'
import { usePendingVisit } from '@/hooks/usePendingVisit'
import { customerApi } from '@/services/customerApi'
import type { VisitReport } from '@/types/public'

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

function reportTarget(state: unknown, pending: { agentId: string; agentName: string } | null) {
  const candidate = state as ReportVisitState | null
  if (typeof candidate?.agentId === 'string' && typeof candidate.agentName === 'string') {
    return { agentId: candidate.agentId, agentName: candidate.agentName }
  }
  return pending
}

/** Leave a private comment for the Orange network about the shop currently in context. */
export default function ReportVisitPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { visit, clear } = usePendingVisit()
  const target = reportTarget(location.state, visit)
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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 bg-app-bg p-4 text-white">
      <header className="flex items-center gap-3">
        <button type="button" onClick={() => history.back()} aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-white/70 transition-colors hover:bg-white/10">
          ‹
        </button>
        <h1 className="text-xl font-bold">Report a visit</h1>
      </header>

      {sent && target ? (
        <div className="flex flex-col gap-4" role="status">
          <h2 className="text-xl font-bold">Thank you for sharing your experience.</h2>
          <p className="text-sm text-white/65">
            Your comment has been recorded for {target.agentName}. It is private to the Orange network and is never shown to other customers or the agent.
          </p>
          <Button
            size="cta"
            onClick={() => {
              clear()
              navigate('/find')
            }}
          >
            Done
          </Button>
        </div>
      ) : target ? (
        <>
          <section className="rounded-2xl bg-brand p-5 text-ink">
            <span className="inline-flex rounded-pill bg-black/10 px-3 py-1 text-xs font-bold uppercase tracking-wider">Customer contribution</span>
            <h2 className="mt-4 text-2xl font-extrabold leading-tight">Share your experience</h2>
            <p className="mt-2 text-sm leading-relaxed text-black/75">
              Your comment will be linked to this shop. It is separate from your star rating.
            </p>
          </section>

          <section className="rounded-xl border border-white/10 bg-app-panel p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-white/55">Comment about</p>
            <p className="mt-1 text-lg font-bold">{target.agentName}</p>
            <p className="mt-3 text-sm text-white/55">The shop is identified automatically. You do not need to enter an agent code.</p>
          </section>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Your comment</span>
            <textarea
              value={comment}
              maxLength={COMMENT_MAX_CHARS}
              onChange={(event) => setComment(event.target.value)}
              rows={8}
              placeholder="Describe your experience. For example, if you were asked to pay extra or noticed a problem with how the shop was run."
              className="min-h-48 rounded-card border-2 border-white/15 bg-app-panel p-3 text-base text-white outline-none placeholder:text-white/35 focus:border-brand"
            />
            <span className="text-xs text-white/50">
              {comment.length}/{COMMENT_MAX_CHARS} characters · Private to the Orange network; never shown to other customers or the agent.
            </span>
          </label>

          {error && <p className="text-sm font-semibold text-danger" role="alert">{error}</p>}

          <Button size="cta" onClick={() => void submit()} disabled={!comment.trim() || submitting}>
            {submitting ? 'Sending…' : 'Send comment'}
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-app-panel p-4">
          <h2 className="font-bold">Choose the shop first</h2>
          <p className="text-sm text-white/65">
            Open the shop’s details and choose Report a visit. We’ll link your comment to that shop automatically, without asking for its agent code.
          </p>
          <Link to="/find">
            <Button size="cta" className="w-full">Find an agent</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
