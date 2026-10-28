import { useEffect, useRef, useState } from 'react'
import { TILE, fromTile, toTile } from '@/lib/tiles'
import { MAX_ZOOM, MIN_ZOOM, PIN_ZOOM, fitView } from './networkMapView'

/**
 * The national map's map: OpenStreetMap streets drawn dark, one bubble per town (its count
 * inside), and the confirmed shops as pins once zoomed in. Drag to move, + and − to zoom.
 * It fits itself to `fit` whenever that changes, so choosing a row in the table moves the
 * map there. Plain images: no map library and no key, like the pin map.
 */

export interface Bubble {
  key: string
  lat: number
  lng: number
  count: number
  label: string
  sub: string
  /** The off-coast "no place on record" bubble is drawn hollow. */
  hollow?: boolean
}
export interface MapPin {
  key: string
  lat: number
  lng: number
  greyed?: boolean
  selected?: boolean
  label: string
}

export function NetworkMap({
  bubbles,
  pins,
  fit,
  onBubble,
  onPin,
  label,
  className = '',
}: {
  bubbles: Bubble[]
  pins: MapPin[]
  /** Points to fit the view to; a new array moves the map. */
  fit: { lat: number; lng: number }[]
  onBubble?: (key: string) => void
  onPin?: (key: string) => void
  label: string
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState({ lat: 8.55, lng: -11.85, zoom: 8 })
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    // Only a real change of size re-renders, so the tiles are never thrown away mid-load.
    const read = () =>
      setSize((s) => {
        const w = el.clientWidth || 800
        const h = el.clientHeight || 600
        return Math.abs(s.w - w) < 2 && Math.abs(s.h - h) < 2 ? s : { w, h }
      })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Re-fit whenever the selection (or the box) changes.
  const fitKey = JSON.stringify(fit.map((p) => [p.lat.toFixed(4), p.lng.toFixed(4)]))
  useEffect(() => {
    setView(fitView(fit, size.w, size.h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.w, size.h])

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
  const showPins = zoom >= PIN_ZOOM
  const biggest = Math.max(1, ...bubbles.map((b) => b.count))

  function release() {
    if (!drag) return
    if (drag.dx !== 0 || drag.dy !== 0) {
      const next = fromTile(c.x - drag.dx / TILE, c.y - drag.dy / TILE, zoom)
      setView({ lat: next.lat, lng: next.lng, zoom })
    }
    setDrag(null)
  }
  const zoomBy = (d: number) => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom + d)) }))
  const btn = 'flex h-11 w-11 items-center justify-center rounded-full border border-finder-line bg-finder-bg text-xl font-bold text-finder-ink'

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div
        ref={box}
        role="region"
        aria-label={label}
        className="relative h-full min-h-[360px] w-full cursor-grab select-none overflow-hidden rounded-panel bg-finder-line/40 active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setDrag({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 })
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x, dy: e.clientY - drag.y })}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="absolute inset-0" style={{ filter: 'invert(1) hue-rotate(180deg) brightness(0.8) contrast(0.9)' }}>
          {tiles.map((t) => (
            <img
              key={`${zoom}/${t.x}/${t.y}`}
              src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
              alt=""
              draggable={false}
              decoding="async"
              style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE }}
            />
          ))}
        </div>
        {!showPins &&
          bubbles.map((b) => {
            const pos = at(b)
            const r = 16 + 22 * Math.sqrt(b.count / biggest)
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => onBubble?.(b.key)}
                aria-label={`${b.label}: ${b.count} agents, ${b.sub}`}
                style={{ left: pos.left, top: pos.top, width: r * 2, height: r * 2 }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 text-sm font-bold ${b.hollow ? 'border-dashed border-finder-muted bg-finder-bg/70 text-finder-ink' : 'border-white bg-finder-accent/85 text-finder-on-orange'}`}
              >
                {b.count}
                <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-center text-xs font-bold text-white [text-shadow:0_0_3px_#000,0_0_3px_#000]">
                  {b.label}
                  <span className="block font-medium">{b.sub}</span>
                </span>
              </button>
            )
          })}
        {showPins &&
          pins.map((p) => {
            const pos = at(p)
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onPin?.(p.key)}
                aria-label={p.label}
                aria-pressed={p.selected ?? false}
                style={{ left: pos.left, top: pos.top }}
                className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white ${p.greyed ? 'bg-finder-muted' : 'bg-finder-accent'} ${p.selected ? 'h-7 w-7 ring-8 ring-finder-accent/35' : ''}`}
              />
            )
          })}
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <button type="button" aria-label="Zoom in" className={btn} disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(1)}>
            +
          </button>
          <button type="button" aria-label="Zoom out" className={btn} disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(-1)}>
            −
          </button>
        </div>
        {!showPins && pins.length > 0 && (
          <p className="absolute bottom-3 left-3 rounded-pill bg-finder-bg/90 px-3 py-1 text-xs font-bold text-finder-ink">Zoom in to see the confirmed shops</p>
        )}
      </div>
      <p className="text-right text-[0.7rem] font-medium text-finder-muted">
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> contributors
      </p>
    </div>
  )
}
