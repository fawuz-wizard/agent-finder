import { useEffect, useRef, useState } from 'react'
import { LocateFixed, Minus, Plus } from 'lucide-react'
import { TILE, fromTile, tileSource, toTile } from '@/lib/tiles'
import { MAX_ZOOM, MIN_ZOOM, fitView } from './networkMapView'
import { TONE_DOT, type AgentPin } from '../agentPins'

/**
 * The aggregator's own agents on a light street map, inside the app (never Google Maps and
 * never Orange's national page). Plain map pictures from OpenStreetMap, one dot per confirmed
 * shop, coloured by today's state. Static on the Network card; draggable with zoom and
 * recenter on the Full map. `focus` centres one shop; `selected` rings it. `origin` and
 * `route` draw the aggregator's own position and the way to the focused shop (Directions);
 * the view then frames both.
 */
export function AgentMap({
  pins,
  interactive = false,
  selected = null,
  focus = null,
  onSelect,
  label,
  controlsTop = 12,
  className = '',
  origin = null,
  route = null,
}: {
  pins: AgentPin[]
  interactive?: boolean
  selected?: string | null
  focus?: string | null
  onSelect?: (key: string) => void
  label: string
  controlsTop?: number
  className?: string
  origin?: { lat: number; lng: number } | null
  route?: { lat: number; lng: number }[] | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 360, h: 240 })
  const [view, setView] = useState({ lat: 8.465, lng: -13.23, zoom: 12 })
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () =>
      setSize((s) => {
        const w = el.clientWidth || 360
        const h = el.clientHeight || 240
        return Math.abs(s.w - w) < 2 && Math.abs(s.h - h) < 2 ? s : { w, h }
      })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitKey = JSON.stringify(pins.map((p) => [p.lat.toFixed(4), p.lng.toFixed(4)]))
  const recenter = () => setView(fitView(pins, size.w, size.h, 16))
  const wayKey = origin ? `${origin.lat},${origin.lng},${route?.length ?? 0}` : ''
  useEffect(() => {
    const f = focus ? pins.find((p) => p.key === focus) : null
    if (f && origin) {
      // Frame the whole way in the top part of the screen: the shop's card covers the bottom.
      const v = fitView([f, origin, ...(route ?? [])], size.w, size.h * 0.5, 17)
      const t = toTile(v.lat, v.lng, v.zoom)
      const shifted = fromTile(t.x, t.y + (size.h * 0.17) / TILE, v.zoom)
      setView({ lat: shifted.lat, lng: shifted.lng, zoom: v.zoom })
    }
    else setView(f ? { lat: f.lat, lng: f.lng, zoom: 16 } : fitView(pins, size.w, size.h, 16))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.w, size.h, focus, wayKey])

  const { zoom } = view
  const c = toTile(view.lat, view.lng, zoom)
  const dx = drag?.dx ?? 0
  const dy = drag?.dy ?? 0
  const n = 2 ** zoom
  const cols = Math.ceil(size.w / TILE / 2) + 1
  const rows = Math.ceil(size.h / TILE / 2) + 1
  const tiles: { x: number; y: number; left: number; top: number }[] = []
  for (let ix = -cols; ix <= cols; ix++)
    for (let iy = -rows; iy <= rows; iy++) {
      const tx = Math.floor(c.x) + ix
      const ty = Math.floor(c.y) + iy
      if (ty < 0 || ty >= n) continue
      tiles.push({ x: ((tx % n) + n) % n, y: ty, left: size.w / 2 + dx + (tx - c.x) * TILE, top: size.h / 2 + dy + (ty - c.y) * TILE })
    }
  const at = (p: { lat: number; lng: number }) => {
    const t = toTile(p.lat, p.lng, zoom)
    return { left: size.w / 2 + dx + (t.x - c.x) * TILE, top: size.h / 2 + dy + (t.y - c.y) * TILE }
  }
  function release() {
    if (!drag) return
    if (drag.dx !== 0 || drag.dy !== 0) {
      const next = fromTile(c.x - drag.dx / TILE, c.y - drag.dy / TILE, zoom)
      setView({ lat: next.lat, lng: next.lng, zoom })
    }
    setDrag(null)
  }
  const zoomBy = (d: number) => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom + d)) }))
  const src = tileSource()
  const ctl = 'flex h-11 w-11 items-center justify-center rounded-[14px] bg-finder-card text-xl font-bold text-finder-ink shadow-[0_2px_8px_rgba(0,0,0,0.12)]'

  return (
    <div
      ref={box}
      role="region"
      aria-label={label}
      className={`${/\babsolute\b/.test(className) ? '' : 'relative'} select-none overflow-hidden bg-design-map-a ${interactive ? 'cursor-grab active:cursor-grabbing' : ''} ${className}`}
      style={interactive ? { touchAction: 'none' } : undefined}
      onPointerDown={
        interactive
          ? (e) => {
              if ((e.target as HTMLElement).closest('button')) return
              e.currentTarget.setPointerCapture?.(e.pointerId)
              setDrag({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 })
            }
          : undefined
      }
      onPointerMove={interactive ? (e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x, dy: e.clientY - drag.y }) : undefined}
      onPointerUp={interactive ? release : undefined}
      onPointerCancel={interactive ? release : undefined}
    >
      <div className="absolute inset-0" style={src.provider === 'osm' ? { filter: 'saturate(0.55) brightness(1.04)' } : undefined} aria-hidden="true">
        {tiles.map((t) => (
          <img
            key={`${zoom}/${t.x}/${t.y}`}
            src={src.url(zoom, t.x, t.y)}
            alt=""
            draggable={false}
            decoding="async"
            style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE }}
          />
        ))}
      </div>
      {origin && (
        <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden="true">
          {(() => {
            const shop = focus ? pins.find((p) => p.key === focus) : null
            const line = (route && route.length > 1 ? route : shop ? [origin, shop] : []).map(at)
            const pts = line.map((q) => `${q.left.toFixed(1)},${q.top.toFixed(1)}`).join(' ')
            const o = at(origin)
            return (
              <>
                {line.length > 1 && <polyline points={pts} fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />}
                {line.length > 1 && <polyline points={pts} fill="none" stroke="var(--color-finder-accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route && route.length > 1 ? undefined : '2 9'} />}
                <circle cx={o.left} cy={o.top} r="8" fill="white" stroke="var(--color-design-ink)" strokeWidth="3" />
              </>
            )
          })()}
        </svg>
      )}
      {origin && (
        <span className="pointer-events-none absolute -translate-x-1/2 rounded-pill bg-finder-card px-2 py-0.5 text-[11px] font-extrabold shadow-[0_1px_3px_rgba(0,0,0,0.2)]" style={{ left: at(origin).left, top: at(origin).top + 12 }}>
          You
        </span>
      )}
      {pins.map((p) => {
        const pos = at(p)
        const on = selected === p.key
        const dot = `absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] ${TONE_DOT[p.tone]} ${on ? 'h-5 w-5 ring-[6px] ring-finder-accent/35' : 'h-3.5 w-3.5'}`
        return onSelect ? (
          <button key={p.key} type="button" aria-label={p.label} aria-pressed={on} onClick={() => onSelect(p.key)} style={{ left: pos.left, top: pos.top }} className={dot} />
        ) : (
          <span key={p.key} title={p.label} style={{ left: pos.left, top: pos.top }} className={dot} />
        )
      })}
      {interactive && (
        <div className="absolute right-4 flex flex-col gap-2" style={{ top: controlsTop }}>
          <button type="button" aria-label="Zoom in" className={ctl} disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(1)}>
            <Plus size={20} strokeWidth={2.2} aria-hidden />
          </button>
          <button type="button" aria-label="Zoom out" className={ctl} disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(-1)}>
            <Minus size={20} strokeWidth={2.2} aria-hidden />
          </button>
          <button type="button" aria-label="Show all my agents" className={`${ctl} text-lg text-finder-link`} onClick={recenter}>
            <LocateFixed size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
      <p className="absolute bottom-1 left-2 text-[10px] font-medium text-design-ink/70">{src.credit.text}</p>
    </div>
  )
}
