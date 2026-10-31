import { ArrowUpRight, Check, ChevronRight, Phone, Send, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAgentRow, FloatForecast, FloatRequest, FloatSend } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { Pill, RowAvatar, ScreenTitle } from './components/designKit'
import { CARD, PAGE, SOLID } from './components/designClasses'

type Tab = 'requests' | 'low' | 'history'
type Range = 7 | 30 | 0
const DAY = 86_400_000

/** One agent who is low or likely to run short, with what the app read and the two actions. */
interface LowRow {
  ref: string
  name: string
  area: string
  phone: string | null
  label: string
  tone: 'bad' | 'warn'
  bar: number
  reasons: string[]
}

function lowRows(agents: DealerAgentRow[], forecast: FloatForecast[]): LowRow[] {
  const byRef = new Map(agents.map((a) => [a.ref, a] as const))
  const rows = new Map<string, LowRow>()
  for (const f of forecast.filter((x) => x.risk !== 'low')) {
    const a = byRef.get(f.agent_ref)
    rows.set(f.agent_ref, {
      ref: f.agent_ref,
      name: f.agent_name,
      area: a?.area ?? '',
      phone: a?.phone ?? null,
      label: f.headline,
      tone: f.risk === 'high' ? 'bad' : 'warn',
      bar: f.risk === 'high' ? 15 : 35,
      reasons: f.reasons,
    })
  }
  for (const a of agents.filter((x) => x.bucket === 'limited' && !rows.has(x.ref))) {
    rows.set(a.ref, { ref: a.ref, name: a.name, area: a.area, phone: a.phone, label: 'Low today', tone: 'warn', bar: 30, reasons: [a.declaration_text] })
  }
  return [...rows.values()].sort((x, y) => (x.tone === y.tone ? 0 : x.tone === 'bad' ? -1 : 1))
}

/** What the History tab lists: a send, or a decision on a request. */
interface Movement {
  key: string
  at: string
  kind: 'sent' | 'approved' | 'declined'
  title: string
  sub: string
  amount: number
  state: string
}

function movements(sends: FloatSend[], requests: FloatRequest[], since: number): Movement[] {
  const answered = new Set(sends.map((s) => s.request_id).filter(Boolean))
  const out: Movement[] = sends.map((s) => ({
    key: s.id,
    at: s.sent_at,
    kind: 'sent' as const,
    title: `Sent to ${s.agent_name}`,
    sub: `${new Date(s.sent_at).toLocaleDateString([], { day: 'numeric', month: 'short' })} ${new Date(s.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${s.om_reference ? ` · ref ${s.om_reference}` : ''}`,
    amount: s.amount_sle,
    state: s.request_id ? 'Completed' : 'Recorded',
  }))
  for (const r of requests) {
    if (!r.decided_at || answered.has(r.id) || r.state === 'pending' || r.state === 'cancelled' || r.state === 'completed') continue
    out.push({
      key: r.id,
      at: r.decided_at,
      kind: r.state === 'declined' ? 'declined' : 'approved',
      title: `${r.state === 'declined' ? 'Declined' : 'Approved'} for ${r.agent_name}`,
      sub: `${new Date(r.decided_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}${r.decision_reason ? ` · “${r.decision_reason}”` : ''}`,
      amount: r.amount_sle,
      state: r.state === 'declined' ? 'Declined' : 'Approved · not sent yet',
    })
  }
  return out.filter((m) => new Date(m.at).getTime() >= since).sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * Float, the aggregator's tab: what was sent this week (from what the aggregator recorded,
 * never a balance), Send float, then three lists. Requests: what agents asked for, oldest
 * first. Low today: who said they are low or will probably run short, with Call and Send
 * float. History: every send and decision. The app never moves money: Send float records a
 * transfer made in Orange Money.
 */
