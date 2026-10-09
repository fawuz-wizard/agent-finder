import { useNavigate } from 'react-router-dom'
import { Button, Card, AppBar } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS, RECORD_KINDS } from '@/types/operator'
import type { AuditEntry, DealerReport, RecordKind } from '@/types/operator'
import { useState } from 'react'

const PERMISSION_TEXT: Record<string, string> = {
  [PERMISSIONS.viewAgent]: 'See your agents',
  [PERMISSIONS.viewFinancial]: 'Reveal financial detail (recorded)',
  [PERMISSIONS.manageFloat]: 'Decide float requests',
  [PERMISSIONS.viewHistory]: 'See agent history',
  [PERMISSIONS.contact]: 'Contact agents',
  [PERMISSIONS.escalate]: 'Escalate to Orange',
  [PERMISSIONS.manageAgent]: 'Register agents and pin their shops',
}

/** Dealer profile: who you are, what you may do, and every financial reveal you made. */
export default function DealerProfilePage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const audit = useAsync<AuditEntry[]>((s) => operatorApi.audit(s))
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

  return (
    <div className="flex flex-1 flex-col">
      <AppBar title={session?.name ?? 'Aggregator'} subtitle={<>Aggregator account</>} />
      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">What you may do</p>
          {(session?.permissions ?? []).map((p) => (
            <p key={p} className="border-b border-line py-2 text-sm last:border-b-0">
              {PERMISSION_TEXT[p] ?? p}
            </p>
          ))}
          <p className="pt-2 text-xs text-muted">Permissions are named and granted individually. The server checks every request; this list only decides what the app offers.</p>
        </Card>

        <Card aria-labelledby="report-heading">
          <p id="report-heading" className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Report and records</p>
          {report.state === 'loading' && <p className="py-2 text-sm text-muted">Loading…</p>}
          {report.data && (
            <>
              <p className="text-sm">
                <b>{report.data.agents}</b> agents · <b>{report.data.located}</b> on the map · <b>{report.data.active_at_orange}</b> active at Orange
              </p>
              <p className="text-xs text-muted">
                {Object.entries(report.data.by_bucket)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(' · ')}
                {' — '}
                {Object.entries(report.data.by_region)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(' · ')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="chip" variant="secondary" block={false} onClick={() => download('report')} disabled={exporting !== null}>
                  {exporting === 'report' ? 'Exporting…' : 'Agent report (CSV)'}
                </Button>
                {RECORD_KINDS.map((r) => (
                  <Button key={r.kind} size="chip" variant="secondary" block={false} onClick={() => download(r.kind)} disabled={exporting !== null}>
                    {exporting === r.kind ? 'Exporting…' : `${r.label} (CSV)`}
                  </Button>
                ))}
              </div>
              {exportError && (
                <p role="alert" className="mt-2 text-sm font-semibold text-danger">
                  {exportError}
                </p>
              )}
              <p className="pt-2 text-xs text-muted">Your agents only. No customer identity, no comments, no balances — the figures the team studies.</p>
            </>
          )}
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Your financial reveals</p>
          {audit.state === 'loading' && <p className="py-2 text-sm text-muted">Loading…</p>}
          {(audit.data ?? []).map((a) => (
            <div key={a.id} className="border-b border-line py-2 last:border-b-0">
              <p className="text-sm font-bold">
                {a.field === 'balance' ? 'Balance' : 'Float position'} · {a.agent_ref}
              </p>
              <p className="text-xs text-muted">
                {new Date(a.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · “{a.purpose}”
              </p>
            </div>
          ))}
          {audit.state === 'ready' && (audit.data ?? []).length === 0 && <p className="py-2 text-sm text-muted">None yet.</p>}
          <p className="pt-2 text-xs text-muted">The record keeps which field you saw and why. It never keeps the amount.</p>
        </Card>

        <Button
          size="cta"
          variant="secondary"
          onClick={() => {
            signOut()
            navigate('/sign-in', { replace: true })
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
