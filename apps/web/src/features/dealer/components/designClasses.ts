/** Class strings of the approved design's pieces (see designKit.tsx), kept apart for fast refresh. */
export const PAGE = 'flex flex-1 flex-col gap-5 px-6 pb-7 pt-3 text-finder-ink'
export const CARD = 'rounded-[18px] bg-finder-card'
/** A filter chip: white, orange when chosen. */
export function chipClass(on: boolean) {
  return `flex shrink-0 items-center rounded-pill px-3.5 py-[9px] text-[13px] font-bold transition-colors duration-150 active:scale-[0.96] ${on ? 'bg-finder-accent text-finder-on-orange' : 'bg-finder-card text-finder-ink'}`
}
/** The outline button: 52 px, orange edge and text. */
export const OUTLINE = 'flex h-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-finder-accent bg-finder-card text-[15px] font-extrabold text-finder-link'
export const SOLID = 'flex h-[52px] items-center justify-center rounded-[14px] bg-finder-accent text-sm font-extrabold text-finder-on-orange'