export default function DealerFloatQueuePage() {
  const [params, setParams] = useSearchParams()
  const tab = (['requests', 'low', 'history'].includes(params.get('tab') ?? '') ? params.get('tab') : 'requests') as Tab
  const range = Number(params.get('range') ?? 7) as Range
  const requests = useAsync<FloatRequest[]>((s) => operatorApi.floatRequests(null, s))
  const forecast = useAsync<FloatForecast[]>((s) => operatorApi.floatForecast(s))
  const agents = useAsync<DealerAgentRow[]>((s) => operatorApi.dealerAgents(s))
  const sends = useAsync<FloatSend[]>((s) => operatorApi.floatSends(null, undefined, s))

  const all = requests.data ?? []
  const waiting = all.filter((r) => r.state === 'pending' || r.state === 'approved').sort((a, b) => a.requested_at.localeCompare(b.requested_at))
  const low = lowRows(agents.data ?? [], forecast.data ?? [])
  const weekSent = (sends.data ?? []).filter((s) => Date.now() - new Date(s.sent_at).getTime() <= 7 * DAY).reduce((n, s) => n + s.amount_sle, 0)
  const moves = movements(sends.data ?? [], all, range ? Date.now() - range * DAY : 0)
  const oldest = waiting[0]
  const go = (next: Partial<{ tab: Tab; range: Range }>) => setParams({ tab: next.tab ?? tab, ...(next.range !== undefined || tab === 'history' ? { range: String(next.range ?? range) } : {}) }, { replace: true })
  const segBtn = (on: boolean) => `flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-colors ${on ? 'bg-finder-accent text-finder-on-orange' : 'text-finder-muted'}`

  return (
    <div className={PAGE}>
      <ScreenTitle title="Float" />

      <section className="flex flex-col gap-1.5 rounded-[20px] bg-finder-head p-5 text-white">
        <p className="text-[13px] text-design-head-sub">Float this week · from what you recorded</p>
        <p className="text-[30px] font-extrabold tracking-[-0.02em]">{formatSle(weekSent)} sent</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 rounded-xl bg-design-head-tile p-3">
            <span className="text-xs text-design-head-sub">Requests waiting</span>
            <span className="text-base font-extrabold">{waiting.length}</span>
            {oldest && <span className="text-xs text-design-head-sub">oldest {oldest.waiting_text}</span>}
          </div>
          <div className="flex flex-col gap-1 rounded-xl bg-design-head-tile p-3">
            <span className="text-xs text-design-head-sub">Agents low today</span>
            <span className="text-base font-extrabold">{low.length}</span>
          </div>
        </div>
      </section>

      <Link to="/dealer/float/send" className={`${SOLID} gap-2 text-[15px]`}>
        <Send size={18} strokeWidth={2.2} aria-hidden />
        Send float
      </Link>

      <div role="tablist" aria-label="Float" className="flex rounded-[14px] bg-finder-card p-1">
        {(
          [
            ['requests', `Requests · ${waiting.length}`],
            ['low', `Low today · ${low.length}`],
            ['history', 'History'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => go({ tab: key })} className={segBtn(tab === key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <section aria-labelledby="waiting-heading" className={`${CARD} py-1`}>
          <h2 id="waiting-heading" className="px-[18px] pb-1 pt-3.5 text-sm font-extrabold">
            Waiting
          </h2>
          {requests.state === 'loading' && <p className="px-[18px] pb-3.5 text-sm text-finder-muted">Loading…</p>}
          {requests.state === 'ready' && waiting.length === 0 && <p className="px-[18px] pb-3.5 text-sm text-finder-muted">Nothing waiting. Nothing expires silently.</p>}
          {waiting.map((r, i) => (
            <Link key={r.id} to={`/dealer/float/${r.id}`} className={`flex items-center gap-3 px-[18px] py-3.5 ${i ? 'border-t border-finder-card-line' : ''}`}>
              <RowAvatar name={r.agent_name} index={i} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[15px] font-bold leading-tight">{r.agent_name}</span>
                <span className="text-[12.5px] text-finder-muted">
                  {r.agent_ref.replace(/^Agent /, '')} · {r.state === 'approved' ? 'approved, not sent yet' : `waiting ${r.waiting_text}`}
                </span>
                {r.ageing && (
                  <span className="self-start">
                    <Pill tone="warn">ageing</Pill>
                  </span>
                )}
              </span>
              <span className="shrink-0 whitespace-nowrap text-sm font-extrabold">{formatSle(r.amount_sle)}</span>
              <ChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-finder-muted" aria-hidden />
            </Link>
          ))}
        </section>
      )}

      {tab === 'low' && (
        <>
          <section aria-labelledby="low-heading" className={`${CARD} py-1`}>
            <h2 id="low-heading" className="px-[18px] pb-1 pt-3.5 text-sm font-extrabold">
              Low or likely short · {low.length}
            </h2>
            {low.length === 0 && (forecast.state === 'ready' || agents.state === 'ready') && <p className="px-[18px] pb-3.5 text-sm text-finder-muted">Nobody looks short right now.</p>}
            {low.map((a, i) => (
              <div key={a.ref} className={`flex flex-col gap-2 px-[18px] py-3.5 ${i ? 'border-t border-finder-card-line' : ''}`}>
                <div className="flex items-center gap-3">
                  <RowAvatar name={a.name} index={i} />
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="text-[15px] font-bold leading-tight">{a.name}</span>
                    <span className="text-[12.5px] text-finder-muted">
                      {a.ref.replace(/^Agent /, '')}
                      {a.area ? ` · ${a.area}` : ''}
                    </span>
                    <Pill tone={a.tone}>{a.label}</Pill>
                  </span>
                </div>
                <div className="h-1.5 rounded-[3px] bg-design-track" aria-hidden="true">
                  <div className={`h-full rounded-[3px] ${a.tone === 'bad' ? 'bg-design-red' : 'bg-design-amber'}`} style={{ width: `${a.bar}%` }} />
                </div>
                <ul className="flex flex-col gap-0.5 text-[12.5px] text-finder-muted">
                  {a.reasons.slice(0, 3).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-2">
                  {a.phone ? (
                    <a href={`tel:${a.phone}`} className="flex h-10 items-center justify-center gap-2 rounded-xl border-[1.5px] border-finder-accent text-[13px] font-extrabold text-finder-link">
                      <Phone size={15} strokeWidth={2.2} aria-hidden />
                      Call
                    </a>
                  ) : (
                    <span className="flex h-10 items-center justify-center rounded-xl bg-design-track text-[13px] font-bold text-finder-muted">No number</span>
                  )}
                  <Link to={`/dealer/float/send?agent=${encodeURIComponent(a.ref)}`} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-finder-accent text-[13px] font-extrabold text-finder-on-orange">
                    <Send size={15} strokeWidth={2.2} aria-hidden />
                    Send float
                  </Link>
                </div>
              </div>
            ))}
          </section>
          <p className="-mt-2 text-xs text-finder-muted">From the agents' own word (Low today, None today), failed visits customers reported and the forecast. No money figure is read from Orange Money.</p>
        </>
      )}

      {tab === 'history' && (
        <>
          <div role="group" aria-label="Period" className="flex rounded-[14px] bg-finder-card p-1">
            {(
              [
                [7, 'This week'],
                [30, 'Last 30 days'],
                [0, 'All'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={range === value} onClick={() => go({ tab: 'history', range: value })} className={segBtn(range === value)}>
                {label}
              </button>
            ))}
          </div>
          <section aria-label="Float movements" className={`${CARD} py-1`}>
            {moves.length === 0 && <p className="px-[18px] py-3.5 text-sm text-finder-muted">Nothing in this period.</p>}
            {moves.map((m, i) => {
              const Ico = m.kind === 'sent' ? ArrowUpRight : m.kind === 'approved' ? Check : X
              const bad = m.kind === 'declined'
              return (
                <div key={m.key} className={`flex items-center gap-3 px-[18px] py-3.5 ${i ? 'border-t border-finder-card-line' : ''}`}>
                  <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${bad ? 'bg-design-red-tint text-design-red' : 'bg-design-good-tint text-finder-likely-ink'}`}>
                    <Ico size={17} strokeWidth={2.2} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-bold leading-tight">{m.title}</span>
                    <span className="line-clamp-2 text-[12.5px] text-finder-muted">{m.sub}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-sm font-extrabold">{formatSle(m.amount)}</span>
                    <Pill tone={bad ? 'bad' : m.kind === 'approved' ? 'warn' : 'good'}>{m.state}</Pill>
                  </span>
                </div>
              )
            })}
          </section>
          <Link to="/dealer/records" className="flex h-[46px] items-center justify-center rounded-[14px] border-[1.5px] border-finder-accent bg-finder-card text-sm font-extrabold text-finder-link">
            Download for Excel
          </Link>
        </>
      )}
    </div>
  )
}
