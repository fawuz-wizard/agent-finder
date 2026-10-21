import { useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { RECORD_KINDS } from '@/types/operator'
import type { DealerReport, RecordKind } from '@/types/operator'
import { FinderHeader } from '@/features/end-user/components/finder'
import { Line, SectionLabel } from '@/features/agent/components/agentChrome'

const REGION_LABEL: Record<string, string> = { west: 'West', north: 'North', east: 'East', south: 'South', unknown: 'no region' }

/**
 * Report and records: the Global Report figures for your agents, and the seven CSV files
 * the team studies, one row each. Your agents only; no customer identity, no comments, no
 * balances.
 */
export default function DealerRecordsPage() {
  const report = useAsync<DealerReport>((s) => operatorApi.report(s))
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  /** Fetch one CSV with the session and hand it to the browser as a file. */
  async function download(kind: RecordKind | 'report') {
    setExporting(kind)
    setExportError(null)
    try {
      const text = await operatorApi.recordsCsv(kind)
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${kind === 'report' ? 'agent-report' : kind}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Could not export.')
    } finally {
      setExporting(null)
    }
  }

  const regions = report.data ? Object.entries(report.data.by_region) : []
  const files: { kind: RecordKind | 'report'; label: string }[] = [{ kind: 'report', label: 'Agent report' }, ...RECORD_KINDS]
  const csvButton = (f: (typeof files)[number]) => (
    <button type="button" onClick={() => void download(f.kind)} disabled={exporting !== null} aria-label={`${f.label} (CSV)`} className="flex h-control shrink-0 items-center text-base font-bold text-finder-link disabled:opacity-60">
      {exporting === f.kind ? 'Exporting…' : 'CSV ›'}
    </button>
  )

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader back="/dealer" title="Report and records" />

      {report.state === 'loading' && <p className="mt-6 text-base font-medium text-finder-muted">Loading…</p>}
      {report.data && (
        <>
          <p className="mt-6 text-base font-bold">
            {report.data.agents} agents · {report.data.located} on the map · {report.data.active_at_orange} active at Orange
          </p>
          {regions.length > 0 && <p className="mt-1 text-sm font-medium text-finder-muted">{regions.map(([k, v]) => `${v} ${REGION_LABEL[k] ?? k}`).join(' · ')}</p>}
          <div className="mt-3 flex flex-col">
            {Object.entries(report.data.by_bucket).map(([k, v]) => (
              <Line key={k} label={k[0]!.toUpperCase() + k.slice(1)} value={v} />
            ))}
          </div>

          <SectionLabel className="mt-8">Files</SectionLabel>
          <div className="mt-2 flex flex-col">
            {files.map((f) => (
              <Line key={f.kind} label={f.label} action={csvButton(f)} />
            ))}
          </div>
          {exportError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-danger">
              {exportError}
            </p>
          )}
          <p className="mt-2 text-xs font-medium text-finder-muted">Your agents only. No customer identity, no comments, no balances: the figures the team studies.</p>
        </>
      )}
    </div>
  )
}
