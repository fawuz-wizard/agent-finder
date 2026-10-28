import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { MapAgentRow, MapCounts, MapFilter, MapRegion, MapSummary } from '@/types/operator'
import { NetworkMap, type Bubble, type MapPin } from './components/NetworkMap'

/**
 * The national map. One question first: how many agents are there, and how many are
 * working, in each region and under each aggregator? The table answers it; the map shows
 * where. Orange's account sees the whole country, an aggregator only their own agents, from
 * the same screen. It only reads: no money figure, and nothing here changes an agent.
 */

type Level =
  | { kind: 'country' }
  | { kind: 'region'; region: MapRegion | 'none' }
  | { kind: 'aggregator'; region: MapRegion | 'none'; id: string; name: string }

const COLUMNS: { key: keyof MapCounts; title: string; def: keyof MapSummary['definitions'] }[] = [
  { key: 'registered', title: 'Registered', def: 'registered' },
  { key: 'transacting', title: 'Transacting', def: 'transacting' },
  { key: 'app_active', title: 'Using the app', def: 'app' },
  { key: 'located', title: 'Located', def: 'located' },
  { key: 'confirmed', title: 'Confirmed', def: 'confirmed' },
]
const SHORT_DEF: Record<keyof MapCounts, string> = {
  registered: 'every agent on record',
  transacting: "Orange's file",
  no_file_figure: '',
  app_active: 'last 7 days',
  located: 'has a pin',
  confirmed: 'on the customer map',
}

