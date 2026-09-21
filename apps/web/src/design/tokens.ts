/**
 * Raw token values for the few places that cannot use CSS variables:
 * the PWA manifest, Google Maps marker SVGs, and canvas/SVG drawing.
 * Everything else uses the Tailwind utilities generated from tokens.css.
 */
export const colors = {
  brand: '#FF7900',
  brandDeep: '#E85D04',
  brandText: '#C24E00',
  brandLight: '#FFF1E6',
  brandFaint: '#FFF8F2',
  ink: '#171717',
  paper: '#FFFFFF',
  canvas: '#FAFAFA',
  line: '#E5E5E5',
  muted: '#6B7280',
  success: '#16803C',
  warning: '#B7791F',
  danger: '#C62828',
} as const

export type ColorToken = keyof typeof colors
