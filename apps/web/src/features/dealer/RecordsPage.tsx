import { useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerReport, RecordKind } from '@/types/operator'
import { FinderCta, FinderHeader } from '@/features/end-user/components/finder'
import { PILL_OFF, PILL_ON, SectionLabel } from '@/features/agent/components/agentChrome'
import { zip } from '@/lib/zip'

type Kind = RecordKind | 'report'

/** What can go in, in the aggregator's words. The agent report is a snapshot; the rest follow the period. */
const TABLES: { kind: Kind; label: string; hint: string; snapshot?: boolean }[] = [
  { kind: 'report', label: 'Agents', hint: 'Every agent: code, shop, region, street, status, on the map, verified', snapshot: true },
  { kind: 'searches', label: 'Customers who saw them', hint: 'Each time an agent was shown, and whether the visit was confirmed' },
  { kind: 'reports', label: 'Customer reports', hint: 'Served or not, and the reason. No names, no comments' },
  { kind: 'transactions', label: 'Transactions logged by agents', hint: 'Cash in and cash out, as bands. No amounts per customer' },
  { kind: 'actions', label: 'Your actions', hint: 'Contacts, nudges, escalations, float decisions' },
  { kind: 'usage', label: 'App usage', hint: 'Who used the app, and when' },
  { kind: 'audit', label: 'Your financial reveals', hint: 'Which field, for whom, why. Never the value' },
]

const PERIODS: { days: number; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

/** The ISO date `days` ago, so Today reads from this morning and 7 days from a week ago. */
function sinceDate(days: number, now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - (days - 1))
  return d.toISOString().slice(0, 10)
}

/**
 * Download a report: the aggregator ticks the tables they want and a period, and gets
 * exactly that, one CSV for one table, one zip of CSVs for several. Their agents only; no
 * customer identity, no comments, no balances.
 */
export default function DealerRecordsPage() {
  const report = useAsync<DealerReport>((s) => operatorApi.report(s))
  const [picked, setPicked] = useState<Set<Kind>>(() => new Set<Kind>(['report']))
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function toggle(kind: Kind) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
    setDone(null)
  }

  const chosen = TABLES.filter((t) => picked.has(t.kind))
  const dated = chosen.some((t) => !t.snapshot)
  const period = PERIODS.find((p) => p.days === days)!
  const today = new Date().toISOString().slice(0, 10)
  const summary = chosen.length === 0 ? 'Nothing ticked yet' : `${chosen.length} ${chosen.length === 1 ? 'table' : 'tables'}${dated ? ` · ${period.label.toLowerCase()}` : ''} · ${chosen.length === 1 ? 'CSV' : 'zip of CSVs'}`

  /** Hand the browser a file: the one CSV, or a zip with one CSV per table. */
  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function download() {
    if (chosen.length === 0 || busy) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const since = sinceDate(days)
      const files = await Promise.all(chosen.map(async (t) => ({ name: `${t.kind === 'report' ? 'agent-report' : t.kind}-${today}.csv`, text: await operatorApi.recordsCsv(t.kind, t.snapshot ? undefined : since) })))
      if (files.length === 1) save(new Blob([files[0]!.text], { type: 'text/csv;charset=utf-8' }), files[0]!.name)
      else save(new Blob([zip(files) as BlobPart], { type: 'application/zip' }), `agent-finder-report-${today}.zip`)
      setDone(files.length === 1 ? files[0]!.name : `agent-finder-report-${today}.zip`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader back="/dealer/profile" title="Download a report" />
      {report.data && (
        <p className="mt-4 text-sm font-medium text-finder-muted">
          {report.data.agents} agents · {report.data.located} on the map · {report.data.active_at_orange} active at Orange
        </p>
      )}

      <SectionLabel className="mt-6">What to include</SectionLabel>
      <div className="mt-2 flex flex-col" role="group" aria-label="What to include">
        {TABLES.map((t) => {
          const on = picked.has(t.kind)
          return (
            <label key={t.kind} className="flex min-h-[3.5rem] cursor-pointer items-center justify-between gap-4 border-b border-finder-line py-2 last:border-b-0">
              <span className="min-w-0">
                <span className="block text-base font-semibold">{t.label}</span>
                <span className="block text-xs font-medium text-finder-muted">{t.hint}</span>
              </span>
              <input type="checkbox" checked={on} onChange={() => toggle(t.kind)} className="sr-only" />
              <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-2 ${on ? 'border-finder-accent bg-finder-accent text-finder-on-orange' : 'border-finder-ink'}`}>
                {on && (
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10.5 8 14.5 16 6" />
                  </svg>
                )}
              </span>
            </label>
          )
        })}
      </div>

      <SectionLabel className="mt-8">Period</SectionLabel>
      <div role="radiogroup" aria-label="Period" className="mt-3 flex gap-2">
        {PERIODS.map((p) => (
          <button key={p.days} type="button" role="radio" aria-checked={days === p.days} onClick={() => setDays(p.days)} disabled={!dated} className={`h-chip flex-1 rounded-pill text-sm font-bold disabled:opacity-45 ${days === p.days ? PILL_ON : PILL_OFF}`}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">{dated ? 'The agents table is always as of now; the period applies to the rest.' : 'The agents table is as of now; tick another table to choose a period.'}</p>

      <p className="mt-8 text-sm font-bold text-finder-muted" aria-live="polite">
        {summary}
      </p>
      <FinderCta className="mt-3" onClick={() => void download()} disabled={busy || chosen.length === 0}>
        {busy ? 'Preparing…' : 'Download'}
      </FinderCta>
      {done && (
        <p role="status" className="mt-3 text-sm font-semibold text-finder-likely">
          Saved as {done}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs font-medium text-finder-muted">Your agents only. No customer identity, no comments, no balances: the figures the team studies.</p>
    </div>
  )
}
