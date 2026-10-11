import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS, RECORD_KINDS } from '@/types/operator'
import type { AuditEntry, DealerReport, RecordKind } from '@/types/operator'
import { FinderBox, FinderCta, FinderHeader, FinderSheet } from '@/features/end-user/components/finder'
import { FieldLabel, PILL_OFF, Row, SectionLabel } from '@/features/agent/components/agentChrome'
import { Line, PillButton } from './components/dealerChrome'
import pkg from '../../../package.json'

const PERMISSION_TEXT: Record<string, string> = {
  [PERMISSIONS.viewAgent]: 'See your agents',
  [PERMISSIONS.viewFinancial]: 'Reveal financial detail (recorded)',
  [PERMISSIONS.manageFloat]: 'Decide float requests',
  [PERMISSIONS.viewHistory]: 'See agent history',
  [PERMISSIONS.contact]: 'Contact agents',
  [PERMISSIONS.escalate]: 'Escalate to Orange',
  [PERMISSIONS.manageAgent]: 'Register agents and pin their shops',
}

const REGION_LABEL: Record<string, string> = { west: 'West', north: 'North', east: 'East', south: 'South', unknown: 'no region' }

/**
 * Profile: who you are and what you may do, the Global Report figures with the CSV exports,
 * every financial reveal you made, your PIN, and sign out. On the finder's design like the
 * rest of the console.
 */
