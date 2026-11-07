/**
 * Raw token values for the few places that cannot use CSS variables:
 * the PWA manifest, Google Maps marker SVGs, and canvas/SVG drawing.
 * Everything else uses the Tailwind utilities generated from tokens.css.
 */
// The brand is the approved logo's pink and purple; the rest is the Orange Design System
// palette (Boosted v5.3). Keep in lockstep with tokens.css.
export const colors = {
  brand: '#FDB2E1', // logo pink
  brandDeep: '#E58FCB',
  brandText: '#5A21B8', // logo purple
  brandLight: '#FCE9F6',
  brandFaint: '#FEF5FB',
  ink: '#000000', // ods-black-900
  paper: '#FFFFFF', // ods-white-100
  canvas: '#FAFAFA',
  line: '#CCCCCC', // ods-gray-400
  muted: '#666666', // ods-gray-600
  success: '#228722', // ods-forest-200
  warning: '#8F7200', // ods-sun-200
  danger: '#CD3C14', // ods-fire-200
} as const

export type ColorToken = keyof typeof colors
