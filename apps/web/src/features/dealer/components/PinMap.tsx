import { useEffect, useRef, useState } from 'react'
import { TILE, fromTile, toTile } from '@/lib/tiles'

/**
 * A street map for placing or checking one pin, drawn from OpenStreetMap tiles with plain
 * images: no library, no key, the same source the place search already uses. In `move`
 * mode the pin stays in the centre and the map is dragged under it, which is the one
 * gesture that works with a thumb; the new centre is reported on release. Read only
 * otherwise. Google's tiles can take the place of these later, behind the same props.
 */

const DEFAULT_ZOOM = 17
const MIN_ZOOM = 14
const MAX_ZOOM = 19

export type Pin = { lat: number; lng: number; label?: string; tone?: 'orange' | 'green' | 'grey' }

export function PinMap({
  lat,
  lng,
  zoom: initialZoom = DEFAULT_ZOOM,
  height = 260,
  mode = 'view',
  onMove,
  pins = [],
  label,
}: {
  lat: number
  lng: number
  zoom?: number
  height?: number
  /** `move`: the pin stays in the centre and the map is dragged under it. */
  mode?: 'view' | 'move'
  onMove?: (point: { lat: number; lng: number }) => void
  /** Other points to show, read only. */
  pins?: Pin[]
  /** What the centre pin is, for screen readers and the caption. */
  label?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(initialZoom)
  const [size, setSize] = useState({ w: 360, h: height })
  // The centre while a drag is in progress; null when the map rests on `lat`/`lng`.
  const [drag, setDrag] = useState<{ startX: number; startY: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth || 360, h: el.clientHeight || height })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  const centre = toTile(lat, lng, zoom)
  // Pixel position of the centre tile corner relative to the map's own centre, shifted by the drag.
  const shiftX = (drag?.dx ?? 0) - (centre.x % 1) * TILE
  const shiftY = (drag?.dy ?? 0) - (centre.y % 1) * TILE
  const cx = Math.floor(centre.x)
  const cy = Math.floor(centre.y)
  const cols = Math.ceil(size.w / TILE / 2) + 1
  const rows = Math.ceil(size.h / TILE / 2) + 1
  const n = 2 ** zoom
  const tiles: { x: number; y: number; left: number; top: number }[] = []
  for (let dx = -cols; dx <= cols; dx++)
    for (let dy = -rows; dy <= rows; dy++) {
      const ty = cy + dy
      if (ty < 0 || ty >= n) continue
      tiles.push({ x: (((cx + dx) % n) + n) % n, y: ty, left: size.w / 2 + shiftX + dx * TILE, top: size.h / 2 + shiftY + dy * TILE })
    }

  /** A point's pixel position on the current view. */
  const at = (p: { lat: number; lng: number }) => {
    const t = toTile(p.lat, p.lng, zoom)
    return { left: size.w / 2 + (drag?.dx ?? 0) + (t.x - centre.x) * TILE, top: size.h / 2 + (drag?.dy ?? 0) + (t.y - centre.y) * TILE }
  }

  function release() {
    if (!drag) return
    const next = fromTile(centre.x - drag.dx / TILE, centre.y - drag.dy / TILE, zoom)
    setDrag(null)
    if (drag.dx !== 0 || drag.dy !== 0) onMove?.({ lat: Number(next.lat.toFixed(5)), lng: Number(next.lng.toFixed(5)) })
  }

  const movable = mode === 'move'
  const zoomBtn = 'flex h-9 w-9 items-center justify-center rounded-pill border border-finder-line bg-finder-bg text-lg font-bold text-finder-ink'

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={box}
        role="img"
        aria-label={label ? `Map: ${label}` : 'Map'}
        style={{ height, touchAction: movable ? 'none' : 'pan-y' }}
        className={`relative w-full select-none overflow-hidden rounded-field border border-finder-line bg-finder-line/40 ${movable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={(e) => {
          if (!movable) return
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setDrag({ startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 })
        }}
        onPointerMove={(e) => {
          if (!drag) return
          setDrag({ ...drag, dx: e.clientX - drag.startX, dy: e.clientY - drag.startY })
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        {tiles.map((t) => (
          <img
            key={`${zoom}/${t.x}/${t.y}`}
            src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE }}
          />
        ))}
        {pins.map((p, i) => {
          const pos = at(p)
          const fill = p.tone === 'green' ? 'var(--color-finder-likely)' : p.tone === 'grey' ? 'var(--color-finder-muted)' : 'var(--color-finder-accent)'
          return (
            <span key={i} style={{ position: 'absolute', left: pos.left, top: pos.top }} className="-translate-x-1/2 -translate-y-1/2" aria-hidden="true">
              <span className="block h-3.5 w-3.5 rounded-full border-2 border-finder-bg" style={{ background: fill }} />
              {p.label && <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-pill border border-finder-line bg-finder-bg px-2 py-0.5 text-xs font-bold text-finder-ink">{p.label}</span>}
            </span>
          )
        })}
        {/* The centre pin: the shop. In move mode it never moves; the map does. */}
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full" aria-hidden="true">
          <svg width="34" height="44" viewBox="0 0 34 44">
            <path d="M17 2C8.7 2 2 8.7 2 17c0 11 15 25 15 25s15-14 15-25C32 8.7 25.3 2 17 2z" fill="var(--color-finder-accent)" stroke="var(--color-finder-on-orange)" strokeWidth="2" />
            <circle cx="17" cy="17" r="5" fill="var(--color-finder-on-orange)" />
          </svg>
        </span>
        <div className="absolute bottom-2 right-2 flex flex-col gap-1">
          <button type="button" aria-label="Zoom in" className={zoomBtn} disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}>
            +
          </button>
          <button type="button" aria-label="Zoom out" className={zoomBtn} disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}>
            −
          </button>
        </div>
        <span className="absolute left-2 top-2 rounded-pill border border-finder-line bg-finder-bg px-2 py-0.5 text-xs font-bold text-finder-ink">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
      </div>
      <p className="text-right text-[0.7rem] font-medium text-finder-muted">
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> contributors
      </p>
    </div>
  )
}