export default function DealerProfilePage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const audit = useAsync<AuditEntry[]>((s) => operatorApi.audit(s))
  const report = useAsync<DealerReport>((s) => operatorApi.report(s))
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  // Change PIN: the current one first.
  const [pinOpen, setPinOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [againPin, setAgainPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinDone, setPinDone] = useState(false)

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

  async function changePin() {
    if (newPin !== againPin) {
      setPinError('The two new PINs are not the same.')
      return
    }
    setPinBusy(true)
    setPinError(null)
    try {
      await operatorApi.changeDealerPin(currentPin, newPin)
      setPinOpen(false)
      setCurrentPin('')
      setNewPin('')
      setAgainPin('')
      setPinDone(true)
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Could not change the PIN.')
    } finally {
      setPinBusy(false)
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  const pinField = 'h-[3.5rem] w-full rounded-field bg-finder-bg px-4 text-md font-bold tracking-[0.4em] text-white shadow-inset-finder outline-none placeholder:text-finder-muted/50 placeholder:tracking-normal focus:outline focus:outline-2 focus:outline-finder-link'
  const regions = report.data ? Object.entries(report.data.by_region) : []

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Profile" />

      <p className="mt-6 text-xl font-bold leading-tight">{session?.name ?? 'Aggregator'}</p>
      <p className="mt-1 text-sm font-medium text-finder-muted">
        Aggregator account{report.data ? ` · ${report.data.agents} agents` : ''}
      </p>

      <SectionLabel className="mt-6">What you may do</SectionLabel>
      <FinderBox className="mt-3 flex flex-col px-4 py-2">
        {(session?.permissions ?? []).map((p) => (
          <Line key={p} label={PERMISSION_TEXT[p] ?? p} value="" />
        ))}
      </FinderBox>
      <p className="mt-2 text-xs font-medium text-finder-muted">Permissions are named and granted one by one. The server checks every request; this list only decides what the app offers.</p>

      <SectionLabel id="report-heading" className="mt-6">
        Report and records
      </SectionLabel>
      <FinderBox className="mt-3 flex flex-col gap-3 px-4 py-4" aria-labelledby="report-heading">
        {report.state === 'loading' && <p className="text-base font-medium text-finder-muted">Loading…</p>}
        {report.data && (
          <>
            <p className="text-base font-bold">
              {report.data.agents} agents · {report.data.located} on the map · {report.data.active_at_orange} active at Orange
            </p>
            <div className="flex flex-col">
              {Object.entries(report.data.by_bucket).map(([k, v]) => (
                <Line key={k} label={k[0]!.toUpperCase() + k.slice(1)} value={v} />
              ))}
            </div>
            {regions.length > 0 && (
              <p className="text-sm font-medium text-finder-muted">{regions.map(([k, v]) => `${v} ${REGION_LABEL[k] ?? k}`).join(' · ')}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <PillButton onClick={() => download('report')} disabled={exporting !== null} className="text-sm">
                {exporting === 'report' ? 'Exporting…' : 'Agent report (CSV)'}
              </PillButton>
              {RECORD_KINDS.map((r) => (
                <PillButton key={r.kind} onClick={() => download(r.kind)} disabled={exporting !== null} className="text-sm">
                  {exporting === r.kind ? 'Exporting…' : `${r.label} (CSV)`}
                </PillButton>
              ))}
            </div>
            {exportError && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {exportError}
              </p>
            )}
            <p className="text-xs font-medium text-finder-muted">Your agents only. No customer identity, no comments, no balances: the figures the team studies.</p>
          </>
        )}
      </FinderBox>

      <SectionLabel className="mt-6">Your financial reveals</SectionLabel>
      <FinderBox className="mt-3 flex flex-col px-4 py-2">
        {audit.state === 'loading' && <p className="py-2 text-base font-medium text-finder-muted">Loading…</p>}
        {(audit.data ?? []).map((a) => (
          <Line
            key={a.id}
            label={
              <span className="block">
                <span className="block font-bold text-white">
                  {a.field === 'balance' ? 'Balance' : 'Float position'} · {a.agent_ref.replace(/^Agent /, 'Code ')}
                </span>
                <span className="block text-xs">“{a.purpose}”</span>
              </span>
            }
            value={new Date(a.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          />
        ))}
        {audit.state === 'ready' && (audit.data ?? []).length === 0 && <p className="py-2 text-base font-medium text-finder-muted">None yet.</p>}
      </FinderBox>
      <p className="mt-2 text-xs font-medium text-finder-muted">The record keeps which field you saw and why. It never keeps the amount.</p>

      <SectionLabel className="mt-6">Security</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        <Row
          label="PIN"
          action={
            <button type="button" onClick={() => setPinOpen(true)} className="text-base font-bold text-finder-link">
              Change ›
            </button>
          }
        />
      </div>
      {pinDone && (
        <p role="status" className="mt-2 text-sm font-semibold text-finder-likely">
          Your PIN is changed.
        </p>
      )}
      <p className="mt-2 text-xs font-medium text-finder-muted">Forgot it? The Agent Finder team gives you a one-time code; you choose a new PIN when you sign in with it.</p>

      <SectionLabel className="mt-6">About</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        <Row label="Aggregator App" value={`Pilot build ${pkg.version}`} />
      </div>

      <button
        type="button"
        onClick={() => {
          signOut()
          navigate('/sign-in', { replace: true })
        }}
        className={`mt-8 h-[2.9rem] w-full rounded-pill text-base font-bold ${PILL_OFF}`}
      >
        Sign out
      </button>

      <FinderSheet open={pinOpen} onClose={() => setPinOpen(false)} title="Change PIN">
        <FieldLabel htmlFor="dealer-pin-current">Current PIN</FieldLabel>
        <input id="dealer-pin-current" type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(e) => setCurrentPin(digits(e.target.value))} className={pinField} placeholder="4 to 6 digits" />
        <FieldLabel htmlFor="dealer-pin-new">New PIN</FieldLabel>
        <input id="dealer-pin-new" type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(digits(e.target.value))} className={pinField} placeholder="4 to 6 digits" />
        <FieldLabel htmlFor="dealer-pin-again">New PIN again</FieldLabel>
        <input id="dealer-pin-again" type="password" inputMode="numeric" autoComplete="new-password" value={againPin} onChange={(e) => setAgainPin(digits(e.target.value))} className={pinField} placeholder="4 to 6 digits" />
        {pinError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {pinError}
          </p>
        )}
        <FinderCta onClick={() => void changePin()} disabled={pinBusy || currentPin.length < 4 || newPin.length < 4 || againPin.length < 4}>
          {pinBusy ? 'Saving…' : 'Change PIN'}
        </FinderCta>
      </FinderSheet>
    </div>
  )
}
