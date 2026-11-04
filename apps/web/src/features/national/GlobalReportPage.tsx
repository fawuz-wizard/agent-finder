import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { ApiRequestError } from '@/lib/api'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { GlobalReport, ReportChangeKind } from '@/types/operator'

/**
 * Orange's daily Global Report, in two steps so nothing changes by surprise: upload reads the
 * file and shows what it would change; a person then applies it (or sets it aside). The
 * network, the map and every aggregator's view are filled from it once applied.
 */

const CHANGES: { kind: ReportChangeKind; title: string; hint: string }[] = [
  { kind: 'new', title: 'New agents', hint: 'not on record yet; added under their aggregator' },
  { kind: 'updated', title: 'Agents updated', hint: "already on record; Orange's details replace ours" },
  { kind: 'located', title: 'Placed on the map', hint: "from Orange's location for the shop" },
  { kind: 'deactivated', title: 'Made inactive by Orange', hint: 'hidden from customers' },
  { kind: 'reactivated', title: 'Active again', hint: 'shown again once located' },
  { kind: 'moved', title: 'Moved to another aggregator', hint: 'by the parent line in the report' },
  { kind: 'not_in_report', title: 'Not in this report', hint: 'on record from an earlier report; nothing is removed' },
]

const ISSUE_TEXT: Record<string, string> = {
  repeated_header: 'repeated header row (skipped)',
  unknown_category: 'not an agent or sub-aggregator (held back)',
  no_aggregator: 'no aggregator line (held back)',
  bad_agent_code: 'agent code is not 6 digits (held back)',
  duplicate_agent_code: 'agent code appears twice (held back)',
  duplicate_msisdn: 'Orange Money number appears twice (held back)',
  bad_msisdn: 'Orange Money number is not 8 digits',
  no_city: 'no city',
  region_unknown: 'region unknown',
  no_name: 'no name',
  bad_status: 'status not Y or N',
  no_address: 'no address',
  address_is_city_only: 'address is only the city',
  short_address: 'address too short',
  name_has_digits: 'name contains digits',
  bad_coordinates: 'location not in Sierra Leone (not used)',
}

const COLUMN_TEXT: { key: keyof GlobalReport['summary']['columns']; label: string }[] = [
  { key: 'coordinates', label: 'Shop locations' },
  { key: 'activity', label: 'Cash in / cash out' },
  { key: 'float', label: 'Float' },
  { key: 'commission', label: 'Commission' },
]

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STATUS_TEXT: Record<GlobalReport['status'], string> = {
  previewed: 'Waiting to be applied',
  applying: 'Being applied',
  applied: 'Applied',
  discarded: 'Set aside',
}

