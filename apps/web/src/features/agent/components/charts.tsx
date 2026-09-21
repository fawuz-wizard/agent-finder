import { useId, useState } from 'react'

/**
 * The one chart on the agent dashboard: three lines on one 0–100 scale.
 *
 * "Status fresh" is already a percentage. "Found you" and "transactions" are drawn as a
 * share of their best interval in the range (100 = best), so the three can share an axis
 * honestly and cross where the story is — the interval the status went stale is the
 * interval customers fell away. Real values live in the legend and the tooltip.
 *
 * Dependency-free SVG. 2px lines, ≥8px end markers with a surface ring, hairline grid,
 * text in text tokens only, a legend (three series), and a hidden table.
 */

const W = 326
const H = 170
const PAD = { top: 12, right: 12, bottom: 24, left: 38 }

export interface LineSeries {
  key: string
  label: string
  /** Real values, one per point. null = not available (the line is not drawn). */
  values: (number | null)[]
  /** Format a real value for the legend and tooltip. */
  format: (v: number) => string
  /** Already 0–100; skip normalisation. */
  isPercent?: boolean
  /** Tailwind classes for the mark (stroke-*, fill-*) and the legend swatch (bg-*). */
  className: string
  /** Short note after the legend label, e.g. the data source. */
  note?: string
  total: string
}

function toPath(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

export function ThreeLines({ labels, series, title }: { labels: string[]; series: LineSeries[]; title: string }) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const n = labels.length
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1))
  const y = (pct: number) => PAD.top + plotH * (1 - Math.max(0, Math.min(100, pct)) / 100)

  const drawn = series
    .filter((s) => s.values.some((v) => v !== null))
    .map((s) => {
      const max = s.isPercent ? 100 : Math.max(1, ...s.values.map((v) => v ?? 0))
      const pts = s.values.map((v, i) => (v === null ? null : { x: x(i), y: y(s.isPercent ? v : (v / max) * 100) }))
      return { s, pts }
    })

  // Label every point for short ranges, every 5th for a month, so labels never collide.
  const step = n <= 8 ? 1 : n <= 14 ? 2 : 5

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t`}
        className="w-full touch-none"
        onMouseLeave={() => setHover(null)}
      >
        <title id={`${id}-t`}>{title}</title>
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted text-[11px]">
              {t}%
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i === n - 1 || (i % step === 0 && n - 1 - i >= step) ? (
            <text
              key={l + i}
              x={x(i)}
              y={H - 7}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              className={`text-[11px] ${i === n - 1 ? 'fill-ink font-bold' : 'fill-muted'}`}
            >
              {l}
            </text>
          ) : null,
        )}
        {drawn.map(({ s, pts }) => {
          const solid = pts.filter((p): p is { x: number; y: number } => p !== null)
          const last = solid[solid.length - 1]
          return (
            <g key={s.key} className={s.className}>
              <path d={toPath(solid)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {last && <circle cx={last.x} cy={last.y} r="4.5" fill="currentColor" className="stroke-paper" strokeWidth="2" />}
            </g>
          )
        })}
        {/* hit targets: one column per point, wider than the mark */}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={x(i) - plotW / (2 * Math.max(1, n - 1))}
            y={PAD.top}
            width={plotW / Math.max(1, n - 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-ink" strokeOpacity="0.3" />
            {drawn.map(({ s, pts }) => {
              const p = pts[hover]
              return p ? <circle key={s.key} cx={p.x} cy={p.y} r="4.5" fill="currentColor" className={`${s.className} stroke-paper`} strokeWidth="2" /> : null
            })}
            {(() => {
              const lines = [labels[hover]!, ...drawn.map(({ s }) => `${s.label} ${s.values[hover] === null ? '—' : s.format(s.values[hover]!)}`)]
              const w = Math.max(...lines.map((l) => l.length)) * 5.6 + 16
              const h = lines.length * 12 + 8
              const left = x(hover) + 8 + w > W - 2 ? x(hover) - 8 - w : x(hover) + 8
              return (
                <g>
                  <rect x={left} y={PAD.top} width={w} height={h} rx="5" className="fill-ink" />
                  {lines.map((l, li) => (
                    <text key={li} x={left + 8} y={PAD.top + 13 + li * 12} className={`fill-paper text-[9px] ${li === 0 ? 'font-bold' : ''}`}>
                      {l}
                    </text>
                  ))}
                </g>
              )
            })()}
          </g>
        )}
      </svg>

      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${s.className}`} />
            {s.label} <b className="text-ink">{s.total}</b>
            {s.note && <span className="text-muted/70">· {s.note}</span>}
          </li>
        ))}
      </ul>

      <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Interval</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l + i}>
              <th scope="row">{l}</th>
              {series.map((s) => (
                <td key={s.key}>{s.values[i] === null ? '—' : s.format(s.values[i]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  )
}