export default function NetworkMapPage() {
  const { session, can, signOut } = useSession()
  const national = can(PERMISSIONS.viewNational)
  const sum = useAsync<MapSummary>((s) => operatorApi.mapSummary(s))
  const [level, setLevel] = useState<Level>({ kind: 'country' })
  const [picked, setPicked] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const filter: MapFilter =
    level.kind === 'country' ? {} : level.kind === 'region' ? { region: level.region } : { region: level.region, aggregator: level.id }
  const agents = useAsync<MapAgentRow[] | null>(
    (s) => (level.kind === 'aggregator' ? operatorApi.mapAgents(filter, s) : Promise.resolve(null)),
    [level.kind, level.kind === 'aggregator' ? level.id : '', level.kind !== 'country' ? level.region : ''],
  )
  // Pins: every confirmed shop in view once an aggregator is chosen; in a region or the country, all confirmed shops of that scope.
  const pinRows = useAsync<MapAgentRow[]>((s) => operatorApi.mapAgents(level.kind === 'region' ? { region: level.region } : level.kind === 'aggregator' ? filter : {}, s), [
    level.kind,
    level.kind === 'aggregator' ? level.id : '',
    level.kind !== 'country' ? level.region : '',
  ])

  const data = sum.data
  const view = useMemo(() => {
    if (!data) return null
    const region = level.kind === 'country' ? null : data.regions.find((r) => r.region === level.region) ?? null
    const towns = data.towns.filter((t) => !region || t.region === region.region)
    const bubbles: Bubble[] = towns.map((t) => ({ key: t.city, lat: t.lat, lng: t.lng, count: t.registered, label: t.city, sub: `${t.transacting} of ${t.registered} transacting` }))
    if (level.kind === 'country' && data.no_point.registered > 0)
      bubbles.push({ key: '__none', lat: data.no_point.lat, lng: data.no_point.lng, count: data.no_point.registered, label: 'No place on record', sub: 'town missing or not yet on the map', hollow: true })
    const pins: MapPin[] = (pinRows.data ?? [])
      .filter((r) => r.confirmed && r.lat !== null && r.lng !== null)
      .map((r) => ({ key: r.ref, lat: r.lat!, lng: r.lng!, greyed: !r.active_at_orange, selected: r.ref === picked, label: `${r.shop_name}, ${r.street}` }))
    const chosen = picked ? pins.find((p) => p.key === picked) : undefined
    const fit = chosen ? [chosen] : level.kind === 'aggregator' && pins.length > 0 ? pins : towns.length > 0 ? towns : [{ lat: 8.55, lng: -11.85 }]
    return { region, bubbles, pins, fit }
  }, [data, level, pinRows.data, picked])

  async function download() {
    setSaving(true)
    setSaveError(null)
    try {
      const text = await operatorApi.mapCsv(filter)
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `agent-network-${level.kind === 'country' ? 'sierra-leone' : level.kind === 'region' ? level.region : level.id}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not download.')
    } finally {
      setSaving(false)
    }
  }

  const head = level.kind === 'aggregator' ? data?.regions.find((r) => r.region === level.region)?.aggregators.find((a) => a.id === level.id) : level.kind === 'region' ? (level.region === 'none' ? data?.unplaced : view?.region) : data?.totals
  const headName = level.kind === 'aggregator' ? `${level.name}'s shops` : level.kind === 'region' ? (level.region === 'none' ? 'shops with no place on record' : `shops in the ${view?.region?.label ?? ''}`) : 'shops'
  const shop = picked ? (pinRows.data ?? []).find((r) => r.ref === picked) ?? (agents.data ?? []).find((r) => r.ref === picked) : undefined

  return (
    <div data-theme="dark" data-platform="dark" className="flex min-h-dvh flex-col bg-finder-bg font-finder text-finder-ink">
      <header className="flex items-center justify-between gap-3 border-b border-finder-line px-5 py-3 md:px-7">
        <span className="flex min-w-0 items-center gap-3 text-base font-bold md:text-lg">
          <LogoMark size={30} />
          <span className="truncate">Agent network · {data?.scope_name ?? (national ? 'Sierra Leone' : '')}</span>
        </span>
        <span className="flex shrink-0 items-center gap-4 text-sm font-semibold text-finder-muted">
          <span className="hidden md:inline">{session?.name}</span>
          {national ? (
            <button type="button" onClick={signOut} className="h-control font-bold text-finder-link">
              Sign out
            </button>
          ) : (
            <Link to="/dealer" className="flex h-control items-center font-bold text-finder-link">
              ‹ Dashboard
            </Link>
          )}
        </span>
      </header>

      {!data ? (
        <div className="p-6">
          {sum.state === 'loading' ? (
            <p className="text-base font-medium text-finder-muted">Loading the network…</p>
          ) : (
            <>
              <p className="text-base font-semibold text-danger">{sum.error}</p>
              <button type="button" onClick={sum.refresh} className="mt-3 h-control font-bold text-finder-link">
                Try again
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mx-5 mt-4 flex flex-col gap-3 rounded-panel bg-finder-line/40 px-4 py-3 md:mx-7 md:flex-row md:items-center md:justify-between">
            <p className="text-base font-semibold">
              <span className="text-xl font-bold text-finder-accent">
                {head?.confirmed ?? 0} of {head?.registered ?? 0}
              </span>{' '}
              {headName} confirmed on the customer map
              {level.kind === 'country' && <span className="text-sm font-medium text-finder-muted"> · the number to push up each week</span>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-finder-muted">Updated {new Date(data.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <button type="button" onClick={() => void download()} disabled={saving} className="h-chip rounded-pill bg-finder-accent px-5 text-sm font-bold text-finder-on-orange">
                {saving ? 'Preparing…' : 'Download for Excel'}
              </button>
            </div>
          </div>
          {saveError && <p className="mx-5 mt-2 text-sm font-semibold text-danger md:mx-7">{saveError}</p>}

          <div className="flex flex-1 flex-col gap-5 px-5 py-4 md:flex-row md:px-7">
            <section aria-label="Counts" className="flex w-full flex-col gap-3 md:w-[640px] md:shrink-0">
              <Crumb level={level} regionLabel={view?.region?.label} onCountry={() => { setLevel({ kind: 'country' }); setPicked(null) }} onRegion={(r) => { setLevel({ kind: 'region', region: r }); setPicked(null) }} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="w-[210px] border-b border-finder-line px-2 py-2 text-left align-bottom text-xs font-bold text-finder-muted">Area</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} title={data.definitions[c.def]} className="border-b border-finder-line px-2 py-2 text-right align-bottom text-xs font-bold text-finder-muted">
                          <span className="whitespace-nowrap">{c.title}</span>
                          <span className="block text-[0.7rem] font-medium leading-tight">{c.key === 'transacting' ? `Orange file, ${data.definitions.file_month}` : SHORT_DEF[c.key]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <CountRow name={data.scope_name} c={data.totals} strong selected={level.kind === 'country'} onClick={() => { setLevel({ kind: 'country' }); setPicked(null) }} />
                    {data.regions
                      .filter((r) => level.kind === 'country' || r.region === level.region)
                      .map((r) => (
                        <RegionBlock key={r.region} r={r} level={level} agents={agents.data} picked={picked} onRegion={() => { setLevel({ kind: 'region', region: r.region }); setPicked(null) }} onAggregator={(id, name) => { setLevel({ kind: 'aggregator', region: r.region, id, name }); setPicked(null) }} onAgent={setPicked} />
                      ))}
                    {(level.kind === 'country' || (level.kind !== 'aggregator' && level.region === 'none') || (level.kind === 'aggregator' && level.region === 'none')) && (
                      <CountRow name="No place on record" c={data.unplaced} indent={1} muted selected={level.kind === 'region' && level.region === 'none'} onClick={() => { setLevel({ kind: 'region', region: 'none' }); setPicked(null) }} />
                    )}
                  </tbody>
                </table>
              </div>
              {level.kind === 'region' && level.region === 'none' && <NoPlaceList reasons={data.unplaced.reasons} />}
              <p className="text-xs font-medium leading-relaxed text-finder-muted">
                <b className="text-finder-ink">Transacting</b>: {data.definitions.transacting} Agents with no figure in the file are counted apart, never as zero
                {data.totals.no_file_figure > 0 ? ` (${data.totals.no_file_figure} today)` : ''}. <b className="text-finder-ink">Using the app</b>: {data.definitions.app} <b className="text-finder-ink">Confirmed</b>: {data.definitions.confirmed}
              </p>
            </section>

            <section aria-label="Map" className="relative flex min-h-[420px] flex-1 flex-col md:sticky md:top-4 md:h-[calc(100dvh-2rem)]">
              {view && (
                <NetworkMap
                  className="h-full flex-1"
                  label={`Map of ${level.kind === 'country' ? data.scope_name : level.kind === 'region' ? view.region?.label ?? 'the area' : level.name}`}
                  bubbles={view.bubbles}
                  pins={view.pins}
                  fit={view.fit}
                  onBubble={(key) => {
                    if (key === '__none') return setLevel({ kind: 'region', region: 'none' })
                    const t = data.towns.find((x) => x.city === key)
                    if (t) setLevel({ kind: 'region', region: t.region })
                  }}
                  onPin={setPicked}
                />
              )}
              {shop && <ShopCard row={shop} onClose={() => setPicked(null)} />}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Crumb({ level, regionLabel, onCountry, onRegion }: { level: Level; regionLabel: string | undefined; onCountry: () => void; onRegion: (r: MapRegion | 'none') => void }) {
  if (level.kind === 'country') return <p className="text-sm font-medium text-finder-muted"><b className="text-finder-ink">Whole country</b> · choose a region to look inside</p>
  const region = level.region === 'none' ? 'No place on record' : regionLabel ?? ''
  return (
    <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 text-sm font-medium text-finder-muted">
      <button type="button" onClick={onCountry} className="font-bold text-finder-link">
        Whole country
      </button>
      ›
      {level.kind === 'aggregator' ? (
        <>
          <button type="button" onClick={() => onRegion(level.region)} className="font-bold text-finder-link">
            {region}
          </button>
          › <b className="text-finder-ink">{level.name}</b>
        </>
      ) : (
        <b className="text-finder-ink">{region}</b>
      )}
    </nav>
  )
}

function CountRow({ name, c, strong, indent = 0, muted, selected, onClick }: { name: string; c: MapCounts; strong?: boolean; indent?: number; muted?: boolean; selected?: boolean; onClick?: () => void }) {
  return (
    <tr className={`${selected ? 'bg-finder-line/40' : ''} ${onClick ? 'cursor-pointer hover:bg-finder-line/30' : ''}`} onClick={onClick}>
      <td className={`whitespace-nowrap border-b border-finder-line px-2 py-2.5 text-left ${strong ? 'text-base font-bold' : 'font-semibold'} ${muted ? 'italic text-finder-muted' : ''}`} style={{ paddingLeft: `${8 + indent * 14}px`, boxShadow: selected ? 'inset 4px 0 0 var(--color-finder-accent)' : undefined }}>
        {onClick ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }} className="text-left">
            {name}
          </button>
        ) : (
          name
        )}
      </td>
      {COLUMNS.map((col) => (
        <td key={col.key} className={`border-b border-finder-line px-2 py-2.5 text-right tabular-nums ${strong ? 'text-base font-bold' : ''} ${muted ? 'italic text-finder-muted' : ''}`}>
          {c[col.key]}
        </td>
      ))}
    </tr>
  )
}

function RegionBlock({ r, level, agents, picked, onRegion, onAggregator, onAgent }: { r: MapSummary['regions'][number]; level: Level; agents: MapAgentRow[] | null; picked: string | null; onRegion: () => void; onAggregator: (id: string, name: string) => void; onAgent: (ref: string) => void }) {
  const open = level.kind !== 'country'
  return (
    <>
      <CountRow name={r.label} c={r} indent={1} selected={level.kind === 'region'} onClick={onRegion} />
      {open &&
        r.aggregators
          .filter((a) => level.kind !== 'aggregator' || a.id === level.id)
          .map((a) => (
            <AggregatorBlock key={a.id} a={a} level={level} agents={agents} picked={picked} onClick={() => onAggregator(a.id, a.name)} onAgent={onAgent} />
          ))}
      {open && r.aggregators.length === 0 && (
        <tr>
          <td colSpan={6} className="border-b border-finder-line px-2 py-2.5 pl-9 text-sm text-finder-muted">
            No agents in this region yet.
          </td>
        </tr>
      )}
    </>
  )
}

function AggregatorBlock({ a, level, agents, picked, onClick, onAgent }: { a: MapSummary['regions'][number]['aggregators'][number]; level: Level; agents: MapAgentRow[] | null; picked: string | null; onClick: () => void; onAgent: (ref: string) => void }) {
  const selected = level.kind === 'aggregator' && level.id === a.id
  return (
    <>
      <CountRow name={a.name} c={a} indent={2} selected={selected} onClick={onClick} />
      {selected &&
        (agents ?? []).map((ag) => (
          <tr key={ag.ref} className={`cursor-pointer text-[0.8rem] hover:bg-finder-line/30 ${picked === ag.ref ? 'bg-finder-line/40' : ''}`} onClick={() => onAgent(ag.ref)}>
            <td className="border-b border-finder-line px-2 py-2 pl-12 text-left leading-snug">
              <button type="button" onClick={(e) => { e.stopPropagation(); onAgent(ag.ref) }} className="text-left font-semibold">
                {ag.shop_name}
              </button>
              <span className="block text-xs text-finder-muted">{ag.ref.replace(/^Agent /, 'Code ')} · {ag.street}</span>
            </td>
            <td className="border-b border-finder-line px-2 py-2 text-right">{ag.active_at_orange ? 'active' : 'inactive'}</td>
            <td className="border-b border-finder-line px-2 py-2 text-right">{ag.transacting === null ? 'no figure' : ag.transacting ? 'yes' : 'no'}</td>
            <td className="border-b border-finder-line px-2 py-2 text-right">{ag.app_days > 0 ? `${ag.app_days} of 7 days` : 'no'}</td>
            <td className="border-b border-finder-line px-2 py-2 text-right">{ag.located ? 'yes' : 'no'}</td>
            <td className="border-b border-finder-line px-2 py-2 text-right">{ag.confirmed ? 'yes' : 'no'}</td>
          </tr>
        ))}
    </>
  )
}

function NoPlaceList({ reasons }: { reasons: MapSummary['unplaced']['reasons'] }) {
  return (
    <p className="text-sm font-medium text-finder-muted">
      {reasons.no_town} with no town in the file, {reasons.town_not_on_record} with a town not yet in the towns table. They count in every total; they appear on the map once their town is placed.
    </p>
  )
}

function ShopCard({ row, onClose }: { row: MapAgentRow; onClose: () => void }) {
  return (
    <aside aria-label={row.shop_name} className="absolute left-3 top-3 w-[min(340px,calc(100%-5rem))] rounded-panel border border-finder-line bg-finder-bg p-4 shadow-inset-finder">
      {row.photo_url && <img src={row.photo_url} alt={`The front of ${row.shop_name}`} className="mb-3 h-28 w-full rounded-field object-cover" />}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight">{row.shop_name}</p>
          <p className="text-sm font-medium text-finder-muted">
            {row.ref.replace(/^Agent /, 'Agent ')} · {row.street} · {row.aggregator}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 shrink-0 text-xl font-bold text-finder-muted">
          ×
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        <dt>Open now</dt>
        <dd className="text-right font-bold">{row.open_now ? 'Yes' : 'No'}</dd>
        <dt>Active at Orange</dt>
        <dd className="text-right font-bold">{row.active_at_orange ? 'Yes' : 'No'}</dd>
        <dt>Transacting (file)</dt>
        <dd className="text-right font-bold">{row.transacting === null ? 'No figure' : row.transacting ? 'Yes' : 'No'}</dd>
        <dt>Using the app</dt>
        <dd className="text-right font-bold">{row.app_days > 0 ? `${row.app_days} of 7 days` : 'Not this week'}</dd>
        <dt>Pin</dt>
        <dd className="text-right font-bold">{row.confirmed ? 'Confirmed' : row.located ? 'Waiting for confirmation' : 'Not placed'}</dd>
      </dl>
    </aside>
  )
}
