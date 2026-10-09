/**
 * Raw token values for the few places that cannot use CSS variables:
 * the PWA manifest, Google Maps marker SVGs, and canvas/SVG drawing.
 * Everything else uses the Tailwind utilities generated from tokens.css.
 */
// Orange Design System palette (Boosted v5.3) — keep in lockstep with tokens.css.
export const colors = {
  brand: '#FF7900', // ods-orange-100
  brandDeep: '#F16E00', // ods-orange-200
  brandText: '#F16E00', // ods-orange-200
  brandLight: '#FFF1E6',
  brandFaint: '#FFF8F2',
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
