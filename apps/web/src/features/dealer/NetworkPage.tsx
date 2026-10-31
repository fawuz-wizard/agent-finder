import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { MapAgentRow, MapSummary } from '@/types/operator'
import { ScreenTitle } from './components/designKit'
import { Link, useNavigate } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import { CARD, PAGE } from './components/designClasses'
import { AgentMap } from './components/AgentMap'
import { toPins, usePlacedAgents } from './agentPins'

/**
 * Network overview, the aggregator's own agents, drawn as the approved design's screen 17: the
 * map card with the confirmed shops and three counts under it, then this week's active share
 * and the customer-map funnel. The server scopes it to this aggregator and their
 * sub-aggregators; Orange's national view is a different account. No money figure.
 */
export default function DealerNetworkPage() {
  const summary = useAsync<MapSummary>((s) => operatorApi.mapSummary(s))
  const rows = useAsync<MapAgentRow[]>((s) => operatorApi.mapAgents({}, s))
  const t = summary.data?.totals
  const all = rows.data ?? []
  const active = all.filter((r) => r.active_at_orange).length
  const { placed } = usePlacedAgents()
  const navigate = useNavigate()
  const share = t && t.registered ? Math.round((t.app_active / t.registered) * 100) : 0
  const funnel = t
    ? [
        { label: 'Reg.', value: t.registered, tone: 'bg-design-peach-bar' },
        { label: 'Pinned', value: t.located, tone: 'bg-design-peach-bar' },
        { label: 'Live', value: t.confirmed, tone: 'bg-finder-accent' },
      ]
    : []

  return (
    <div className={PAGE}>
      <ScreenTitle title="Network overview" back="/dealer" />
      {(summary.state === 'loading' || rows.state === 'loading') && <p className="text-sm font-medium text-finder-muted">Loading…</p>}
      {summary.state === 'error' && <p className="text-sm font-semibold text-danger">{summary.error}</p>}
      {t && rows.data && (
        <>
          <section className={`${CARD} overflow-hidden`}>
            <div className="relative h-[240px]">
              <button type="button" aria-label="Open the full map" onClick={() => navigate('/dealer/network/map')} className="absolute inset-0 z-[1]" />
              <AgentMap pins={toPins(placed)} label={`${placed.length} of your shops on the map`} className="h-full w-full" />
              <Link to="/dealer/network/map" className="absolute bottom-3 right-3 z-[2] flex items-center gap-2 rounded-xl bg-design-ink px-3.5 py-2.5 text-[13px] font-bold text-white">
                Open full map <Maximize2 size={15} strokeWidth={2.2} aria-hidden />
              </Link>
            </div>
            <div className="grid grid-cols-3">
              {[
                { value: t.registered, label: 'Total', tone: 'text-finder-ink' },
                { value: active, label: 'Active', tone: 'text-finder-likely-ink' },
                { value: t.registered - active, label: 'Inactive', tone: 'text-danger' },
              ].map((n, i) => (
                <div key={n.label} className={`flex flex-col gap-1 px-2 py-4 text-center ${i ? 'border-l border-finder-card-line' : ''}`}>
                  <span className={`text-[22px] font-extrabold ${n.tone}`}>{n.value}</span>
                  <span className="text-xs font-semibold text-finder-muted">{n.label}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-[1fr_1.3fr] gap-3">
            <section className={`${CARD} flex flex-col items-center gap-3 p-5`}>
              <h2 className="self-start text-[13px] font-bold">Active rate</h2>
              <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--color-finder-accent) 0 ${share}%, var(--color-design-peach) 0)` }}>
                <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-finder-card text-[22px] font-extrabold">{share}%</div>
              </div>
              <p className="text-center text-xs text-finder-muted">
                {t.app_active} of {t.registered} agents used the app
              </p>
            </section>
            <section className={`${CARD} flex flex-col gap-2.5 p-5`}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[13px] font-bold">Customer map</h2>
                <span className="text-xs font-bold text-finder-likely-ink">{t.confirmed} live</span>
              </div>
              <div className="flex h-[110px] flex-1 items-end gap-2">
                {funnel.map((b) => (
                  <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="text-[11px] font-bold">{b.value}</span>
                    <div className={`w-full rounded ${b.tone}`} style={{ height: `${t.registered ? Math.max(6, (b.value / t.registered) * 70) : 6}%` }} />
                    <span className="text-[10px] text-finder-muted">{b.label}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <p className="-mt-2 text-xs font-medium text-finder-muted">{summary.data!.definitions.confirmed}</p>
        </>
      )}
    </div>
  )
}
