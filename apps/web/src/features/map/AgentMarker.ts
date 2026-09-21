/**
 * Builds the marker element for an agent. Neutral by design: a white disc with a deep-orange
 * ring and a name label. NO status colour, ever — the map must never read as a liquidity board.
 * Raw colours are allowed in this file because Advanced Markers take DOM, not Tailwind classes.
 */
import { colors } from '@/design/tokens'

export interface AgentMarkerOptions {
  label: string
  selected?: boolean
}

export function buildAgentMarkerElement({ label, selected = false }: AgentMarkerOptions): HTMLElement {
  const size = selected ? 32 : 24
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;'
  const disc = document.createElement('div')
  disc.style.cssText = [
    `width:${size}px;height:${size}px;border-radius:999px;`,
    `background:${selected ? colors.brand : colors.paper};`,
    `border:2px solid ${colors.brandDeep};box-sizing:border-box;`,
    'box-shadow:0 1px 3px rgba(0,0,0,.25);',
  ].join('')
  const text = document.createElement('span')
  text.textContent = label
  text.style.cssText = [
    'font:600 12px system-ui,sans-serif;',
    `color:${colors.ink};background:${colors.canvas};`,
    'padding:1px 6px;border-radius:6px;white-space:nowrap;',
  ].join('')
  el.append(disc, text)
  return el
}
