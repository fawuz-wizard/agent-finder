/**
 * The two actions at the foot of a shop's screens: Call and Get Directions. Orange with black
 * text and icon, Orange's own rule: white on this orange measures 2.8:1, black 7.5:1, so black
 * is what reads at arm's length in sunlight.
 */
export const actionClass =
  'flex h-chip flex-1 items-center justify-center gap-2 rounded-field bg-finder-link text-base font-semibold text-finder-on-orange transition-[filter] hover:brightness-95 active:brightness-90'

export const PhoneIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M4 2h3l1.5 3.5L6.8 7a9 9 0 004.2 4.2l1.5-1.7L16 11v3a1.5 1.5 0 01-1.6 1.5A13 13 0 012.5 3.6 1.5 1.5 0 014 2z" fill="currentColor" />
  </svg>
)

export const DirectionsIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 1.5l8.5 8.5-8.5 8.5L1.5 10z" fill="currentColor" />
    <path d="M7.5 11.5v-2.5h4V7.5l2.5 2.5-2.5 2.5V11h-2.5v1.5z" fill="var(--color-finder-link)" />
  </svg>
)