export default function GlobalReportPage() {
  const { session, signOut } = useSession()
  const history = useAsync<GlobalReport[]>((s) => operatorApi.globalReports(s))
  const [file, setFile] = useState<File | null>(null)
  const [day, setDay] = useState(today())
  const [busy, setBusy] = useState<null | 'reading' | 'applying' | 'discarding'>(null)
  const [error, setError] = useState<string | null>(null)
  const [shrunk, setShrunk] = useState<string | null>(null)
  const [current, setCurrent] = useState<GlobalReport | null>(null)

  async function read() {
    if (!file) return
    setBusy('reading')
    setError(null)
    setShrunk(null)
    try {
      setCurrent(await operatorApi.uploadGlobalReport(file, day))
      history.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the report.')
    } finally {
      setBusy(null)
    }
  }

  async function apply(confirmShrink: boolean) {
    if (!current) return
    setBusy('applying')
    setError(null)
    try {
      setCurrent(await operatorApi.applyGlobalReport(current.id, confirmShrink))
      setShrunk(null)
      history.refresh()
    } catch (e) {
      if (e instanceof ApiRequestError && e.error.code === 'report_shrunk') setShrunk(e.message)
      else setError(e instanceof Error ? e.message : 'Could not apply the report.')
    } finally {
      setBusy(null)
    }
  }

  async function discard() {
    if (!current) return
    setBusy('discarding')
    setError(null)
    try {
      setCurrent(await operatorApi.discardGlobalReport(current.id))
      setShrunk(null)
      history.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the report aside.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div data-theme="dark" data-platform="dark" className="flex min-h-dvh flex-col bg-finder-bg font-finder text-finder-ink">
      <header className="flex items-center justify-between gap-3 border-b border-finder-line px-5 py-3 md:px-7">
        <span className="flex min-w-0 items-center gap-3 text-base font-bold md:text-lg">
          <LogoMark size={30} />
          <span className="truncate">Global Report · Orange Sierra Leone</span>
        </span>
        <span className="flex shrink-0 items-center gap-4 text-sm font-semibold text-finder-muted">
          <Link to="/national" className="flex h-control items-center font-bold text-finder-link">
            Agent network
          </Link>
          <span className="hidden md:inline">{session?.name}</span>
          <button type="button" onClick={signOut} className="h-control font-bold text-finder-link">
            Sign out
          </button>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-5 py-5 md:px-7">
        <section aria-labelledby="upload-title" className="rounded-panel bg-finder-line/40 p-5">
          <h1 id="upload-title" className="text-xl font-bold">
            Add today's report
          </h1>
          <p className="mt-1 text-base text-finder-muted">
            The Excel (.xlsx) or CSV file from Orange. It is read and checked first; nothing changes until you apply it.
          </p>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              The day it covers
              <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} className="h-control rounded-field border border-finder-line bg-finder-bg px-3 text-base text-finder-ink" />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
              Report file
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="h-control text-base text-finder-ink file:mr-3 file:h-full file:rounded-pill file:border-0 file:bg-finder-line file:px-4 file:font-bold file:text-finder-ink"
              />
            </label>
            <button type="button" disabled={!file || busy !== null} onClick={() => void read()} className="h-control rounded-pill bg-finder-accent px-6 font-bold text-finder-on-orange disabled:opacity-50">
              {busy === 'reading' ? 'Reading…' : 'Read the report'}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-base font-semibold text-danger">
              {error}
            </p>
          )}
        </section>

        {current && <Preview report={current} busy={busy} shrunk={shrunk} onApply={apply} onDiscard={discard} />}

        <section aria-labelledby="history-title" className="flex flex-col gap-2">
          <h2 id="history-title" className="text-lg font-bold">
            Reports so far
          </h2>
          {history.state === 'error' ? (
            <p className="text-base text-danger">
              Could not load the list ·{' '}
              <button type="button" onClick={history.refresh} className="font-bold text-finder-link">
                Try again
              </button>
            </p>
          ) : !history.data ? (
            <p className="text-base text-finder-muted">Loading…</p>
          ) : history.data.length === 0 ? (
            <p className="text-base text-finder-muted">No report has been added yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-finder-line rounded-panel bg-finder-line/40">
              {history.data.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setCurrent(r)} className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left active:scale-[0.99]">
                    <span className="font-bold">{r.report_date}</span>
                    <span className="min-w-0 flex-1 truncate text-finder-muted">{r.file_name}</span>
                    <span className="text-sm font-semibold">
                      {r.summary.importable} agents · {STATUS_TEXT[r.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

function Preview({
  report,
  busy,
  shrunk,
  onApply,
  onDiscard,
}: {
  report: GlobalReport
  busy: null | 'reading' | 'applying' | 'discarding'
  shrunk: string | null
  onApply: (confirmShrink: boolean) => Promise<void>
  onDiscard: () => Promise<void>
}) {
  const s = report.summary
  const issues = Object.entries(s.issues)
  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-4 rounded-panel bg-finder-line/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="preview-title" className="text-lg font-bold">
          Report for {report.report_date}
        </h2>
        <span className="text-sm font-semibold text-finder-muted">
          {report.file_name} · {STATUS_TEXT[report.status]}
          {report.duplicate ? ' · this file was added before' : ''}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Rows in the file" value={s.rows} />
        <Figure label="Agents to apply" value={s.importable} />
        <Figure label="Held back" value={s.held_back} />
        <Figure label="Aggregators" value={s.aggregators} />
      </dl>

      <div className="flex flex-wrap gap-2" aria-label="What the report carries">
        {COLUMN_TEXT.map((c) => (
          <span key={c.key} className={`rounded-pill px-3 py-1 text-sm font-semibold ${s.columns[c.key] ? 'bg-finder-open/20 text-finder-ink' : 'bg-finder-line text-finder-muted'}`}>
            {c.label}: {s.columns[c.key] ? 'in the report' : 'not in the report'}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold">{report.status === 'applied' ? 'What it changed' : 'What applying will do'}</h3>
        {CHANGES.map((c) => (
          <details key={c.kind} className="rounded-field bg-finder-bg px-3 py-2">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-base">
              <span>
                <span className="font-semibold">{c.title}</span> <span className="text-sm text-finder-muted">· {c.hint}</span>
              </span>
              <span className="text-lg font-bold">{s.changes.counts[c.kind] ?? 0}</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-finder-muted">
              {(s.changes.lists[c.kind] ?? []).map((i, n) => (
                <li key={`${i.agent_code ?? i.ref ?? ''}-${n}`}>
                  {i.name} {i.agent_code ? `· agent code ${i.agent_code}` : ''} {i.row ? `· row ${i.row}` : ''}
                </li>
              ))}
              {(s.changes.counts[c.kind] ?? 0) > (s.changes.lists[c.kind]?.length ?? 0) && <li>…and {s.changes.counts[c.kind] - s.changes.lists[c.kind].length} more</li>}
            </ul>
          </details>
        ))}
      </div>

      {issues.length > 0 && (
        <details className="rounded-field bg-finder-bg px-3 py-2">
          <summary className="cursor-pointer text-base font-semibold">
            Rows to check in the file ({s.rows_with_issues.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {issues.map(([code, n]) => (
              <li key={code}>
                {ISSUE_TEXT[code] ?? code.replace(/_/g, ' ')}: {n} {n === 1 ? 'row' : 'rows'} (
                {s.rows_with_issues
                  .filter((r) => r.issues.includes(code))
                  .slice(0, 12)
                  .map((r) => r.row)
                  .join(', ')}
                )
              </li>
            ))}
          </ul>
        </details>
      )}

      {report.status === 'previewed' && (
        <div className="flex flex-col gap-2">
          {shrunk && (
            <p role="alert" className="text-base font-semibold text-danger">
              {shrunk}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy !== null || s.importable === 0} onClick={() => void onApply(Boolean(shrunk))} className="h-control rounded-pill bg-finder-accent px-6 font-bold text-finder-on-orange disabled:opacity-50">
              {busy === 'applying' ? 'Applying…' : shrunk ? 'Apply anyway' : 'Apply to the network'}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void onDiscard()} className="h-control rounded-pill border border-finder-line px-6 font-bold text-finder-ink disabled:opacity-50">
              {busy === 'discarding' ? 'Setting aside…' : 'Set aside'}
            </button>
          </div>
        </div>
      )}
      {report.status === 'applied' && (
        <p className="text-base font-semibold">
          Applied{report.applied_by ? ` by ${report.applied_by}` : ''}
          {report.applied_at ? ` at ${new Date(report.applied_at).toLocaleString()}` : ''}. The map, the aggregators' lists and the report now show it.
        </p>
      )}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-field bg-finder-bg px-3 py-2">
      <dt className="text-sm text-finder-muted">{label}</dt>
      <dd className="text-xl font-bold">{value.toLocaleString()}</dd>
    </div>
  )
}
