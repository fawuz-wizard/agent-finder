import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TILE, fitPoints, tileSource, toTile, type LatLngPoint } from '@/lib/tiles'

/**
 * The map pictures for one view, from TomTom with the key (OpenStreetMap without it), and a
 * projection for whatever is drawn on top. The children get `at(point)` in pixels of this box.
 * Static: it frames what it is given; nothing to drag. Used by the customer's directions and
 * the shop's spot on the agent page.
 */
export function TileLayer({
  fit,
  zoomBy = 0,
  style = 'night',
  className = '',
  label,
  children,
}: {
  fit: LatLngPoint[]
  zoomBy?: number
  style?: 'main' | 'night'
  className?: string
  label: string
  children?: (at: (p: LatLngPoint) => { x: number; y: number }, size: { w: number; h: number }) => ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 360, h: 220 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setSize((s) => (Math.abs(s.w - (el.clientWidth || 360)) < 2 && Math.abs(s.h - (el.clientHeight || 220)) < 2 ? s : { w: el.clientWidth || 360, h: el.clientHeight || 220 }))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const src = tileSource()
  const v = fitPoints(fit, size.w, size.h)
  const zoom = Math.max(3, Math.min(19, v.zoom + zoomBy))
  const c = toTile(v.lat, v.lng, zoom)
  const n = 2 ** zoom
  const cols = Math.ceil(size.w / TILE / 2) + 1
  const rows = Math.ceil(size.h / TILE / 2) + 1
  const tiles: { x: number; y: number; left: number; top: number }[] = []
  for (let ix = -cols; ix <= cols; ix++)
    for (let iy = -rows; iy <= rows; iy++) {
      const tx = Math.floor(c.x) + ix
      const ty = Math.floor(c.y) + iy
      if (ty < 0 || ty >= n) continue
      tiles.push({ x: ((tx % n) + n) % n, y: ty, left: size.w / 2 + (tx - c.x) * TILE, top: size.h / 2 + (ty - c.y) * TILE })
    }
  const at = (p: LatLngPoint) => {
    const t = toTile(p.lat, p.lng, zoom)
    return { x: size.w / 2 + (t.x - c.x) * TILE, y: size.h / 2 + (t.y - c.y) * TILE }
  }
  // OpenStreetMap has no night style: its light pictures are inverted to sit on the dark screen.
  const osmNight = src.provider === 'osm' && style === 'night' ? { filter: 'invert(1) hue-rotate(180deg) brightness(0.8) contrast(0.9)' } : undefined

  return (
    <div ref={box} role="img" aria-label={label} className={`${/\babsolute\b/.test(className) ? '' : 'relative '}select-none overflow-hidden bg-finder-line ${className}`}>
      <div className="absolute inset-0" style={osmNight} aria-hidden="true">
        {tiles.map((t) => (
          <img key={`${zoom}/${t.x}/${t.y}`} src={src.url(zoom, t.x, t.y, style)} alt="" draggable={false} decoding="async" style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE }} />
        ))}
      </div>
      {children?.(at, size)}
      <span className="absolute bottom-1 right-2 text-[10px] font-medium text-white/70" aria-hidden="true">
        {src.credit.text}
      </span>
    </div>
  )
}
